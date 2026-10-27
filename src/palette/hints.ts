// Holding Ctrl labels the visible results with letters and numbers the containers; holding Alt
// numbers the spaces. The options panel numbers its actions instead.
import { useEffect, useEffectEvent } from "react"

// Editing keys, the options panel, and the browser's close and quit keys never become hints.
const RESERVED = "acvxzkqw"
// Long enough that a quick Ctrl+K never flashes hints.
const HOLD_MS = 150

export interface Hint {
  letter: string
  /** Position of the letter in the title, marked while the hint shows. */
  index: number
}

/** One letter per title, preferring word starts, then any letter of the title; null when none is free. */
export function assignHints(titles: string[], taken: string[]): Array<Hint | null> {
  const used = new Set([...RESERVED, ...taken])
  return titles.map((title) => {
    const lower = title.toLowerCase()
    const starts = [...lower.matchAll(/[a-z]+/g)].map((match) => match.index)
    const anywhere = [...lower].keys()
    for (const index of [...starts, ...anywhere]) {
      const letter = lower[index]
      if (/^[a-z]$/.test(letter) && !used.has(letter)) {
        used.add(letter)
        return { letter, index }
      }
    }
    return null
  })
}

export type Modifier = "ctrl" | "alt"

const MODIFIER_KEYS: Record<string, Modifier> = { Control: "ctrl", Alt: "alt" }

/**
 * Reports a modifier once it has been held alone briefly, and null on release. Keys pressed while
 * it is held (Ctrl+1, Alt+2) keep it held, so a strip stays up while choosing from it.
 */
export function useModifierHold(win: Window | null, onHold: (held: Modifier | null) => void) {
  const notify = useEffectEvent(onHold)
  useEffect(() => {
    if (!win) return
    let timer = 0
    let held: Modifier | null = null
    const release = () => {
      win.clearTimeout(timer)
      if (held) notify(null)
      held = null
    }
    const down = (event: KeyboardEvent) => {
      win.clearTimeout(timer)
      const modifier = MODIFIER_KEYS[event.key]
      if (!modifier || event.repeat || held) return
      const others = [event.ctrlKey && modifier !== "ctrl", event.altKey && modifier !== "alt", event.shiftKey, event.metaKey]
      if (others.some(Boolean)) return
      timer = win.setTimeout(() => {
        held = modifier
        notify(modifier)
      }, HOLD_MS)
    }
    const up = (event: KeyboardEvent) => {
      if (MODIFIER_KEYS[event.key]) release()
    }
    win.addEventListener("keydown", down, true)
    win.addEventListener("keyup", up, true)
    win.addEventListener("blur", release)
    return () => {
      release()
      win.removeEventListener("keydown", down, true)
      win.removeEventListener("keyup", up, true)
      win.removeEventListener("blur", release)
    }
  }, [win])
}
