// End-to-end checks and interaction benchmarks, run against an isolated headless Zen.
import { mkdir, writeFile } from "node:fs/promises"
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
        if (paletteOpen()) await dismiss()
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
    name: "alt+2 moves the tab to space 2, follows it, and shows a Zen toast",
    body: String.raw`${READY}
      if (gZenWorkspaces.getWorkspaces().length < 2) await gZenWorkspaces.createAndSaveWorkspace("Second", undefined, true)
      const [first, target] = gZenWorkspaces.getWorkspaces()
      const tab = newTab()
      await sleep(50)
      press("alt+2", document.documentElement)
      await until(() => tab.getAttribute("zen-workspace-id") === target.uuid)
      await until(() => gZenWorkspaces.activeWorkspace === target.uuid && gBrowser.selectedTab === tab, 4000)
      const text = await until(() => toastText().includes("Moved to") && toastText(), 4000)
      const ok = text.includes("Moved to " + target.name)
      gBrowser.removeTab(tab)
      await gZenWorkspaces.changeWorkspaceWithID(first.uuid)
      const native = document.getElementById("key_selectTab2")
      const shadowed = native ? native.getAttribute("modifiers") + "+" + native.getAttribute("key") : "none"
      return { ok, detail: "followed to " + target.name + "; toast: " + text + "; overrides native " + shadowed }`,
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
    name: "holding ctrl labels visible rows with letters",
    body: String.raw`${READY}
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      const init = { key: "Control", code: "ControlLeft", ctrlKey: true, bubbles: true, composed: true }
      document.documentElement.dispatchEvent(new KeyboardEvent("keydown", init))
      const hints = () => [...shadow().querySelectorAll("[cmdk-item] kbd.text-peach")].map((kbd) => kbd.textContent)
      const shown = await until(() => hints().length && hints(), 2000)
      // Each row marks its letter inside the title.
      const marked = [...shadow().querySelectorAll("[cmdk-item]")].filter((item) => item.querySelector("kbd.text-peach"))
        .every((item) => item.querySelector("span.underline")?.textContent.toLowerCase() === item.querySelector("kbd.text-peach").textContent)
      document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { ...init, ctrlKey: false }))
      await until(() => hints().length === 0, 2000)
      await dismiss()
      const unique = new Set(shown).size === shown.length && !shown.some((l) => "acvxzkqw".includes(l))
      return { ok: shown.length > 3 && unique && marked, detail: shown.join(" ") + (marked ? "; marked in titles" : "; titles not marked") + "; cleared on release" }`,
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
      const ok = nav.length === 4 && columns === spaces && icon.includes("logo") && tabs.length === 8 && vertical
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
]

export async function runScenarios(zen: Zen): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = []
  for (const scenario of SCENARIOS) {
    console.error(`… ${scenario.name}`)
    const start = performance.now()
    try {
      const value = await zen.run(scenario.body)
      const ok = typeof value === "object" && value !== null && "ok" in value && value.ok === true
      const detail = typeof value === "object" && value !== null && "detail" in value ? String(value.detail) : ""
      results.push({ name: scenario.name, ok, detail, ms: Math.round(performance.now() - start) })
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error)
      results.push({ name: scenario.name, ok: false, detail: message, ms: Math.round(performance.now() - start) })
    }
  }
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
  await zen.run(String.raw`press("ctrl+k"); await sleep(300)`)
  await shot("palette-actions")
  await zen.run(String.raw`press("escape"); typeQuery(""); await sleep(100)
    if (gZenWorkspaces.getWorkspaces().length < 2) await gZenWorkspaces.createAndSaveWorkspace("Second")
    press("alt+2"); press("ctrl+2"); await sleep(400)`)
  await shot("palette-targets")
  await zen.run(String.raw`document.documentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", code: "AltLeft", altKey: true, bubbles: true, composed: true }))
    await sleep(400)`)
  await shot("palette-spaces")
  await zen.run(String.raw`document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", code: "AltLeft", bubbles: true, composed: true }))
    await dismiss()
    press("ctrl+,", document.documentElement)
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
