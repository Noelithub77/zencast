export function listWorkspaces(win: Window): ZenWorkspace[] {
  return win.gZenWorkspaces.getWorkspaces()
}

export function activeWorkspaceId(win: Window): string {
  return win.gZenWorkspaces.activeWorkspace
}

export async function switchWorkspace(win: Window, id: string) {
  await win.gZenWorkspaces.changeWorkspaceWithID(id)
}

export function moveTabToWorkspace(win: Window, tab: XULTab, id: string) {
  win.gZenWorkspaces.moveTabToWorkspace(tab, id)
}

/** Moves the tab and follows it: the space switches with Zen's animation and the tab stays selected. */
export async function moveTabAndFollow(win: Window, tab: XULTab, id: string) {
  moveTabToWorkspace(win, tab, id)
  await switchWorkspace(win, id)
  win.gBrowser.selectedTab = tab
}
