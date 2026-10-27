// Holding Ctrl labels the visible results with letters and the open options with numbers.
import { useEffect, useEffectEvent } from "react"

// Editing keys, the options panel, and the browser's close and quit keys never become hints.
const RESERVED = "acvxzkqw"
// Long enough that a quick Ctrl+K never flashes hints.
const HOLD_MS = 180

/** One letter per title, preferring word starts, then any letter of the title; "" when none is free. */
export function assignHints(titles: string[], taken: string[]): string[] {
  const used = new Set([...RESERVED, ...taken])
  return titles.map((title) => {
    const lower = title.toLowerCase()
    const starts = lower.split(/[^a-z]+/).map((word) => word[0] ?? "")
    for (const letter of [...starts, ...lower]) {
      if (/^[a-z]$/.test(letter) && !used.has(letter)) {
        used.add(letter)
        return letter
      }
    }
    return ""
  })
}

/** Calls `onHold(true)` once Ctrl alone has been held briefly, and `onHold(false)` on release. */
export function useCtrlHold(win: Window | null, onHold: (held: boolean) => void) {
  const notify = useEffectEvent(onHold)
  useEffect(() => {
    if (!win) return
    let timer = 0
    let held = false
    const release = () => {
      win.clearTimeout(timer)
      if (held) notify(false)
      held = false
    }
    const down = (event: KeyboardEvent) => {
      win.clearTimeout(timer)
      if (event.key !== "Control" || event.repeat || event.altKey || event.shiftKey || event.metaKey) return
      timer = win.setTimeout(() => {
        held = true
        notify(true)
      }, HOLD_MS)
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === "Control") release()
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
