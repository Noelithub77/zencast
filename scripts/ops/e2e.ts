// End-to-end checks and interaction benchmarks, run against an isolated headless Zen.
import { mkdir, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { join } from "node:path"

import type { Zen } from "./zen.ts"

export interface ScenarioResult {
  name: string
  ok: boolean
  detail: string
  ms: number
}

interface Scenario {
  name: string
  /** Async function body run in the browser window; returns { ok, detail }. */
  body: string
}

const READY = String.raw`await until(() => window.Zencast && document.getElementById("zencast-host"), 20000)`

// Places for the bookmark scenarios; poll() gives up quietly where until() throws.
const PLACES = String.raw`const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs")
      const poll = async (fn, ms = 3000) => {
        const end = Date.now() + ms
        for (;;) {
          const value = await fn()
          if (value || Date.now() > end) return value
          await sleep(50)
        }
      }
      const inputPlaceholder = () => shadow().querySelector("[cmdk-input]")?.placeholder ?? ""`

// A dev server the runner starts on a free port, written into scenario bodies in place of this token.
const LOCAL_PORT = "__LOCAL_PORT__"

const SCENARIOS: Scenario[] = [
  {
    name: "mod loads and mounts",
    body: String.raw`${READY}
      return { ok: true, detail: "window.Zencast and #zencast-host present" }`,
  },
  {
    name: "ctrl+k opens, esc closes",
    body: String.raw`${READY}
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      await until(() => resultTitles().length > 0)
      const focused = deepActive()?.hasAttribute("cmdk-input")
      await dismiss()
      return { ok: focused, detail: focused ? "input focused on open" : "input not focused" }`,
  },
  {
    name: "ctrl+t stays Zen's new tab unless the palette is set to take it",
    body: String.raw`${READY}
      const CONFIG = "zencast.config"
      const setPaletteKeys = (keys) => Services.prefs.setStringPref(CONFIG, JSON.stringify({ version: 1, bindings: { "zencast.palette": keys } }))
      // Zen's new tab either adds a tab or, with zen.urlbar.replace-newtab, opens the URL bar.
      const nativeNewTab = async () => {
        const tabs = gBrowser.tabs.length
        gBrowser.selectedBrowser.focus()
        pressTrusted("ctrl+t")
        await sleep(300)
        const native = !paletteOpen() && (gBrowser.tabs.length > tabs || gURLBar.focused)
        gURLBar.view.close()
        gURLBar.handleRevert()
        gBrowser.selectedBrowser.focus()
        await sleep(100)
        return native
      }
      try {
        const byDefault = await nativeNewTab()
        setPaletteKeys(["ctrl+k", "ctrl+t"])
        const tabs = gBrowser.tabs.length
        gBrowser.selectedBrowser.focus()
        pressTrusted("ctrl+t")
        const opened = await until(paletteOpen, 2000).catch(() => false)
        await dismiss()
        const palette = opened && gBrowser.tabs.length === tabs
        setPaletteKeys(["ctrl+k"])
        const afterOff = await nativeNewTab()
        return {
          ok: byDefault && palette && afterOff,
          detail: "default: " + (byDefault ? "zen" : "blocked") + "; turned on: " + (palette ? "palette" : "not palette") + "; turned off: " + (afterOff ? "zen" : "blocked"),
        }
      } finally {
        Services.prefs.clearUserPref(CONFIG)
      }`,
  },
  {
    name: "fuzzy search tolerates a typo",
    body: String.raw`${READY}
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      typeQuery("contaner")
      await sleep(50)
      const titles = resultTitles()
      await dismiss()
      const hit = titles.some((t) => /container/i.test(t))
      return { ok: hit, detail: titles.slice(0, 3).join(" · ") }`,
  },
  {
    name: "search covers unloaded pinned tabs and folder names, loaded tabs first",
    body: String.raw`${READY}
      const page = (title) => "data:text/html,<title>" + encodeURIComponent(title) + "</title>x"
      const unloaded = newTab(page("Zebra docs"))
      await until(() => unloaded.label === "Zebra docs")
      const loaded = newTab(page("Zebra docs"))
      await until(() => loaded.label === "Zebra docs")
      const folder = gZenFolders.createFolder([unloaded], { label: "Quokka notes" })
      gBrowser.pinTab(unloaded)
      const current = newTab()
      await sleep(100)
      gBrowser.discardBrowser(unloaded, true)
      await until(() => unloaded.hasAttribute("pending"))
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      typeQuery("zebra")
      await sleep(80)
      const zebra = resultTitles().filter((t) => t.startsWith("Zebra docs"))
      typeQuery("quokka")
      await sleep(80)
      const quokka = resultTitles()
      await dismiss()
      const both = zebra.length === 2 && zebra[0].includes("data:") && zebra[1].includes("Quokka notes")
      const byFolder = quokka.some((t) => t.startsWith("Quokka notes")) && quokka.some((t) => t.startsWith("Zebra docs"))
      for (const tab of [loaded, current]) gBrowser.removeTab(tab)
      await folder.delete()
      return { ok: both && byFolder, detail: "zebra: " + zebra.join(" | ") + "; quokka: " + quokka.slice(0, 2).join(" | ") }`,
  },
  {
    name: "palette keys win over the browser's while it is open",
    body: String.raw`${READY}
      const target = newTab("data:text/html,<title>Close%20me%20please</title>x")
      await until(() => target.label === "Close me please")
      // A blank tab would hand focus to the address bar on its own; use a page.
      const current = newTab("data:text/html,<title>Current</title>x")
      await until(() => current.label === "Current")
      gBrowser.selectedBrowser.focus()
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      typeQuery("close me please")
      await sleep(80)
      press("ctrl+w")
      await until(() => !target.isConnected, 2000).catch(() => false)
      const closedTarget = !target.isConnected && current.isConnected && gBrowser.selectedTab === current
      press("ctrl+l")
      await sleep(80)
      const open = paletteOpen()
      const urlbar = gURLBar.focused
      await dismiss()
      gBrowser.removeTab(current)
      const ok = closedTarget && open && !urlbar
      return { ok, detail: (closedTarget ? "ctrl+w closed the result" : "ctrl+w: target " + (target.isConnected ? "open" : "closed") + ", current " + (current.isConnected ? "open" : "closed")) + "; ctrl+l " + (urlbar ? "focused the address bar" : open ? "held" : "closed the palette") }`,
  },
  {
    name: "ctrl+c opens the container picker only when nothing is selected",
    body: String.raw`${READY}
      const tab = newTab("data:text/html,<title>Copy</title><p>Some text to copy</p>")
      await until(() => tab.label === "Copy")
      gBrowser.selectedBrowser.focus()
      await sleep(100)
      press("ctrl+c", document.documentElement)
      const picker = await until(() => paletteOpen() && resultTitles().length > 0, 2000).catch(() => false)
      await dismiss()
      gBrowser.selectedBrowser.focus()
      goDoCommand("cmd_selectAll")
      await sleep(100)
      press("ctrl+c", document.documentElement)
      await sleep(300)
      const opened = paletteOpen()
      if (opened) await dismiss()
      const clip = await navigator.clipboard.readText().catch((e) => "unreadable: " + e)
      gBrowser.removeTab(tab)
      const copied = !opened && clip.includes("Some text to copy")
      return { ok: !!picker && copied, detail: (picker ? "no selection: picker" : "no selection: nothing") + "; with selection: " + (opened ? "picker" : "clipboard " + JSON.stringify(clip.slice(0, 30))) }`,
  },
  {
    // The example in src/features/ proves the feature-module glob reaches the palette.
    name: "a feature module's command copies the tab as a Markdown link",
    body: String.raw`${READY}
      const tab = newTab("data:text/html,<title>Feature [demo]</title>x")
      await until(() => tab.label === "Feature [demo]")
      let clip = ""
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("copy as markdown")
        const row = await until(() => shadow().querySelector('[cmdk-item][data-value="tab.copyMarkdownLink"]'), 3000)
        row.click()
        await until(() => !paletteOpen(), 2000)
        await sleep(300)
        clip = await navigator.clipboard.readText().catch((e) => "unreadable: " + e)
      } finally {
        await dismiss().catch(() => {})
        gBrowser.removeTab(tab)
      }
      return { ok: clip.startsWith("[Feature demo](data:text/html,"), detail: JSON.stringify(clip.slice(0, 40)) }`,
  },
  {
    name: "alt+p pins and unpins",
    body: String.raw`${READY}
      const tab = newTab()
      await sleep(50)
      press("alt+p", document.documentElement)
      await until(() => tab.pinned)
      press("alt+p", document.documentElement)
      await until(() => !tab.pinned)
      gBrowser.removeTab(tab)
      return { ok: true, detail: "pinned then unpinned" }`,
  },
  {
    name: "ctrl+shift+n creates a folder, or a subfolder inside the current one",
    body: String.raw`${READY}
      const folders = () => [...document.querySelectorAll("zen-folder")]
      const tab = newTab()
      await sleep(50)
      const before = new Set(folders())
      press("ctrl+shift+n", document.documentElement)
      const root = await until(() => folders().find((f) => !before.has(f)))
      const isRoot = !root.group?.isZenFolder
      await sleep(100)
      root.addTabs([tab])
      gBrowser.selectedTab = tab
      await sleep(50)
      press("ctrl+shift+n", document.documentElement)
      const sub = await until(() => folders().find((f) => f !== root && !before.has(f)))
      const nested = sub.group === root
      await root.delete()
      return { ok: isRoot && nested, detail: (isRoot ? "root folder" : "not root") + ", then " + (nested ? "subfolder inside it" : "folder outside it") }`,
  },
  {
    name: "ctrl+shift+2 moves the tab to space 2, follows it, and shows a Zen toast",
    body: String.raw`${READY}
      if (gZenWorkspaces.getWorkspaces().length < 2) await gZenWorkspaces.createAndSaveWorkspace("Second", undefined, true)
      const [first, target] = gZenWorkspaces.getWorkspaces()
      const tab = newTab()
      await sleep(50)
      press("ctrl+shift+2", document.documentElement)
      await until(() => tab.getAttribute("zen-workspace-id") === target.uuid)
      await until(() => gZenWorkspaces.activeWorkspace === target.uuid && gBrowser.selectedTab === tab, 4000)
      const text = await until(() => toastText().includes("Moved to") && toastText(), 4000)
      const ok = text.includes("Moved to " + target.name)
      gBrowser.removeTab(tab)
      await gZenWorkspaces.changeWorkspaceWithID(first.uuid)
      return { ok, detail: "followed to " + target.name + "; toast: " + text }`,
  },
  {
    name: "ctrl+2 switches to space 2, and ctrl+n passes through when space n does not exist",
    body: String.raw`${READY}
      if (gZenWorkspaces.getWorkspaces().length < 2) await gZenWorkspaces.createAndSaveWorkspace("Second", undefined, true)
      const spaces = gZenWorkspaces.getWorkspaces()
      await gZenWorkspaces.changeWorkspaceWithID(spaces[0].uuid)
      press("ctrl+2", document.documentElement)
      const switched = await until(() => gZenWorkspaces.activeWorkspace === spaces[1].uuid, 3000).catch(() => false)
      const missing = spaces.length + 1
      const event = press("ctrl+" + missing, document.documentElement)
      const passed = !event.defaultPrevented
      await gZenWorkspaces.changeWorkspaceWithID(spaces[0].uuid)
      return { ok: Boolean(switched) && passed, detail: (switched ? "switched to " + spaces[1].name : "did not switch") + "; ctrl+" + missing + (passed ? " passed through" : " was taken") }`,
  },
  {
    name: "ctrl+, opens Zen's settings",
    body: String.raw`${READY}
      press("ctrl+,", document.documentElement)
      const url = await until(() => gBrowser.selectedBrowser.currentURI.spec.startsWith("about:preferences") && gBrowser.selectedBrowser.currentURI.spec)
      gBrowser.removeTab(gBrowser.selectedTab)
      return { ok: true, detail: url }`,
  },
  {
    name: "a host from the DNS cache completes inline",
    body: String.raw`${READY}
      // Resolving puts the host in Firefox's DNS cache, as visiting the site would.
      await new Promise((resolve) => Services.dns.asyncResolve("allpyq.in", Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT, 0, null,
        { QueryInterface: ChromeUtils.generateQI(["nsIDNSListener"]), onLookupComplete: resolve }, Services.tm.mainThread, {}))
      await new Promise((resolve) => Services.dns.asyncResolve("pinterest.com", Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT, 0, null,
        { QueryInterface: ChromeUtils.generateQI(["nsIDNSListener"]), onLookupComplete: resolve }, Services.tm.mainThread, {}))
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      await sleep(100)
      typeQuery("allpyq")
      const input = shadow().querySelector("[cmdk-input]")
      const value = await until(() => input.value !== "allpyq" && input.value, 3000).catch(() => input.value)
      const selected = input.value.slice(input.selectionStart, input.selectionEnd)
      const first = resultTitles()[0] ?? ""
      // A DNS host wins Enter even when a command's name starts with the query ("Pin or unpin tab").
      typeQuery("")
      await sleep(50)
      typeQuery("pin")
      const pin = await until(() => input.value !== "pin" && input.value, 3000).catch(() => input.value)
      const pinFirst = resultTitles()[0] ?? ""
      await dismiss()
      const ok = value === "allpyq.in" && selected === ".in" && first.startsWith("allpyq.in") && pin === "pinterest.com" && pinFirst.startsWith("pinterest.com")
      return { ok, detail: value + " (selected " + JSON.stringify(selected) + "), first row " + first + "; pin → " + pin + ", first row " + pinFirst }`,
  },
  {
    name: "a visited host completes inline even below Firefox's autofill threshold, with its favicon",
    body: String.raw`${READY}
      // One visit is too few for the URL bar's own origin autofill, but the history row still comes back.
      await PlacesUtils.history.insert({ url: "https://www.quokkagram.net/", title: "Quokkagram", visits: [{ transition: PlacesUtils.history.TRANSITIONS.TYPED, date: new Date() }] })
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      await sleep(100)
      typeQuery("quokkag")
      const input = shadow().querySelector("[cmdk-input]")
      const value = await until(() => input.value !== "quokkag" && input.value, 3000).catch(() => input.value)
      const icon = shadow().querySelector("[cmdk-item] img")?.getAttribute("src") ?? "none"
      await dismiss()
      await PlacesUtils.history.remove("https://www.quokkagram.net/")
      return { ok: value === "quokkagram.net" && icon === "page-icon:https://www.quokkagram.net/", detail: value + "; icon " + icon }`,
  },
  {
    name: "holding ctrl or alt labels visible rows with letters and lists the keys",
    body: String.raw`${READY}
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      const init = { key: "Control", code: "ControlLeft", ctrlKey: true, bubbles: true, composed: true }
      document.documentElement.dispatchEvent(new KeyboardEvent("keydown", init))
      const hints = () => [...shadow().querySelectorAll("[cmdk-item] [data-hint]")].map((kbd) => kbd.textContent.toLowerCase())
      const shown = await until(() => hints().length && hints(), 2000)
      // Each row marks its letter inside the title, in the badge's colour.
      const marked = [...shadow().querySelectorAll("[cmdk-item]")].filter((item) => item.querySelector("[data-hint]"))
        .every((item) => {
          const letter = item.querySelector("span.underline")
          const badge = item.querySelector("[data-hint]")
          return letter?.textContent.toLowerCase() === badge.textContent.toLowerCase() && letter.style.color === badge.style.color
        })
      const colors = new Set([...shadow().querySelectorAll("[data-hint]")].map((kbd) => kbd.style.color)).size
      const legend = shadow().querySelector("[data-legend]")?.textContent ?? ""
      document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { ...init, ctrlKey: false }))
      await until(() => hints().length === 0 && !shadow().querySelector("[data-legend]"), 2000)
      // Alt labels the same rows, and Alt+letter runs one.
      const alt = { key: "Alt", code: "AltLeft", altKey: true, bubbles: true, composed: true }
      document.documentElement.dispatchEvent(new KeyboardEvent("keydown", alt))
      const altShown = await until(() => hints().length && hints(), 2000).catch(() => [])
      const altLegend = shadow().querySelector("[data-legend]")?.textContent ?? ""
      document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { ...alt, altKey: false }))
      await until(() => hints().length === 0, 2000)
      await dismiss()
      const unique = new Set(shown).size === shown.length && !shown.some((l) => "acjvxzkqw".includes(l))
      const listed = legend.includes("Close") && legend.includes("Open in container") && altLegend.includes("Open in space")
      return {
        ok: shown.length > 3 && unique && marked && colors > 3 && listed && altShown.length > 3,
        detail: shown.join(" ") + "; " + colors + " colours" + (marked ? "; marked in titles" : "; titles not marked") + "; legend: " + legend + "; alt: " + altShown.join(" ") + "; cleared on release",
      }`,
  },
  {
    name: "holding ctrl+shift shows every key, and a quick ctrl+shift+key does not",
    body: String.raw`${READY}
      const root = document.documentElement
      const ctrl = { key: "Control", code: "ControlLeft", ctrlKey: true, bubbles: true, composed: true }
      const shift = { key: "Shift", code: "ShiftLeft", ctrlKey: true, shiftKey: true, bubbles: true, composed: true }
      const sheet = () => shadow().querySelector("[data-keysheet]")
      const hold = () => {
        root.dispatchEvent(new KeyboardEvent("keydown", ctrl))
        root.dispatchEvent(new KeyboardEvent("keydown", shift))
      }
      const release = () => {
        root.dispatchEvent(new KeyboardEvent("keyup", { ...shift, shiftKey: false }))
        root.dispatchEvent(new KeyboardEvent("keyup", { ...ctrl, ctrlKey: false }))
      }
      hold()
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "x", code: "KeyX", ctrlKey: true, shiftKey: true, bubbles: true, composed: true }))
      await sleep(700)
      const quick = !!sheet()
      release()
      hold()
      const text = await until(() => sheet()?.textContent, 2000).catch(() => "")
      release()
      const hidden = await until(() => !sheet(), 2000).catch(() => false)
      const listed = text.includes("Open Zencast") && text.includes("Move tab to space 1…9") && text.includes("Switch to space 1…9")
      return {
        ok: !quick && listed && hidden,
        detail: (quick ? "showed on a quick key" : "quick key: no sheet") + "; " + (listed ? "lists the palette and the 1…9 families" : "missing rows: " + text.slice(0, 200)) + (hidden ? "; hidden on release" : "; still shown"),
      }`,
  },
  {
    name: "sessions save this window's tabs, and alt+s reopens one",
    body: String.raw`${READY}
      const url = "data:text/html,<title>Session kiwi</title>x"
      const tab = newTab(url)
      await until(() => tab.label === "Session kiwi", 3000).catch(() => false)
      const start = Services.startup.getStartupInfo().process.getTime()
      const path = PathUtils.join(PathUtils.profileDir, "zencast", "sessions", start + ".json")
      Services.obs.notifyObservers(null, "sessionstore-state-write-complete")
      const saved = await until(async () => {
        if (!(await IOUtils.exists(path))) return false
        const session = await IOUtils.readJSON(path)
        return session.windows.some((win) => win.tabs.some((t) => t.title === "Session kiwi")) && session
      }, 4000).catch(() => null)
      gBrowser.removeTab(tab)
      await sleep(100)
      press("alt+s", document.documentElement)
      await until(paletteOpen)
      const first = await until(() => resultTitles()[0], 2000).catch(() => "")
      press("enter")
      await sleep(200)
      typeQuery("kiwi")
      await sleep(150)
      press("enter")
      const reopened = await until(() => gBrowser.tabs.find((t) => t.linkedBrowser?.currentURI.spec === url || t.label === "Session kiwi"), 3000).catch(() => null)
      await dismiss()
      if (reopened) gBrowser.removeTab(reopened)
      return {
        ok: !!saved && first.startsWith("Today") && !!reopened,
        detail: (saved ? "saved " + saved.windows.length + " window(s)" : "not saved") + "; first row " + first + "; " + (reopened ? "reopened" : "not reopened"),
      }`,
  },
  {
    name: "alt+l lists a local dev server, opens it, then switches to its tab",
    body: String.raw`${READY}
      const url = "http://localhost:${LOCAL_PORT}/"
      const pick = async () => {
        press("alt+l", document.documentElement)
        await until(paletteOpen, 4000)
        const listed = await until(() => resultTitles().some((title) => title.startsWith("Kiwi dev server")), 4000).catch(() => false)
        typeQuery("kiwi dev")
        await sleep(150)
        press("enter")
        return listed
      }
      const listed = await pick()
      const tab = await until(() => gBrowser.tabs.find((t) => t.linkedBrowser?.currentURI.spec === url), 4000).catch(() => null)
      const count = gBrowser.tabs.length
      gBrowser.selectedTab = gBrowser.tabs.find((t) => t !== tab)
      await pick()
      const switched = await until(() => tab && gBrowser.selectedTab === tab, 3000).catch(() => false)
      const same = gBrowser.tabs.length === count
      await dismiss()
      if (tab) gBrowser.removeTab(tab)
      return {
        ok: listed && !!tab && switched && same,
        detail: (listed ? "listed" : "not listed") + "; " + (tab ? "opened" : "not opened") + "; " + (switched && same ? "switched to its tab" : "did not switch"),
      }`,
  },
  {
    name: "a typed prefix narrows search to tabs, commands or settings, and backspace clears it",
    body: String.raw`${READY}
      const tab = newTab("data:text/html,<title>Zebra scope</title>x")
      await until(() => tab.label === "Zebra scope", 3000).catch(() => false)
      // The palette leaves out the current tab.
      gBrowser.selectedTab = gBrowser.tabs.find((t) => t !== tab)
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      const chip = () => shadow().querySelector("[data-scope]")?.textContent ?? ""
      const headings = () => [...shadow().querySelectorAll("[cmdk-group-heading]:not([hidden])")].map((h) => h.textContent)
      const step = async (text) => {
        typeQuery(text)
        await sleep(150)
        return { chip: chip(), first: resultTitles()[0] ?? "", headings: headings() }
      }
      const tabs = await step("@zebra")
      typeQuery("")
      await sleep(50)
      press("backspace")
      await sleep(80)
      const cleared = chip() === ""
      const commands = await step("/sessions")
      typeQuery("")
      await sleep(50)
      press("backspace")
      await sleep(80)
      const settings = await step("$vertical tabs")
      await dismiss()
      gBrowser.removeTab(tab)
      const ok = tabs.chip === "Tabs" && tabs.first.startsWith("Zebra scope") && !tabs.headings.includes("Web") && !tabs.headings.includes("Search")
        && cleared && commands.chip === "Commands" && commands.first.startsWith("Sessions")
        && settings.chip === "Settings" && settings.headings.every((h) => h === "Settings")
      return {
        ok,
        detail: "@zebra → " + tabs.chip + ": " + tabs.first + " [" + tabs.headings + "]; " + (cleared ? "cleared" : "not cleared") + "; /sessions → " + commands.chip + ": " + commands.first + "; $vertical tabs → " + settings.chip + ": " + settings.first + " [" + settings.headings + "]",
      }`,
  },
  {
    name: "typing a key finds what it runs",
    body: String.raw`${READY}
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      const firstFor = async (text) => {
        typeQuery(text)
        await sleep(150)
        return resultTitles()[0] ?? ""
      }
      const sessions = await firstFor("alt s")
      const plus = await firstFor("Alt + L")
      const chord = await firstFor("ctrl space")
      await dismiss()
      return {
        ok: sessions.startsWith("Sessions") && plus.startsWith("Localhost") && chord !== "" && !chord.startsWith("Search"),
        detail: "alt s → " + sessions + "; Alt + L → " + plus + "; ctrl space → " + chord,
      }`,
  },
  {
    name: "the open key closes the palette and ctrl+j opens actions",
    body: String.raw`${READY}
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      typeQuery("settings")
      await until(() => resultTitles().length > 0)
      const panel = () => shadow().querySelectorAll("[cmdk-root]").length > 1
      press("ctrl+j")
      const actions = await until(panel, 2000).catch(() => false)
      press("ctrl+j")
      const backToList = await until(() => !panel(), 2000).catch(() => false)
      press("ctrl+k")
      const closed = await until(() => !paletteOpen(), 2000).catch(() => false)
      if (paletteOpen()) await dismiss()
      return {
        ok: actions && backToList && closed,
        detail: "actions: " + (actions ? "opened" : "not opened") + "; again: " + (backToList ? "closed panel" : "still open") + "; ctrl+k: " + (closed ? "closed palette" : "still open"),
      }`,
  },
  {
    name: "alt+n and ctrl+n target a space and a container, and pressing again clears them",
    body: String.raw`${READY}
      if (gZenWorkspaces.getWorkspaces().length < 2) await gZenWorkspaces.createAndSaveWorkspace("Second")
      const [first, second] = gZenWorkspaces.getWorkspaces()
      await gZenWorkspaces.changeWorkspaceWithID(first.uuid)
      const home = newTab("data:text/html,<title>Home base</title>x")
      const mango = newTab("data:text/html,<title>Mango notes</title>x")
      gBrowser.selectedTab = home
      await sleep(100)
      const chips = () => [...shadow().querySelectorAll("[cmdk-input] ~ span:not([aria-hidden=true])")].map((chip) => chip.textContent)
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      press("alt+2")
      const spaceChip = await until(() => chips().find((text) => text.includes(second.name)), 2000).catch(() => "")
      press("alt+2")
      const cleared = await until(() => !chips().length, 2000).catch(() => false)
      press("ctrl+1")
      const containerChip = await until(() => chips()[0], 2000).catch(() => "")
      press("ctrl+1")
      const containerCleared = await until(() => !chips().length, 2000).catch(() => false)
      // With space 2 targeted, Enter on a tab moves it there and follows it.
      press("alt+2")
      typeQuery("Mango notes")
      await sleep(80)
      press("enter")
      await until(() => !paletteOpen(), 2000)
      await sleep(400)
      const moved = mango.getAttribute("zen-workspace-id") === second.uuid && gBrowser.selectedTab === mango && gZenWorkspaces.activeWorkspace === second.uuid
      gBrowser.removeTab(mango)
      gBrowser.removeTab(home)
      await gZenWorkspaces.changeWorkspaceWithID(first.uuid)
      return {
        ok: !!spaceChip && cleared && !!containerChip && containerCleared && moved,
        detail: "space chip " + JSON.stringify(spaceChip) + (cleared ? ", cleared" : ", stuck") + "; container chip " + JSON.stringify(containerChip) + (containerCleared ? ", cleared" : ", stuck") + "; tab " + (moved ? "moved to " + second.name : "not moved"),
      }`,
  },
  {
    name: "ctrl+. records a shortcut in the palette, and a tab gets a jump key",
    body: String.raw`${READY}
      const binding = (id) => JSON.parse(Services.prefs.getStringPref("zencast.config", "{}")).bindings?.[id] ?? []
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("Pin or unpin tab")
        await sleep(80)
        press("ctrl+.")
        await until(() => shadow().textContent.includes("Press keys"), 2000)
        press("ctrl+shift+y")
        const recorded = await until(() => binding("pin.toggle")[0] === "ctrl+shift+y", 3000).catch(() => false)
        await dismiss()

        const kiwi = newTab("data:text/html,<title>Kiwi page</title>x")
        const other = newTab("data:text/html,<title>Other</title>x")
        await sleep(100)
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("Kiwi page")
        await sleep(80)
        press("ctrl+.")
        await until(() => shadow().textContent.includes("Press keys"), 2000)
        press("ctrl+shift+u")
        const jumpId = "jump:url:" + kiwi.linkedBrowser.currentURI.spec
        const bound = await until(() => binding(jumpId)[0] === "ctrl+shift+u", 3000).catch(() => false)
        await dismiss()
        gBrowser.selectedTab = other
        await sleep(100)
        press("ctrl+shift+u", document.documentElement)
        const jumped = await until(() => gBrowser.selectedTab === kiwi, 2000).catch(() => false)
        gBrowser.removeTab(kiwi)
        gBrowser.removeTab(other)
        return {
          ok: recorded && bound && jumped,
          detail: "pin: " + (recorded ? "ctrl+shift+y" : JSON.stringify(binding("pin.toggle"))) + "; jump " + (bound ? "bound" : "not bound") + (jumped ? ", switched to Kiwi page" : ", did not switch"),
        }
      } finally {
        Services.prefs.clearUserPref("zencast.config")
      }`,
  },
  {
    name: "number prefs are edited in the palette through a prompt",
    body: String.raw`${READY}
      const defaults = Services.prefs.getDefaultBranch("")
      const name = defaults.getChildList("zen.").find((pref) => defaults.getPrefType(pref) === Services.prefs.PREF_INT && !/migration|\.version$/.test(pref))
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery(name)
        const row = await until(() => shadow().querySelector('[cmdk-item][data-value="pref:' + name + '"]'), 3000)
        row.click()
        const input = shadow().querySelector("[cmdk-input]")
        const initial = await until(() => input.value === String(Services.prefs.getIntPref(name)) && input.value, 2000).catch(() => input.value)
        typeQuery("4242")
        await sleep(50)
        press("enter")
        await until(() => !paletteOpen(), 2000)
        const value = Services.prefs.getIntPref(name)
        return { ok: value === 4242 && initial !== "", detail: name + ": prompt started at " + initial + ", saved " + value }
      } finally {
        if (name) Services.prefs.clearUserPref(name)
      }`,
  },
  {
    name: "ctrl+shift+, opens the settings page",
    body: String.raw`${READY}
      press("ctrl+shift+,", document.documentElement)
      const browser = await until(() => gBrowser.selectedBrowser.currentURI.spec.includes("zencast/settings") && gBrowser.selectedBrowser)
      const doc = await until(() => browser.contentDocument?.querySelector("nav a") && browser.contentDocument)
      const nav = [...doc.querySelectorAll("nav a")].map((a) => a.textContent.trim())
      browser.contentWindow.location.hash = "#folders"
      const tree = await until(() => doc.querySelector("[role=tree] [role=treeitem]") && doc.querySelector("[role=tree]"))
      const columns = tree.querySelectorAll(":scope > [role=group]").length
      const spaces = gZenWorkspaces.getWorkspaces().length
      const icon = await until(() => gBrowser.selectedTab.getAttribute("image"), 3000).catch(() => "")
      browser.contentWindow.location.hash = "#settings"
      const tabs = await until(() => [...doc.querySelectorAll("[role=tab]")].some((tab) => tab.textContent.trim() === "Pages") && [...doc.querySelectorAll("[role=tab]")])
      const tabsTab = tabs.find((tab) => tab.textContent.trim() === "Tabs")
      tabsTab.focus()
      const vertical = await until(() => [...doc.querySelectorAll("[role=tabpanel] [role=switch]")].some((s) => s.getAttribute("aria-label") === "Vertical tabs"), 2000).catch(() => false)
      const ok = nav.length === 5 && columns === spaces && icon.includes("logo") && tabs.length === 8 && vertical
      return { ok, detail: nav.join(", ") + "; " + columns + " space columns; favicon " + (icon.split("/").pop() || "missing") + "; settings tabs " + tabs.map((t) => t.textContent.trim()).join(" ") + (vertical ? "; Vertical tabs under Tabs" : "") }`,
  },
  {
    name: "zencast's card in Sine's mod list opens the settings page",
    body: String.raw`${READY}
      openPreferences("paneSineMods")
      const browser = await until(() => gBrowser.selectedBrowser.currentURI.spec.startsWith("about:preferences") && gBrowser.selectedBrowser)
      const button = await until(() => browser.contentDocument?.querySelector('.sineItem[mod-id="zencast"] .zencast-settings-button'), 10000)
      const title = await until(() => button.getAttribute("title"), 3000).catch(() => "")
      button.click()
      const opened = await until(() => gBrowser.selectedBrowser.currentURI.spec.includes("zencast/settings"), 3000).catch(() => false)
      return { ok: Boolean(opened), detail: "button \"" + title + "\"; " + (opened ? "opened settings" : "settings did not open") }`,
  },
  {
    // Closing a space's first tab leaves Zen's placeholder tab without a browser.
    name: "ctrl+shift+, still opens settings when a tab has no browser",
    body: String.raw`${READY}
      for (const tab of gBrowser.tabs.filter((tab) => tab.linkedBrowser?.currentURI?.spec.includes("zencast/settings"))) gBrowser.removeTab(tab)
      const first = gBrowser.tabs[0]
      gBrowser.selectedTab = gBrowser.addTrustedTab("about:blank", { skipAnimation: true })
      gBrowser.removeTab(first)
      const empty = await until(() => gBrowser.tabs.filter((tab) => tab.linkedBrowser === null).length, 3000).catch(() => 0)
      press("ctrl+shift+,", document.documentElement)
      const opened = await until(() => gBrowser.selectedBrowser.currentURI.spec.includes("zencast/settings"), 3000).catch(() => false)
      return { ok: empty > 0 && Boolean(opened), detail: empty + " tab without a browser; " + (opened ? "opened settings" : "settings did not open") }`,
  },
  {
    name: "bookmarks are found by title and folder, and ctrl+. gives one a key",
    body: String.raw`${READY}
      ${PLACES}
      const url = "https://example.com/quokka-handbook"
      const folder = await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.toolbarGuid, type: PlacesUtils.bookmarks.TYPE_FOLDER, title: "Field notes" })
      await PlacesUtils.bookmarks.insert({ parentGuid: folder.guid, url, title: "Quokka handbook" })
      await sleep(300)
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("field notes")
        const byFolder = await until(() => resultTitles().some((title) => title.startsWith("Quokka handbook")), 3000).catch(() => false)
        typeQuery("quokka")
        const first = await until(() => (resultTitles()[0] ?? "").startsWith("Quokka handbook") && resultTitles()[0], 3000).catch(() => resultTitles()[0] ?? "")
        press("ctrl+.")
        await until(() => shadow().textContent.includes("Press keys"), 2000)
        press("ctrl+shift+q")
        const bound = await until(() => JSON.parse(Services.prefs.getStringPref("zencast.config", "{}")).bindings?.["jump:url:" + url]?.[0] === "ctrl+shift+q", 3000).catch(() => false)
        await dismiss()
        press("ctrl+shift+q", document.documentElement)
        const jumped = await until(() => gBrowser.selectedBrowser.currentURI?.spec === url || gBrowser.selectedBrowser.userTypedValue === url, 3000).catch(() => false)
        if (jumped) gBrowser.removeTab(gBrowser.selectedTab)
        return {
          ok: byFolder && first.startsWith("Quokka handbook") && bound && jumped,
          detail: "first row for quokka: " + first.slice(0, 40) + (byFolder ? "; found by folder" : "; not found by folder") + (bound ? "; key bound" : "; key not bound") + (jumped ? ", opens it" : ", did not open"),
        }
      } finally {
        Services.prefs.clearUserPref("zencast.config")
        await PlacesUtils.bookmarks.remove(folder.guid)
      }`,
  },
  {
    name: "a keyword opens its bookmark, and a quick link fills in the query",
    body: String.raw`${READY}
      ${PLACES}
      const template = "https://example.org/search?q=%s"
      const search = await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid, url: template, title: "Example search" })
      await PlacesUtils.keywords.insert({ keyword: "zq", url: template })
      const dash = await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid, url: "https://example.net/dash", title: "Dash board" })
      await PlacesUtils.keywords.insert({ keyword: "dsh", url: "https://example.net/dash" })
      await sleep(300)
      const opened = async () => {
        const url = await until(() => {
          const browser = gBrowser.selectedBrowser
          const spec = browser.currentURI?.spec ?? ""
          return spec.startsWith("https://example.") ? spec : (browser.userTypedValue ?? "").startsWith("https://example.") ? browser.userTypedValue : ""
        }, 3000).catch(() => "")
        if (url) gBrowser.removeTab(gBrowser.selectedTab)
        return url
      }
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("zq hello world")
        const filled = await until(() => (resultTitles()[0] ?? "").startsWith("hello world") && resultTitles()[0], 2000).catch(() => resultTitles()[0] ?? "")
        press("enter")
        const query = await opened()

        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("zq")
        await until(() => (resultTitles()[0] ?? "").includes("Type to search"), 2000)
        press("enter")
        await until(() => inputPlaceholder() === "Search", 2000)
        typeQuery("abc")
        await sleep(50)
        press("enter")
        const prompted = await opened()

        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("dsh")
        const plain = await until(() => (resultTitles()[0] ?? "").startsWith("Dash board") && resultTitles()[0], 2000).catch(() => resultTitles()[0] ?? "")
        await dismiss()
        return {
          ok: query.endsWith("q=hello%20world") && prompted.endsWith("q=abc") && plain.startsWith("Dash board"),
          detail: "zq hello world: " + (query || filled.slice(0, 30)) + "; zq then abc: " + prompted + "; dsh: " + plain.slice(0, 20),
        }
      } finally {
        await PlacesUtils.bookmarks.remove(search.guid)
        await PlacesUtils.bookmarks.remove(dash.guid)
        await PlacesUtils.keywords.remove("zq").catch(() => {})
        await PlacesUtils.keywords.remove("dsh").catch(() => {})
      }`,
  },
  {
    name: "a query can go to ChatGPT or Claude as a prompt",
    body: String.raw`${READY}
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      typeQuery("plan a quiet weekend")
      const rows = await until(() => resultTitles().some((title) => title.endsWith("Ask Claude")) && resultTitles(), 3000).catch(() => resultTitles())
      const gpt = rows.some((title) => title === "plan a quiet weekendAsk ChatGPT")
      // Each step lets React commit the new selection before the next key.
      for (let i = rows.findIndex((title) => title.endsWith("Ask Claude")); i > 0; i--) {
        press("down")
        await sleep(50)
      }
      press("enter")
      const url = await until(() => {
        const browser = gBrowser.selectedBrowser
        const spec = browser.currentURI?.spec ?? ""
        return spec.startsWith("https://claude.ai/") ? spec : (browser.userTypedValue ?? "").startsWith("https://claude.ai/") ? browser.userTypedValue : ""
      }, 3000).catch(() => "")
      if (url) gBrowser.removeTab(gBrowser.selectedTab)
      return {
        ok: gpt && url === "https://claude.ai/new?q=plan%20a%20quiet%20weekend",
        detail: (gpt ? "ChatGPT row shown" : "no ChatGPT row in " + rows.join(" | ").slice(0, 120)) + "; Claude opened " + (url || "nothing"),
      }`,
  },
  {
    name: "ask about this page sends the question, the selection and the address to an assistant",
    body: String.raw`${READY}
      ${PLACES}
      const page = "https://example.com/ask-page"
      const tab = newTab(page)
      await until(() => gBrowser.selectedBrowser.currentURI?.spec === page, 10000).catch(() => {})
      gBrowser.selectedBrowser.focus()
      goDoCommand("cmd_selectAll")
      await sleep(200)
      const opened = (host) => {
        const browser = gBrowser.selectedBrowser
        const spec = browser.currentURI?.spec ?? ""
        return spec.startsWith(host) ? spec : (browser.userTypedValue ?? "").startsWith(host) ? browser.userTypedValue : ""
      }
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("ask about this page")
        await until(() => (resultTitles()[0] ?? "").startsWith("Ask about this page"), 2000)
        await sleep(80)
        press("enter")
        const placeholder = await until(() => inputPlaceholder() === "Question about the selection" && inputPlaceholder(), 2000).catch(() => inputPlaceholder())
        typeQuery("what is this")
        await until(() => (resultTitles()[0] ?? "") === "what is this", 2000)
        await sleep(80)
        press("ctrl+enter")
        const url = await until(() => opened("https://chatgpt.com/"), 3000).catch(() => "")
        const prompt = new URL(url || "https://x/").searchParams.get("q")
        return {
          ok: placeholder === "Question about the selection" && (prompt ?? "").startsWith("what is this\n\n> ") && prompt.includes("domain") && prompt.endsWith("\n\nFrom " + page),
          detail: "placeholder " + placeholder + "; ChatGPT got " + JSON.stringify(prompt),
        }
      } finally {
        await dismiss().catch(() => {})
        if (opened("https://chatgpt.com/")) gBrowser.removeTab(gBrowser.selectedTab)
        if (tab.isConnected) gBrowser.removeTab(tab)
      }`,
  },
  {
    name: "ctrl+b fills a bookmark's name, folder and keyword, then edits it",
    body: String.raw`${READY}
      ${PLACES}
      const url = "https://example.com/zencast-ctrl-b"
      const tab = newTab(url)
      await until(() => gBrowser.selectedBrowser.currentURI?.spec === url, 10000).catch(() => {})
      await sleep(200)
      try {
        press("ctrl+b", document.documentElement)
        await until(paletteOpen, 2000)
        const initial = shadow().querySelector("[cmdk-input]").value
        typeQuery("Ctrl B test")
        await sleep(50)
        press("enter")
        await until(() => inputPlaceholder() === "Folder", 2000)
        typeQuery("other bookmarks")
        await until(() => (resultTitles()[0] ?? "").startsWith("Other bookmarks"), 2000)
        press("enter")
        await until(() => inputPlaceholder().startsWith("Keyword"), 2000)
        typeQuery("cbt")
        await sleep(50)
        const label = resultTitles()[0] ?? ""
        press("enter")
        await until(() => !paletteOpen(), 2000)
        const saved = await poll(() => PlacesUtils.bookmarks.fetch({ url }))
        const keyword = await PlacesUtils.keywords.fetch({ url })
        await sleep(300)

        press("ctrl+b", document.documentElement)
        await until(paletteOpen, 2000)
        const fields = await until(() => resultTitles().length >= 5 && resultTitles(), 2000).catch(() => resultTitles())
        shadow().querySelector('[cmdk-item][data-value="bookmark-edit-delete"]').click()
        await until(() => !paletteOpen(), 2000)
        const removed = await poll(async () => !(await PlacesUtils.bookmarks.fetch({ url })))

        // Zen's bookmarks sidebar command no longer shows Ctrl+B, which Zencast now owns.
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("bookmark show sidebar")
        const sidebar = await until(() => resultTitles().find((title) => title.startsWith("Bookmark show sidebar")), 2000).catch(() => "")
        await dismiss()
        const ok = initial !== "" && label.includes("cbt") && saved?.title === "Ctrl B test" && saved?.parentGuid === PlacesUtils.bookmarks.unfiledGuid &&
          keyword?.keyword === "cbt" && fields.some((title) => title.startsWith("Keyword")) && removed && sidebar !== "" && !sidebar.endsWith("CtrlB")
        return {
          ok,
          detail: "name from \"" + initial.slice(0, 20) + "\" to " + saved?.title + " in " + saved?.parentGuid + ", keyword " + keyword?.keyword + "; edit rows " + fields.length + (removed ? ", removed" : ", not removed") + "; sidebar row: " + sidebar,
        }
      } finally {
        gBrowser.removeTab(tab)
        const left = await PlacesUtils.bookmarks.fetch({ url })
        if (left) await PlacesUtils.bookmarks.remove(left.guid)
        await PlacesUtils.keywords.remove("cbt").catch(() => {})
      }`,
  },
  {
    name: "bookmarks are browsed by folder, moved, edited and deleted with undo",
    body: String.raw`${READY}
      ${PLACES}
      const { bookmarks: api, keywords } = PlacesUtils
      const shelf = await api.insert({ parentGuid: api.toolbarGuid, type: api.TYPE_FOLDER, title: "Zc shelf" })
      const inner = await api.insert({ parentGuid: shelf.guid, type: api.TYPE_FOLDER, title: "Zc inner" })
      const one = await api.insert({ parentGuid: shelf.guid, url: "https://example.com/shelf-one", title: "Shelf one" })
      const two = await api.insert({ parentGuid: shelf.guid, url: "https://example.com/shelf-two", title: "Shelf two" })
      await keywords.insert({ keyword: "sh1", url: "https://example.com/shelf-one" })
      await sleep(300)
      const undo = async () => (await until(() => document.getElementById("zencast-toast-action"), 2000)).doCommand()
      const pick = async (query, view) => {
        typeQuery(query)
        await until(() => (resultTitles()[0] ?? "").toLowerCase().startsWith(query), 2000)
        await sleep(80)
        press("enter")
        if (view) await until(() => inputPlaceholder() === view, 2000)
      }
      const closed = (step) => until(() => !paletteOpen(), 2000).catch(() => {
        throw new Error("palette stayed open after " + step + ": " + inputPlaceholder() + " | " + resultTitles().slice(0, 3).join(" | "))
      })
      // Waits a frame after the row shows, so the palette has selected it before a key acts on it.
      const select = async (query) => {
        typeQuery(query)
        await until(() => (resultTitles()[0] ?? "").toLowerCase().startsWith(query), 2000)
        await sleep(80)
      }
      const before = gBrowser.tabs.length
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        await pick("browse bookmarks", "Folder")
        await pick("bookmarks toolbar", "Search Bookmarks toolbar")
        typeQuery("zc shelf")
        const summary = await until(() => resultTitles().find((title) => title.startsWith("Zc shelf")), 2000).catch(() => "")
        press("enter")
        await until(() => inputPlaceholder() === "Search Zc shelf", 2000)
        const order = await until(() => resultTitles().length === 3 && resultTitles(), 2000).catch(() => resultTitles())

        await select("shelf one")
        press("ctrl+m")
        await until(() => inputPlaceholder() === "Folder", 2000)
        typeQuery("zc inner")
        await until(() => (resultTitles()[0] ?? "").startsWith("Zc inner"), 2000)
        await sleep(80)
        press("enter")
        await closed("move")
        const moved = await poll(async () => (await api.fetch(one.guid))?.parentGuid === inner.guid)
        const movedTo = (await api.fetch(one.guid))?.parentGuid
        await undo()
        const back = await poll(async () => {
          const now = await api.fetch(one.guid)
          return now?.parentGuid === shelf.guid && now.index === one.index
        })

        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        await select("shelf one")
        press("ctrl+e")
        await until(() => resultTitles().some((title) => title.startsWith("URL")), 2000)
        shadow().querySelector('[cmdk-item][data-value="bookmark-edit-url"]').click()
        await until(() => inputPlaceholder().startsWith("URL"), 2000)
        typeQuery("example.com/shelf-uno")
        await sleep(50)
        press("enter")
        await closed("url")
        const renamed = await poll(async () => (await api.fetch(one.guid))?.url.href === "https://example.com/shelf-uno")
        const keyword = await poll(async () => (await keywords.fetch("sh1"))?.url.href === "https://example.com/shelf-uno")

        await sleep(300)
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        await select("shelf two")
        press("ctrl+shift+backspace")
        await closed("delete")
        const deleted = await poll(async () => !(await api.fetch(two.guid)))
        await undo()
        const restored = await poll(async () => {
          const found = await api.fetch({ url: "https://example.com/shelf-two" })
          return found?.parentGuid === shelf.guid && found.index === two.index
        })

        await sleep(300)
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        await pick("browse bookmarks", "Folder")
        await pick("bookmarks toolbar", "Search Bookmarks toolbar")
        await select("zc shelf")
        press("ctrl+enter")
        const opened = await until(() => gBrowser.tabs.length === before + 2, 3000).catch(() => false)

        const ok = summary.includes("1 folder · 2 bookmarks") && ["Zc inner", "Shelf one", "Shelf two"].every((title, i) => order[i]?.startsWith(title)) && moved && back && renamed && keyword && deleted && restored && opened
        return {
          ok,
          detail: "row: " + summary + "; order " + order.map((title) => title.slice(0, 9)).join(", ") + (moved ? "; moved" : "; not moved, went to " + movedTo) + (back ? ", undone in place" : ", not undone") +
            (renamed ? "; URL changed" : "; URL unchanged") + (keyword ? " with its keyword" : ", keyword left behind") +
            (deleted ? "; deleted" : "; not deleted") + (restored ? ", restored in place" : ", not restored") + (opened ? "; opened all" : "; open all opened " + (gBrowser.tabs.length - before)),
        }
      } finally {
        await dismiss().catch(() => {})
        while (gBrowser.tabs.length > before) gBrowser.removeTab(gBrowser.tabs.at(-1))
        await api.remove(shelf.guid)
        await keywords.remove("sh1").catch(() => {})
      }`,
  },
  {
    name: "clean up closes week-old tabs into a bookmark folder, and undo brings them back",
    body: String.raw`${READY}
      ${PLACES}
      const principal = Services.scriptSecurityManager.getSystemPrincipal()
      const { E10SUtils } = ChromeUtils.importESModule("resource://gre/modules/E10SUtils.sys.mjs")
      const old = ["https://example.com/stale-one", "https://example.com/stale-two"].map((url, i) => {
        const tab = gBrowser.addTab(url, { triggeringPrincipal: principal, inBackground: true, createLazyBrowser: true, title: "Stale " + (i + 1) })
        // Asleep tabs get their title from SessionStore, as after a restart.
        const lastAccessed = Date.now() - (9 + i) * 24 * 60 * 60 * 1000
        SessionStore.setTabState(tab, JSON.stringify({ entries: [{ url, title: "Stale " + (i + 1), triggeringPrincipal_base64: E10SUtils.serializePrincipal(principal) }], lastAccessed }))
        tab.updateLastAccessed(lastAccessed)
        return tab
      })
      const before = gBrowser.tabs.length
      const staleOpen = () => gBrowser.tabs.filter((tab) => tab.linkedBrowser?.currentURI?.spec.includes("/stale-")).length
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("clean up tabs")
        await until(() => (resultTitles()[0] ?? "").startsWith("Clean up tabs"), 2000)
        await sleep(80)
        press("enter")
        await until(() => inputPlaceholder() === "Tab", 2000)
        const rows = await until(() => resultTitles().length >= 3 && resultTitles(), 2000).catch(() => resultTitles())
        press("enter")
        await until(() => !paletteOpen(), 2000)
        const closed = await poll(() => staleOpen() === 0)
        const folder = await poll(async () => {
          const found = await PlacesUtils.bookmarks.search({ url: "https://example.com/stale-two" })
          return found[0]?.title === "Stale 2" && found[0].parentGuid
        })
        const toast = await until(() => toastText().includes("Closed") && toastText(), 2000).catch(() => toastText())
        ;(await until(() => document.getElementById("zencast-toast-action"), 2000)).doCommand()
        const back = await poll(() => staleOpen() === 2 && gBrowser.tabs.some((tab) => tab.label === "Stale 1" && tab.hasAttribute("pending")))
        const gone = await poll(async () => !(await PlacesUtils.bookmarks.fetch(folder ?? "")))
        // A tab opened asleep keeps the label "New Tab" in a headless Zen, so rows are told apart by URL.
        const ok = rows[0]?.startsWith("Close 2 tabs") && rows[1]?.includes("stale-two") && rows[2]?.includes("stale-one") && closed && !!folder && back && gone
        return {
          ok,
          detail: "rows " + rows.map((row) => row.slice(0, 12)).join(" | ") + (closed ? "; closed" : "; not closed") + (folder ? ", bookmarked" : ", no folder") +
            "; toast: " + toast + (back ? "; undo reopened them" : "; undo did not reopen") + (gone ? ", folder removed" : ", folder kept"),
        }
      } finally {
        await dismiss().catch(() => {})
        for (const tab of gBrowser.tabs.filter((tab) => tab.linkedBrowser?.currentURI?.spec.includes("/stale-"))) gBrowser.removeTab(tab)
        for (const group of await PlacesUtils.bookmarks.search({ title: "Tab cleanup" })) await PlacesUtils.bookmarks.remove(group.guid)
      }`,
  },
  {
    name: "starter quick links fill a folder and keep a keyword already taken",
    body: String.raw`${READY}
      ${PLACES}
      const mine = "https://example.com/my-gh?q=%s"
      const own = await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid, url: mine, title: "My gh" })
      await PlacesUtils.keywords.insert({ keyword: "gh", url: mine })
      await sleep(300)
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("Add starter quick links")
        await until(() => (resultTitles()[0] ?? "").startsWith("Add starter quick links"), 2000)
        press("enter")
        const yt = await poll(() => PlacesUtils.keywords.fetch("yt"))
        const gh = await PlacesUtils.keywords.fetch("gh")
        const toast = await until(() => toastText(), 2000).catch(() => "")
        return {
          ok: !!yt && yt.url.href.startsWith("https://www.youtube.com/") && gh?.url.href === mine,
          detail: toast + "; gh still " + (gh?.url.href ?? "missing"),
        }
      } finally {
        await PlacesUtils.bookmarks.remove(own.guid)
        for (const folder of await PlacesUtils.bookmarks.search({ title: "Quick links" })) await PlacesUtils.bookmarks.remove(folder.guid)
        for (const keyword of ["gh", "yt", "wiki", "mdn", "npm", "maps", "gpt", "claude", "cf"]) await PlacesUtils.keywords.remove(keyword).catch(() => {})
      }`,
  },
  {
    name: "a site set to always open in a container moves there, and so does its next tab",
    body: String.raw`${READY}
      ${PLACES}
      const onSite = (path) => gBrowser.tabs.filter((tab) => tab.linkedBrowser?.currentURI?.spec === "https://example.com/" + path)
      const tab = newTab("https://example.com/site-rule")
      await until(() => gBrowser.selectedBrowser.currentURI?.spec === "https://example.com/site-rule", 10000).catch(() => {})
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("always open this site")
        await until(() => (resultTitles()[0] ?? "").startsWith("Always open this site"), 2000)
        await sleep(80)
        press("enter")
        await until(() => inputPlaceholder() === "Container", 2000)
        const first = await until(() => resultTitles()[0], 2000).catch(() => "")
        press("enter")
        await until(() => !paletteOpen(), 2000)
        const rule = await poll(() => JSON.parse(Services.prefs.getStringPref("zencast.config", "{}")).siteContainers?.["example.com"])
        const moved = await poll(() => onSite("site-rule").length === 1 && onSite("site-rule")[0].userContextId === rule)

        gBrowser.selectedTab = gBrowser.addTab("https://example.com/next", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() })
        const next = await poll(() => onSite("next").length === 1 && onSite("next")[0].userContextId === rule, 10000)
        return {
          ok: rule > 0 && moved && next,
          detail: "picked " + first + " → rule " + rule + (moved ? "; this tab moved" : "; this tab stayed") + (next ? "; next tab opened in it" : "; next tab in " + onSite("next").map((t) => t.userContextId).join(",")),
        }
      } finally {
        await dismiss().catch(() => {})
        Services.prefs.clearUserPref("zencast.config")
        for (const open of [...onSite("site-rule"), ...onSite("next")]) gBrowser.removeTab(open)
        if (tab.isConnected) gBrowser.removeTab(tab)
      }`,
  },
  {
    name: "google account containers read Google's real list and leave the cookie jar alone",
    body: String.raw`${READY}
      // A stand-in cookie makes the request go out; Google answers with an empty list for it.
      const jar = () => Services.cookies.getCookiesWithOriginAttributes("{}", "google.com").map((c) => c.name + "=" + c.value).sort().join("; ")
      Services.cookies.add(".google.com", "/", "SID", "zencast-test", true, false, false, Date.now() + 600000, {}, Ci.nsICookie.SAMESITE_NONE, Ci.nsICookie.SCHEME_HTTPS, false)
      const before = jar()
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("Google account containers")
        await until(() => (resultTitles()[0] ?? "").startsWith("Google account containers"), 2000)
        press("enter")
        const toast = await until(() => toastText().includes("Google") && toastText(), 8000).catch(() => toastText())
        const after = jar()
        return {
          ok: toast.includes("No Google accounts signed in") && after === before,
          detail: "toast: " + toast + (after === before ? "; cookie jar unchanged" : "; cookie jar changed: " + after.slice(0, 80)),
        }
      } finally {
        Services.cookies.remove(".google.com", "SID", "/", {})
        Services.prefs.clearUserPref("zencast.googleAccounts")
      }`,
  },
  {
    name: "mod overlap finds mods on Zencast's keys and turns one off through Sine",
    body: String.raw`${READY}
      const utils = ChromeUtils.importESModule("chrome://userscripts/content/core/utils.sys.mjs").default
      const fake = async (id, name, files) => {
        const folder = utils.getModFolder(id)
        await IOUtils.makeDirectory(folder, { ignoreExisting: true })
        for (const [file, text] of Object.entries(files)) await IOUtils.writeUTF8(PathUtils.join(folder, file), text)
        const mods = await utils.getMods()
        mods[id] = { id, name, enabled: true }
        await IOUtils.writeJSON(utils.modsDataFile, mods)
      }
      // A live shortcut setting wins over the default in its script; a mod without one is read from its script.
      await fake("zc-pinner", "Fake pinner", {
        "pinner.uc.js": 'const DEFAULT = "Ctrl+K"; Services.prefs.getStringPref("zc.pinner.shortcut", DEFAULT)',
        "preferences.json": JSON.stringify([{ type: "string", property: "zc.pinner.shortcut", defaultValue: "Ctrl+K" }]),
      })
      Services.prefs.setStringPref("zc.pinner.shortcut", "Alt+P")
      await fake("zen-tab-palette", "Fake tab palette", { "palette.uc.js": 'const OPEN = "Ctrl+K"; const HINT = "Ctrl+Enter"' })
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("Mod overlap")
        await until(() => (resultTitles()[0] ?? "").startsWith("Mod overlap"), 2000)
        press("enter")
        const rows = await until(() => resultTitles().length >= 2 && resultTitles()[0].startsWith("Fake") && resultTitles(), 4000).catch(() => resultTitles())
        press("enter")
        let disabled = false
        for (let i = 0; i < 40 && !disabled; i++) {
          disabled = (await utils.getMods())["zc-pinner"]?.enabled === false
          if (!disabled) await sleep(50)
        }
        const toast = await until(() => toastText().includes("Turned off") && toastText(), 2000).catch(() => toastText())
        const pinner = rows.find((row) => row.startsWith("Fake pinner")) ?? ""
        const palette = rows.find((row) => row.startsWith("Fake tab palette")) ?? ""
        // "*" lists every mod, off ones too, and Enter turns one back on in place.
        await until(() => !paletteOpen(), 2000).catch(() => dismiss())
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("*fake pin")
        const listed = await until(() => (resultTitles()[0] ?? "").startsWith("Fake pinnerOff") && resultTitles()[0], 4000).catch(() => resultTitles()[0] ?? "")
        press("enter")
        const shown = await until(() => (resultTitles()[0] ?? "").startsWith("Fake pinnerOn") && resultTitles()[0], 4000).catch(() => resultTitles()[0] ?? "")
        const enabled = (await utils.getMods())["zc-pinner"]?.enabled === true
        await dismiss()
        return {
          ok: pinner.includes("Same key as Pin or unpin tab") && !pinner.includes("Open Zencast") && palette.includes("Same key as Open Zencast") && disabled
            && listed.startsWith("Fake pinnerOff") && shown.startsWith("Fake pinnerOn") && enabled,
          detail: "pinner: " + pinner + " | palette: " + palette + " | " + (disabled ? "turned off" : "still on") + "; toast: " + toast + " | *fake pin: " + listed + " → " + shown,
        }
      } finally {
        const mods = await utils.getMods()
        for (const id of ["zc-pinner", "zen-tab-palette"]) {
          delete mods[id]
          await IOUtils.remove(utils.getModFolder(id), { recursive: true, ignoreAbsent: true })
        }
        await IOUtils.writeJSON(utils.modsDataFile, mods)
        Services.prefs.clearUserPref("zc.pinner.shortcut")
      }`,
  },
]

export async function runScenarios(zen: Zen): Promise<ScenarioResult[]> {
  const server = createServer((_, response) => response.writeHead(200, { "content-type": "text/html" }).end("<title>Kiwi dev server</title>"))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  const port = String(typeof address === "object" && address ? address.port : 0)
  const results: ScenarioResult[] = []
  for (const scenario of SCENARIOS) {
    console.error(`… ${scenario.name}`)
    const start = performance.now()
    try {
      const value = await zen.run(scenario.body.replaceAll(LOCAL_PORT, port))
      const ok = typeof value === "object" && value !== null && "ok" in value && value.ok === true
      const detail = typeof value === "object" && value !== null && "detail" in value ? String(value.detail) : ""
      results.push({ name: scenario.name, ok, detail, ms: Math.round(performance.now() - start) })
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error)
      results.push({ name: scenario.name, ok: false, detail: message, ms: Math.round(performance.now() - start) })
    }
  }
  server.close()
  return results
}

