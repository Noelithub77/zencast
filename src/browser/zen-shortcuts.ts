import { normalizeCombo } from "@/shared/keys"

export interface NativeShortcut {
  id: string
  /** XUL command id run by the shortcut, e.g. "cmd_zenToggleSidebar". */
  action: string
  group: string
  title: string
  /** Normalized combo ("ctrl+shift+s"), or "" when unbound. */
  combo: string
}

// "zen-compact-mode-shortcut-toggle" -> "Compact mode toggle"
function humanize(l10nId: string, fallback: string): string {
  const base = (l10nId || fallback)
    .replace(/^(zen-|key_|cmd_)/, "")
    .replace(/-?shortcut-?/g, "-")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase()
  return base.charAt(0).toUpperCase() + base.slice(1)
}

const KEYCODE_NAMES: Record<string, string> = {
  VK_LEFT: "left",
  VK_RIGHT: "right",
  VK_UP: "up",
  VK_DOWN: "down",
  VK_DELETE: "delete",
  VK_BACK: "backspace",
  VK_RETURN: "enter",
  VK_ESCAPE: "escape",
  VK_TAB: "tab",
  VK_HOME: "home",
  VK_END: "end",
  VK_PAGE_UP: "pageup",
  VK_PAGE_DOWN: "pagedown",
}

function comboOf(shortcut: ZenKeyShortcut): string {
  if (shortcut.isEmpty() || shortcut.isDisabled()) return ""
  const json = shortcut.toJSONForm()
  const keycode = json.keycode ?? ""
  const key = json.key || KEYCODE_NAMES[keycode] || keycode.replace(/^VK_/, "").toLowerCase()
  if (!key) return ""
  const mods = json.modifiers
  const parts = [
    mods.control && "ctrl",
    mods.accel && "ctrl",
    mods.alt && "alt",
    mods.shift && "shift",
    mods.meta && "meta",
  ].filter((part): part is string => !!part)
  return normalizeCombo([...parts, key].join("+"))
}

/** All of Zen's and Firefox's registered shortcuts in this window, with normalized combos. */
export function nativeShortcuts(win: Window): NativeShortcut[] {
  const list = win.gZenKeyboardShortcutsManager._currentShortcutList ?? []
  const out: NativeShortcut[] = []
  for (const shortcut of list) {
    if (shortcut.isInternal()) continue
    const json = shortcut.toJSONForm()
    out.push({
      id: shortcut.getID(),
      action: shortcut.getAction(),
      group: shortcut.getGroup(),
      title: humanize(json.l10nId, shortcut.getAction() || shortcut.getID()),
      combo: comboOf(shortcut),
    })
  }
  return out
}
