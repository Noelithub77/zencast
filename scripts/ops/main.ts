// Operator entry point: `pnpm ops <command>`. Run `pnpm ops --help` for commands.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { cp, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"

import { captureScreens, runBench, runScenarios } from "./e2e.ts"
import { defaultProfile, isRunning, MOD_ID, modsDir, readMods, readPref, writeMods, type ModEntry } from "./profile.ts"
import { launchZen, removeProfile, type Zen } from "./zen.ts"

const ROOT = resolve(import.meta.dirname, "..", "..")
const DIST = join(ROOT, "dist", MOD_ID)

const HELP = `Usage: pnpm ops <command> [options]

Commands
  build              Typecheck and build the mod and settings page into dist/zencast
  install            Copy dist/zencast into a Zen profile and register it with Sine
  doctor             Check the build, the profile, Sine and what blocks the mod from loading
  e2e                Run end-to-end checks in an isolated headless Zen
  bench              Measure open, search and keystroke latency in an isolated headless Zen

Options
  --profile <dir>    Zen profile directory (default: the profile Zen opens by default)
  --dry-run          install: report what would change without writing
  --screenshots <dir>  e2e: also save screenshots of the palette and settings page
  --tabs <n>         bench: lazy tabs to open first (default 300)
  --opens <n>        bench: palette opens to measure (default 40)
  --keep             e2e, bench: keep the temporary profile for inspection
  --json             Print one JSON result on stdout; progress goes to stderr
  -h, --help         Show this help

Effects
  install writes <profile>/chrome/sine-mods/zencast and the zencast entry in mods.json.
  It never changes prefs. Restart Zen afterwards; Sine rebuilds chrome.css at startup.
  e2e and bench copy Sine from the profile into a temporary profile and never touch the original.
  Both need a current build (pnpm ops build).

Examples
  pnpm ops build
  pnpm ops install --dry-run --json
  pnpm --silent ops doctor --json
  pnpm ops e2e --screenshots /tmp/zencast-shots
  pnpm --silent ops bench --json`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    profile: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    screenshots: { type: "string" },
    tabs: { type: "string", default: "300" },
    opens: { type: "string", default: "40" },
    keep: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
})

const json = values.json
const log = (message: string) => console.error(message)

function finish(result: Record<string, unknown> & { ok: boolean }, text: string) {
  if (json) console.log(JSON.stringify(result, null, 2))
  else console.log(text)
  process.exitCode = result.ok ? 0 : 1
}

function profileDir(): string {
  return values.profile ? resolve(values.profile) : defaultProfile()
}

function readTheme(dir: string): ModEntry | null {
  const path = join(dir, "theme.json")
  if (!existsSync(path)) return null
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
  return typeof parsed === "object" && parsed !== null ? { ...parsed } : null
}

function build() {
  log("Building…")
  // pnpm's own output stays on stderr so --json keeps stdout clean.
  const run = spawnSync("pnpm", ["-s", "build"], { cwd: ROOT, stdio: ["ignore", 2, 2] })
  const ok = run.status === 0
  const files = ["zencast.uc.mjs", "palette.css", "document.css", "settings/index.html"].map((file) => {
    const path = join(DIST, file)
    return { file, bytes: existsSync(path) ? readFileSync(path).byteLength : null }
  })
  finish(
    { ok, command: "build", output: DIST, files },
    ok ? `Built ${DIST}\n${files.map((f) => `  ${f.file}  ${f.bytes ?? "missing"} B`).join("\n")}` : "Build failed",
  )
}

async function install() {
  const profile = profileDir()
  const theme = readTheme(DIST)
  if (!theme) return finish({ ok: false, command: "install", error: "dist/zencast is missing; run pnpm ops build" }, "Run pnpm ops build first")
  if (!existsSync(join(profile, "chrome", "JS", "sine.sys.mjs")))
    return finish({ ok: false, command: "install", profile, error: "Sine is not installed in this profile" }, `Sine is not installed in ${profile}`)

  const target = join(modsDir(profile), MOD_ID)
  const mods = await readMods(profile)
  const previous = mods[MOD_ID]
  const today = new Date().toISOString().slice(0, 10)
  const entry: ModEntry = {
    ...theme,
    createdAt: typeof previous?.createdAt === "string" ? previous.createdAt : today,
    updatedAt: today,
    // Keep a mod the user disabled in Sine disabled.
    enabled: previous?.enabled ?? true,
    "no-updates": true,
  }
  const running = isRunning(profile)
  const scriptsAllowed = readPref(profile, "sine.allow-unsafe-js") === "true"
  const warnings = [
    ...(running ? ["Zen is running: restart it to load this version"] : []),
    ...(scriptsAllowed ? [] : ["Sine skips scripts from local mods until “Allow unsafe JS” (sine.allow-unsafe-js) is on"]),
  ]

  if (!values["dry-run"]) {
    await rm(target, { recursive: true, force: true })
    await cp(DIST, target, { recursive: true })
    await writeMods(profile, { ...mods, [MOD_ID]: entry })
  }
  finish(
    {
      ok: true,
      command: "install",
      dryRun: values["dry-run"],
      profile,
      target,
      version: entry.version,
      previousVersion: previous?.version ?? null,
      enabled: entry.enabled,
      warnings,
    },
    [
      `${values["dry-run"] ? "Would install" : "Installed"} Zencast ${String(entry.version)} into ${target}`,
      ...warnings.map((warning) => `  ! ${warning}`),
    ].join("\n"),
  )
}

