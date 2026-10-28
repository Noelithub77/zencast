// Keyboard-first bookmarking. Ctrl+B fills the bookmark in the palette, one field per step (name,
// folder, optional keyword; Esc steps back), and opens the same fields for a page already bookmarked.
// "Browse bookmarks" walks the folders; every bookmark row can be edited, moved or deleted.
import {
  BookmarkAdd01Icon,
  BookmarkRemove01Icon,
  Folder01Icon,
  Globe02Icon,
  KeyboardIcon,
  Link04Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons"

import {
  addBookmark,
  addStarterQuickLinks,
  bookmarkFolders,
  editBookmark,
  findBookmark,
  keywordBookmark,
  lastFolder,
  normalizeKeyword,
  removeBookmark,
  restoreBookmark,
  type Bookmark,
  type BookmarkFolder,
} from "@/browser/bookmarks"
import { tabUrl } from "@/browser/tabs"
import { jumpId, readConfig, type Jump } from "@/shared/config"
import type { Command, CommandContext, ListView, PaletteItem, RunResult } from "./types"

const canBookmark = ({ tab }: CommandContext) => /^(https?|file):/.test(tabUrl(tab))

function folderPicker(title: string, pick: (folder: BookmarkFolder) => RunResult, current?: BookmarkFolder): ListView {
  const last = lastFolder()
  return {
    id: "bookmark-folder",
    title,
    placeholder: "Folder",
    items: bookmarkFolders().map((folder) => ({
      id: `bookmark-folder:${folder.guid}`,
      title: folder.title,
      subtitle: folder.path === folder.title ? undefined : folder.path,
      section: "Folders",
      icon: { kind: "icon", icon: Folder01Icon },
      accessory: folder.guid === current?.guid ? "Current" : folder.guid === last?.guid ? "Last used" : undefined,
      accessoryColor: "var(--faint)",
      // The last folder leads the empty list; folders picked often follow through usage ranking.
      boost: folder.guid === last?.guid ? 2 : 0,
      actions: [{ id: "pick", title: "Choose", run: () => pick(folder) }],
    })),
  }
}

/** Saving with a keyword another bookmark has moves it, so the row says so before Enter. */
function keywordLabel(value: string, verb: string, own?: Bookmark): string {
  const keyword = normalizeKeyword(value)
  if (!keyword) return `${verb} without a keyword`
  const owner = keywordBookmark(keyword)
  return owner && owner.url !== own?.url ? `${verb} with “${keyword}”, taking it from ${owner.title}` : `${verb} with “${keyword}”`
}

function keywordStep(ctx: CommandContext, url: string, title: string, folder: BookmarkFolder): ListView {
  return {
    id: "bookmark-keyword",
    title: "Keyword",
    placeholder: "Keyword (optional), e.g. gh",
    items: [],
    prompt: {
      initial: "",
      label: (value) => keywordLabel(value, "Save"),
      submit: async (value) => {
        const keyword = normalizeKeyword(value)
        await addBookmark({ url, title, folder, keyword })
        const saved = findBookmark(url)
        ctx.ui.toast(`Bookmarked in ${folder.title}`, saved && { label: "Undo", run: () => void removeBookmark(saved) })
      },
    },
  }
}

function newBookmark(ctx: CommandContext, url: string): ListView {
  const initial = ctx.tab.label
  return {
    id: "bookmark-name",
    title: "Bookmark name",
    placeholder: "Name",
    items: [],
    prompt: {
      initial,
      label: (value) => `Name it “${value.trim() || initial}”`,
      submit: (value) => {
        const title = value.trim() || initial
        return folderPicker(title, (folder) => keywordStep(ctx, url, title, folder))
      },
    },
  }
}

/** Moves a bookmark to another folder; Undo puts it back in its old place. */
export function moveView(ctx: CommandContext, bookmark: Bookmark): ListView {
  return folderPicker(
    "Move to folder",
    async (folder) => {
      await editBookmark(bookmark, { folder })
      ctx.ui.toast(`Moved to ${folder.title}`, { label: "Undo", run: () => void editBookmark(bookmark, { folder: bookmark.folder, index: bookmark.index }) })
    },
    bookmark.folder,
  )
}

export async function deleteBookmark(ctx: CommandContext, bookmark: Bookmark) {
  await removeBookmark(bookmark)
  ctx.ui.toast("Bookmark deleted", { label: "Undo", run: () => void restoreBookmark(bookmark) })
}

/** What was typed as a URL: kept when it parses, otherwise read as a site ("example.com/a"). */
function typedUrl(value: string, fallback: string): string {
  const text = value.trim()
  if (!text) return fallback
  try {
    return new URL(text).href
  } catch {
    return `https://${text}`
  }
}

function field(id: string, title: string, value: string, icon: PaletteItem["icon"], run: () => ListView): PaletteItem {
  return {
    id,
    title,
    section: "Bookmark",
    icon,
    accessory: value,
    accessoryColor: "var(--faint)",
    actions: [{ id: "edit", title: `Change ${title.toLowerCase()}`, run }],
  }
}

export function editView(ctx: CommandContext, bookmark: Bookmark): ListView {
  const jump: Jump = { kind: "url", target: bookmark.url, title: bookmark.title }
  return {
    id: "bookmark-edit",
    title: bookmark.title,
    items: [
      field("bookmark-edit-name", "Name", bookmark.title, { kind: "icon", icon: PencilEdit01Icon }, () => ({
        id: "bookmark-rename",
        title: "Name",
        items: [],
        prompt: {
          initial: bookmark.title,
          label: (value) => `Rename to “${value.trim() || bookmark.title}”`,
          submit: async (value) => {
            await editBookmark(bookmark, { title: value.trim() || bookmark.title })
            ctx.ui.toast("Bookmark renamed")
          },
        },
      })),
      field("bookmark-edit-url", "URL", bookmark.url.replace(/^https?:\/\//, ""), { kind: "icon", icon: Globe02Icon }, () => ({
        id: "bookmark-reurl",
        title: "URL",
        placeholder: "URL, with %s for a search",
        items: [],
        prompt: {
          initial: bookmark.url,
          label: (value) => `Change to “${typedUrl(value, bookmark.url)}”`,
          submit: async (value) => {
            await editBookmark(bookmark, { url: typedUrl(value, bookmark.url) })
            ctx.ui.toast("URL changed")
          },
        },
      })),
      field("bookmark-edit-folder", "Folder", bookmark.folder.title, { kind: "icon", icon: Folder01Icon }, () => moveView(ctx, bookmark)),
      field("bookmark-edit-keyword", "Keyword", bookmark.keyword || "None", { kind: "icon", icon: Link04Icon }, () => ({
        id: "bookmark-rekey",
        title: "Keyword",
        placeholder: "Keyword, e.g. gh",
        items: [],
        prompt: {
          initial: bookmark.keyword,
          label: (value) => keywordLabel(value, "Save", bookmark),
          submit: async (value) => {
            const keyword = normalizeKeyword(value)
            await editBookmark(bookmark, { keyword })
            ctx.ui.toast(keyword ? `Keyword: ${keyword}` : "Keyword removed")
          },
        },
      })),
      {
        id: "bookmark-edit-key",
        title: "Shortcut key",
        section: "Bookmark",
        icon: { kind: "icon", icon: KeyboardIcon },
        keys: readConfig().bindings[jumpId(jump)]?.[0],
        actions: [{ id: "assign", title: "Record shortcut", keys: "ctrl+.", keepOpen: true, run: () => ctx.ui.record(jumpId(jump), bookmark.title, jump) }],
      },
      {
        id: "bookmark-edit-delete",
        title: "Delete bookmark",
        section: "Bookmark",
        icon: { kind: "icon", icon: BookmarkRemove01Icon, color: "var(--rose)" },
        actions: [{ id: "delete", title: "Delete", danger: true, run: () => deleteBookmark(ctx, bookmark) }],
      },
    ],
  }
}

export const bookmarkCommands: Command[] = [
  {
    id: "bookmark.add",
    title: "Bookmark this tab",
    section: "Bookmarks",
    icon: BookmarkAdd01Icon,
    keywords: "save star favorite keyword quick link edit",
    defaultKeys: ["ctrl+b"],
    when: canBookmark,
    run: (ctx) => {
      const url = tabUrl(ctx.tab)
      const existing = findBookmark(url)
      return existing ? editView(ctx, existing) : newBookmark(ctx, url)
    },
  },
  {
    id: "bookmark.starters",
    title: "Add starter quick links",
    section: "Bookmarks",
    icon: Link04Icon,
    keywords: "keywords search shortcuts gh yt wiki mdn npm",
    run: async (ctx) => {
      const { added, skipped } = await addStarterQuickLinks()
      const taken = skipped.length ? ` · kept your ${skipped.join(", ")}` : ""
      ctx.ui.toast(added ? `Added ${added} quick links to Other bookmarks${taken}` : `Quick links already set${taken}`)
    },
  },
]
