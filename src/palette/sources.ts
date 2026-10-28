import {
  Folder01Icon,
  Layers01Icon,
  Search01Icon,
  Settings01Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons"

import { containerName, openInContainer, reopenInContainer } from "@/browser/containers"
import {
  openAboutConfig,
  openPane,
  paneSettings,
  prefSettings,
  prefValue,
  readValuePref,
  searchPreferences,
  togglePref,
  valuePrefs,
  writeValuePref,
  type ValuePref,
} from "@/browser/settings-index"
import { allFolders, breadcrumb, folderPath, openFolder } from "@/browser/folders"
import { closeTab, duplicateTab, listTabs, pageTitle, selectTab, tabKey, tabUrl } from "@/browser/tabs"
import { fillQuery } from "@/browser/bookmarks"
import { ASSISTANTS, defaultEngine, searchUrl, typedUrl, type WebResult } from "@/browser/urlbar"
import { openUrl } from "@/browser/window"
import { activeWorkspaceId, listWorkspaces, moveTabAndFollow, switchWorkspace } from "@/browser/workspaces"
import { chooseContainer, COMMANDS, containerItems, openSettings } from "@/commands/catalog"
import type { CommandContext, ItemAction, ListView, PaletteItem } from "@/commands/types"
import { paletteOnCtrlT, setPaletteOnCtrlT } from "@/keys/bindings"
import { jumpId, readConfig, RESULT_LIMITS, updateConfig, type Jump } from "@/shared/config"
import { inScope } from "./scopes"
import { buildIndex, type SearchIndex } from "./search"
import { getState } from "./store"

/** Moves a tab into the targeted space, if there is one, and follows it. */
async function placeInSpace(ctx: CommandContext, tab: XULTab) {
  const space = getState().space
  if (space && tab.getAttribute("zen-workspace-id") !== space.id) await moveTabAndFollow(ctx.win, tab, space.id)
}

/** Opens a URL in a new tab, or the current one, honouring the targeted container and space. */
export async function openTarget(ctx: CommandContext, url: string, where: "tab" | "current") {
  const { openIn, space } = getState()
  if (openIn) {
    // A tab cannot change container in place, so "current" replaces it with a container tab.
    const old = ctx.tab
    const tab = openInContainer(ctx.win, openIn.id, url)
    if (where === "current") ctx.win.gBrowser.removeTab(old)
    return placeInSpace(ctx, tab)
  }
  if (where === "current") {
    openUrl(ctx.win, url, "current")
    return placeInSpace(ctx, ctx.tab)
  }
  // Container 0 is no container; this path returns the tab so it can move to the space.
  if (space) return placeInSpace(ctx, openInContainer(ctx.win, 0, url))
  openUrl(ctx.win, url, "tab")
}

/** Switches to a tab, first reopening it in the targeted container and moving it to the targeted space. */
async function switchToTab(ctx: CommandContext, tab: XULTab) {
  const { openIn, space } = getState()
  const target = openIn && tab.userContextId !== openIn.id ? reopenInContainer(ctx.win, tab, openIn.id) : tab
  if (space) await placeInSpace(ctx, target)
  else await selectTab(ctx.win, target)
}

/** Records a key that jumps to a site or folder from anywhere. */
function assignAction(ctx: CommandContext, jump: Jump): ItemAction {
  return { id: "assign", title: "Assign shortcut", keys: "ctrl+.", keepOpen: true, run: () => ctx.ui.record(jumpId(jump), jump.title, jump) }
}

export function openActions(ctx: CommandContext, url: () => string | Promise<string>): ItemAction[] {
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
        { id: "shortcut", title: "Record shortcut", keys: "ctrl+.", keepOpen: true, run: () => ctx.ui.record(command.id, command.title) },
      ],
    })
  }
  return out
}

const HOUR_MS = 3_600_000

function tabItem(ctx: CommandContext, tab: XULTab, bindings: Map<string, string[]>, spaces: Map<string, string>, now: number): PaletteItem {
  const url = tabUrl(tab)
  const container = tab.userContextId
  const loaded = !tab.hasAttribute("pending")
  const recency = 0.3 / (1 + Math.max(0, now - tab.lastAccessed) / HOUR_MS)
  const jump: Jump = { kind: "url", target: url, title: tab.label }
  // Where the tab lives, from its space down through every folder, then its container.
  const place = breadcrumb(tab, spaces)
  return {
    id: tabKey(tab),
    transient: true,
    title: tab.label,
    subtitle: url.replace(/^https?:\/\/(www\.)?/, ""),
    section: "Tabs",
    icon: { kind: "favicon", url: tab.getAttribute("image") || `page-icon:${url}` },
    accessory: [place, container && containerName(container)].filter(Boolean).join(" · ") || undefined,
    accessoryColor: "var(--faint)",
    keys: bindings.get(jumpId(jump))?.[0],
    // Searchable by its folder path and, once renamed, by the page's own title.
    keywords: [
      place,
      pageTitle(ctx.win, tab),
      tab.pinned && "pinned",
      tab.hasAttribute("zen-essential") && "essential",
      !loaded && "unloaded",
      tab === ctx.tab && "current",
    ]
      .filter(Boolean)
      .join(" "),
    boost: (loaded ? 0.6 : 0) + recency,
    dim: !loaded,
    actions: [
      { id: "switch", title: "Switch to tab", run: () => switchToTab(ctx, tab) },
      { id: "close", title: "Close tab", keys: "ctrl+w", danger: true, keepOpen: true, run: () => closeTab(ctx.win, tab) },
      assignAction(ctx, jump),
      { id: "duplicate", title: "Duplicate", run: () => duplicateTab(ctx.win, tab) },
    ],
  }
}

