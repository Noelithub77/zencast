import {
  Globe02Icon,
  KeyboardIcon,
  Layers01Icon,
  Search01Icon,
  Settings01Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons"

import { containerName, openInContainer } from "@/browser/containers"
import {
  openAboutConfig,
  openPane,
  paneSettings,
  prefSettings,
  prefValue,
  searchPreferences,
  togglePref,
} from "@/browser/settings-index"
import { closeTab, duplicateTab, listTabs, selectTab, tabKey, tabUrl } from "@/browser/tabs"
import { defaultEngine, searchUrl, typedUrl, type WebResult } from "@/browser/urlbar"
import { openUrl } from "@/browser/window"
import { activeWorkspaceId, listWorkspaces, moveTabToWorkspace, switchWorkspace } from "@/browser/workspaces"
import { chooseContainer, COMMANDS, containerItems, openSettings } from "@/commands/catalog"
import type { CommandContext, ItemAction, PaletteItem } from "@/commands/types"
import { buildIndex, type SearchIndex } from "./search"
import { getState } from "./store"

/** Opens a URL in a new tab, or the current one, honouring the chosen container. */
export function openTarget(ctx: CommandContext, url: string, where: "tab" | "current") {
  const openIn = getState().openIn
  if (openIn && where === "tab") openInContainer(ctx.win, openIn.id, url)
  else if (openIn) {
    // A tab cannot change container in place, so "current" replaces it with a container tab.
    const old = ctx.tab
    openInContainer(ctx.win, openIn.id, url)
    ctx.win.gBrowser.removeTab(old)
  } else openUrl(ctx.win, url, where)
}

function openActions(ctx: CommandContext, url: () => string | Promise<string>): ItemAction[] {
  return [
    { id: "open", title: "Open in new tab", run: async () => openTarget(ctx, await url(), "tab") },
    { id: "open-here", title: "Open in this tab", keys: "alt+enter", run: async () => openTarget(ctx, await url(), "current") },
  ]
}

function commandItems(ctx: CommandContext, bindings: Map<string, string[]>): PaletteItem[] {
  const out: PaletteItem[] = []
  for (const command of COMMANDS) {
    if (command.hidden || (command.when && !command.when(ctx))) continue
    out.push({
      id: command.id,
      title: command.title,
      section: command.section,
      icon: { kind: "icon", icon: command.icon },
      keys: bindings.get(command.id)?.[0],
      keywords: command.keywords,
      boost: 1,
      actions: [
        { id: "run", title: "Run", run: () => command.run(ctx) },
        { id: "shortcut", title: "Change shortcut", keys: "ctrl+.", run: () => openSettings(ctx.win, `keys/${command.id}`) },
      ],
    })
  }
  return out
}

function tabItems(ctx: CommandContext): PaletteItem[] {
  const spaces = new Map(listWorkspaces(ctx.win).map((ws) => [ws.uuid, ws.name]))
  return listTabs(ctx.win)
    .filter((tab) => tab !== ctx.tab)
    .map((tab) => {
      const url = tabUrl(tab)
      const container = tab.userContextId
      return {
        id: tabKey(tab),
        transient: true,
        title: tab.label,
        subtitle: url.replace(/^https?:\/\/(www\.)?/, ""),
        section: "Tabs",
        icon: { kind: "favicon", url: tab.getAttribute("image") || `page-icon:${url}` },
        accessory: container ? containerName(container) : (spaces.get(tab.getAttribute("zen-workspace-id") ?? "") ?? undefined),
        accessoryColor: container ? undefined : "var(--faint)",
        keywords: tab.pinned ? "pinned" : undefined,
        actions: [
          { id: "switch", title: "Switch to tab", run: () => selectTab(ctx.win, tab) },
          { id: "close", title: "Close tab", keys: "ctrl+w", danger: true, keepOpen: true, run: () => closeTab(ctx.win, tab) },
          { id: "duplicate", title: "Duplicate", run: () => duplicateTab(ctx.win, tab) },
        ],
      }
    })
}

function spaceItems(ctx: CommandContext): PaletteItem[] {
  const active = activeWorkspaceId(ctx.win)
  return listWorkspaces(ctx.win)
    .filter((ws) => ws.uuid !== active)
    .map((ws, index) => ({
      id: `space:${ws.uuid}`,
      title: ws.name,
      section: "Spaces",
      icon: { kind: "icon", icon: Layers01Icon },
      keywords: `space workspace ${index + 1}`,
      actions: [
        { id: "switch", title: "Switch to space", run: () => switchWorkspace(ctx.win, ws.uuid) },
        { id: "move", title: "Move tab here", keys: "ctrl+enter", run: () => moveTabToWorkspace(ctx.win, ctx.tab, ws.uuid) },
      ],
    }))
}

/** Everything searchable without a query-specific source; built synchronously on open. */
export function rootItems(ctx: CommandContext, bindings: Map<string, string[]>, native: PaletteItem[]): PaletteItem[] {
  return [
    ...commandItems(ctx, bindings),
    ...native,
    ...tabItems(ctx),
    ...spaceItems(ctx),
    ...containerItems(
      ctx,
      { title: "Open next in container", keepOpen: true, run: (id) => chooseContainer(ctx, id) },
      { title: "Open blank tab", run: (id) => void openInContainer(ctx.win, id) },
    ).map((item) => ({ ...item, keywords: "container" })),
  ]
}

/** Settings are only searched once the query has two characters, so the prefs list stays out of the root view. */
const withSettings = new WeakMap<PaletteItem[], SearchIndex>()

/**
 * Root plus every setting, cached per root list. Root is rebuilt on open and after keep-open
 * actions, which also refreshes the prefs' On/Off accessories.
 */
export function rootWithSettings(ctx: CommandContext, root: PaletteItem[]): SearchIndex {
  let index = withSettings.get(root)
  if (!index) {
    index = buildIndex([...root, ...settingsItems(ctx)])
    withSettings.set(root, index)
  }
  return index
}

export function settingsItems(ctx: CommandContext): PaletteItem[] {
  const panes: PaletteItem[] = paneSettings().map((pane) => ({
    id: `pane:${pane.pane}`,
    title: pane.title,
    section: "Settings",
    icon: { kind: "icon", icon: Settings01Icon },
    keywords: `${pane.keywords} settings preferences`,
    actions: [{ id: "open", title: "Open settings", run: () => openPane(ctx.win, pane.pane) }],
  }))
  const prefs: PaletteItem[] = prefSettings().map((pref) => {
    const on = prefValue(pref.name)
    return {
      id: `pref:${pref.name}`,
      title: pref.title,
      subtitle: pref.section,
      section: "Settings",
      icon: { kind: "icon", icon: SlidersHorizontalIcon },
      keywords: pref.name,
      accessory: on ? "On" : "Off",
      accessoryColor: on ? "var(--mint)" : "var(--faint)",
      boost: -1,
      actions: [
        {
          id: "toggle",
          title: on ? "Turn off" : "Turn on",
          keepOpen: true,
          run: () => {
            ctx.ui.toast(`${pref.title} ${togglePref(pref.name) ? "on" : "off"}`)
          },
        },
        { id: "config", title: "Open in about:config", keys: "ctrl+enter", run: () => openAboutConfig(ctx.win, pref.name) },
      ],
    }
  })
  return [...panes, ...prefs]
}

export function settingsSearchItem(ctx: CommandContext, query: string): PaletteItem {
  return {
    id: "settings-search",
    transient: true,
    title: `Search settings for “${query}”`,
    section: "Settings",
    icon: { kind: "icon", icon: Search01Icon },
    actions: [{ id: "search", title: "Search settings", run: () => searchPreferences(ctx.win, query) }],
  }
}

export function keybindingsItem(ctx: CommandContext): PaletteItem {
  return {
    id: "zencast.keys",
    title: "Keyboard shortcuts",
    section: "Palette",
    icon: { kind: "icon", icon: KeyboardIcon },
    keywords: "keybindings hotkeys bindings chords",
    actions: [{ id: "open", title: "Open", run: () => openSettings(ctx.win, "keys") }],
  }
}

let engineName = ""

export function loadEngineName() {
  void defaultEngine().then((engine) => (engineName = engine.name))
}

/** The typed URL and the web search fallback for a query. */
export function queryItems(ctx: CommandContext, query: string): { url: PaletteItem | null; search: PaletteItem } {
  const url = typedUrl(query)
  return {
    url: url
      ? {
          id: "typed-url",
          transient: true,
          title: url.replace(/^https?:\/\//, ""),
          section: "Open",
          icon: { kind: "icon", icon: Globe02Icon },
          actions: openActions(ctx, () => url),
        }
      : null,
    search: {
      id: "web-search",
      transient: true,
      title: query,
      subtitle: engineName ? `Search ${engineName}` : "Search the web",
      section: "Search",
      icon: { kind: "icon", icon: Search01Icon },
      actions: openActions(ctx, () => searchUrl(query)),
    },
  }
}

export function webItems(ctx: CommandContext, results: WebResult[], query: string): PaletteItem[] {
  const out: PaletteItem[] = []
  for (const result of results) {
    if (result.heuristic || result.source === "tab") continue
    if (result.kind === "search") {
      const text = result.query ?? result.title
      if (text.toLowerCase() === query.trim().toLowerCase()) continue
      out.push({
        id: `suggest:${text}`,
        transient: true,
        title: text,
        section: "Web",
        icon: { kind: "icon", icon: Search01Icon, color: "var(--faint)" },
        actions: openActions(ctx, () => searchUrl(text)),
      })
    } else {
      out.push({
        id: `url:${result.url}`,
        transient: true,
        title: result.title,
        subtitle: result.url.replace(/^https?:\/\/(www\.)?/, ""),
        section: "Web",
        icon: { kind: "favicon", url: `page-icon:${result.url}` },
        accessory: result.source === "bookmark" ? "Bookmark" : undefined,
        accessoryColor: "var(--butter)",
        actions: openActions(ctx, () => result.url),
      })
    }
  }
  return out
}
