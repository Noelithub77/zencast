// Typing one of these first narrows the root search to one kind of result: "@" tabs, "/" commands,
// "#" bookmarks, "$" settings, "*" mods.
import { Bookmark01Icon, BrowserIcon, CommandIcon, PuzzleIcon, Settings01Icon } from "@hugeicons/core-free-icons"

import type { Icon, PaletteItem, ScopeId } from "@/commands/types"

export interface Scope {
  id: ScopeId
  prefix: string
  name: string
  icon: Icon
  color: string
}

export const SCOPES: Scope[] = [
  { id: "tabs", prefix: "@", name: "Tabs", icon: BrowserIcon, color: "var(--peach)" },
  { id: "commands", prefix: "/", name: "Commands", icon: CommandIcon, color: "var(--lilac)" },
  { id: "bookmarks", prefix: "#", name: "Bookmarks", icon: Bookmark01Icon, color: "var(--butter)" },
  { id: "settings", prefix: "$", name: "Settings", icon: Settings01Icon, color: "var(--mint)" },
  { id: "mods", prefix: "*", name: "Mods", icon: PuzzleIcon, color: "var(--sage)" },
]

export const scopeFor = (prefix: string) => SCOPES.find((scope) => scope.prefix === prefix)

/** Marks freshly built items with the scope that finds them. */
export function inScope(scope: ScopeId, items: PaletteItem[]): PaletteItem[] {
  for (const item of items) item.scope = scope
  return items
}
