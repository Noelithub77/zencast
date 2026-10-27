import { selectTab, tabKey } from "./tabs"
import { listWorkspaces } from "./workspaces"

export interface TabNode {
  kind: "tab"
  key: string
  tab: XULTab
  title: string
  url: string
}

export interface FolderNode {
  kind: "folder"
  key: string
  folder: ZenFolder
  label: string
  collapsed: boolean
  children: TreeNode[]
}

export type TreeNode = TabNode | FolderNode

export interface SpaceTree {
  workspace: ZenWorkspace
  folders: FolderNode[]
  pinned: TabNode[]
  tabs: TabNode[]
}

export function isFolder(element: Element | null): element is ZenFolder {
  return !!element && "isZenFolder" in element && element.isZenFolder === true
}

export function isTab(element: Element): element is XULTab {
  return element.localName === "tab"
}

function tabNode(tab: XULTab): TabNode {
  return {
    kind: "tab",
    key: tabKey(tab),
    tab,
    title: tab.label,
    url: tab.linkedBrowser.currentURI?.spec ?? "",
  }
}

function folderNode(folder: ZenFolder): FolderNode {
  const children: TreeNode[] = []
  for (const item of folder.allItems) {
    if (isFolder(item)) children.push(folderNode(item))
    else if (isTab(item) && !item.hasAttribute("zen-empty-tab")) children.push(tabNode(item))
    else if (item.hasAttribute("split-view-group"))
      for (const child of item.children) if (isTab(child)) children.push(tabNode(child))
  }
  return {
    kind: "folder",
    key: `folder-${folder.id}`,
    folder,
    label: folder.label,
    collapsed: folder.collapsed,
    children,
  }
}

export function rootFolders(win: Window, workspaceId: string): ZenFolder[] {
  return win.gBrowser.tabGroups.filter(
    (group) =>
      isFolder(group) &&
      !group.isLiveFolder &&
      !group.group &&
      group.getAttribute("zen-workspace-id") === workspaceId,
  )
}

export function allFolders(win: Window): ZenFolder[] {
  return win.gBrowser.tabGroups.filter((group) => isFolder(group) && !group.isLiveFolder)
}

/** Expands the folder and switches to its first tab. */
export async function openFolder(win: Window, folder: ZenFolder) {
  folder.collapsed = false
  const first = folder.tabs.find((tab) => !tab.hasAttribute("zen-empty-tab"))
  if (first) await selectTab(win, first)
}

export function spaceTrees(win: Window): SpaceTree[] {
  const tabs = win.gBrowser.tabs
  return listWorkspaces(win).map((workspace) => {
    const pinned: TabNode[] = []
    const loose: TabNode[] = []
    for (const tab of tabs) {
      if (tab.group || tab.hasAttribute("zen-essential") || tab.hasAttribute("zen-empty-tab")) continue
      if (tab.getAttribute("zen-workspace-id") !== workspace.uuid) continue
      ;(tab.pinned ? pinned : loose).push(tabNode(tab))
    }
    return {
      workspace,
      folders: rootFolders(win, workspace.uuid).map(folderNode),
      pinned,
      tabs: loose,
    }
  })
}

export function folderPath(folder: ZenFolder): string {
  const parts: string[] = []
  for (let current: ZenFolder | null = folder; current; current = current.group) parts.unshift(current.label)
  return parts.join(" / ")
}

function folderDepth(folder: ZenFolder): number {
  let depth = 0
  for (let current: ZenFolder | null = folder; current; current = current.group) depth++
  return depth
}

/**
 * Creates a subfolder when the selected tab sits inside a folder (and nesting depth allows it),
 * otherwise a root folder in the active space. Zen opens the rename field either way.
 */
export function createSmartFolder(win: Window): "subfolder" | "folder" {
  const parent = win.gBrowser.selectedTab.group
  const maxDepth = Services.prefs.getIntPref("zen.folders.max-subfolders", 5)
  if (isFolder(parent) && folderDepth(parent) <= maxDepth) {
    parent.createSubfolder()
    return "subfolder"
  }
  win.gZenFolders.createFolder([], { renameFolder: true })
  return "folder"
}

export function createFolderWithTab(win: Window, tab: XULTab) {
  win.gZenFolders.createFolder([tab], { renameFolder: true })
}

export function moveTabToFolder(win: Window, tab: XULTab, folder: ZenFolder) {
  const target = folder.getAttribute("zen-workspace-id")
  if (target && tab.getAttribute("zen-workspace-id") !== target) win.gZenWorkspaces.moveTabToWorkspace(tab, target)
  folder.addTabs([tab])
}

export function moveFolderToWorkspace(win: Window, folder: ZenFolder, workspaceId: string) {
  win.gZenFolders.changeFolderToSpace(folder, workspaceId)
}

export function renameFolder(folder: ZenFolder, label: string) {
  folder.label = label
}

/** Moves a tab out of any folder and into a space as a loose tab. */
export function moveTabToSpace(win: Window, tab: XULTab, workspaceId: string) {
  if (tab.group) win.gBrowser.ungroupTab(tab)
  if (tab.getAttribute("zen-workspace-id") !== workspaceId) win.gZenWorkspaces.moveTabToWorkspace(tab, workspaceId)
}

export function createFolderInSpace(win: Window, workspaceId: string, label: string): ZenFolder {
  return win.gZenFolders.createFolder([], { workspaceId, label })
}

/** Deletes a folder with its tabs, or dissolves it and keeps the tabs in the space. */
export function deleteFolder(folder: ZenFolder, keepTabs: boolean): Promise<void> {
  return keepTabs ? folder.unpackTabs() : folder.delete()
}

export function countNodeTabs(node: FolderNode): number {
  return node.children.reduce((sum, child) => sum + (child.kind === "tab" ? 1 : countNodeTabs(child)), 0)
}
