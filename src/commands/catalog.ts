import {
  Archive02Icon,
  ArrowTurnBackwardIcon,
  CommandIcon,
  DashboardSquare01Icon,
  EraserIcon,
  Exchange01Icon,
  Folder01Icon,
  FolderAddIcon,
  FolderLibraryIcon,
  FolderOpenIcon,
  FolderTransferIcon,
  GhostIcon,
  Layers01Icon,
  Link01Icon,
  PencilEdit01Icon,
  PinIcon,
  PuzzleIcon,
  RefreshIcon,
  Settings02Icon,
  StarIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"

import { archiveFolder, countTabs, readArchive, restoreFolder } from "@/browser/archive"
import { listContainers, openInContainer, openTemporaryContainer, reopenInContainer } from "@/browser/containers"
import {
  allFolders,
  createFolderWithTab,
  createSmartFolder,
  folderPath,
  isFolder,
  moveTabToFolder,
} from "@/browser/folders"
import { editPinnedUrl, replacePinnedUrl, resetPinnedTab, toggleEssential, togglePin } from "@/browser/pins"
import { transferSession, wipeTab } from "@/browser/session"
import { canCopy, isPageFocused, pageHasSelection } from "@/browser/window"
import { activeWorkspaceId, listWorkspaces, moveTabAndFollow, switchWorkspace } from "@/browser/workspaces"
import type { Command, CommandContext, ListView, PaletteItem } from "./types"

export const SETTINGS_URL = "chrome://sine/content/zencast/settings/index.html"

export function openSettings(win: Window, section = "") {
  const url = section ? `${SETTINGS_URL}#${section}` : SETTINGS_URL
  const existing = win.gBrowser.tabs.find((tab) => tab.linkedBrowser.currentURI?.spec.startsWith(SETTINGS_URL))
  if (existing) {
    win.gBrowser.selectedTab = existing
    if (section) existing.linkedBrowser.contentDocument?.location.replace(url)
    return
  }
  win.gBrowser.selectedTab = win.gBrowser.addTrustedTab(url)
}

const isPinned = ({ tab }: CommandContext) => tab.pinned && !tab.hasAttribute("zen-essential")
const inFolder = ({ tab }: CommandContext) => isFolder(tab.group)
const isWebPage = ({ tab }: CommandContext) => ["http", "https"].includes(tab.linkedBrowser.currentURI?.scheme ?? "")

function workspacePicker(ctx: CommandContext, title: string, pick: (id: string) => void | Promise<void>): ListView {
  const active = activeWorkspaceId(ctx.win)
  return {
    id: "pick-space",
    title,
    placeholder: "Space",
    items: listWorkspaces(ctx.win).map((ws, index) => ({
      id: `space-${ws.uuid}`,
      title: ws.name,
      section: "Spaces",
      icon: { kind: "icon", icon: Layers01Icon },
      accessory: ws.uuid === active ? "Current" : `${index + 1}`,
      actions: [{ id: "pick", title, run: () => pick(ws.uuid) }],
    })),
  }
}

interface ContainerAction {
  title: string
  keepOpen?: boolean
  run: (id: number) => void | Promise<void>
}

export function containerItems(ctx: CommandContext, primary: ContainerAction, secondary?: ContainerAction): PaletteItem[] {
  return listContainers().map((container) => ({
    id: `container-${container.id}`,
    title: container.name,
    section: "Containers",
    icon: { kind: "dot", color: container.color },
    accessory: container.id === ctx.tab.userContextId ? "Current" : container.temporary ? "Temporary" : undefined,
    actions: [
      { id: "primary", title: primary.title, keepOpen: primary.keepOpen, run: () => primary.run(container.id) },
      ...(secondary ? [{ id: "secondary", title: secondary.title, keys: "ctrl+enter", run: () => secondary.run(container.id) }] : []),
    ],
  }))
}

/** Makes the palette open its next URL or search in this container. */
export function chooseContainer(ctx: CommandContext, id: number) {
  const container = listContainers().find((candidate) => candidate.id === id)
  if (container) ctx.ui.setOpenIn({ id, name: container.name, color: container.color })
}

function containerPicker(ctx: CommandContext): ListView {
  return {
    id: "pick-container",
    title: "Open in container",
    placeholder: "Container",
    items: containerItems(
      ctx,
      { title: "Choose", keepOpen: true, run: (id) => chooseContainer(ctx, id) },
      { title: "Open blank tab", run: (id) => void openInContainer(ctx.win, id) },
    ),
  }
}

const moveToSpaceN: Command[] = Array.from({ length: 9 }, (_, i) => ({
  id: `tab.moveToSpace.${i + 1}`,
  title: `Move tab to space ${i + 1}`,
  section: "Spaces",
  icon: Layers01Icon,
  hidden: true,
  defaultKeys: [`alt+${i + 1}`],
  when: (ctx) => listWorkspaces(ctx.win).length > i,
  run: async (ctx) => {
    const ws = listWorkspaces(ctx.win)[i]
    await moveTabAndFollow(ctx.win, ctx.tab, ws.uuid)
    ctx.ui.toast(`Moved to ${ws.name}`)
  },
}))

export const COMMANDS: Command[] = [
  {
    id: "zencast.palette",
    title: "Open Zencast",
    section: "Palette",
    icon: CommandIcon,
    hidden: true,
    defaultKeys: ["ctrl+k", "ctrl+t"],
    run: () => {},
  },
  {
    id: "zencast.settings",
    title: "Zencast settings",
    section: "Palette",
    icon: Settings02Icon,
    keywords: "preferences keybindings shortcuts config",
    defaultKeys: ["ctrl+,"],
    run: ({ win }) => openSettings(win),
  },
  {
    id: "zencast.extensions",
    title: "Extensions",
    section: "Palette",
    icon: PuzzleIcon,
    keywords: "addons add-ons manager themes plugins",
    defaultKeys: ["ctrl+shift+,"],
    // Reuses an open add-ons tab instead of opening another.
    run: ({ win }) => void win.BrowserAddonUI.openAddonsMgr("addons://list/extension"),
  },
  {
    id: "zencast.folderManager",
    title: "Folder manager",
    section: "Folders",
    icon: FolderLibraryIcon,
    keywords: "folders archive organize tree",
    run: ({ win }) => openSettings(win, "folders"),
  },

  // Pins
  {
    id: "pin.toggle",
    title: "Pin or unpin tab",
    section: "Pins",
    icon: PinIcon,
    defaultKeys: ["alt+p"],
    run: ({ win, tab }) => togglePin(win, tab),
  },
  {
    id: "pin.replaceUrl",
    title: "Set pinned URL to this page",
    section: "Pins",
    icon: Link01Icon,
    keywords: "replace change update pin url",
    defaultKeys: ["alt+shift+p"],
    when: isPinned,
    run: ({ win, tab, ui }) => {
      replacePinnedUrl(win, tab)
      ui.toast("Pinned URL updated")
    },
  },
  {
    id: "pin.reset",
    title: "Reset pinned tab",
    section: "Pins",
    icon: ArrowTurnBackwardIcon,
    keywords: "back to pinned url",
    when: isPinned,
    run: ({ win, tab }) => resetPinnedTab(win, tab),
  },
  {
    id: "pin.edit",
    title: "Edit pinned URL",
    section: "Pins",
    icon: PencilEdit01Icon,
    when: isPinned,
    run: ({ win, tab }) => editPinnedUrl(win, tab),
  },
  {
    id: "essential.toggle",
    title: "Toggle essential",
    section: "Pins",
    icon: StarIcon,
    keywords: "essentials add remove",
    defaultKeys: ["ctrl+space e"],
    run: ({ win, tab }) => toggleEssential(win, tab),
  },

  // Folders
  {
    id: "folder.smart",
    title: "New folder",
    section: "Folders",
    icon: FolderAddIcon,
    keywords: "create subfolder",
    defaultKeys: ["ctrl+shift+n"],
    run: ({ win }) => {
      createSmartFolder(win)
    },
  },
  {
    id: "folder.withTab",
    title: "Move tab into new folder",
    section: "Folders",
    icon: FolderOpenIcon,
    run: ({ win, tab }) => createFolderWithTab(win, tab),
  },
  {
    id: "folder.moveTab",
    title: "Move tab to folder",
    section: "Folders",
    icon: FolderTransferIcon,
    defaultKeys: ["ctrl+space f"],
    run: (ctx): ListView => ({
      id: "pick-folder",
      title: "Move tab to folder",
      placeholder: "Folder",
      items: allFolders(ctx.win)
        .filter((folder) => folder !== ctx.tab.group)
        .map((folder) => ({
          id: `folder-${folder.id}`,
          title: folder.label,
          subtitle: folderPath(folder),
          section: listWorkspaces(ctx.win).find((ws) => ws.uuid === folder.getAttribute("zen-workspace-id"))?.name ?? "Folders",
          icon: { kind: "icon", icon: Folder01Icon },
          actions: [{ id: "move", title: "Move here", run: () => moveTabToFolder(ctx.win, ctx.tab, folder) }],
        })),
    }),
  },
  {
    id: "folder.archive",
    title: "Archive this folder",
    section: "Folders",
    icon: Archive02Icon,
    when: inFolder,
    run: async ({ win, tab, ui }) => {
      if (!isFolder(tab.group)) return
      const entry = await archiveFolder(win, tab.group)
      ui.toast(`Archived ${entry.root.label}`, { label: "Undo", run: () => void restoreFolder(win, entry.id) })
    },
  },
  {
    id: "folder.restore",
    title: "Restore archived folder",
    section: "Folders",
    icon: Archive02Icon,
    keywords: "unarchive",
    run: async (ctx): Promise<ListView> => ({
      id: "pick-archive",
      title: "Restore archived folder",
      placeholder: "Archived folder",
      items: (await readArchive()).map((entry) => ({
        id: `archive-${entry.id}`,
        title: entry.root.label,
        subtitle: entry.workspaceName,
        section: "Archive",
        icon: { kind: "icon", icon: Archive02Icon },
        accessory: `${countTabs(entry.root)} tabs`,
        actions: [
          {
            id: "restore",
            title: "Restore",
            run: async () => {
              await restoreFolder(ctx.win, entry.id)
              ctx.ui.toast(`Restored ${entry.root.label}`)
            },
          },
        ],
      })),
    }),
  },
  {
    id: "folder.collapseAll",
    title: "Collapse all folders",
    section: "Folders",
    icon: Folder01Icon,
    run: ({ win }) => win.gZenFolders.collapseAllFolders(),
  },
  {
    id: "folder.expandAll",
    title: "Expand all folders",
    section: "Folders",
    icon: FolderOpenIcon,
    run: ({ win }) => win.gZenFolders.expandAllFolders(),
  },

  // Spaces
  {
    id: "space.switch",
    title: "Switch space",
    section: "Spaces",
    icon: DashboardSquare01Icon,
    keywords: "workspace",
    run: (ctx) => workspacePicker(ctx, "Switch", (id) => switchWorkspace(ctx.win, id)),
  },
  {
    id: "tab.moveToSpace",
    title: "Move tab to space",
    section: "Spaces",
    icon: Layers01Icon,
    keywords: "workspace send",
    defaultKeys: ["ctrl+space w"],
    run: (ctx) => workspacePicker(ctx, "Move here", (id) => moveTabAndFollow(ctx.win, ctx.tab, id)),
  },
  ...moveToSpaceN,

  // Containers
  {
    id: "container.open",
    title: "Open in container",
    section: "Containers",
    icon: UserGroupIcon,
    keywords: "new tab identity",
    // Ctrl+C opens the picker only when there is nothing to copy; with a selection it still copies.
    defaultKeys: ["ctrl+c"],
    keysWhen: ({ win }) => isPageFocused(win) || !canCopy(win),
    run: async (ctx): Promise<ListView | void> => {
      if (isPageFocused(ctx.win) && (await pageHasSelection(ctx.win))) return ctx.win.goDoCommand("cmd_copy")
      return containerPicker(ctx)
    },
  },
  {
    id: "container.reopen",
    title: "Reopen tab in container",
    section: "Containers",
    icon: RefreshIcon,
    defaultKeys: ["alt+shift+c"],
    when: isWebPage,
    run: (ctx): ListView => ({
      id: "pick-container-reopen",
      title: "Reopen in container",
      placeholder: "Container",
      items: containerItems(ctx, { title: "Reopen here", run: (id) => void reopenInContainer(ctx.win, ctx.tab, id) }),
    }),
  },
  {
    id: "container.temporary",
    title: "New temporary container tab",
    section: "Containers",
    icon: GhostIcon,
    keywords: "throwaway disposable incognito",
    defaultKeys: ["alt+shift+t"],
    run: ({ win }) => void openTemporaryContainer(win),
  },
  {
    id: "session.transfer",
    title: "Move session to container",
    section: "Containers",
    icon: Exchange01Icon,
    keywords: "cookies login auth copy transfer",
    defaultKeys: ["alt+m"],
    when: isWebPage,
    run: (ctx): ListView => {
      const transfer = (mode: "copy" | "move") => async (id: number) => {
        const result = await transferSession(ctx.win, ctx.tab, id, mode)
        ctx.ui.toast(`${mode === "copy" ? "Copied" : "Moved"} ${result.cookies} cookies, ${result.storage} storage keys`)
      }
      return {
        id: "pick-container-session",
        title: "Move session",
        placeholder: "Target container",
        items: containerItems(
          ctx,
          { title: "Copy session here", run: transfer("copy") },
          { title: "Move session here", run: transfer("move") },
        ).filter((item) => item.id !== `container-${ctx.tab.userContextId}`),
      }
    },
  },

  // Privacy
  {
    id: "tab.wipe",
    title: "Wipe tab",
    section: "Privacy",
    icon: EraserIcon,
    keywords: "reset clear cookies storage cache history logout",
    defaultKeys: ["alt+shift+w"],
    when: isWebPage,
    run: (ctx): ListView => ({
      id: "confirm-wipe",
      title: "Wipe tab",
      items: [
        {
          id: "wipe-confirm",
          title: "Wipe site data and history",
          subtitle:
            ctx.tab.userContextId === 0
              ? "Signs you out of this site in every tab without a container"
              : "Clears this site in this container only",
          section: "Confirm",
          icon: { kind: "icon", icon: EraserIcon, color: "var(--rose)" },
          actions: [
            {
              id: "wipe",
              title: "Wipe",
              danger: true,
              run: async () => {
                const site = await wipeTab(ctx.tab)
                ctx.ui.toast(`Wiped ${site}`)
              },
            },
          ],
        },
      ],
    }),
  },
]

export const COMMANDS_BY_ID = new Map(COMMANDS.map((command) => [command.id, command]))
