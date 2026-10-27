// Searchable index of browser settings: Zen's preference panes, every boolean zen.* pref
// (toggleable inline), number and text zen.* prefs (edited by typing), and a fallback that runs
// about:preferences' own search.
import { describePref, groupRank, PREF_CATEGORIES, type PrefCategory } from "./zen-prefs"

export interface PrefSetting {
  kind: "pref"
  name: string
  title: string
  category: PrefCategory
  group: string
  /** "Tabs · Glance", or just the category when it has a single group. */
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

/** Built once per window on first use; reads only default-branch names, which is cheap. */
export function prefSettings(): PrefSetting[] {
  if (prefIndex) return prefIndex
  const defaults = Services.prefs.getDefaultBranch("")
  prefIndex = defaults
    .getChildList("zen.")
    .filter((name) => defaults.getPrefType(name) === Services.prefs.PREF_BOOL)
    .map((name): PrefSetting => {
      const { title, category, group } = describePref(name)
      return { kind: "pref", name, title, category, group, section: group === category ? category : `${category} · ${group}` }
    })
    .sort(
      (a, b) =>
        PREF_CATEGORIES.indexOf(a.category) - PREF_CATEGORIES.indexOf(b.category) ||
        groupRank(a.group) - groupRank(b.group) ||
        a.title.localeCompare(b.title),
    )
  return prefIndex
}

export interface ValuePref {
  name: string
  title: string
  section: string
  type: "int" | "string"
}

let valueIndex: ValuePref[] | null = null

export function valuePrefs(): ValuePref[] {
  if (valueIndex) return valueIndex
  const defaults = Services.prefs.getDefaultBranch("")
  valueIndex = defaults.getChildList("zen.").flatMap((name): ValuePref[] => {
    const type = defaults.getPrefType(name)
    if (type !== Services.prefs.PREF_INT && type !== Services.prefs.PREF_STRING) return []
    const { title, category, group } = describePref(name)
    // Bookkeeping values that Zen writes itself; editing them only breaks its migrations.
    if (group === "Internal" || /migration|\.version$/.test(name)) return []
    return [{ name, title, section: group === category ? category : `${category} · ${group}`, type: type === Services.prefs.PREF_INT ? "int" : "string" }]
  })
  return valueIndex
}

export function readValuePref(pref: ValuePref): string {
  return pref.type === "int" ? String(Services.prefs.getIntPref(pref.name, 0)) : Services.prefs.getStringPref(pref.name, "")
}

/** Sets the pref from typed text; returns why it was refused, if it was. */
export function writeValuePref(pref: ValuePref, text: string): string | null {
  if (pref.type === "string") {
    Services.prefs.setStringPref(pref.name, text)
    return null
  }
  const value = Number(text.trim())
  if (!Number.isInteger(value) || Math.abs(value) > 2 ** 31 - 1) return `${pref.title} needs a whole number`
  Services.prefs.setIntPref(pref.name, value)
  return null
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
