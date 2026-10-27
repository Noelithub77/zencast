import { useSyncExternalStore } from "react"

import type { CommandContext, ListView, PaletteItem } from "@/commands/types"
import type { ChordHint } from "@/keys/engine"

export interface OpenIn {
  id: number
  name: string
  color: string
}

export interface PaletteState {
  open: boolean
  /** Increments on every open so the view resets its query and selection. */
  session: number
  context: CommandContext | null
  /** Root items, snapshotted when the palette opens. */
  root: PaletteItem[]
  /** Pushed pickers; empty means the root list. */
  stack: ListView[]
  openIn: OpenIn | null
  chord: ChordHint | null
}

/** Id of the shadow host element; focus inside the palette reports this as the active element. */
export const HOST_ID = "zencast-host"

type Listener = () => void

let state: PaletteState = {
  open: false,
  session: 0,
  context: null,
  root: [],
  stack: [],
  openIn: null,
  chord: null,
}
const listeners = new Set<Listener>()

export function getState(): PaletteState {
  return state
}

export function setState(patch: Partial<PaletteState> | ((current: PaletteState) => Partial<PaletteState>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }
  for (const listener of listeners) listener()
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePalette<T>(select: (state: PaletteState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

