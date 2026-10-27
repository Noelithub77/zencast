export function togglePin(win: Window, tab: XULTab) {
  if (tab.pinned) win.gBrowser.unpinTab(tab)
  else win.gBrowser.pinTab(tab)
}

export function replacePinnedUrl(win: Window, tab: XULTab) {
  if (tab.pinned) win.gZenPinnedTabManager.replacePinnedUrlWithCurrent(tab)
}

export function resetPinnedTab(win: Window, tab: XULTab) {
  if (tab.pinned) win.gZenPinnedTabManager.resetPinnedTab(tab)
}

export function editPinnedUrl(win: Window, tab: XULTab) {
  if (tab.pinned) void win.gZenPinnedTabManager.editPinnedUrl(tab)
}

export function toggleEssential(win: Window, tab: XULTab) {
  if (tab.hasAttribute("zen-essential")) win.gZenPinnedTabManager.removeEssentials(tab)
  else win.gZenPinnedTabManager.addToEssentials(tab)
}
