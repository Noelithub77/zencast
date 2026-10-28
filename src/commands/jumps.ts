// Jumps: keys bound to a site or a folder instead of a command. Each becomes a hidden command, so
// the key engine, conflict checks and the settings page treat it like any other binding.
import { Folder01Icon, Globe02Icon } from "@hugeicons/core-free-icons"

import { allFolders, openFolder } from "@/browser/folders"
import { listTabs, selectTab, tabUrl } from "@/browser/tabs"
import { openUrl } from "@/browser/window"
import { jumpId, type Config, type Jump } from "@/shared/config"
import { COMMANDS } from "./catalog"
import type { Command } from "./types"

/** Switches to an open tab showing the site, in any space, or opens it in a new tab. */
async function jumpToUrl(win: Window, url: string) {
  const open = listTabs(win).find((tab) => tabUrl(tab) === url)
  if (open) await selectTab(win, open)
  else openUrl(win, url, "tab")
}

function jumpCommand(jump: Jump): Command {
  return {
    id: jumpId(jump),
    title: jump.title,
    section: "Jumps",
    icon: jump.kind === "folder" ? Folder01Icon : Globe02Icon,
    hidden: true,
    run: async (ctx) => {
      if (jump.kind === "url") return jumpToUrl(ctx.win, jump.target)
      const folder = allFolders(ctx.win).find((candidate) => candidate.id === jump.target)
      if (!folder) return ctx.ui.toast(`${jump.title} no longer exists`)
      await openFolder(ctx.win, folder)
    },
  }
}

/** The catalog plus the user's jumps. */
export function allCommands(config: Config): Command[] {
  return config.jumps.length ? [...COMMANDS, ...config.jumps.map(jumpCommand)] : COMMANDS
}