interface Check {
  name: string
  status: "pass" | "warn" | "fail"
  detail: string
}

async function doctor() {
  const profile = profileDir()
  const checks: Check[] = []
  const add = (name: string, status: Check["status"], detail: string) => checks.push({ name, status, detail })

  const built = readTheme(DIST)
  add("build", built ? "pass" : "fail", built ? `dist ${String(built.version)}` : "dist/zencast missing; run pnpm ops build")
  add("profile", existsSync(profile) ? "pass" : "fail", profile)
  add("sine", existsSync(join(profile, "chrome", "JS", "sine.sys.mjs")) ? "pass" : "fail", "chrome/JS/sine.sys.mjs")

  const installed = readTheme(join(modsDir(profile), MOD_ID))
  if (!installed) add("installed", "fail", "not installed; run pnpm ops install")
  else if (built && installed.version !== built.version) add("installed", "warn", `installed ${String(installed.version)}, dist ${String(built.version)}`)
  else add("installed", "pass", `version ${String(installed.version)}`)

  const mods = existsSync(profile) ? await readMods(profile) : {}
  const entry = mods[MOD_ID]
  add("registered", entry?.enabled ? "pass" : "fail", entry ? (entry.enabled ? "enabled in mods.json" : "disabled in Sine") : "no mods.json entry")

  const unsafe = readPref(profile, "sine.allow-unsafe-js") === "true"
  add("scripts", unsafe ? "pass" : "fail", unsafe ? "sine.allow-unsafe-js is on" : "Sine skips local mod scripts until “Allow unsafe JS” is on")

  const palette = mods["zen-command-palette"]
  if (palette?.enabled) add("conflicts", "warn", "Zen Command Palette is enabled; Zencast takes Ctrl+K first")

  add("zen", isRunning(profile) ? "warn" : "pass", isRunning(profile) ? "running; restart after installing" : "not running")

  const ok = checks.every((check) => check.status !== "fail")
  const mark = { pass: "✓", warn: "!", fail: "✗" }
  finish(
    { ok, command: "doctor", profile, checks },
    checks.map((check) => `${mark[check.status]} ${check.name.padEnd(11)} ${check.detail}`).join("\n"),
  )
}

function count(name: "tabs" | "opens"): number {
  const value = Number(values[name])
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`)
  return value
}

/** Runs work against a fresh headless Zen and always shuts it down. */
async function withZen<T>(work: (zen: Zen) => Promise<T>): Promise<T> {
  if (!readTheme(DIST)) throw new Error("dist/zencast is missing; run pnpm ops build")
  log("Starting headless Zen…")
  const zen = await launchZen({ sourceProfile: profileDir(), dist: DIST })
  try {
    return await work(zen)
  } finally {
    await zen.stop()
    if (values.keep) log(`Kept profile ${zen.profile}`)
    else await removeProfile(zen.profile)
  }
}

async function e2e() {
  const { results, screenshots } = await withZen(async (zen) => {
    const results = await runScenarios(zen)
    let screenshots: string[] = []
    if (values.screenshots) {
      try {
        screenshots = await captureScreens(zen, resolve(values.screenshots))
      } catch (error) {
        results.push({ name: "screenshots", ok: false, detail: error instanceof Error ? error.message.split("\n")[0] : String(error), ms: 0 })
      }
    }
    return { results, screenshots }
  })
  const ok = results.every((result) => result.ok)
  finish(
    { ok, command: "e2e", environment: "headless Zen, temporary profile", results, screenshots },
    [
      ...results.map((r) => `${r.ok ? "✓" : "✗"} ${r.name}  ${r.detail} (${r.ms} ms)`),
      ...screenshots.map((path) => `  ${path}`),
      `${results.filter((r) => r.ok).length}/${results.length} passed`,
    ].join("\n"),
  )
}

async function bench() {
  const tabs = count("tabs")
  const opens = count("opens")
  const result = await withZen((zen) => runBench(zen, { tabs, opens }))
  const ok = Object.values(result.metrics).every((metric) => metric.ok)
  finish(
    { ok, command: "bench", environment: "headless Zen, temporary profile", ...result },
    [
      `${result.tabs} tabs; first open ${result.firstOpen} ms (mount)`,
      ...Object.entries(result.metrics).map(
        ([name, m]) => `${m.ok ? "✓" : "✗"} ${name.padEnd(9)} p50 ${m.p50} ms  p95 ${m.p95} ms  max ${m.max} ms  (budget p95 ≤ ${m.budget}, n=${m.samples})`,
      ),
    ].join("\n"),
  )
}

const command = positionals[0]
if (values.help || !command) console.log(HELP)
else if (command === "build") build()
else if (command === "install") await install()
else if (command === "doctor") await doctor()
else if (command === "e2e") await e2e()
else if (command === "bench") await bench()
else {
  console.error(`Unknown command: ${command}\n\n${HELP}`)
  process.exitCode = 2
}
