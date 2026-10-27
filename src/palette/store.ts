import { useSyncExternalStore } from "react"

import type { CommandContext, ListView, PaletteItem } from "@/commands/types"
import type { ChordHint } from "@/keys/engine"
import type { Jump } from "@/shared/config"

export interface OpenIn {
  id: number
  name: string
  color: string
}

/** The space that the next opened URL, search or tab goes to. */
export interface SpaceTarget {
  id: string
  name: string
  color: string
}

/** A shortcut being recorded in the palette, for a command or for a new jump. */
export interface Recording {
  id: string
  title: string
  jump?: Jump
  combos: string[]
  hint: string | null
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
  space: SpaceTarget | null
  recording: Recording | null
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
  space: null,
  recording: null,
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

