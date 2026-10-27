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
    name: "ctrl+t opens the palette instead of a new tab",
    body: String.raw`${READY}
      const tabs = gBrowser.tabs.length
      press("ctrl+t", document.documentElement)
      await until(paletteOpen)
      await dismiss()
      return { ok: gBrowser.tabs.length === tabs, detail: (gBrowser.tabs.length - tabs) + " tabs opened" }`,
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
    name: "ctrl+shift+, opens the extensions page",
    body: String.raw`${READY}
      press("ctrl+shift+,", document.documentElement)
      const url = await until(() => gBrowser.selectedBrowser.currentURI.spec.startsWith("about:addons") && gBrowser.selectedBrowser.currentURI.spec)
      gBrowser.removeTab(gBrowser.selectedTab)
      return { ok: true, detail: url }`,
  },
  {
    name: "a host from the DNS cache completes inline",
    body: String.raw`${READY}
      // Resolving puts the host in Firefox's DNS cache, as visiting the site would.
      await new Promise((resolve) => Services.dns.asyncResolve("allpyq.in", Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT, 0, null,
        { QueryInterface: ChromeUtils.generateQI(["nsIDNSListener"]), onLookupComplete: resolve }, Services.tm.mainThread, {}))
      press("ctrl+k", document.documentElement)
      await until(paletteOpen)
      await sleep(100)
      typeQuery("allpyq")
      const input = shadow().querySelector("[cmdk-input]")
      const value = await until(() => input.value !== "allpyq" && input.value, 3000).catch(() => input.value)
      const selected = input.value.slice(input.selectionStart, input.selectionEnd)
      const first = resultTitles()[0] ?? ""
      await dismiss()
      return { ok: value === "allpyq.in" && selected === ".in" && first.startsWith("allpyq.in"), detail: value + " (selected " + JSON.stringify(selected) + "), first row " + first }`,
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
      document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { ...init, ctrlKey: false }))
      await until(() => hints().length === 0, 2000)
      await dismiss()
      const unique = new Set(shown).size === shown.length && !shown.some((l) => "acvxzkqw".includes(l))
      return { ok: shown.length > 3 && unique, detail: shown.join(" ") + "; cleared on release" }`,
  },
  {
    name: "ctrl+, opens the settings page",
    body: String.raw`${READY}
      press("ctrl+,", document.documentElement)
      const browser = await until(() => gBrowser.selectedBrowser.currentURI.spec.includes("zencast/settings") && gBrowser.selectedBrowser)
      const doc = await until(() => browser.contentDocument?.querySelector("nav a") && browser.contentDocument)
      const nav = [...doc.querySelectorAll("nav a")].map((a) => a.textContent.trim())
      browser.contentWindow.location.hash = "#folders"
      const tree = await until(() => doc.querySelector("[role=tree] [role=treeitem]") && doc.querySelector("[role=tree]"))
      const columns = tree.querySelectorAll(":scope > [role=group]").length
      const spaces = gZenWorkspaces.getWorkspaces().length
      const icon = await until(() => gBrowser.selectedTab.getAttribute("image"), 3000).catch(() => "")
      const ok = nav.length === 4 && columns === spaces && icon.includes("logo")
      return { ok, detail: nav.join(", ") + "; " + columns + " space columns; favicon " + (icon.split("/").pop() || "missing") }`,
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
    press("ctrl+k", document.documentElement)
    await until(paletteOpen)
    await sleep(300)`)
  await shot("palette")
  await zen.run(String.raw`typeQuery("sett"); await sleep(300)`)
  await shot("palette-search")
  await zen.run(String.raw`press("ctrl+k"); await sleep(300)`)
  await shot("palette-actions")
  await zen.run(String.raw`await dismiss()
    press("ctrl+,", document.documentElement)
    const browser = await until(() => gBrowser.selectedBrowser.currentURI.spec.includes("zencast/settings") && gBrowser.selectedBrowser)
    await until(() => browser.contentDocument?.querySelector("nav a"))
    browser.contentWindow.location.hash = "#keys"
    await sleep(400)`)
  await shot("settings-shortcuts")
  await zen.run(String.raw`gBrowser.selectedBrowser.contentWindow.location.hash = "#folders"; await sleep(400)`)
  await shot("settings-folders")
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
