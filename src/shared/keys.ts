// Key combos are stored as normalized strings such as "ctrl+shift+n".
// A sequence (chord) is space-separated combos: "ctrl+space s".

const MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta"] as const
type Modifier = (typeof MODIFIER_ORDER)[number]

const CODE_KEYS: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Space: "space",
  Enter: "enter",
  NumpadEnter: "enter",
  Escape: "escape",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
}

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "OS", "AltGraph", "CapsLock"])

const DISPLAY: Record<string, string> = {
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "Super",
  space: "Space",
  enter: "↵",
  escape: "Esc",
  tab: "Tab",
  backspace: "⌫",
  delete: "Del",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  pageup: "PgUp",
  pagedown: "PgDn",
}

function keyName(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null
  // Letters follow the active layout; everything else uses the physical key so Shift does not
  // turn "," into "<".
  if (event.key.length === 1 && /[a-z]/i.test(event.key)) return event.key.toLowerCase()
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code)
  if (digit) return digit[1]
  const fn = /^F(\d{1,2})$/.exec(event.code)
  if (fn) return `f${fn[1]}`
  return CODE_KEYS[event.code] ?? null
}

export function comboFromEvent(event: KeyboardEvent): string | null {
  const key = keyName(event)
  if (!key) return null
  const mods: Modifier[] = []
  if (event.ctrlKey) mods.push("ctrl")
  if (event.altKey) mods.push("alt")
  if (event.shiftKey) mods.push("shift")
  if (event.metaKey) mods.push("meta")
  return [...mods, key].join("+")
}

export function normalizeCombo(combo: string): string {
  const parts = combo.toLowerCase().split("+").filter(Boolean)
  const key = parts.pop() ?? ""
  const mods = new Set(parts.map((part) => (part === "control" ? "ctrl" : part === "accel" ? "ctrl" : part)))
  return [...MODIFIER_ORDER.filter((mod) => mods.has(mod)), key].join("+")
}

export function normalizeSequence(sequence: string): string {
  return sequence.trim().split(/\s+/).map(normalizeCombo).join(" ")
}

export function hasModifier(combo: string): boolean {
  return combo.includes("+")
}

const MODIFIER_WORDS: Record<string, Modifier> = {
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
  meta: "meta",
  super: "meta",
  cmd: "meta",
}
const KEY_WORDS = new Set([...Object.values(CODE_KEYS), "esc"])

/**
 * Typed text that names a key, so a search for "ctrl j", "Ctrl + Shift + K" or "ctrl+space f" can
 * find what it runs. The first combo needs a modifier; otherwise null.
 */
export function sequenceFromText(text: string): string | null {
  const combos: string[] = []
  let mods: Modifier[] = []
  for (const word of text.trim().toLowerCase().split(/\s*\+\s*|\s+/).filter(Boolean)) {
    const mod = MODIFIER_WORDS[word]
    if (mod) {
      mods.push(mod)
      continue
    }
    if (word.length !== 1 && !KEY_WORDS.has(word) && !/^f\d{1,2}$/.test(word)) return null
    if (!combos.length && !mods.length) return null
    combos.push(normalizeCombo([...mods, word === "esc" ? "escape" : word].join("+")))
    mods = []
  }
  return combos.length && !mods.length ? combos.join(" ") : null
}

/** Display parts for one sequence, e.g. [["Ctrl","Space"],["W"]]. */
export function displaySequence(sequence: string): string[][] {
  return sequence
    .split(" ")
    .map((combo) => combo.split("+").map((part) => DISPLAY[part] ?? part.toUpperCase()))
}
