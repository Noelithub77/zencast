// Pastels for spaces without a theme colour, so each still gets its own tint.
const SPACE_FALLBACK = ["#aab4f0", "#99ffe4", "#ffc799", "#c8b6ff", "#f5e6a8", "#ffb3d1", "#b5d8a6", "#ff8080"]

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

/** The space's primary theme colour, or a pastel picked by its position. */
export function workspaceColor(workspace: ZenWorkspace, index: number): string {
  const colors = workspace.theme?.gradientColors ?? []
  const rgb = (colors.find((color) => color.isPrimary) ?? colors[0])?.c
  return rgb?.length === 3 ? `rgb(${rgb.join(" ")})` : SPACE_FALLBACK[index % SPACE_FALLBACK.length]
}
