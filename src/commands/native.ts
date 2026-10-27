import { CommandIcon } from "@hugeicons/core-free-icons"

import { nativeShortcuts } from "@/browser/zen-shortcuts"
import { runCommandElement } from "@/browser/window"
import type { PaletteItem } from "./types"

export interface NativeCommand {
  id: string
  title: string
  icon?: string
  combo: string
  available: boolean
  run: () => void
}

/**
 * Zen's labelled global actions plus every Zen/Firefox shortcut target, de-duplicated by command id.
 * Built per palette open; both sources are in-memory lists.
 */
export function nativeCommands(win: Window): NativeCommand[] {
  const shortcuts = nativeShortcuts(win)
  const comboByAction = new Map(shortcuts.filter((s) => s.combo).map((s) => [s.action, s.combo]))
  const seen = new Set<string>()
  const out: NativeCommand[] = []

  let actions: ZenGlobalAction[] = []
  try {
    actions = ChromeUtils.importESModule("resource:///modules/ZenUBGlobalActions.sys.mjs").globalActions
  } catch {
    // Older Zen builds without global actions: shortcuts below still cover most commands.
  }
  for (const action of actions) {
    const command = action.command
    seen.add(action.commandId)
    out.push({
      id: `native:${action.commandId}`,
      title: action.label,
      icon: action.icon,
      combo: typeof command === "string" ? (comboByAction.get(command) ?? "") : "",
      available: action.isAvailable(win),
      run: () => (typeof command === "string" ? void runCommandElement(win, command) : command(win)),
    })
  }

  for (const shortcut of shortcuts) {
    const target = shortcut.action || shortcut.id
    if (!target || seen.has(target)) continue
    seen.add(target)
    out.push({
      id: `native:${target}`,
      title: shortcut.title,
      combo: shortcut.combo,
      available: !!win.document.getElementById(target) || !!win.document.getElementById(shortcut.id),
      run: () => {
        if (!runCommandElement(win, target)) runCommandElement(win, shortcut.id)
      },
    })
  }
  return out
}

export function nativeItems(win: Window): PaletteItem[] {
  return nativeCommands(win)
    .filter((command) => command.available)
    .map((command) => ({
      id: command.id,
      title: command.title,
      section: "Zen",
      icon: command.icon ? { kind: "chrome", url: command.icon } : { kind: "icon", icon: CommandIcon },
      keys: command.combo || undefined,
      actions: [{ id: "run", title: "Run", run: command.run }],
    }))
}
