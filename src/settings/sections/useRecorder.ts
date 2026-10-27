import { useEffect, useEffectEvent, useState } from "react"

import { CHORD_WAIT_MS, recordKey } from "@/keys/record"
import { comboFromEvent } from "@/shared/keys"

export interface Recording {
  id: string
  mode: "replace" | "add"
  combos: string[]
  hint: string | null
}

/**
 * Captures a key sequence. Keys are swallowed while recording and the mod's own keybindings are
 * paused. A pause of one second, or Enter, ends the sequence; Escape cancels.
 */
export function useRecorder(win: Window, onCommit: (id: string, mode: Recording["mode"], sequence: string) => void) {
  const [recording, setRecording] = useState<Recording | null>(null)
  const commit = useEffectEvent(onCommit)
  const id = recording?.id
  const mode = recording?.mode

  useEffect(() => {
    if (!id || !mode) return
    win.Zencast?.setRecording(true)
    let combos: string[] = []
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (save: boolean) => {
      if (timer) clearTimeout(timer)
      if (save && combos.length) commit(id, mode, combos.join(" "))
      setRecording(null)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const combo = comboFromEvent(event)
      if (!combo) return
      event.preventDefault()
      event.stopPropagation()
      const step = recordKey(combos, combo)
      if (step.kind === "cancel") return finish(false)
      if (step.kind === "save") return finish(true)
      if (step.kind === "hint") return setRecording((current) => current && { ...current, hint: step.text })
      combos = step.combos
      setRecording((current) => current && { ...current, combos, hint: null })
      if (timer) clearTimeout(timer)
      if (step.done) return finish(true)
      timer = setTimeout(() => finish(true), CHORD_WAIT_MS)
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener("keydown", onKeyDown, { capture: true })
      win.Zencast?.setRecording(false)
    }
  }, [id, mode, win])

  const start = (id: string, mode: Recording["mode"]) => setRecording({ id, mode, combos: [], hint: null })
  return { recording, start }
}
