import { allCommands } from "@/commands/jumps"
import type { Command } from "@/commands/types"
import { updateConfig, type Config } from "@/shared/config"
import { normalizeSequence } from "@/shared/keys"

/** Key sequences per command: defaults, replaced wholesale by any user override. */
export function effectiveBindings(config: Config): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const command of allCommands(config)) {
    const keys = config.bindings[command.id] ?? command.defaultKeys ?? []
    out.set(command.id, keys.map(normalizeSequence).filter(Boolean))
  }
  return out
}

export interface BindingIndex {
  /** Full sequence -> commands bound to it (several when their `when` conditions differ). */
  exact: Map<string, Command[]>
  /** Every proper prefix of a chord, e.g. "ctrl+space" for "ctrl+space w". */
  prefixes: Map<string, Array<{ next: string; command: Command }>>
}

export function buildIndex(config: Config): BindingIndex {
  const exact = new Map<string, Command[]>()
  const prefixes = new Map<string, Array<{ next: string; command: Command }>>()
  const byId = new Map(allCommands(config).map((command) => [command.id, command]))
  for (const [id, sequences] of effectiveBindings(config)) {
    const command = byId.get(id)
    if (!command) continue
    for (const sequence of sequences) {
      const list = exact.get(sequence) ?? []
      list.push(command)
      exact.set(sequence, list)
      const combos = sequence.split(" ")
      for (let i = 1; i < combos.length; i++) {
        const prefix = combos.slice(0, i).join(" ")
        const next = combos.slice(i).join(" ")
        const entries = prefixes.get(prefix) ?? []
        entries.push({ next, command })
        prefixes.set(prefix, entries)
      }
    }
  }
  return { exact, prefixes }
}

export interface Conflict {
  sequence: string
  commands: string[]
}

/** Sequences bound to more than one command, or that are both a full binding and a chord prefix. */
export function findConflicts(index: BindingIndex): Conflict[] {
  const out: Conflict[] = []
  for (const [sequence, commands] of index.exact) {
    if (commands.length > 1 && commands.some((command) => !command.when))
      out.push({ sequence, commands: commands.map((command) => command.id) })
    if (index.prefixes.has(sequence))
      out.push({
        sequence,
        commands: [...commands.map((c) => c.id), ...(index.prefixes.get(sequence) ?? []).map((p) => p.command.id)],
      })
  }
  return out
}

/**
 * Makes the sequence the command's first binding ("replace") or adds it ("add"). It is removed from
 * the command's other bindings first, so recording a key twice never duplicates it.
 */
export function bindSequence(id: string, sequence: string, mode: "replace" | "add" = "replace") {
  updateConfig((config) => {
    const current = (effectiveBindings(config).get(id) ?? []).filter((s) => s !== sequence)
    const next = mode === "add" ? [...current, sequence] : [sequence, ...current.slice(1)]
    return { ...config, bindings: { ...config.bindings, [id]: next } }
  })
}

const PALETTE = "zencast.palette"

export function paletteOnCtrlT(config: Config): boolean {
  return (effectiveBindings(config).get(PALETTE) ?? []).includes("ctrl+t")
}

/** Gives Ctrl+T to the palette, or back to Zen's new tab. */
export function setPaletteOnCtrlT(on: boolean) {
  updateConfig((config) => {
    const keys = (effectiveBindings(config).get(PALETTE) ?? []).filter((sequence) => sequence !== "ctrl+t")
    return { ...config, bindings: { ...config.bindings, [PALETTE]: on ? [...keys, "ctrl+t"] : keys } }
  })
}
