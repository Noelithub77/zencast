import { countNodeTabs, folderPath, type FolderNode, type SpaceTree, type TabNode } from "@/browser/folders"
import { fuzzyFilter } from "@/palette/search"

export type TreeRow =
  | { kind: "space"; key: string; depth: number; tree: SpaceTree; count: number }
  | { kind: "folder"; key: string; depth: number; node: FolderNode; count: number; path?: string }
  | { kind: "loose"; key: string; depth: number; label: string; tabs: TabNode[] }
  | { kind: "tab"; key: string; depth: number; node: TabNode; path?: string }

/** Loose tab groups start closed; spaces and folders start open. */
export function isOpen(row: TreeRow, toggled: ReadonlySet<string>): boolean {
  const byDefault = row.kind !== "loose"
  return toggled.has(row.key) ? !byDefault : byDefault
}

export function isExpandable(row: TreeRow): boolean {
  return row.kind !== "tab"
}

function pushFolder(rows: TreeRow[], node: FolderNode, depth: number, toggled: ReadonlySet<string>) {
  const row: TreeRow = { kind: "folder", key: node.key, depth, node, count: countNodeTabs(node) }
  rows.push(row)
  if (!isOpen(row, toggled)) return
  for (const child of node.children) {
    if (child.kind === "folder") pushFolder(rows, child, depth + 1, toggled)
    else rows.push({ kind: "tab", key: child.key, depth: depth + 1, node: child })
  }
}

/** The visible rows of the tree, honouring which nodes the user opened or closed. */
export function treeRows(trees: SpaceTree[], toggled: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = []
  for (const tree of trees) {
    const count = tree.folders.reduce((sum, folder) => sum + countNodeTabs(folder), 0) + tree.pinned.length + tree.tabs.length
    const space: TreeRow = { kind: "space", key: `space-${tree.workspace.uuid}`, depth: 0, tree, count }
    rows.push(space)
    if (!isOpen(space, toggled)) continue
    for (const folder of tree.folders) pushFolder(rows, folder, 1, toggled)
    for (const [label, tabs] of [["Pinned", tree.pinned], ["Tabs", tree.tabs]] as const) {
      if (!tabs.length) continue
      const loose: TreeRow = { kind: "loose", key: `${label}-${tree.workspace.uuid}`, depth: 1, label, tabs }
      rows.push(loose)
      if (isOpen(loose, toggled)) for (const tab of tabs) rows.push({ kind: "tab", key: tab.key, depth: 2, node: tab })
    }
  }
  return rows
}

/** A flat list of matching folders and tabs, each labelled with where it lives. */
export function searchRows(trees: SpaceTree[], query: string): TreeRow[] {
  const all: TreeRow[] = []
  const walk = (node: FolderNode, space: string) => {
    const path = `${space} / ${folderPath(node.folder)}`
    all.push({ kind: "folder", key: node.key, depth: 0, node, count: countNodeTabs(node), path })
    for (const child of node.children) {
      if (child.kind === "folder") walk(child, space)
      else all.push({ kind: "tab", key: child.key, depth: 0, node: child, path })
    }
  }
  for (const tree of trees) {
    for (const folder of tree.folders) walk(folder, tree.workspace.name)
    for (const tab of [...tree.pinned, ...tree.tabs]) all.push({ kind: "tab", key: tab.key, depth: 0, node: tab, path: tree.workspace.name })
  }
  return fuzzyFilter(all, (row) => (row.kind === "folder" ? row.node.label : row.kind === "tab" ? `${row.node.title} ${row.node.url}` : ""), query)
}
