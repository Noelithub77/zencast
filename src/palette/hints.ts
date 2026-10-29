// Holding Ctrl or Alt labels the visible results with letters; Ctrl also numbers the containers and
// Alt the spaces. The options panel numbers its actions instead.
import { useEffect, useEffectEvent } from "react"

// Editing keys, the actions panel (J), and the browser's close and quit keys never become hints; nor
// do the palette's own keys or Zencast's, which the caller passes as taken.
const RESERVED = "acjvxzqw"
// Long enough that a quick Ctrl+K never flashes hints.
const HOLD_MS = 200
// Alt pressed and let go alone within this is a tap, even if the hold already showed the hints.
const TAP_MS = 350

// Many pastels, like a terminal's colours, so neighbouring hints read apart at a glance.
const COLORS = [
  "var(--peach)",
  "var(--mint)",
  "var(--lilac)",
  "var(--butter)",
  "#ffb3d1",
  "var(--sage)",
  "#ffa8a0",
  "#e3c4ff",
  "#d6f5a3",
  "#ffd9a8",
  "#a8f0d0",
  "#f7c6e8",
]

export interface Hint {
  letter: string
  /** Position of the letter in the title, marked while the hint shows. */
  index: number
  color: string
}

/** One letter per title, preferring word starts, then any letter of the title; null when none is free. */
export function assignHints(titles: string[], taken: string[]): Array<Hint | null> {
  const used = new Set([...RESERVED, ...taken])
  let count = 0
  return titles.map((title) => {
    const lower = title.toLowerCase()
    const starts = [...lower.matchAll(/[a-z]+/g)].map((match) => match.index)
    const anywhere = [...lower].keys()
    for (const index of [...starts, ...anywhere]) {
      const letter = lower[index]
      if (/^[a-z]$/.test(letter) && !used.has(letter)) {
        used.add(letter)
        return { letter, index, color: COLORS[count++ % COLORS.length] }
      }
    }
    return null
  })
}

export type Modifier = "ctrl" | "alt"

const MODIFIER_KEYS: Record<string, Modifier> = { Control: "ctrl", Alt: "alt" }

/**
 * Reports a modifier once it has been held alone briefly, and null on release. Keys pressed while
 * it is held (Ctrl+1, Alt+2) keep it held, so a strip stays up while choosing from it. Alt pressed
 * and let go with no other key is reported after the release as a "tap" when quick, else as "lone";
 * losing focus or closing reports a "reset". While Alt hints show, held or latched, the next press of
 * Alt reports "lone" as it goes down, so they clear even when the last release never arrived.
 */
export function useModifierHold(
  win: Window | null,
  onHold: (held: Modifier | null, cause?: "tap" | "lone" | "reset") => void,
  isLatched: () => boolean,
) {
  const notify = useEffectEvent(onHold)
  const latched = useEffectEvent(isLatched)
  useEffect(() => {
    if (!win) return
    let timer = 0
    let pending: Modifier | null = null
    let held: Modifier | null = null
    // When Alt went down alone, until another key is pressed with it.
    let aloneSince = 0
    // This press of Alt cleared the hints, so its release does nothing more.
    let clearing = false
    const release = () => {
      win.clearTimeout(timer)
      if (held) notify(null)
      pending = held = null
    }
    const down = (event: KeyboardEvent) => {
      const modifier = MODIFIER_KEYS[event.key]
      if (modifier === "alt" && !event.repeat) {
        // An input method can keep Alt's release, which would leave a hold showing for good and every
        // later press looking like its repeat.
        clearing = held === "alt" || latched()
        if (clearing) {
          aloneSince = 0
          release()
          notify(null, "lone")
          return
        }
      }
      // A repeat must not cancel the hold that is still counting down.
      if (modifier && modifier === (held ?? pending)) return
      win.clearTimeout(timer)
      pending = null
      if (!modifier || event.repeat || held) {
        if (!event.repeat) aloneSince = 0
        return
      }
      const others = [event.ctrlKey && modifier !== "ctrl", event.altKey && modifier !== "alt", event.shiftKey, event.metaKey]
      aloneSince = modifier === "alt" && !others.some(Boolean) ? event.timeStamp : 0
      if (others.some(Boolean)) return
      pending = modifier
      timer = win.setTimeout(() => {
        pending = null
        held = modifier
        notify(modifier)
      }, HOLD_MS)
    }
    const up = (event: KeyboardEvent) => {
      if (!MODIFIER_KEYS[event.key]) return
      if (clearing && event.key === "Alt") {
        clearing = false
        return
      }
      const alone = event.key === "Alt" && aloneSince > 0
      const quick = event.timeStamp - aloneSince < TAP_MS
      aloneSince = 0
      release()
      if (alone) notify("alt", quick ? "tap" : "lone")
    }
    const blur = () => {
      aloneSince = 0
      clearing = false
      release()
      notify(null, "reset")
    }
    win.addEventListener("keydown", down, true)
    win.addEventListener("keyup", up, true)
    win.addEventListener("blur", blur)
    return () => {
      win.clearTimeout(timer)
      win.removeEventListener("keydown", down, true)
      win.removeEventListener("keyup", up, true)
      win.removeEventListener("blur", blur)
      notify(null, "reset")
    }
  }, [win])
}