/** Saves screenshots of the open palette and the folder manager for visual review. */
export async function captureScreens(zen: Zen, dir: string): Promise<string[]> {
  await mkdir(dir, { recursive: true })
  const files: string[] = []
  const shot = async (name: string) => {
    const path = join(dir, `${name}.png`)
    await writeFile(path, await zen.screenshot())
    files.push(path)
  }
  await zen.run(String.raw`${READY}
    gBrowser.selectedTab = gBrowser.tabs[0]
    // Zen focuses the address bar shortly after selecting an empty tab; let that settle first.
    await sleep(300)
    press("ctrl+k", document.documentElement)
    await until(paletteOpen)
    await sleep(300)`)
  await shot("palette")
  await zen.run(String.raw`typeQuery("sett"); await sleep(300)`)
  await shot("palette-search")
  await zen.run(String.raw`press("ctrl+j"); await sleep(300)`)
  await shot("palette-actions")
  await zen.run(String.raw`press("escape"); typeQuery(""); await sleep(100); typeQuery("/"); await sleep(300)`)
  await shot("palette-scope")
  await zen.run(String.raw`press("backspace"); await sleep(100)`)
  await zen.run(String.raw`press("escape"); typeQuery(""); await sleep(100)
    if (gZenWorkspaces.getWorkspaces().length < 2) await gZenWorkspaces.createAndSaveWorkspace("Second")
    press("alt+2"); press("ctrl+2"); await sleep(400)`)
  await shot("palette-targets")
  await zen.run(String.raw`document.documentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", code: "AltLeft", altKey: true, bubbles: true, composed: true }))
    await sleep(400)`)
  await shot("palette-spaces")
  await zen.run(String.raw`document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", code: "AltLeft", bubbles: true, composed: true }))
    await dismiss()
    document.documentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", code: "ControlLeft", ctrlKey: true, bubbles: true, composed: true }))
    document.documentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", code: "ShiftLeft", ctrlKey: true, shiftKey: true, bubbles: true, composed: true }))
    await sleep(700)`)
  await shot("keysheet")
  await zen.run(String.raw`document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", ctrlKey: true, bubbles: true, composed: true }))
    document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", code: "ControlLeft", bubbles: true, composed: true }))
    press("ctrl+shift+,", document.documentElement)
    const browser = await until(() => gBrowser.selectedBrowser.currentURI.spec.includes("zencast/settings") && gBrowser.selectedBrowser)
    await until(() => browser.contentDocument?.querySelector("nav a"))
    browser.contentWindow.location.hash = "#keys"
    await sleep(400)`)
  await shot("settings-shortcuts")
  await zen.run(String.raw`gBrowser.selectedBrowser.contentWindow.location.hash = "#folders"; await sleep(400)`)
  await shot("settings-folders")
  await zen.run(String.raw`gBrowser.selectedBrowser.contentWindow.location.hash = "#settings"; await sleep(400)`)
  await shot("settings-zen")
  await zen.run(String.raw`const doc = gBrowser.selectedBrowser.contentDocument
    ;[...doc.querySelectorAll("[role=tab]")].find((tab) => tab.textContent.trim() === "Tabs").focus()
    await sleep(300)`)
  await shot("settings-zen-tabs")
  return files
}

