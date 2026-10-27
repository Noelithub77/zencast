import { z } from "zod"

import { isFolder, isTab } from "./folders"
import { systemPrincipal } from "./window"

// Archived folders are stored in a profile file rather than a pref: they can hold hundreds of URLs.

interface ArchivedTab {
  type: "tab"
  title: string
  url: string
  userContextId: number
}

export interface ArchivedFolderNode {
  type: "folder"
  label: string
  items: Array<ArchivedTab | ArchivedFolderNode>
}

const tabSchema = z.object({
  type: z.literal("tab"),
  title: z.string(),
  url: z.string(),
  userContextId: z.number().int(),
})

const folderSchema: z.ZodType<ArchivedFolderNode> = z.lazy(() =>
  z.object({
    type: z.literal("folder"),
    label: z.string(),
    items: z.array(z.union([tabSchema, folderSchema])),
  }),
)

const archiveSchema = z.array(
  z.object({
    id: z.string(),
    archivedAt: z.number(),
    workspaceId: z.string(),
    workspaceName: z.string(),
    root: folderSchema,
  }),
)

export type ArchivedFolder = z.infer<typeof archiveSchema>[number]

const archiveDir = () => PathUtils.join(PathUtils.profileDir, "zencast")
const archivePath = () => PathUtils.join(archiveDir(), "archive.json")

// The palette (browser window) and the settings tab are separate globals, so the file is the only
// shared state: it is read fresh each time and writes are broadcast through the observer service.
const CHANGED_TOPIC = "zencast-archive-changed"

export async function readArchive(): Promise<ArchivedFolder[]> {
  if (!(await IOUtils.exists(archivePath()))) return []
  const parsed = archiveSchema.safeParse(await IOUtils.readJSON(archivePath()))
  return parsed.success ? parsed.data : []
}

export function onArchiveChange(listener: () => void): () => void {
  const observer = { observe: listener }
  Services.obs.addObserver(observer, CHANGED_TOPIC)
  return () => Services.obs.removeObserver(observer, CHANGED_TOPIC)
}

async function writeArchive(next: ArchivedFolder[]) {
  await IOUtils.makeDirectory(archiveDir(), { ignoreExisting: true })
  await IOUtils.writeJSON(archivePath(), next, { tmpPath: `${archivePath()}.tmp` })
  Services.obs.notifyObservers(null, CHANGED_TOPIC)
}

function serialize(folder: ZenFolder): ArchivedFolderNode {
  const items: ArchivedFolderNode["items"] = []
  for (const item of folder.allItems) {
    if (isFolder(item)) {
      items.push(serialize(item))
      continue
    }
    const tabs = item.hasAttribute("split-view-group") ? [...item.children] : [item]
    for (const tab of tabs) {
      if (!isTab(tab) || tab.hasAttribute("zen-empty-tab")) continue
      items.push({
        type: "tab",
        title: tab.label,
        url: tab.linkedBrowser.currentURI?.spec ?? "about:blank",
        userContextId: tab.userContextId,
      })
    }
  }
  return { type: "folder", label: folder.label, items }
}

/** Saves the folder tree to the archive file, then removes the folder and its tabs from the sidebar. */
export async function archiveFolder(win: Window, folder: ZenFolder): Promise<ArchivedFolder> {
  const workspaceId = folder.getAttribute("zen-workspace-id") ?? win.gZenWorkspaces.activeWorkspace
  const entry: ArchivedFolder = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    archivedAt: Date.now(),
    workspaceId,
    workspaceName: win.gZenWorkspaces.getWorkspaces().find((ws) => ws.uuid === workspaceId)?.name ?? "",
    root: serialize(folder),
  }
  // Write first: the folder is only removed once its data is safely on disk.
  await writeArchive([entry, ...(await readArchive())])
  await folder.delete()
  return entry
}

function lazyTab(win: Window, tab: ArchivedTab): XULTab {
  return win.gBrowser.addTab(tab.url, {
    triggeringPrincipal: systemPrincipal(),
    userContextId: tab.userContextId,
    createLazyBrowser: true,
    skipAnimation: true,
    inBackground: true,
    title: tab.title,
  })
}

function restoreNode(win: Window, node: ArchivedFolderNode, workspaceId: string, parent: ZenFolder | null): ZenFolder {
  const tabs = node.items.filter((item): item is ArchivedTab => item.type === "tab").map((tab) => lazyTab(win, tab))
  const folder = win.gZenFolders.createFolder(tabs, {
    label: node.label,
    workspaceId,
    collapsed: true,
    insertAfter: parent ? parent.groupContainer.lastElementChild : null,
  })
  for (const item of node.items) if (item.type === "folder") restoreNode(win, item, workspaceId, folder)
  return folder
}

/** Rebuilds an archived folder with unloaded tabs, then drops it from the archive. */
export async function restoreFolder(win: Window, id: string): Promise<ZenFolder | null> {
  const archive = await readArchive()
  const entry = archive.find((item) => item.id === id)
  if (!entry) return null
  const exists = win.gZenWorkspaces.getWorkspaces().some((ws) => ws.uuid === entry.workspaceId)
  const workspaceId = exists ? entry.workspaceId : win.gZenWorkspaces.activeWorkspace
  if (workspaceId !== win.gZenWorkspaces.activeWorkspace) await win.gZenWorkspaces.changeWorkspaceWithID(workspaceId)
  const folder = restoreNode(win, entry.root, workspaceId, null)
  await writeArchive(archive.filter((item) => item.id !== id))
  return folder
}

export async function deleteArchived(id: string) {
  await writeArchive((await readArchive()).filter((item) => item.id !== id))
}

export function countTabs(node: ArchivedFolderNode): number {
  return node.items.reduce((sum, item) => sum + (item.type === "tab" ? 1 : countTabs(item)), 0)
}