const spaceNames = (ctx: CommandContext) => new Map(listWorkspaces(ctx.win).map((ws) => [ws.uuid, ws.name]))

/**
 * Every tab in every space and folder but the current one, including pinned, essential and unloaded
 * ones. Loaded tabs rank above unloaded ones, and recently used tabs above both, without outranking commands.
 */
function tabItems(ctx: CommandContext, bindings: Map<string, string[]>): PaletteItem[] {
  const spaces = spaceNames(ctx)
  const now = Date.now()
  return listTabs(ctx.win)
    .filter((tab) => tab !== ctx.tab)
    .map((tab) => tabItem(ctx, tab, bindings, spaces, now))
}

/** The current tab, listed only when searching tabs, where it shows where it lives. */
export const currentTabItem = (ctx: CommandContext, bindings: Map<string, string[]>): PaletteItem =>
  tabItem(ctx, ctx.tab, bindings, spaceNames(ctx), Date.now())

/** Folders by name and path; opening one expands it and switches to its first tab. */
function folderItems(ctx: CommandContext, bindings: Map<string, string[]>): PaletteItem[] {
  const spaces = new Map(listWorkspaces(ctx.win).map((ws) => [ws.uuid, ws.name]))
  return allFolders(ctx.win).map((folder) => {
    const jump: Jump = { kind: "folder", target: folder.id, title: folder.label }
    return {
      id: `folder:${folder.id}`,
      title: folder.label,
      section: "Folders",
      icon: { kind: "icon", icon: Folder01Icon },
      // The parent folders follow the space, as on tabs.
      accessory: breadcrumb(folder, spaces) || undefined,
      accessoryColor: "var(--faint)",
      keys: bindings.get(jumpId(jump))?.[0],
      keywords: `folder ${folderPath(folder)} ${folder.tabs.length} tabs`,
      transient: true,
      actions: [
        { id: "open", title: "Open folder", run: () => openFolder(ctx.win, folder) },
        { id: "manage", title: "Show in folder manager", keys: "ctrl+enter", run: () => openSettings(ctx.win, "folders") },
        assignAction(ctx, jump),
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
        { id: "move", title: "Move tab here", keys: "ctrl+enter", run: () => moveTabAndFollow(ctx.win, ctx.tab, ws.uuid) },
      ],
    }))
}

