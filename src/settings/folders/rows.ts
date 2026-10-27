import { countNodeTabs, folderPath, type FolderNode, type SpaceTree, type TabNode } from "@/browser/folders"
import { fuzzyFilter } from "@/palette/search"

export type TreeRow =
  | { kind: "space"; key: string; depth: number; tree: SpaceTree; count: number }
  | { kind: "folder"; key: string; depth: number; node: FolderNode; count: number; path?: string }
  | { kind: "loose"; key: string; depth: number; label: string; tabs: TabNode[] }
  | { kind: "tab"; key: string; depth: number; node: TabNode; path?: string }

/** Spaces are column headers and always open; folders and loose tab groups start closed. */
export function isOpen(row: TreeRow, toggled: ReadonlySet<string>): boolean {
  const byDefault = row.kind === "space"
  return toggled.has(row.key) ? !byDefault : byDefault
}

export function isExpandable(row: TreeRow): boolean {
  return row.kind === "folder" || row.kind === "loose"
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

/** One column per space: its header, then the rows the user has opened below its root folders. */
export function spaceColumns(trees: SpaceTree[], toggled: ReadonlySet<string>): TreeRow[][] {
  return trees.map((tree) => {
    const count = tree.folders.reduce((sum, folder) => sum + countNodeTabs(folder), 0) + tree.pinned.length + tree.tabs.length
    const rows: TreeRow[] = [{ kind: "space", key: `space-${tree.workspace.uuid}`, depth: 0, tree, count }]
    for (const folder of tree.folders) pushFolder(rows, folder, 1, toggled)
    for (const [label, tabs] of [["Pinned", tree.pinned], ["Tabs", tree.tabs]] as const) {
      if (!tabs.length) continue
      const loose: TreeRow = { kind: "loose", key: `${label}-${tree.workspace.uuid}`, depth: 1, label, tabs }
      rows.push(loose)
      if (isOpen(loose, toggled)) for (const tab of tabs) rows.push({ kind: "tab", key: tab.key, depth: 2, node: tab })
    }
    return rows
  })
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
