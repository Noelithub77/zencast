// Zen profile discovery and Sine's mod registry (chrome/sine-mods/mods.json).
import { existsSync, readFileSync, readlinkSync } from "node:fs"
import { readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export const ZEN_DIR = join(homedir(), ".config", "zen")
export const MOD_ID = "zencast"

/** The profile Zen opens by default, from installs.ini (falling back to profiles.ini). */
export function defaultProfile(): string {
  for (const file of ["installs.ini", "profiles.ini"]) {
    const path = join(ZEN_DIR, file)
    if (!existsSync(path)) continue
    const match = /^Default=(.+)$/m.exec(readFileSync(path, "utf8"))
    if (match) return join(ZEN_DIR, match[1].trim())
  }
  throw new Error(`No default Zen profile in ${ZEN_DIR}`)
}

export function modsDir(profile: string): string {
  return join(profile, "chrome", "sine-mods")
}

/** A running Zen holds the profile lock symlink. */
export function isRunning(profile: string): boolean {
  try {
    const target = readlinkSync(join(profile, "lock"))
    const pid = Number(target.split("+").pop())
    if (!pid) return false
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function readPref(profile: string, name: string): string | null {
  let value: string | null = null
  // user.js is applied after prefs.js, so its value wins.
  for (const file of ["prefs.js", "user.js"]) {
    const path = join(profile, file)
    if (!existsSync(path)) continue
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const match = new RegExp(`user_pref\\("${escaped}",\\s*(.+?)\\);`).exec(readFileSync(path, "utf8"))
    if (match) value = match[1]
  }
  return value
}

export type ModEntry = Record<string, unknown> & { enabled?: boolean; version?: string }
export type ModsRegistry = Record<string, ModEntry>

function isRegistry(value: unknown): value is ModsRegistry {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function readMods(profile: string): Promise<ModsRegistry> {
  const path = join(modsDir(profile), "mods.json")
  if (!existsSync(path)) return {}
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"))
  if (!isRegistry(parsed)) throw new Error(`${path} is not a mods object`)
  return parsed
}

/** Writes through a temporary file so a crash never leaves Sine a half-written registry. */
export async function writeMods(profile: string, mods: ModsRegistry) {
  const path = join(modsDir(profile), "mods.json")
  const temp = `${path}.zencast-tmp`
  await writeFile(temp, JSON.stringify(mods))
  await rename(temp, path)
}
