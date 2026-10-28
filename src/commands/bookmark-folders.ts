// Walks the bookmark tree a folder at a time: subfolders first, then the folder's own bookmarks, in
// the order Zen shows them. Ctrl+Enter on a folder opens its bookmarks as tabs.
import { Folder01Icon, FolderLibraryIcon } from "@hugeicons/core-free-icons"

import { folderContents, takesQuery, type BookmarkFolder } from "@/browser/bookmarks"
import { openSavedTabs } from "@/browser/sessions"
import { effectiveBindings } from "@/keys/bindings"
import { bookmarkItem } from "@/palette/bookmarks"
import { getState } from "@/palette/store"
import { readConfig } from "@/shared/config"
import type { Command, CommandContext, ListView, PaletteItem } from "./types"

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

function contentsLabel(folder: BookmarkFolder): string {
  const { folders, bookmarks } = folderContents(folder.guid)
  const parts = [folders.length && plural(folders.length, "folder"), bookmarks.length && plural(bookmarks.length, "bookmark")]
  return parts.filter(Boolean).join(" · ") || "Empty"
}

/** Opens the folder's own bookmarks as tabs; search templates are skipped, as they need a query. */
function openAll(ctx: CommandContext, folder: BookmarkFolder) {
  const urls = folderContents(folder.guid).bookmarks.filter((bookmark) => !takesQuery(bookmark.url))
  if (!urls.length) return ctx.ui.toast("No bookmarks to open")
  const userContextId = getState().openIn?.id ?? 0
  openSavedTabs(ctx.win, urls.map(({ title, url }) => ({ title, url, userContextId })), true)
  ctx.ui.toast(`Opened ${plural(urls.length, "tab")}`)
}

function folderItem(ctx: CommandContext, folder: BookmarkFolder): PaletteItem {
  return {
    id: `bookmark-folder:${folder.guid}`,
    title: folder.title,
    subtitle: contentsLabel(folder),
    section: "Folders",
    icon: { kind: "icon", icon: Folder01Icon },
    actions: [
      { id: "browse", title: "Open folder", run: () => folderView(ctx, folder) },
      { id: "all", title: "Open all in tabs", keys: "ctrl+enter", run: () => openAll(ctx, folder) },
    ],
  }
}

/** A folder's contents, or the roots (toolbar, menu, other) when no folder is given. */
export function folderView(ctx: CommandContext, folder?: BookmarkFolder): ListView {
  const { folders, bookmarks } = folderContents(folder?.guid ?? null)
  const bindings = effectiveBindings(readConfig())
  // An empty root, such as mobile bookmarks on a desktop, is left out.
  const shown = folder ? folders : folders.filter((root) => contentsLabel(root) !== "Empty")
  return {
    id: `bookmark-browse:${folder?.guid ?? "root"}`,
    title: folder?.title ?? "Bookmarks",
    placeholder: folder ? `Search ${folder.title}` : "Folder",
    items: [...shown.map((child) => folderItem(ctx, child)), ...bookmarks.map((bookmark) => bookmarkItem(ctx, bookmark, bindings))],
  }
}

export const bookmarkFolderCommands: Command[] = [
  {
    id: "bookmark.browse",
    title: "Browse bookmarks",
    section: "Bookmarks",
    icon: FolderLibraryIcon,
    keywords: "folders tree library manage organize",
    run: (ctx) => folderView(ctx),
  },
]
