// Installed Sine mods, read through Sine's own modules, and the keys each one claims. Mods keep a
// shortcut in a string setting ("Ctrl+Shift+F"), often with the default written in their script, so
// a mod's keys are its live shortcut settings, or else the shortcut strings in its scripts.
import { z } from "zod"

import { normalizeCombo } from "@/shared/keys"

const sine = () => ChromeUtils.importESModule("chrome://userscripts/content/core/utils.sys.mjs").default

const MODS = z.record(z.string(), z.object({ name: z.string().optional(), enabled: z.boolean().optional() }))
const PREFERENCES = z.array(z.object({ property: z.string().optional(), defaultValue: z.unknown().optional() }))

const MODIFIER = "(?:ctrl|control|alt|shift|meta|super|cmd|command|accel|option)"
const SHORTCUT = new RegExp(`^(?:${MODIFIER}\\+)+(?:[a-z0-9]|f\\d{1,2}|space|tab|enter|escape|backspace|delete|up|down|left|right|[,./;'=\\[\\]\\\\-])$`, "i")
const LITERAL = new RegExp(`["'\`]((?:${MODIFIER}\\+)+[^"'\`\\s+]{1,9})["'\`]`, "gi")
const SHORTCUT_PREF = /["'`]([\w.-]*(?:shortcut|hotkey|keybind)[\w.-]*)["'`]/gi
const ALIASES: Record<string, string> = { super: "meta", cmd: "meta", command: "meta", option: "alt" }

export interface SineMod {
  id: string
  name: string
  folder: string
}

/** Enabled mods other than Zencast. */
export async function enabledMods(): Promise<SineMod[]> {
  const utils = sine()
  const parsed = MODS.safeParse(await utils.getMods())
  if (!parsed.success) return []
  return Object.entries(parsed.data)
    .filter(([id, mod]) => mod.enabled && id !== "zencast")
    .map(([id, mod]) => ({ id, name: mod.name || id, folder: utils.getModFolder(id) }))
}

async function scripts(folder: string, depth = 0): Promise<string[]> {
  const out: string[] = []
  for (const path of await IOUtils.getChildren(folder, { ignoreAbsent: true })) {
    const { type } = await IOUtils.stat(path)
    if (type === "directory" && depth < 3) out.push(...(await scripts(path, depth + 1)))
    else if (type === "regular" && /\.m?js$/.test(path)) out.push(path)
  }
  return out
}

const toCombo = (text: string) =>
  normalizeCombo(text.trim().toLowerCase().split("+").map((part) => ALIASES[part] ?? part).join("+"))

/** The keys a mod claims, written as Zencast writes them ("ctrl+shift+f"). */
export async function modKeys(mod: SineMod): Promise<string[]> {
  const live = new Set<string>()
  const literals = new Set<string>()
  const readSetting = (name: string) => {
    if (Services.prefs.getPrefType(name) !== Services.prefs.PREF_STRING) return
    const value = Services.prefs.getStringPref(name, "").trim()
    if (SHORTCUT.test(value)) live.add(toCombo(value))
  }

  const preferences = PathUtils.join(mod.folder, "preferences.json")
  if (await IOUtils.exists(preferences)) {
    const parsed = PREFERENCES.safeParse(await IOUtils.readJSON(preferences))
    for (const { property, defaultValue } of parsed.success ? parsed.data : []) {
      if (!property) continue
      readSetting(property)
      if (typeof defaultValue === "string" && SHORTCUT.test(defaultValue) && Services.prefs.getPrefType(property) === Services.prefs.PREF_INVALID)
        live.add(toCombo(defaultValue))
    }
  }
  for (const path of await scripts(mod.folder)) {
    const text = await IOUtils.readUTF8(path)
    for (const [, name] of text.matchAll(SHORTCUT_PREF)) readSetting(name)
    for (const [, shortcut] of text.matchAll(LITERAL)) if (SHORTCUT.test(shortcut)) literals.add(toCombo(shortcut))
  }
  // A shortcut setting with a value replaces the default written in the script.
  return [...(live.size ? live : literals)]
}

/** Turns a mod off, or back on, through Sine's own toggle. */
export async function toggleMod(id: string) {
  const manager = ChromeUtils.importESModule("chrome://userscripts/content/core/manager.sys.mjs").default
  await manager.toggleTheme(await sine().getMods(), id)
}
