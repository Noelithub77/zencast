import type { Command, CommandContext } from "@/commands/types"
import { comboFromEvent, hasModifier } from "@/shared/keys"
import type { BindingIndex } from "./bindings"

const CHORD_TIMEOUT_MS = 1500

export interface ChordHint {
  prefix: string
  options: Array<{ next: string; command: Command }>
}

interface EngineOptions {
  index: () => BindingIndex
  context: () => CommandContext
  /** True while the palette is open or the settings page is recording a shortcut. */
  paused: () => boolean
  dispatch: (command: Command, event: KeyboardEvent) => void
  onChord: (hint: ChordHint | null) => void
}

function consume(event: KeyboardEvent) {
  event.preventDefault()
  event.stopImmediatePropagation()
  // Keeps the key from also reaching the web page in the content process.
  event.stopCrossProcessForwarding?.()
}

/**
 * Window-level keybinding engine. It listens in the capture phase so it runs before Zen's <key>
 * elements and before the event is forwarded to web content.
 */
export function startKeyEngine(win: Window, options: EngineOptions): () => void {
  let pending: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearPending = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (pending !== null) {
      pending = null
      options.onChord(null)
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || options.paused()) return
    const combo = comboFromEvent(event)
    if (!combo) return
    // Fast path: plain typing never matches unless a chord is pending.
    if (pending === null && !hasModifier(combo) && !/^f\d/.test(combo)) return

    const sequence = pending === null ? combo : `${pending} ${combo}`
    const index = options.index()
    const candidates = index.exact.get(sequence)
    if (candidates) {
      const context = options.context()
      const command = candidates.find((candidate) => !candidate.when || candidate.when(context))
      if (command) {
        consume(event)
        clearPending()
        options.dispatch(command, event)
        return
      }
    }

    const continuations = index.prefixes.get(sequence)
    if (continuations) {
      consume(event)
      pending = sequence
      if (timer) clearTimeout(timer)
      timer = setTimeout(clearPending, CHORD_TIMEOUT_MS)
      options.onChord({ prefix: sequence, options: continuations })
      return
    }

    // An unknown key after a chord prefix is swallowed so it does not leak into the page.
    if (pending !== null) {
      consume(event)
      clearPending()
    }
  }

  win.addEventListener("keydown", onKeyDown, { capture: true })
  return () => {
    clearPending()
    win.removeEventListener("keydown", onKeyDown, { capture: true })
  }
}
