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
