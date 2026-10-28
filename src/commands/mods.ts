// Installed Sine mods to turn on and off, and the overlap report: enabled mods that claim a key
// Zencast uses, or do a job Zencast already does, each with a way to turn it off through Sine.
import { PuzzleIcon } from "@hugeicons/core-free-icons"

import { enabledMods, installedMods, modKeys, toggleMod, type SineMod } from "@/browser/sine-mods"
import { effectiveBindings } from "@/keys/bindings"
import { readConfig } from "@/shared/config"
import { allCommands } from "./jumps"
import type { Command, CommandContext, ListView, PaletteItem } from "./types"

/** Mods whose main job Zencast covers, by Sine mod id. */
const SAME_JOB: Record<string, string> = {
  "zen-tab-palette": "Zencast's palette finds tabs and moves them to folders and spaces",
  "quick-search-zen-browser": "Zencast's palette searches the web",
  "settings-shortcuts-search": "Zencast's palette lists Zen's commands with their keys",
}

/** Zencast's keys by their first combo, so a chord's lead key ("ctrl+space") counts too. */
function zencastKeys(): Map<string, string> {
  const config = readConfig()
  const titles = new Map(allCommands(config).map((command) => [command.id, command.title]))
  const out = new Map<string, string>()
  for (const [id, sequences] of effectiveBindings(config))
    for (const sequence of sequences) {
      const lead = sequence.split(" ")[0]
      if (lead && !out.has(lead)) out.set(lead, titles.get(id) ?? id)
    }
  return out
}

function overlapItem(ctx: CommandContext, mod: SineMod, clashes: Array<[string, string]>, job: string | undefined): PaletteItem {
  const [first] = clashes
  const titles = clashes.map(([, title]) => title).join(", ")
  return {
    id: `mod-overlap:${mod.id}`,
    title: mod.name,
    subtitle: first ? `${clashes.length > 1 ? "Same keys as" : "Same key as"} ${titles}` : job,
    section: "Overlapping mods",
    icon: { kind: "icon", icon: PuzzleIcon },
    keys: first?.[0],
    accessory: first ? undefined : "Same job",
    accessoryColor: "var(--faint)",
    actions: [
      {
        id: "off",
        title: "Turn off",
        danger: true,
        run: async () => {
          await toggleMod(mod.id)
          ctx.ui.toast(`Turned off ${mod.name}`, { label: "Undo", run: () => void toggleMod(mod.id) })
        },
      },
    ],
  }
}

/** Every installed mod as a row that turns it on or off, for the "*" scope. */
export async function modItems(ctx: CommandContext, onChange: () => void): Promise<PaletteItem[]> {
  return (await installedMods()).map((mod) => ({
    id: `mod:${mod.id}`,
    title: mod.name,
    section: "Mods",
    scope: "mods",
    icon: { kind: "icon", icon: PuzzleIcon },
    accessory: mod.enabled ? "On" : "Off",
    accessoryColor: mod.enabled ? "var(--mint)" : "var(--faint)",
    actions: [
      {
        id: "toggle",
        title: mod.enabled ? "Turn off" : "Turn on",
        keepOpen: true,
        run: async () => {
          await toggleMod(mod.id)
          ctx.ui.toast(`${mod.name} ${mod.enabled ? "off" : "on"}`)
          onChange()
        },
      },
    ],
  }))
}

async function overlapView(ctx: CommandContext): Promise<ListView | void> {
  const owned = zencastKeys()
  const items: PaletteItem[] = []
  for (const mod of await enabledMods()) {
    const clashes = (await modKeys(mod).catch((): string[] => [])).flatMap((combo): Array<[string, string]> => {
      const title = owned.get(combo)
      return title ? [[combo, title]] : []
    })
    const job = SAME_JOB[mod.id]
    if (clashes.length || job) items.push(overlapItem(ctx, mod, clashes, job))
  }
  if (!items.length) return ctx.ui.toast("No mod overlaps Zencast")
  return { id: "mod-overlap", title: "Mod overlap", placeholder: "Mod", items }
}

export const modCommands: Command[] = [
  {
    id: "zencast.modOverlap",
    title: "Mod overlap",
    section: "Palette",
    icon: PuzzleIcon,
    keywords: "sine mods conflicts duplicate keys clash",
    run: overlapView,
  },
]
