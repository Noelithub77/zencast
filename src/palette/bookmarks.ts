// Bookmarks in the palette: every bookmark is searchable from the root list, and a typed keyword
// ("gh zencast") becomes the top row, filling the quick link's %s with the rest of the query.
import { allBookmarks, fillQuery, keywordBookmark, takesQuery, type Bookmark } from "@/browser/bookmarks"
import { editView } from "@/commands/bookmarks"
import type { CommandContext, ItemAction, ListView, PaletteItem } from "@/commands/types"
import { jumpId, type Jump } from "@/shared/config"
import { openActions, openTarget } from "./sources"

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*%s.*$/i, "")

// A search URL's template is never visited itself, so its site's favicon comes from the origin.
const favicon = (url: string) => `page-icon:${takesQuery(url) ? new URL(url).origin + "/" : url}`

/** Asks for the query a quick link fills in. */
function queryPrompt(ctx: CommandContext, bookmark: Bookmark): ListView {
  return {
    id: `quick-link:${bookmark.guid}`,
    title: bookmark.title,
    placeholder: "Search",
    items: [],
    prompt: {
      initial: "",
      label: (value) => (value.trim() ? `Search ${bookmark.title} for “${value.trim()}”` : `Open ${bookmark.title}`),
      submit: (value) => openTarget(ctx, fillQuery(bookmark.url, value.trim()), "tab"),
    },
  }
}

function editAction(ctx: CommandContext, bookmark: Bookmark): ItemAction {
  return { id: "edit", title: "Edit bookmark", keys: "ctrl+e", run: () => editView(ctx, bookmark) }
}

export function bookmarkItems(ctx: CommandContext, bindings: Map<string, string[]>): PaletteItem[] {
  return allBookmarks().map((bookmark) => {
    const search = takesQuery(bookmark.url)
    const jump: Jump = { kind: "url", target: bookmark.url, title: bookmark.title }
    return {
      id: `bookmark:${bookmark.guid}`,
      title: bookmark.title,
      subtitle: shortUrl(bookmark.url),
      section: "Bookmarks",
      icon: { kind: "favicon", url: favicon(bookmark.url) },
      accessory: bookmark.keyword || undefined,
      accessoryColor: "var(--butter)",
      keys: bindings.get(jumpId(jump))?.[0],
      keywords: `bookmark ${bookmark.keyword} ${bookmark.folder.path}`,
      // Below tabs and commands in the empty list; a typed match still ranks on its own.
      boost: -0.5,
      actions: search
        ? [{ id: "search", title: "Search", run: () => queryPrompt(ctx, bookmark) }, editAction(ctx, bookmark)]
        : [
            ...openActions(ctx, () => bookmark.url),
            editAction(ctx, bookmark),
            { id: "assign", title: "Assign shortcut", keys: "ctrl+.", keepOpen: true, run: () => ctx.ui.record(jumpId(jump), bookmark.title, jump) },
          ],
    }
  })
}

/**
 * The quick link a query starts with: "gh zencast" searches GitHub, "gh" alone asks for the query,
 * and a keyword without %s opens its bookmark. Returns the bookmark too, so its own row is dropped.
 */
export function quickLink(ctx: CommandContext, query: string): { item: PaletteItem; bookmark: Bookmark } | null {
  const match = /^(\S+)(?:\s+(.*))?$/.exec(query.trim())
  const bookmark = match?.[1] ? keywordBookmark(match[1]) : undefined
  if (!bookmark) return null
  const rest = match?.[2]?.trim() ?? ""
  const base = {
    id: "quick-link",
    transient: true,
    section: "Quick link",
    icon: { kind: "favicon", url: favicon(bookmark.url) } as const,
    accessory: bookmark.keyword,
    accessoryColor: "var(--butter)",
  }
  if (!takesQuery(bookmark.url)) {
    if (rest) return null
    return { bookmark, item: { ...base, title: bookmark.title, subtitle: shortUrl(bookmark.url), actions: openActions(ctx, () => bookmark.url) } }
  }
  if (!rest)
    return {
      bookmark,
      item: { ...base, title: bookmark.title, subtitle: "Type to search", actions: [{ id: "search", title: "Search", run: () => queryPrompt(ctx, bookmark) }] },
    }
  return {
    bookmark,
    item: {
      ...base,
      title: rest,
      subtitle: `Search ${bookmark.title}`,
      actions: openActions(ctx, () => fillQuery(bookmark.url, rest)),
    },
  }
}
