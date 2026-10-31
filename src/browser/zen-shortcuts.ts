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

function comboOf(key: Element): string {
  if (key.getAttribute("disabled") === "true") return ""
  const keycode = key.getAttribute("keycode") ?? ""
  const name = key.getAttribute("key") || KEYCODE_NAMES[keycode] || keycode.replace(/^VK_/, "").toLowerCase()
  if (!name) return ""
  const mods = (key.getAttribute("modifiers") ?? "").split(/[\s,]+/)
  const parts = [
    // Accel is Ctrl everywhere Zencast runs except macOS, where the key engine maps it too.
    (mods.includes("control") || mods.includes("accel")) && "ctrl",
    mods.includes("alt") && "alt",
    mods.includes("shift") && "shift",
    mods.includes("meta") && "meta",
  ].filter((part): part is string => !!part)
  return normalizeCombo([...parts, name].join("+"))
}

// nsIPermissionManager.DENY_ACTION, which is also the "block" value of permissions.default.shortcuts.
const BLOCK = 2

/**
 * Whether the focused web page sees this key before the browser and may use it itself. Firefox keeps
 * its reserved keys (Ctrl+T, Ctrl+W, Ctrl+N and Ctrl+Q among them) from every page, and every key
 * from pages whose shortcuts the user blocked.
 */
export function pageSeesKeyFirst(win: Window, event: KeyboardEvent, combo: string): boolean {
  const browser = win.gBrowser.selectedBrowser
  if (event.target !== browser || browser.getAttribute("remote") !== "true") return false
  if (Services.prefs.getIntPref("permissions.default.shortcuts", 0) === BLOCK) return false
  if (Services.perms.testPermissionFromPrincipal(browser.contentPrincipal, "shortcuts") === BLOCK) return false
  return ![...win.document.querySelectorAll('key[reserved="true"]')].some((key) => comboOf(key) === combo)
}

/** All of Zen's and Firefox's shortcuts in this window, read from their <key> elements, with normalized combos. */
export function nativeShortcuts(win: Window): NativeShortcut[] {
  const out: NativeShortcut[] = []
  for (const key of win.document.querySelectorAll("key")) {
    if (!key.id || key.hasAttribute("internal")) continue
    const action = key.getAttribute("command") ?? ""
    out.push({
      id: key.id,
      action,
      group: key.parentElement?.id ?? "",
      title: humanize(key.getAttribute("data-l10n-id") ?? "", action || key.id),
      combo: comboOf(key),
    })
  }
  return out
}
