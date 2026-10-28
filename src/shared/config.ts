import { z } from "zod"

// Chrome documents forbid eval, which zod's JIT would otherwise try first.
z.config({ jitless: true })

// Config lives in a string pref so every browser window and the settings tab see one source of truth
// and get change notifications for free through the pref observer.
const CONFIG_PREF = "zencast.config"
const USAGE_PREF = "zencast.usage"

// A key bound to a place rather than a command: a site (switched to if open, else opened) or a folder.
const jumpSchema = z.object({
  kind: z.enum(["url", "folder"]),
  target: z.string(),
  title: z.string(),
})

export type Jump = z.infer<typeof jumpSchema>

/** The hidden command id a jump's key is bound to. */
export function jumpId(jump: Pick<Jump, "kind" | "target">): string {
  return `jump:${jump.kind}:${jump.target}`
}

const configSchema = z.object({
  version: z.literal(1).default(1),
  // Overrides of default bindings: command id -> key sequences. An empty list unbinds the command.
  bindings: z.record(z.string(), z.array(z.string())).default({}),
  urlResults: z.boolean().default(true),
  maxResults: z.number().int().min(10).max(200).default(60),
  jumps: z.array(jumpSchema).default([]),
})

export type Config = z.infer<typeof configSchema>

export const RESULT_LIMITS = [30, 60, 100, 200]

const usageSchema = z.record(z.string(), z.tuple([z.number(), z.number()]))
// command id -> [run count, last run epoch ms]
export type Usage = z.infer<typeof usageSchema>

function readJsonPref<T>(pref: string, schema: z.ZodType<T>, fallback: T): T {
  const raw = Services.prefs.getStringPref(pref, "")
  if (!raw) return fallback
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

let cachedConfig: Config | null = null
let cachedUsage: Usage | null = null

export function readConfig(): Config {
  cachedConfig ??= readJsonPref(CONFIG_PREF, configSchema, configSchema.parse({}))
  return cachedConfig
}

export function writeConfig(next: Config) {
  cachedConfig = next
  Services.prefs.setStringPref(CONFIG_PREF, JSON.stringify(next))
}

export function resetConfig() {
  writeConfig(configSchema.parse({}))
}

export function updateConfig(patch: (config: Config) => Config) {
  writeConfig(patch(readConfig()))
}

export function readUsage(): Usage {
  cachedUsage ??= readJsonPref(USAGE_PREF, usageSchema, {})
  return cachedUsage
}

let usageFlush: ReturnType<typeof setTimeout> | null = null

export function recordUsage(id: string) {
  const usage = readUsage()
  const [count] = usage[id] ?? [0, 0]
  usage[id] = [count + 1, Date.now()]
  // Batch pref writes; ranking reads the in-memory copy.
  usageFlush ??= setTimeout(() => {
    usageFlush = null
    Services.prefs.setStringPref(USAGE_PREF, JSON.stringify(readUsage()))
  }, 2000)
}

export function onConfigChange(listener: (config: Config) => void): () => void {
  const observer = {
    observe() {
      cachedConfig = null
      listener(readConfig())
    },
  }
  Services.prefs.addObserver(CONFIG_PREF, observer)
  return () => Services.prefs.removeObserver(CONFIG_PREF, observer)
}
