// Searchable index of browser settings: Zen's preference panes, every boolean zen.* pref
// (toggleable inline), and a fallback that runs about:preferences' own search.

export interface PrefSetting {
  kind: "pref"
  name: string
  title: string
  section: string
}

export interface PaneSetting {
  kind: "pane"
  pane: string
  title: string
  keywords: string
}

const PANES: PaneSetting[] = [
  { kind: "pane", pane: "paneGeneral", title: "General settings", keywords: "startup language downloads files" },
  { kind: "pane", pane: "paneZenLooks", title: "Look and feel", keywords: "theme gradient compact sidebar zen" },
  { kind: "pane", pane: "paneZenTabManagement", title: "Tab management", keywords: "workspaces spaces tabs unload essentials" },
  { kind: "pane", pane: "paneZenCKS", title: "Keyboard shortcuts", keywords: "keybindings hotkeys zen" },
  { kind: "pane", pane: "paneZenMarketplace", title: "Zen mods", keywords: "mods themes sine marketplace" },
  { kind: "pane", pane: "paneHome", title: "Home and new tab", keywords: "homepage new tab" },
  { kind: "pane", pane: "paneSearch", title: "Search", keywords: "search engine suggestions" },
  { kind: "pane", pane: "panePrivacy", title: "Privacy and security", keywords: "cookies tracking passwords permissions history" },
  { kind: "pane", pane: "paneSync", title: "Sync", keywords: "account sync" },
]

let prefIndex: PrefSetting[] | null = null

function humanizePref(name: string): { title: string; section: string } {
  const parts = name.replace(/^zen\./, "").split(".")
  const leaf = parts.pop() ?? name
  const words = leaf
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .toLowerCase()
  return {
    title: words.charAt(0).toUpperCase() + words.slice(1),
    section: parts.join(" › ") || "zen",
  }
}

/** Built once per window on first use; reads only default-branch names, which is cheap. */
export function prefSettings(): PrefSetting[] {
  if (prefIndex) return prefIndex
  const defaults = Services.prefs.getDefaultBranch("")
  prefIndex = defaults
    .getChildList("zen.")
    .filter((name) => defaults.getPrefType(name) === Services.prefs.PREF_BOOL)
    .sort()
    .map((name) => ({ kind: "pref", name, ...humanizePref(name) }))
  return prefIndex
}

export function paneSettings(): PaneSetting[] {
  return PANES
}

export function prefValue(name: string): boolean {
  return Services.prefs.getBoolPref(name, false)
}

export function togglePref(name: string): boolean {
  const next = !prefValue(name)
  Services.prefs.setBoolPref(name, next)
  return next
}

export function openPane(win: Window, pane: string) {
  win.openPreferences(pane)
}

export function openAboutConfig(win: Window, filter: string) {
  win.openTrustedLinkIn(`about:config?filter=${encodeURIComponent(filter)}`, "tab")
}

/** Opens about:preferences and runs its built-in search for the query. */
export function searchPreferences(win: Window, query: string) {
  win.openPreferences("paneSearchResults")
  const tryFill = (attempt: number) => {
    const doc = win.gBrowser.selectedBrowser.contentDocument
    const input = doc?.getElementById("searchInput")
    if (input && "value" in input) {
      input.value = query
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("command", { bubbles: true }))
    } else if (attempt < 20) {
      win.setTimeout(() => tryFill(attempt + 1), 50)
    }
  }
  tryFill(0)
}
