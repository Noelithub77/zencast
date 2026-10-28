// Tab cleanup: lists the tabs not selected for a week and closes them together, bookmarked into a
// dated folder unless Ctrl+Enter skips that. Selecting a tab from the list keeps it.
import { CleanIcon } from "@hugeicons/core-free-icons"

import { cleanUpTabs, idleDays, idleTabs, IDLE_DAYS, undoCleanup } from "@/browser/cleanup"
import { breadcrumb } from "@/browser/folders"
import { selectTab, tabKey, tabUrl } from "@/browser/tabs"
import { listWorkspaces } from "@/browser/workspaces"
import type { Command, CommandContext, ListView, PaletteItem } from "./types"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

function cleanupView(ctx: CommandContext): ListView | void {
  const tabs = idleTabs(ctx.win)
  if (!tabs.length) return ctx.ui.toast(`Every tab was opened in the last ${IDLE_DAYS} days`)
  const spaces = new Map(listWorkspaces(ctx.win).map((space) => [space.uuid, space.name]))
  const close = (bookmark: boolean) => async () => {
    const cleanup = await cleanUpTabs(ctx.win, tabs, bookmark)
    const where = cleanup.folder ? " into Tab cleanup" : ""
    ctx.ui.toast(`Closed ${plural(tabs.length, "tab")}${where}`, { label: "Undo", run: () => void undoCleanup(ctx.win, cleanup) })
  }
  const rows = tabs.map((tab): PaletteItem => {
    const url = tabUrl(tab)
    return {
      id: `cleanup:${tabKey(tab)}`,
      transient: true,
      title: tab.label,
      subtitle: [url.replace(/^https?:\/\/(www\.)?/, ""), breadcrumb(tab, spaces)].filter(Boolean).join(" · "),
      section: `Not opened for ${IDLE_DAYS} days`,
      icon: { kind: "favicon", url: tab.getAttribute("image") || `page-icon:${url}` },
      accessory: `${idleDays(tab)} days`,
      accessoryColor: "var(--faint)",
      actions: [{ id: "keep", title: "Switch to tab and keep it", run: () => selectTab(ctx.win, tab) }],
    }
  })
  return {
    id: "cleanup",
    title: "Clean up tabs",
    placeholder: "Tab",
    items: [
      {
        id: "cleanup-all",
        transient: true,
        title: `Close ${plural(tabs.length, "tab")}`,
        subtitle: "Bookmarked into Other bookmarks / Tab cleanup",
        section: "Clean up",
        icon: { kind: "icon", icon: CleanIcon, color: "var(--peach)" },
        actions: [
          { id: "close", title: "Close and bookmark", run: close(true) },
          { id: "close-only", title: "Close without bookmarking", keys: "ctrl+enter", danger: true, run: close(false) },
        ],
      },
      ...rows,
    ],
  }
}

export const cleanupCommands: Command[] = [
  {
    id: "tabs.cleanup",
    title: "Clean up tabs",
    section: "Tabs",
    icon: CleanIcon,
    keywords: "old stale idle unused close tidy declutter",
    run: cleanupView,
  },
]