/** Everything searchable without a query-specific source; built synchronously on open. */
export function rootItems(ctx: CommandContext, bindings: Map<string, string[]>, native: PaletteItem[]): PaletteItem[] {
  return [
    ...inScope("commands", commandItems(ctx, bindings)),
    ...inScope("commands", native),
    ...inScope("tabs", [...tabItems(ctx, bindings), ...folderItems(ctx, bindings), ...spaceItems(ctx)]),
    ...containerItems(
      ctx,
      { title: "Open next in container", keepOpen: true, run: (id) => chooseContainer(ctx, id) },
      { title: "Open blank tab", run: (id) => placeInSpace(ctx, openInContainer(ctx.win, id)) },
    ).map((item): PaletteItem => ({ ...item, keywords: "container", scope: "commands" })),
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
  return inScope("settings", [...panes, ...prefs, ...valueItems(ctx), ...zencastItems(ctx)])
}

function promptView(title: string, initial: string, submit: (value: string) => void): ListView {
  return { id: `prompt:${title}`, title, placeholder: "Value", items: [], prompt: { initial, submit } }
}

/** Number and text prefs: Enter opens a prompt with the current value. */
function valueItems(ctx: CommandContext): PaletteItem[] {
  return valuePrefs().map((pref: ValuePref) => {
    const value = readValuePref(pref)
    return {
      id: `pref:${pref.name}`,
      title: pref.title,
      subtitle: pref.section,
      section: "Settings",
      icon: { kind: "icon", icon: SlidersHorizontalIcon },
      keywords: pref.name,
      accessory: value.length > 24 ? `${value.slice(0, 23)}…` : value || "Empty",
      accessoryColor: "var(--faint)",
      boost: -1,
      actions: [
        {
          id: "edit",
          title: "Edit value",
          run: () =>
            promptView(pref.title, value, (text) => {
              const error = writeValuePref(pref, text)
              ctx.ui.toast(error ?? `${pref.title}: ${text || "empty"}`)
            }),
        },
        { id: "config", title: "Open in about:config", keys: "ctrl+enter", run: () => openAboutConfig(ctx.win, pref.name) },
      ],
    }
  })
}

function zencastToggle(id: string, title: string, on: boolean, set: (on: boolean) => void, ctx: CommandContext): PaletteItem {
  return {
    id,
    title,
    subtitle: "Zencast",
    section: "Settings",
    icon: { kind: "icon", icon: SlidersHorizontalIcon },
    keywords: "zencast",
    accessory: on ? "On" : "Off",
    accessoryColor: on ? "var(--mint)" : "var(--faint)",
    actions: [
      {
        id: "toggle",
        title: on ? "Turn off" : "Turn on",
        keepOpen: true,
        run: () => {
          set(!on)
          ctx.ui.toast(`${title} ${on ? "off" : "on"}`)
        },
      },
    ],
  }
}

/** Zencast's own settings, the same ones as the General page. */
function zencastItems(ctx: CommandContext): PaletteItem[] {
  const config = readConfig()
  return [
    zencastToggle("zencast:ctrl-t", "Open with Ctrl+T", paletteOnCtrlT(config), setPaletteOnCtrlT, ctx),
    zencastToggle("zencast:url-results", "History, bookmarks and suggestions", config.urlResults, (urlResults) => updateConfig((c) => ({ ...c, urlResults })), ctx),
    {
      id: "zencast:max-results",
      title: "Result limit",
      subtitle: "Zencast",
      section: "Settings",
      icon: { kind: "icon", icon: SlidersHorizontalIcon },
      keywords: "zencast maximum results",
      accessory: String(config.maxResults),
      accessoryColor: "var(--faint)",
      actions: [
        {
          id: "pick",
          title: "Change",
          run: (): ListView => ({
            id: "result-limit",
            title: "Result limit",
            items: RESULT_LIMITS.map((limit) => ({
              id: `limit:${limit}`,
              title: String(limit),
              section: "Result limit",
              accessory: limit === config.maxResults ? "Current" : undefined,
              actions: [{ id: "set", title: "Set", run: () => updateConfig((c) => ({ ...c, maxResults: limit })) }],
            })),
          }),
        },
      ],
    },
  ]
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

let engineName = ""
export const defaultEngineName = () => engineName

export function loadEngineName() {
  void defaultEngine().then((engine) => (engineName = engine.name))
}

/** The typed URL, and the web search and assistant prompts that follow it, for a query. */
export function queryItems(
  ctx: CommandContext,
  query: string,
  icon: (url: string) => string,
): { url: PaletteItem | null; search: PaletteItem[] } {
  const url = typedUrl(query)
  return {
    url: url
      ? {
          id: "typed-url",
          transient: true,
          title: url.replace(/^https?:\/\//, ""),
          section: "Open",
          icon: { kind: "favicon", url: icon(url) },
          actions: [...openActions(ctx, () => url), assignAction(ctx, { kind: "url", target: url, title: url.replace(/^https?:\/\//, "") })],
        }
      : null,
    search: [
      {
        id: "web-search",
        transient: true,
        title: query,
        subtitle: engineName ? `Search ${engineName}` : "Search the web",
        section: "Search",
        icon: { kind: "icon", icon: Search01Icon },
        actions: openActions(ctx, () => searchUrl(query)),
      },
      ...ASSISTANTS.map((assistant): PaletteItem => ({
        id: `ask:${assistant.keyword}`,
        transient: true,
        title: query,
        subtitle: `Ask ${assistant.title}`,
        section: "Search",
        icon: { kind: "favicon", url: `page-icon:${new URL(assistant.url).origin}/` },
        actions: openActions(ctx, () => fillQuery(assistant.url, query)),
      })),
    ],
  }
}

export function webItems(
  ctx: CommandContext,
  results: WebResult[],
  query: string,
  search: (text: string) => string | Promise<string> = searchUrl,
): PaletteItem[] {
  const out: PaletteItem[] = []
  for (const result of results) {
    // Bookmarks come from their own index, with keywords and folders.
    if (result.heuristic || result.source === "tab" || result.source === "bookmark") continue
    if (result.kind === "search") {
      const text = result.query ?? result.title
      if (text.toLowerCase() === query.trim().toLowerCase()) continue
      out.push({
        id: `suggest:${text}`,
        transient: true,
        title: text,
        section: "Web",
        icon: { kind: "icon", icon: Search01Icon, color: "var(--faint)" },
        actions: openActions(ctx, () => search(text)),
      })
    } else {
      out.push({
        id: `url:${result.url}`,
        transient: true,
        title: result.title,
        subtitle: result.url.replace(/^https?:\/\/(www\.)?/, ""),
        section: "Web",
        icon: { kind: "favicon", url: `page-icon:${result.url}` },
        actions: [...openActions(ctx, () => result.url), assignAction(ctx, { kind: "url", target: result.url, title: result.title })],
      })
    }
  }
  return out
}
