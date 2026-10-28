import { z } from "zod"

export interface TabInfo {
  tab: XULTab
  title: string
  url: string
  workspaceId: string | null
  pinned: boolean
  essential: boolean
  folder: ZenFolder | null
  userContextId: number
}

const tabKeys = new WeakMap<XULTab, string>()
let nextTabKey = 0

// Tabs have no stable public id; give each a session-unique key for React lists and selection.
export function tabKey(tab: XULTab): string {
  let key = tabKeys.get(tab)
  if (!key) {
    key = `tab-${nextTabKey++}`
    tabKeys.set(tab, key)
  }
  return key
}

/** The tab's browser; actions on a tab that was never loaded fail with a readable message. */
export function loadedBrowser(tab: XULTab): XULBrowser {
  if (!tab.linkedBrowser) throw new Error("The tab has not loaded yet")
  return tab.linkedBrowser
}

export function tabUrl(tab: XULTab): string {
  return tab.linkedBrowser?.currentURI?.spec ?? ""
}

export function describeTab(tab: XULTab): TabInfo {
  const folder = tab.group?.isZenFolder ? tab.group : null
  return {
    tab,
    title: tab.label,
    url: tabUrl(tab),
    workspaceId: tab.getAttribute("zen-workspace-id"),
    pinned: tab.pinned,
    essential: tab.hasAttribute("zen-essential"),
    folder,
    userContextId: tab.userContextId,
  }
}

// A tab's SessionStore state; `index` is 1-based and absent on a fresh tab.
const stateSchema = z.object({
  entries: z.array(z.object({ url: z.string(), title: z.string().optional() })),
  index: z.number().int().optional(),
})

/** The history entry a tab shows, from its SessionStore state. */
export function currentEntry(state: string): { url: string; title?: string } | undefined {
  const parsed = stateSchema.safeParse(JSON.parse(state))
  if (!parsed.success) return undefined
  const { entries, index } = parsed.data
  return entries[(index ?? entries.length) - 1]
}

/** The page's own title on a tab the user renamed, which its label no longer shows, even asleep. */
export function pageTitle(win: Window, tab: XULTab): string | undefined {
  if (typeof tab.zenStaticLabel !== "string") return undefined
  return currentEntry(win.SessionStore.getTabState(tab))?.title
}

/** Real tabs only: skips Zen's hidden placeholder tabs used inside empty folders. */
export function listTabs(win: Window): XULTab[] {
  return win.gBrowser.tabs.filter((tab) => !tab.hasAttribute("zen-empty-tab") && !tab.hasAttribute("zen-glance-tab"))
}

export async function selectTab(win: Window, tab: XULTab) {
  await win.gZenWorkspaces.switchTabIfNeeded(tab)
  win.gBrowser.selectedTab = tab
}

export function closeTab(win: Window, tab: XULTab) {
  win.gBrowser.removeTab(tab, { animate: true })
}

export function duplicateTab(win: Window, tab: XULTab) {
  win.gBrowser.selectedTab = win.gBrowser.duplicateTab(tab)
}