export interface Stats {
  samples: number
  p50: number
  p95: number
  max: number
}

function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  const round = (n: number) => Math.round(n * 100) / 100
  return { samples: sorted.length, p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1) ?? 0) }
}

/**
 * p95 budgets in milliseconds; a frame at 60 Hz is 16.7 ms. Open runs from the key press to the
 * first painted frame, so it includes up to a frame of vsync alignment. Keystroke is the work a key
 * press blocks before the next paint, kept under one frame so typing never drops one.
 */
export const BUDGETS = { open: 33.4, search: 4, keystroke: 16.7 } as const

export interface BenchResult {
  tabs: number
  metrics: Record<keyof typeof BUDGETS, Stats & { budget: number; ok: boolean }>
  firstOpen: number
}

const QUERIES = ["settings", "pin tab", "github", "contaner", "dark mode", "move to space", "folder", "page 1"]

export async function runBench(zen: Zen, options: { tabs: number; opens: number }): Promise<BenchResult> {
  const raw = await zen.run(
    String.raw`${READY}
      const principal = Services.scriptSecurityManager.getSystemPrincipal()
      for (let i = 0; i < ${options.tabs}; i++)
        gBrowser.addTab("https://example.com/page-" + i, { createLazyBrowser: true, lazyTabTitle: "Page " + i + " example", triggeringPrincipal: principal, skipAnimation: true })
      await sleep(500)

      // Opens: key press to the first painted frame, measured by the mod itself.
      const openStart = Zencast.perf().open.length
      for (let i = 0; i < ${options.opens}; i++) {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        await frame(); await frame()
        Zencast.close()
        await until(() => !paletteOpen())
        await sleep(30)
      }
      const opens = Zencast.perf().open.slice(openStart)

      // Typing: each prefix of each query, as a keystroke would produce it.
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      const searchStart = Zencast.perf().search.length
      const keystrokes = []
      const list = shadow().querySelector("[cmdk-list]")
      for (const query of ${JSON.stringify(QUERIES)}) {
        for (let n = 1; n <= query.length; n++) {
          // Main-thread work a key press blocks before the next paint: React commits input events
          // synchronously, then style and layout are forced. The deferred rest of the list is excluded.
          const t0 = performance.now()
          typeQuery(query.slice(0, n))
          list.getBoundingClientRect()
          keystrokes.push(performance.now() - t0)
          await frame()
          await frame()
        }
        typeQuery("")
        await frame()
      }
      const searches = Zencast.perf().search.slice(searchStart)
      Zencast.close()
      return { tabs: gBrowser.tabs.length, opens, searches, keystrokes }`,
    180000,
  )
  if (typeof raw !== "object" || raw === null) throw new Error("Benchmark returned nothing")
  const numbers = (key: string): number[] => {
    const value: unknown = key in raw ? Reflect.get(raw, key) : []
    return Array.isArray(value) ? value.filter((n): n is number => typeof n === "number") : []
  }
  const opens = numbers("opens")
  const measured = { open: stats(opens.slice(1)), search: stats(numbers("searches")), keystroke: stats(numbers("keystrokes")) }
  const metrics = {
    open: { ...measured.open, budget: BUDGETS.open, ok: measured.open.p95 <= BUDGETS.open },
    search: { ...measured.search, budget: BUDGETS.search, ok: measured.search.p95 <= BUDGETS.search },
    keystroke: { ...measured.keystroke, budget: BUDGETS.keystroke, ok: measured.keystroke.p95 <= BUDGETS.keystroke },
  }
  const tabs = "tabs" in raw && typeof raw.tabs === "number" ? raw.tabs : 0
  return { tabs, metrics, firstOpen: Math.round((opens[0] ?? 0) * 100) / 100 }
}
