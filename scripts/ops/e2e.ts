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

// A fresh profile on newer Zen has no containers; the scenarios expect the classic four.
const READY = String.raw`await until(() => window.Zencast && document.getElementById("zencast-host"), 20000)
      const identities = ChromeUtils.importESModule("moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs").ContextualIdentityService
      if (!identities.getPublicIdentities().length) {
        for (const [name, icon, color] of [["Personal", "fingerprint", "blue"], ["Work", "briefcase", "orange"], ["Banking", "dollar", "green"], ["Shopping", "cart", "pink"]]) identities.create(name, icon, color)
      }`

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
    name: "ctrl+t opens the palette by default, and turning it off gives Zen's new tab back",
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
        Services.prefs.clearUserPref(CONFIG)
        await sleep(100)
        const tabs = gBrowser.tabs.length
        gBrowser.selectedBrowser.focus()
        pressTrusted("ctrl+t")
        const opened = await until(paletteOpen, 2000).catch(() => false)
        await dismiss()
        const palette = opened && gBrowser.tabs.length === tabs
        setPaletteKeys(["ctrl+k"])
        await sleep(100)
        const afterOff = await nativeNewTab()
        return {
          ok: palette && afterOff,
          detail: "default: " + (palette ? "palette" : "not palette") + "; turned off: " + (afterOff ? "zen" : "blocked"),
        }
      } finally {
        Services.prefs.clearUserPref(CONFIG)
      }`,
  },
  {
    name: "the sidebar new-tab button follows Ctrl+T",
    body: String.raw`${READY}
      const CONFIG = "zencast.config"
      const button = document.getElementById("vertical-tabs-newtab-button")
      try {
        Services.prefs.setStringPref(CONFIG, JSON.stringify({ version: 1, bindings: { "zencast.palette": ["ctrl+k", "ctrl+t"] } }))
        await sleep(100)
        button.click()
        const opened = await until(paletteOpen, 2000).catch(() => false)
        await dismiss()
        Services.prefs.setStringPref(CONFIG, JSON.stringify({ version: 1, bindings: { "zencast.palette": ["ctrl+k"] } }))
        await sleep(100)
        gBrowser.selectedBrowser.focus()
        await sleep(100)
        const before = gBrowser.tabs.length
        button.click()
        await sleep(300)
        const native = !paletteOpen() && (gBrowser.tabs.length > before || gURLBar.focused)
        gURLBar.view.close()
        gURLBar.handleRevert()
        return { ok: opened && native, detail: "on: " + (opened ? "palette" : "no palette") + "; off: " + (native ? "zen" : "blocked") }
      } finally {
        Services.prefs.clearUserPref(CONFIG)
      }`,
  },
  {
    name: "typing always lands in the palette input, from a focused page and after focus leaves to nothing or the page",
    body: String.raw`${READY}
      const page = newTab("data:text/html,<title>Typer</title><input autofocus oninput='document.title=\"got:\"+this.value'>")
      await until(() => page.label === "Typer")
      gBrowser.selectedTab = page
      gBrowser.selectedBrowser.focus()
      await sleep(200)
      // Real key events, routed by focus like a keyboard's, unlike dispatched ones.
      const tip = Cc["@mozilla.org/text-input-processor;1"].createInstance(Ci.nsITextInputProcessor)
      tip.beginInputTransactionForTests(window)
      const type = async (text) => {
        for (const key of text) {
          const code = "Key" + key.toUpperCase()
          tip.keydown(new KeyboardEvent("", { key, code }))
          tip.keyup(new KeyboardEvent("", { key, code }))
          await sleep(20)
        }
      }
      const input = () => shadow().querySelector("[cmdk-input]")
      const typed = () => input()?.value.slice(0, input().selectionStart) ?? ""
      try {
        tip.keydown(new KeyboardEvent("", { key: "Control", code: "ControlLeft" }))
        tip.keydown(new KeyboardEvent("", { key: "k", code: "KeyK" }))
        tip.keyup(new KeyboardEvent("", { key: "k", code: "KeyK" }))
        tip.keyup(new KeyboardEvent("", { key: "Control", code: "ControlLeft" }))
        await sleep(20)
        await type("xq")
        const fromPage = await until(() => typed() === "xq", 2000).catch(() => false)
        // A click on the list's padding leaves focus nowhere; the next key still types.
        input().blur()
        await sleep(50)
        await type("w")
        const fromNothing = await until(() => typed() === "xqw", 2000).catch(() => false)
        gBrowser.selectedBrowser.focus()
        await sleep(50)
        await type("v")
        const fromBrowser = await until(() => typed() === "xqwv", 2000).catch(() => false)
        const pageClean = page.label === "Typer"
        return {
          ok: !!fromPage && !!fromNothing && !!fromBrowser && pageClean,
          detail: "typed " + typed() + (pageClean ? "; page got nothing" : "; page got " + page.label),
        }
      } finally {
        await dismiss().catch(() => {})
        gBrowser.removeTab(page)
      }`,
  },
  {
    name: "the Zen internals Zencast wraps are still there, and native shortcuts are read",
    body: String.raw`${READY}
      const wanted = {
        gZenWorkspaces: ["getWorkspaces", "activeWorkspace", "moveTabToWorkspace", "changeWorkspaceWithID", "switchTabIfNeeded", "allStoredTabs"],
        gZenFolders: ["createFolder", "expandAllFolders", "collapseAllFolders", "changeFolderToSpace"],
        gZenUIManager: ["showToast"],
        gZenPinnedTabManager: ["resetPinnedTab", "replacePinnedUrlWithCurrent", "removeEssentials", "editPinnedUrl", "addToEssentials"],
      }
      const missing = Object.entries(wanted).flatMap(([name, members]) => members.filter((m) => !(window[name] && m in window[name])).map((m) => name + "." + m))
      const keys = [...document.querySelectorAll("key[command]")].filter((key) => key.getAttribute("key") && key.id)
      const error = (Services.console.getMessageArray() ?? []).map((m) => m.message).find((m) => m.includes("[zencast]"))
      return {
        ok: missing.length === 0 && keys.length > 20 && !error,
        detail: missing.length ? "missing " + missing.join(", ") : keys.length + " shortcut keys" + (error ? "; " + error.slice(0, 120) : ""),
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
    name: "search lists every matching tab past the result limit, loaded first, the current one too, and renamed tabs by their page",
    body: String.raw`${READY}
      const principal = Services.scriptSecurityManager.getSystemPrincipal()
      const lazy = []
      for (let i = 0; i < 70; i++) lazy.push(gBrowser.addTab("https://wombatlist.example/" + i, { triggeringPrincipal: principal, inBackground: true, createLazyBrowser: true }))
      const live = newTab("data:text/html,<title>Wombatlist live</title>x")
      await until(() => live.label === "Wombatlist live")
      // A sleeping tab renamed by the user: only its saved page title holds "numbat".
      const renamed = gBrowser.addTab("about:blank", { triggeringPrincipal: principal, inBackground: true })
      SessionStore.setTabState(renamed, JSON.stringify({ entries: [{ url: "https://example.net/ledger", title: "Numbat ledger", triggeringPrincipal_base64: "" }], index: 1 }))
      await until(() => renamed.hasAttribute("pending") && renamed.label === "Numbat ledger")
      renamed.zenStaticLabel = "public-db"
      gBrowser._setTabLabel(renamed, "public-db")
      const current = newTab("data:text/html,<title>Wallaby here</title>x")
      await until(() => current.label === "Wallaby here")
      await sleep(300)
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      typeQuery("wombatlist")
      await sleep(400)
      const wombats = resultTitles().filter((t) => /^Wombatlist live|wombatlist\.example\/\d/.test(t))
      typeQuery("numbat")
      await sleep(150)
      const numbat = resultTitles()
      typeQuery("wallaby")
      await sleep(150)
      const wallaby = resultTitles()
      typeQuery("")
      await sleep(50)
      typeQuery("@wombatlist")
      await sleep(400)
      const scoped = resultTitles().filter((t) => /^Wombatlist live|wombatlist\.example\/\d/.test(t)).length
      await dismiss()
      for (const tab of [...lazy, live, renamed, current]) gBrowser.removeTab(tab)
      const all = wombats.length === 71 && wombats[0].startsWith("Wombatlist live") && scoped === 71
      const byPage = numbat.some((t) => t.startsWith("public-db"))
      // The tab already shown is found too.
      const here = wallaby.some((t) => t.startsWith("Wallaby here"))
      return { ok: all && byPage && here, detail: wombats.length + " wombat tabs, first " + wombats[0] + "; " + scoped + " in the tabs scope; numbat: " + numbat.slice(0, 2).join(" | ") + "; current tab: " + wallaby.slice(0, 3).join(" | ") }`,
  },
  {
    // gBrowser.tabs holds only the current space's pinned tabs and one level of folders.
    name: "search finds a pinned tab in a nested folder of another space, ahead of the web rows",
    body: String.raw`${READY}
      if (gZenWorkspaces.getWorkspaces().length < 2) await gZenWorkspaces.createAndSaveWorkspace("Second", undefined, true)
      const [first, second] = gZenWorkspaces.getWorkspaces()
      await gZenWorkspaces.changeWorkspaceWithID(second.uuid)
      const tab = newTab("data:text/html,<title>Koala-db console</title>x")
      await until(() => tab.label === "Koala-db console")
      gBrowser.pinTab(tab)
      const outer = gZenFolders.createFolder([], { label: "Koala outer" })
      gZenFolders.createFolder([tab], { label: "Koala inner", insertAfter: outer.groupContainer.lastElementChild })
      await gZenWorkspaces.changeWorkspaceWithID(first.uuid)
      await sleep(300)
      const nested = tab.group?.group === outer && !gBrowser.tabs.includes(tab)
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      typeQuery("koala db")
      await sleep(300)
      const titles = resultTitles()
      await dismiss()
      await outer.delete()
      const first3 = titles.slice(0, 3)
      const found = titles[0]?.startsWith("Koala-db console")
      return { ok: nested && found, detail: (nested ? "nested, outside gBrowser.tabs" : "not nested as expected") + "; koala db: " + first3.join(" | ") }`,
  },
  {
    name: "a palette closed before anything runs keeps the typed text for the next open",
    body: String.raw`${READY}
      const target = newTab("data:text/html,<title>Draftling page</title>x")
      await until(() => target.label === "Draftling page")
      const blank = newTab()
      const input = () => shadow().querySelector("[cmdk-input]")
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      typeQuery("draftling")
      await sleep(80)
      press("ctrl+k", deepActive())
      await until(() => !paletteOpen())
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      await sleep(80)
      const kept = input().value
      const selected = input().selectionStart === 0 && input().selectionEnd === kept.length
      press("enter")
      await until(() => !paletteOpen())
      const switched = gBrowser.selectedTab === target
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      await sleep(80)
      const after = input().value
      await dismiss()
      for (const tab of [target, blank]) gBrowser.removeTab(tab)
      const ok = kept === "draftling" && selected && switched && after === ""
      return { ok, detail: "kept " + JSON.stringify(kept) + (selected ? " selected" : " unselected") + ", switched " + switched + ", after run " + JSON.stringify(after) }`,
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
    name: "ctrl+space c moves the tab to a container and reopens its page there",
    body: String.raw`${READY}
      const url = "http://localhost:${LOCAL_PORT}/"
      const tab = newTab(url)
      await until(() => tab.linkedBrowser?.currentURI?.spec === url)
      gBrowser.selectedTab = tab
      gBrowser.selectedBrowser.focus()
      await sleep(200)
      press("ctrl+space", document.documentElement)
      press("c", document.documentElement)
      const picker = await until(paletteOpen, 2000).catch(() => false)
      await sleep(150)
      press("enter")
      const moved = await until(() => gBrowser.tabs.find((t) => t.linkedBrowser?.currentURI.spec === url && t.userContextId !== 0), 3000).catch(() => null)
      await dismiss()
      const replaced = !tab.isConnected
      if (moved) gBrowser.removeTab(moved)
      return { ok: !!picker && !!moved && replaced, detail: "picker " + !!picker + "; moved to a container " + !!moved + "; original closed " + replaced }`,
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
    name: "alt+shift+2 moves the tab to space 2, follows it, and shows a Zen toast",
    body: String.raw`${READY}
      if (gZenWorkspaces.getWorkspaces().length < 2) await gZenWorkspaces.createAndSaveWorkspace("Second", undefined, true)
      const [first, target] = gZenWorkspaces.getWorkspaces()
      const tab = newTab()
      await sleep(50)
      press("alt+shift+2", document.documentElement)
      await until(() => tab.getAttribute("zen-workspace-id") === target.uuid)
      await until(() => gZenWorkspaces.activeWorkspace === target.uuid && gBrowser.selectedTab === tab, 4000)
      const text = await until(() => toastText().includes("Moved to") && toastText(), 4000)
      const ok = text.includes("Moved to " + target.name)
      gBrowser.removeTab(tab)
      await gZenWorkspaces.changeWorkspaceWithID(first.uuid)
      return { ok, detail: "followed to " + target.name + "; toast: " + text }`,
  },
  {
    name: "alt+2 switches to space 2, and alt+n passes through when space n does not exist",
    body: String.raw`${READY}
      if (gZenWorkspaces.getWorkspaces().length < 2) await gZenWorkspaces.createAndSaveWorkspace("Second", undefined, true)
      const spaces = gZenWorkspaces.getWorkspaces()
      await gZenWorkspaces.changeWorkspaceWithID(spaces[0].uuid)
      press("alt+2", document.documentElement)
      const switched = await until(() => gZenWorkspaces.activeWorkspace === spaces[1].uuid, 3000).catch(() => false)
      const missing = spaces.length + 1
      const event = press("alt+" + missing, document.documentElement)
      const passed = !event.defaultPrevented
      await gZenWorkspaces.changeWorkspaceWithID(spaces[0].uuid)
      return { ok: Boolean(switched) && passed, detail: (switched ? "switched to " + spaces[1].name : "did not switch") + "; alt+" + missing + (passed ? " passed through" : " was taken") }`,
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
    name: "a completed host leads, a matching tab leads once the completion is deleted, and shift+enter searches",
    body: String.raw`${READY}
      const { ContextualIdentityService } = ChromeUtils.importESModule("moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs")
      const identity = ContextualIdentityService.create("Zebrafinch", "fingerprint", "orange")
      const principal = Services.scriptSecurityManager.getSystemPrincipal()
      const tab = gBrowser.addTab("https://zebrafinch.example/notes", { triggeringPrincipal: principal, inBackground: true, createLazyBrowser: true, lazyTabTitle: "Field notes" })
      const headings = () => [...shadow().querySelectorAll("[cmdk-group-heading]:not([hidden])")].map((h) => h.textContent)
      let searched = null
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        await sleep(100)
        typeQuery("zebrafinch")
        const input = shadow().querySelector("[cmdk-input]")
        const value = await until(() => input.value !== "zebrafinch" && input.value, 3000).catch(() => input.value)
        const order = await until(() => headings().includes("Containers") && headings(), 2000).catch(() => headings())
        await sleep(80)
        // Backspace on the selected completion leaves the typed text.
        typeQuery("zebrafinch")
        const deleted = await until(() => input.value === "zebrafinch" && headings()[0] === "Tabs" && headings(), 2000).catch(() => headings())
        press("shift+enter")
        await until(() => !paletteOpen(), 2000)
        searched = gBrowser.selectedTab
        const url = await until(() => {
          const browser = searched.linkedBrowser
          const spec = browser.userTypedValue || browser.currentURI?.spec || ""
          return /zebrafinch/.test(spec) && !spec.startsWith("https://zebrafinch.example") && spec
        }, 3000).catch(() => "")
        return {
          ok: order[0] === "Open" && order[1] === "Tabs" && deleted[0] === "Tabs" && value === "zebrafinch.example" && !!url,
          detail: "sections " + order.join(", ") + "; completed " + value + "; after backspace " + deleted.join(", ") + "; shift+enter " + (url || "nothing"),
        }
      } finally {
        await dismiss().catch(() => {})
        if (searched && searched !== tab && searched.isConnected) gBrowser.removeTab(searched)
        gBrowser.removeTab(tab)
        ContextualIdentityService.remove(identity.userContextId)
      }`,
  },
  {
    name: "a search engine's keyword and tab search only that engine, in its icon's colour",
    body: String.raw`${READY}
      const { SearchService } = ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs")
      const engine = SearchService.getEngineByName("DuckDuckGo")
      const before = engine.alias
      engine.alias = "dk"
      const footer = () => shadow().querySelector("[data-footer-hint]")?.textContent ?? ""
      const inputPlaceholder = () => shadow().querySelector("[cmdk-input]")?.placeholder ?? ""
      const chip = () => shadow().querySelector("[data-engine]")
      const enter = async () => {
        typeQuery("dk")
        await until(() => footer().includes("DuckDuckGo"), 4000)
        press("tab")
        await until(chip, 2000)
      }
      let opened = null
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("pin")
        const shiftHint = await until(() => footer().startsWith("Search") && footer(), 2000).catch(() => footer())
        await enter()
        const color = chip().style.backgroundColor
        const placeholder = inputPlaceholder()
        typeQuery("zebra")
        const first = await until(() => resultTitles()[0]?.includes("Search DuckDuckGo") && resultTitles()[0], 2000).catch(() => resultTitles()[0] ?? "")
        press("enter")
        await until(() => !paletteOpen(), 2000)
        opened = gBrowser.selectedTab
        const url = await until(() => {
          const browser = opened.linkedBrowser
          const spec = browser.userTypedValue || browser.currentURI?.spec || ""
          return spec.includes("duckduckgo.com") && spec.includes("zebra") && spec
        }, 3000).catch(() => "")
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        await enter()
        press("backspace")
        const left = await until(() => !chip(), 2000).catch(() => false)
        return {
          ok: shiftHint.startsWith("Search") && color.includes("rgb(") && placeholder === "Search DuckDuckGo" && first.includes("zebra") && !!url && left,
          detail: "typing: " + shiftHint + "; chip " + color + ", " + placeholder + "; first row " + first + "; opened " + (url || "nothing") + (left ? "; backspace left the engine" : "; still in the engine"),
        }
      } finally {
        await dismiss().catch(() => {})
        if (opened?.isConnected) gBrowser.removeTab(opened)
        engine.alias = before
      }`,
  },
  {
    name: "unloaded tabs are greyed out, and searching tabs lists them in their own section with the current tab and each tab's space and folders",
    body: String.raw`${READY}
      const principal = Services.scriptSecurityManager.getSystemPrincipal()
      const lazy = gBrowser.addTab("https://quokkafern.example/a", { triggeringPrincipal: principal, inBackground: true, createLazyBrowser: true, })
      const shelved = gBrowser.addTab("https://example.com/shelf", { triggeringPrincipal: principal, inBackground: true, createLazyBrowser: true, })
      const folder = gZenFolders.createFolder([shelved], { label: "Quokkafern shelf" })
      const live = newTab("data:text/html,<title>Quokkafern live</title>x")
      await until(() => live.label === "Quokkafern live")
      const current = newTab("data:text/html,<title>Quokkafern here</title>x")
      await until(() => current.label === "Quokkafern here")
      const headings = () => [...shadow().querySelectorAll("[cmdk-group-heading]:not([hidden])")].map((h) => h.textContent)
      const row = (text) => [...shadow().querySelectorAll("[cmdk-item]")].find((item) => item.textContent.includes(text))
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("@quokkafern")
        const order = await until(() => headings().includes("Unloaded") && headings(), 2000).catch(() => headings())
        const scoped = row("quokkafern.example")?.className.includes("grayscale") && !row("Quokkafern live")?.className.includes("grayscale")
        const here = !!row("Quokkafern here")
        const crumbs = row("example.com/shelf")?.textContent ?? ""
        const placed = /Space \/ Quokkafern shelf/.test(crumbs)
        press("backspace")
        await sleep(50)
        typeQuery("quokkafern")
        const greyed = await until(() => row("quokkafern.example")?.className.includes("grayscale"), 2000).catch(() => false)
        return {
          ok: order.join() === "Tabs,Unloaded" && !!scoped && greyed && here && placed,
          detail: "tabs scope: " + order.join(", ") + (scoped ? ", only the unloaded row greyed" : ", greying wrong") + (here ? ", current tab listed" : ", no current tab") + "; folder row: " + crumbs + (greyed ? "; greyed in search too" : "; not greyed in search"),
        }
      } finally {
        await dismiss().catch(() => {})
        await folder.delete()
        for (const tab of [lazy, live, current]) gBrowser.removeTab(tab)
      }`,
  },
  {
    name: "zencast keys work over the palette, and ctrl+. stays away from the emoji picker",
    body: String.raw`${READY}
      const url = "https://example.com/zencast-over-palette"
      const inputPlaceholder = () => shadow().querySelector("[cmdk-input]")?.placeholder ?? ""
      const tab = newTab(url)
      await until(() => gBrowser.selectedBrowser.currentURI?.spec === url, 10000).catch(() => {})
      let settings = null
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("pin")
        await sleep(80)
        press("ctrl+j")
        await sleep(80)
        const emoji = press("ctrl+.")
        press("escape")
        await sleep(50)
        press("ctrl+b")
        const bookmark = await until(() => paletteOpen() && inputPlaceholder() === "Name", 2000).catch(() => false)
        await dismiss()
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        press("ctrl+shift+,")
        settings = await until(() => gBrowser.selectedBrowser.currentURI.spec.includes("zencast/settings") && gBrowser.selectedTab, 3000).catch(() => null)
        const closed = !paletteOpen()
        return {
          ok: emoji.defaultPrevented && bookmark && !!settings && closed,
          detail: (emoji.defaultPrevented ? "ctrl+. held in the actions panel" : "ctrl+. reached the input") + (bookmark ? "; ctrl+b opened the bookmark name" : "; ctrl+b did nothing") + (settings ? "; ctrl+shift+, opened settings" : "; no settings") + (closed ? " and closed the palette" : ", palette still open"),
        }
      } finally {
        await dismiss().catch(() => {})
        if (settings?.isConnected) gBrowser.removeTab(settings)
        gBrowser.removeTab(tab)
      }`,
  },
  {
    name: "holding ctrl or alt labels visible rows with lowercase letters and lists the keys, even while the key repeats",
    body: String.raw`${READY}
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      const init = { key: "Control", code: "ControlLeft", ctrlKey: true, bubbles: true, composed: true }
      document.documentElement.dispatchEvent(new KeyboardEvent("keydown", init))
      const hints = () => [...shadow().querySelectorAll("[cmdk-item] [data-hint]")].map((kbd) => kbd.textContent)
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
      // A real held key keeps repeating from before the hold delay ends; the hints must show meanwhile.
      let altShown = []
      for (let i = 0; i < 40 && !altShown.length; i++) {
        await sleep(25)
        document.documentElement.dispatchEvent(new KeyboardEvent("keydown", { ...alt, repeat: true }))
        altShown = hints()
      }
      const altLegend = shadow().querySelector("[data-legend]")?.textContent ?? ""
      // Held past a tap, so letting go clears the hints instead of latching them.
      await sleep(400)
      document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { ...alt, altKey: false }))
      await until(() => hints().length === 0, 2000)
      await dismiss()
      const unique = new Set(shown).size === shown.length && !shown.some((l) => "acjvxzkqw".includes(l))
      const listed = legend.includes("Close") && legend.includes("Open in container") && altLegend.includes("Open in space")
      return {
        ok: shown.length > 3 && unique && marked && colors > 3 && listed && altShown.length > 3 && shown.every((l) => l === l.toLowerCase()),
        detail: shown.join(" ") + "; " + colors + " colours" + (marked ? "; marked in titles" : "; titles not marked") + "; legend: " + legend + "; alt: " + altShown.join(" ") + "; cleared on release",
      }`,
  },
  {
    name: "the empty palette leads with the last seven loaded tabs and the current tab, lists no other tab, and the rest follows right after",
    body: String.raw`${READY}
      const start = newTab("data:text/html,<title>Current koala</title>x")
      const fillers = []
      // Eight fillers, so the oldest falls out of the recent seven and must not be listed anywhere.
      for (let i = 0; i < 8; i++) fillers.push(newTab("data:text/html,<title>Recent filler " + i + "</title>x"))
      const older = newTab("data:text/html,<title>Recent wombat</title>x")
      const newer = newTab("data:text/html,<title>Recent numbat</title>x")
      await until(() => start.label === "Current koala" && older.label === "Recent wombat" && newer.label === "Recent numbat" && fillers.every((tab, i) => tab.label === "Recent filler " + i))
      try {
        for (const tab of [...fillers, older, newer, start]) {
          gBrowser.selectedTab = tab
          await sleep(30)
        }
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        await sleep(150)
        // Rows render flat: each visible heading starts a section.
        const sections = []
        for (const el of shadow().querySelectorAll("[cmdk-group-heading], [cmdk-item]")) {
          if (el.hasAttribute("cmdk-group-heading")) {
            if (!el.hidden) sections.push({ heading: el.textContent, el, rows: [] })
          } else sections.at(-1)?.rows.push(el.textContent)
        }
        const [recent, current, next] = sections
        const currentRow = [...shadow().querySelectorAll("[cmdk-item]")].find((el) => el.textContent.startsWith("Current koala"))
        const unlisted = !sections.some((section) => section.rows.some((row) => row.startsWith("Recent filler 0")))
        const after = !!next && !!currentRow && next.el.getBoundingClientRect().top - currentRow.getBoundingClientRect().bottom < 60
        return {
          ok: recent?.heading === "Recent tabs" && recent.rows.length === 7 && !!recent.rows[0]?.startsWith("Recent numbat") && !!recent.rows[1]?.startsWith("Recent wombat")
            && current?.heading === "Current tab" && current.rows.length === 1 && current.rows[0].startsWith("Current koala") && unlisted && after,
          detail: sections.slice(0, 3).map((section) => section.heading + " (" + section.rows.length + ")").join(", ") + "; first recent " + recent?.rows[0]?.slice(0, 20) + (unlisted ? "; older tabs unlisted" : "; an older tab is listed") + "; next section " + (after ? "right after" : "pushed away"),
        }
      } finally {
        await dismiss().catch(() => {})
        for (const tab of [...fillers, older, newer, start]) gBrowser.removeTab(tab)
      }`,
  },
  {
    name: "a tap of alt latches the hints, a bare letter runs a marked row, and esc, another tap, a long alt or a press after a lost release clears them",
    body: String.raw`${READY}
      const start = gBrowser.selectedTab
      const target = newTab("data:text/html,<title>Quokkalatch</title>x")
      await until(() => target.label === "Quokkalatch")
      gBrowser.selectedTab = start
      const hints = () => [...shadow().querySelectorAll("[cmdk-item] [data-hint]")]
      const alt = { key: "Alt", code: "AltLeft", altKey: true, bubbles: true, composed: true }
      const tap = () => {
        document.documentElement.dispatchEvent(new KeyboardEvent("keydown", alt))
        document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { ...alt, altKey: false }))
      }
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        tap()
        const latched = await until(() => hints().length > 0, 2000).catch(() => false)
        // Still up well past the hold delay, with nothing held.
        await sleep(300)
        const stayed = hints().length > 0
        tap()
        const untapped = await until(() => hints().length === 0, 2000).catch(() => false)
        // Latched again, then a long press of Alt alone clears them too.
        tap()
        await until(() => hints().length > 0, 2000)
        document.documentElement.dispatchEvent(new KeyboardEvent("keydown", alt))
        await sleep(450)
        document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { ...alt, altKey: false }))
        const longCleared = await until(() => hints().length === 0, 2000).catch(() => false)
        // A release that never arrives, as when an input method keeps it: the next press still clears them.
        document.documentElement.dispatchEvent(new KeyboardEvent("keydown", alt))
        await until(() => hints().length > 0, 2000)
        document.documentElement.dispatchEvent(new KeyboardEvent("keydown", alt))
        const unstuck = await until(() => hints().length === 0, 2000).catch(() => false)
        await sleep(300)
        const stayedOff = hints().length === 0
        document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { ...alt, altKey: false }))
        tap()
        await until(() => hints().length > 0, 2000)
        press("escape")
        const escaped = await until(() => hints().length === 0, 2000).catch(() => false) && paletteOpen()
        typeQuery("quokkalatch")
        const row = await until(() => [...shadow().querySelectorAll("[cmdk-item]")].find((item) => item.textContent.includes("Quokkalatch") && item.textContent.includes("data:")), 2000)
        tap()
        const letter = (await until(() => row.querySelector("[data-hint]")?.textContent.toLowerCase(), 2000).catch(() => "")) ?? ""
        if (letter) press(letter)
        const ran = await until(() => gBrowser.selectedTab === target, 2000).catch(() => false)
        return {
          ok: !!latched && stayed && !!untapped && !!longCleared && !!unstuck && stayedOff && !!escaped && ran,
          detail: (latched && stayed ? "a tap latched the hints" : "no latch") + (untapped ? "; another tap cleared them" : "; still up after a tap") + (longCleared ? "; a long alt cleared them" : "; still up after a long alt") + (unstuck && stayedOff ? "; a press after a lost release cleared them" : "; stuck after a lost release") + (escaped ? "; esc cleared them" : "; esc did not clear") + (ran ? "; " + letter + " switched to the marked tab" : "; letter " + letter + " ran nothing"),
        }
      } finally {
        await dismiss().catch(() => {})
        gBrowser.removeTab(target)
      }`,
  },
  {
    name: "ctrl+/ toggles every key, any other key hides it, and holding ctrl+shift shows nothing",
    body: String.raw`${READY}
      const root = document.documentElement
      const sheet = () => shadow().querySelector("[data-keysheet]")
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", code: "ControlLeft", ctrlKey: true, bubbles: true, composed: true }))
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", code: "ShiftLeft", ctrlKey: true, shiftKey: true, bubbles: true, composed: true }))
      await sleep(700)
      const held = !!sheet()
      root.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", ctrlKey: true, bubbles: true, composed: true }))
      root.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", code: "ControlLeft", bubbles: true, composed: true }))
      press("ctrl+/", root)
      const text = await until(() => sheet()?.textContent, 2000).catch(() => "")
      press("ctrl+/", root)
      const toggled = await until(() => !sheet(), 2000).catch(() => false)
      press("ctrl+/", root)
      await until(() => sheet(), 2000)
      const escape = press("escape", root)
      const hidden = await until(() => !sheet(), 2000).catch(() => false)
      const listed = text.includes("Open Zencast") && text.includes("Move tab to space 1…9") && text.includes("Switch to space 1…9")
      return {
        ok: !held && listed && toggled && hidden && escape.defaultPrevented,
        detail: (held ? "showed on a ctrl+shift hold" : "no sheet on hold") + "; " + (listed ? "lists the palette and the 1…9 families" : "missing rows: " + text.slice(0, 200)) + (toggled ? "; ctrl+/ hides it" : "; ctrl+/ left it") + (hidden && escape.defaultPrevented ? "; escape hides it" : "; escape: " + hidden + ", consumed " + escape.defaultPrevented),
      }`,
  },
  {
    name: "sessions save this window's unpinned tabs, and alt+s reopens one",
    body: String.raw`${READY}
      const url = "data:text/html,<title>Session kiwi</title>x"
      const tab = newTab(url)
      const pinned = newTab("data:text/html,<title>Session plum</title>x")
      gBrowser.pinTab(pinned)
      await until(() => tab.label === "Session kiwi" && pinned.label === "Session plum", 3000).catch(() => false)
      const start = Services.startup.getStartupInfo().process.getTime()
      const path = PathUtils.join(PathUtils.profileDir, "zencast", "sessions", start + ".json")
      Services.obs.notifyObservers(null, "sessionstore-state-write-complete")
      const saved = await until(async () => {
        if (!(await IOUtils.exists(path))) return false
        const session = await IOUtils.readJSON(path)
        return session.windows.some((win) => win.tabs.some((t) => t.title === "Session kiwi")) && session
      }, 4000).catch(() => null)
      const keptPinned = !!saved && saved.windows.some((win) => win.tabs.some((t) => t.title === "Session plum"))
      gBrowser.removeTab(tab)
      gBrowser.removeTab(pinned)
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
        ok: !!saved && !keptPinned && first.startsWith("Today") && !!reopened,
        detail: (saved ? "saved " + saved.windows.length + " window(s)" : "not saved") + (keptPinned ? "; kept the pinned tab" : "; pinned tab left out") + "; first row " + first + "; " + (reopened ? "reopened" : "not reopened"),
      }`,
  },
  {
    name: "alt+l lists a local dev server, opens it, then switches to its tab from the cached list at once",
    body: String.raw`${READY}
      const url = "http://localhost:${LOCAL_PORT}/"
      const pick = async () => {
        const start = performance.now()
        press("alt+l", document.documentElement)
        await until(paletteOpen, 4000)
        const listed = await until(() => resultTitles().some((title) => title.startsWith("Kiwi dev server")), 4000).catch(() => false)
        const ms = Math.round(performance.now() - start)
        typeQuery("kiwi dev")
        await sleep(150)
        press("enter")
        return listed && ms
      }
      const listed = await pick()
      const tab = await until(() => gBrowser.tabs.find((t) => t.linkedBrowser?.currentURI.spec === url), 4000).catch(() => null)
      const count = gBrowser.tabs.length
      gBrowser.selectedTab = gBrowser.tabs.find((t) => t !== tab)
      const cachedMs = await pick()
      const switched = await until(() => tab && gBrowser.selectedTab === tab, 3000).catch(() => false)
      const same = gBrowser.tabs.length === count
      await dismiss()
      if (tab) gBrowser.removeTab(tab)
      return {
        ok: !!listed && !!tab && switched && same && cachedMs !== false && cachedMs < 150,
        detail: (listed ? "listed in " + listed + " ms, then " + cachedMs + " ms from the cache" : "not listed") + "; " + (tab ? "opened" : "not opened") + "; " + (switched && same ? "switched to its tab" : "did not switch"),
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
    name: "quick links list keywords, keys and search engine keywords together",
    body: String.raw`${READY}
      ${PLACES}
      const { SearchService } = ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs")
      const engine = SearchService.getEngineByName("DuckDuckGo")
      const before = engine.alias
      engine.alias = "dk"
      const page = "https://example.net/quokka-links"
      const mark = await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid, url: page, title: "Quokka links" })
      await PlacesUtils.keywords.insert({ keyword: "zql", url: page })
      const target = "https://example.org/quokka-jump"
      Services.prefs.setStringPref("zencast.config", JSON.stringify({
        version: 1,
        jumps: [{ kind: "url", target, title: "Quokka jump" }],
        bindings: { ["jump:url:" + target]: ["ctrl+shift+9"] },
      }))
      const headings = () => [...shadow().querySelectorAll("[cmdk-group-heading]:not([hidden])")].map((h) => h.textContent)
      await sleep(300)
      try {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("quick links")
        await until(() => (resultTitles()[0] ?? "").startsWith("Quick links"), 2000)
        press("enter")
        const sections = await until(() => headings().includes("Search engines") && headings(), 3000).catch(() => headings())
        const rows = resultTitles()
        const keyword = rows.find((row) => row.startsWith("Quokka links")) ?? ""
        const jump = rows.find((row) => row.startsWith("Quokka jump")) ?? ""
        const duck = rows.find((row) => row.startsWith("DuckDuckGo")) ?? ""
        return {
          ok: sections.join() === "Keywords,Keys,Search engines" && keyword.includes("zql") && jump.includes("Ctrl") && duck.includes("dk"),
          detail: "sections " + sections.join(", ") + " | " + keyword + " | " + jump + " | " + duck,
        }
      } finally {
        await dismiss().catch(() => {})
        engine.alias = before
        Services.prefs.clearUserPref("zencast.config")
        await PlacesUtils.bookmarks.remove(mark.guid)
        await PlacesUtils.keywords.remove("zql").catch(() => {})
      }`,
  },
  {
    name: "a query goes to the preferred AI, ChatGPT by default, and ctrl+shift+enter asks it from any row",
    body: String.raw`${READY}
      const CONFIG = "zencast.config"
      const opened = (host) => {
        const browser = gBrowser.selectedBrowser
        const spec = browser.currentURI?.spec ?? ""
        return spec.startsWith(host) ? spec : (browser.userTypedValue ?? "").startsWith(host) ? browser.userTypedValue : ""
      }
      const askRows = async () => {
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("plan a quiet weekend")
        const rows = await until(() => resultTitles().some((title) => title.includes("Ask ")) && resultTitles(), 3000).catch(() => resultTitles())
        await dismiss()
        return rows.filter((title) => title.startsWith("plan a quiet weekendAsk "))
      }
      try {
        const fallback = await askRows()
        Services.prefs.setStringPref(CONFIG, JSON.stringify({ version: 1, assistant: "claude" }))
        await sleep(100)
        const chosen = await askRows()
        press("ctrl+k", document.documentElement)
        await until(paletteOpen)
        typeQuery("plan a quiet weekend")
        await sleep(80)
        // The first row is selected, not the Ask row.
        const selected = shadow().querySelector("[cmdk-item][aria-selected=true]")?.textContent ?? ""
        press("ctrl+shift+enter")
        const url = await until(() => opened("https://claude.ai/"), 3000).catch(() => "")
        if (url) gBrowser.removeTab(gBrowser.selectedTab)
        const one = (rows, title) => rows.length === 1 && rows[0].includes("Ask " + title)
        return {
          ok: one(fallback, "ChatGPT") && one(chosen, "Claude") && !selected.includes("Ask ") && url === "https://claude.ai/new?q=plan%20a%20quiet%20weekend",
          detail: "default: " + fallback.join(" | ") + "; claude set: " + chosen.join(" | ") + "; ctrl+shift+enter on " + JSON.stringify(selected.slice(0, 40)) + " opened " + (url || "nothing"),
        }
      } finally {
        await dismiss().catch(() => {})
        Services.prefs.clearUserPref(CONFIG)
      }`,
  },
  {
    name: "ask about this page sends the question, the selection and the address to the preferred AI",
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
        press("enter")
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
  // An engine's search mode, mid hook-in and settled.
  await zen.run(String.raw`if (!paletteOpen()) press("ctrl+k", document.documentElement)
    await until(paletteOpen)
    typeQuery("")
    await sleep(100)
    const { SearchService } = ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs")
    SearchService.getEngineByName("DuckDuckGo").alias = "dk"
    typeQuery("dk")
    await until(() => shadow().querySelector("[data-footer-hint]")?.textContent.includes("DuckDuckGo"), 4000)
    press("tab")
    typeQuery("zebra")
    await sleep(90)`)
  await shot("palette-engine-in")
  await zen.run(String.raw`await sleep(600)`)
  await shot("palette-engine")
  await zen.run(String.raw`typeQuery(""); press("backspace"); await sleep(100)`)
  await zen.run(String.raw`if (!paletteOpen()) press("ctrl+k", document.documentElement)
    await until(paletteOpen)
    typeQuery("")
    await sleep(100)
    if (gZenWorkspaces.getWorkspaces().length < 2) await gZenWorkspaces.createAndSaveWorkspace("Second")
    press("alt+2"); press("ctrl+2"); await sleep(400)`)
  await shot("palette-targets")
  await zen.run(String.raw`document.documentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", code: "AltLeft", altKey: true, bubbles: true, composed: true }))
    await sleep(400)`)
  await shot("palette-spaces")
  await zen.run(String.raw`document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", code: "AltLeft", bubbles: true, composed: true }))
    await dismiss()
    press("ctrl+/", document.documentElement)
    await sleep(400)`)
  await shot("keysheet")
  await zen.run(String.raw`press("escape", document.documentElement)
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
