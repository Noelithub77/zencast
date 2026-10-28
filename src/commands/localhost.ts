// Dev servers running on this machine: switch to the tab already on one, or open it.
import { ComputerTerminal01Icon } from "@hugeicons/core-free-icons"

import { localServers, localTab, type LocalServer } from "@/browser/localhost"
import { selectTab } from "@/browser/tabs"
import { openTarget } from "@/palette/sources"
import type { Command, CommandContext, ListView, PaletteItem } from "./types"

function serverItem(ctx: CommandContext, server: LocalServer): PaletteItem {
  const tab = localTab(ctx.win, server.port)
  const address = `localhost:${server.port}`
  return {
    id: `localhost:${server.port}`,
    title: server.title,
    subtitle: server.title === address ? server.process : [address, server.process].filter(Boolean).join(" · "),
    section: "Servers",
    icon: { kind: "favicon", url: `page-icon:${server.url}` },
    keywords: `${server.port} ${server.process ?? ""}`,
    accessory: tab ? "Open" : undefined,
    accessoryColor: "var(--mint)",
    actions: [
      tab
        ? { id: "switch", title: "Switch to tab", run: () => selectTab(ctx.win, tab) }
        : { id: "open", title: "Open", run: () => openTarget(ctx, server.url, "tab") },
      { id: "new", title: "Open in new tab", keys: "ctrl+enter", run: () => openTarget(ctx, server.url, "tab") },
    ],
  }
}

async function localhostView(ctx: CommandContext): Promise<ListView | void> {
  const servers = await localServers()
  if (!servers.length) return ctx.ui.toast("No local servers running")
  return { id: "localhost", title: "Localhost", placeholder: "Server", items: servers.map((server) => serverItem(ctx, server)) }
}

export const localhostCommands: Command[] = [
  {
    id: "localhost.open",
    title: "Localhost",
    section: "Tabs",
    icon: ComputerTerminal01Icon,
    keywords: "dev server port local running",
    defaultKeys: ["alt+l"],
    run: localhostView,
  },
]
