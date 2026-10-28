// Past sessions: each run of Zen by its start time, then its windows, then tabs to pick back into
// this window.
import { AppWindowIcon, Clock01Icon } from "@hugeicons/core-free-icons"

import { listSessions, openSavedTabs, sessionStart, sessionTime, tabCount, type SavedWindow, type Session } from "@/browser/sessions"
import type { Command, CommandContext, ListView, PaletteItem } from "./types"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

function tabsView(ctx: CommandContext, win: SavedWindow, title: string): ListView {
  return {
    id: `session-tabs:${win.id}`,
    title,
    placeholder: "Tab",
    items: win.tabs.map((tab, index) => ({
      id: `session-tab:${index}`,
      title: tab.title,
      subtitle: tab.url,
      section: "Tabs",
      icon: { kind: "favicon", url: tab.icon || `page-icon:${tab.url}` },
      accessory: tab.space ? win.spaces[tab.space] : undefined,
      accessoryColor: "var(--faint)",
      actions: [
        {
          id: "open",
          title: "Open here",
          keepOpen: true,
          run: () => {
            openSavedTabs(ctx.win, [tab])
            ctx.ui.toast(`Opened ${tab.title}`)
          },
        },
        { id: "all", title: "Open all here", keys: "ctrl+enter", run: () => openSavedTabs(ctx.win, win.tabs, true) },
      ],
    })),
  }
}

function windowItem(ctx: CommandContext, win: SavedWindow, index: number, label: string): PaletteItem {
  const title = `Window ${index + 1}`
  const spaces = [...new Set(win.tabs.flatMap((tab) => (tab.space && win.spaces[tab.space] ? [win.spaces[tab.space]] : [])))]
  return {
    id: `session-window:${win.id}`,
    title,
    subtitle: [plural(win.tabs.length, "tab"), ...spaces].join(" · "),
    section: "Windows",
    icon: { kind: "icon", icon: AppWindowIcon },
    accessory: win.closed ? `Closed ${sessionTime(win.closed).replace(/^Today /, "")}` : undefined,
    accessoryColor: "var(--faint)",
    actions: [
      { id: "tabs", title: "Show tabs", run: () => tabsView(ctx, win, `${label} · ${title}`) },
      { id: "all", title: "Open all here", keys: "ctrl+enter", run: () => openSavedTabs(ctx.win, win.tabs, true) },
    ],
  }
}

function sessionView(ctx: CommandContext, session: Session): ListView {
  const label = sessionTime(session.start)
  const [only] = session.windows
  if (only && session.windows.length === 1) return tabsView(ctx, only, label)
  return { id: `session:${session.start}`, title: label, placeholder: "Window", items: session.windows.map((win, i) => windowItem(ctx, win, i, label)) }
}

async function sessionsView(ctx: CommandContext): Promise<ListView | void> {
  const current = sessionStart()
  const sessions = await listSessions()
  if (!sessions.length) return ctx.ui.toast("No sessions saved yet")
  return {
    id: "sessions",
    title: "Sessions",
    placeholder: "Session",
    items: sessions.map((session) => ({
      id: `session:${session.start}`,
      title: sessionTime(session.start),
      subtitle: `${plural(session.windows.length, "window")} · ${plural(tabCount(session), "tab")}`,
      section: "Sessions",
      icon: { kind: "icon", icon: Clock01Icon },
      accessory: session.start === current ? "Now" : undefined,
      accessoryColor: "var(--mint)",
      actions: [{ id: "show", title: "Show", run: () => sessionView(ctx, session) }],
    })),
  }
}

export const sessionCommands: Command[] = [
  {
    id: "sessions.open",
    title: "Sessions",
    section: "Tabs",
    icon: Clock01Icon,
    keywords: "history restore reopen yesterday windows snapshot",
    defaultKeys: ["alt+s"],
    run: sessionsView,
  },
]
