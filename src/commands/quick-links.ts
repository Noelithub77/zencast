// Everything reachable by a short keyword or a key in one list: bookmarks with a keyword, sites and
// folders given a key, and search engines with a keyword from Zen's settings. Rows keep this order,
// so the bookmark rows drop the boost that ranks them low elsewhere.
import { Folder01Icon, Link04Icon } from "@hugeicons/core-free-icons"

import { allBookmarks, findBookmark } from "@/browser/bookmarks"
import { allEngines, engineSearchUrl, type Engine } from "@/browser/engines"
import { effectiveBindings } from "@/keys/bindings"
import { bookmarkItem } from "@/palette/bookmarks"
import { openTarget } from "@/palette/sources"
import { jumpId, readConfig, type Jump } from "@/shared/config"
import { allCommands } from "./jumps"
import type { Command, CommandContext, ListView, PaletteItem } from "./types"

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")

function jumpItem(ctx: CommandContext, jump: Jump, keys: string | undefined): PaletteItem {
  const id = jumpId(jump)
  return {
    id: `quick:${id}`,
    title: jump.title,
    subtitle: jump.kind === "url" ? shortUrl(jump.target) : "Folder",
    section: "Keys",
    icon: jump.kind === "url" ? { kind: "favicon", url: `page-icon:${jump.target}` } : { kind: "icon", icon: Folder01Icon },
    keys,
    actions: [
      { id: "open", title: "Open", run: () => allCommands(readConfig()).find((command) => command.id === id)?.run(ctx) },
      { id: "assign", title: "Change shortcut", keys: "ctrl+.", keepOpen: true, run: () => ctx.ui.record(id, jump.title, jump) },
    ],
  }
}

function engineItem(ctx: CommandContext, engine: Engine, keyword: string): PaletteItem {
  return {
    id: `quick:engine:${engine.name}`,
    title: engine.name,
    subtitle: "Search engine",
    section: "Search engines",
    icon: { kind: "favicon", url: engine.icon },
    accessory: keyword,
    accessoryColor: "var(--butter)",
    keywords: engine.aliases.join(" "),
    actions: [
      {
        id: "search",
        title: "Search",
        run: (): ListView => ({
          id: `quick-engine:${engine.name}`,
          title: engine.name,
          placeholder: `Search ${engine.name}`,
          items: [],
          prompt: {
            initial: "",
            label: (value) => `Search ${engine.name} for “${value.trim()}”`,
            submit: (value) => openTarget(ctx, engineSearchUrl(engine, value.trim()), "tab"),
          },
        }),
      },
    ],
  }
}

function quickLinksView(ctx: CommandContext): ListView | void {
  const config = readConfig()
  const bindings = effectiveBindings(config)
  const byKeyword = (a: { keyword: string }, b: { keyword: string }) => a.keyword.localeCompare(b.keyword)
  const keyworded = allBookmarks().filter((bookmark) => bookmark.keyword).sort(byKeyword)
  const shown = new Set(keyworded.map((bookmark) => bookmark.url))
  // A site's key shows on its keyword row when it has one, so it is listed once.
  const jumps = config.jumps.filter((jump) => !(jump.kind === "url" && shown.has(jump.target)))
  const engines = allEngines().flatMap((engine) => {
    const keyword = engine.aliases.find((alias) => !alias.startsWith("@"))
    return keyword ? [{ engine, keyword }] : []
  })
  const items = [
    ...keyworded.map((bookmark) => ({ ...bookmarkItem(ctx, bookmark, bindings), section: "Keywords", boost: undefined })),
    ...jumps.map((jump) => {
      const bookmark = jump.kind === "url" ? findBookmark(jump.target) : undefined
      const keys = bindings.get(jumpId(jump))?.[0]
      return bookmark ? { ...bookmarkItem(ctx, bookmark, bindings), section: "Keys", boost: undefined } : jumpItem(ctx, jump, keys)
    }),
    ...engines.sort(byKeyword).map(({ engine, keyword }) => engineItem(ctx, engine, keyword)),
  ]
  if (!items.length) return ctx.ui.toast("No quick links yet: give a bookmark a keyword, or anything a key with Ctrl+.")
  return { id: "quick-links", title: "Quick links", placeholder: "Keyword or key", items }
}

export const quickLinkCommands: Command[] = [
  {
    id: "bookmark.quickLinks",
    title: "Quick links",
    section: "Bookmarks",
    icon: Link04Icon,
    keywords: "keywords shortcuts keys jumps bookmark keybindings search engines list all",
    run: quickLinksView,
  },
]
