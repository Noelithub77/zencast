import { hasModifier } from "@/shared/keys"

/** A pause this long ends a recorded sequence. */
export const CHORD_WAIT_MS = 1000
const MAX_COMBOS = 3

export type RecordStep =
  | { kind: "cancel" }
  | { kind: "save" }
  | { kind: "hint"; text: string }
  | { kind: "add"; combos: string[]; done: boolean }

/**
 * One key press while recording a shortcut. Escape cancels and Enter saves; a sequence must start
 * with a modifier, since a bare first key would fire while typing in pages.
 */
export function recordKey(combos: string[], combo: string): RecordStep {
  if (combo === "escape") return { kind: "cancel" }
  if (combo === "enter" && combos.length) return { kind: "save" }
  if (!combos.length && !hasModifier(combo) && !/^f\d/.test(combo)) return { kind: "hint", text: "Start with Ctrl, Alt or Super" }
  const next = [...combos, combo]
  return { kind: "add", combos: next, done: next.length >= MAX_COMBOS }
}
