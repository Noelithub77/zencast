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

export function tabUrl(tab: XULTab): string {
  return tab.linkedBrowser.currentURI?.spec ?? ""
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
