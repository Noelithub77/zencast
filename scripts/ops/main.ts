// Operator entry point: `pnpm ops <command>`. Run `pnpm ops --help` for commands.
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { cp, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"

import { captureScreens, runBench, runScenarios } from "./e2e.ts"
import { captureLooks } from "./look.ts"
import { captureMedia } from "./media.ts"
import { defaultProfile, isRunning, MOD_ID, modsDir, readMods, readPref, writeMods, type ModEntry } from "./profile.ts"
import { bumpSource, isBump, publish, RELEASE_BRANCH, REPO_URL } from "./release.ts"
import { buildSite, deploySite } from "./site.ts"
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
  eval <js>          Run chrome-privileged JS in an isolated headless Zen and print what it returns
  media [dir]        Record the README's GIFs and screenshots in an isolated headless Zen (default docs/media)
  look [css…]        Screenshot Zen restyled by each stylesheet, in an isolated headless Zen (default src/looks/*.css)
  release            Build and publish the mod to the release branch, which Sine installs and updates from
  site               Typecheck and build the landing page into site/dist
  deploy             Build the landing page, deploy it to zencast.allpyq.in and check it is live

Options
  --profile <dir>    Zen profile directory (default: the profile Zen opens by default)
  --dry-run          install, release, deploy: report what would change without writing or pushing
  --screenshots <dir>  e2e: also save screenshots of the palette and settings page
  --tabs <n>         bench: lazy tabs to open first (default 300)
  --opens <n>        bench: palette opens to measure (default 40)
  --file <path>      eval: read the JS from a file instead of the argument
  --out <dir>        look: where to write the screenshots (default docs/media/looks)
  --keep             e2e, bench, eval, media, look: keep the temporary profile for inspection
  --video            media: record 1920x1080 MP4 clips for films instead of the README's GIFs
  --bump <part>      release: raise the version first (patch, minor or major), commit and tag it
  --json             Print one JSON result on stdout; progress goes to stderr
  -h, --help         Show this help

Effects
  install writes <profile>/chrome/sine-mods/zencast and the zencast entry in mods.json.
  It never changes prefs. Restart Zen afterwards; Sine rebuilds chrome.css at startup.
  e2e, bench, eval, media and look copy Sine from the profile into a temporary profile and never touch
  the original. They need a current build (pnpm ops build). media loads real sites and needs ffmpeg.
  eval runs its JS as an async function body in the browser window, with gBrowser, Zen's managers,
  Services and the test helpers (until, sleep, press); return a JSON-serialisable value.
  release needs a clean tree. It replaces the release branch with the build, stamps updatedAt in
  theme.json so Sine updates installed copies on their next start, and pushes the branch, plus the
  version commit and tag with --bump.
  deploy runs wrangler with site/wrangler.jsonc. It uses CLOUDFLARE_API_TOKEN, or else the cf CLI's
  current login (cf auth login), then fetches the live page and reports its status and title.

Examples
  pnpm ops build
  pnpm ops install --dry-run --json
  pnpm --silent ops doctor --json
  pnpm ops e2e --screenshots /tmp/zencast-shots
  pnpm --silent ops bench --json
  pnpm ops eval "return gZenWorkspaces.getWorkspaces().map((w) => w.name)"
  pnpm ops media
  pnpm ops look src/looks/candy.css --out /tmp/looks
  pnpm ops release --bump patch
  pnpm --silent ops deploy --json`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    profile: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    screenshots: { type: "string" },
    tabs: { type: "string", default: "300" },
    opens: { type: "string", default: "40" },
    keep: { type: "boolean", default: false },
    bump: { type: "string" },
    file: { type: "string" },
    out: { type: "string" },
    video: { type: "boolean", default: false },
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

function runBuild(): boolean {
  log("Building…")
  // pnpm's own output stays on stderr so --json keeps stdout clean.
  return spawnSync("pnpm", ["-s", "build"], { cwd: ROOT, stdio: ["ignore", 2, 2] }).status === 0
}

function build() {
  const ok = runBuild()
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
async function withZen<T>(work: (zen: Zen) => Promise<T>, size?: { width: number; height: number }): Promise<T> {
  if (!readTheme(DIST)) throw new Error("dist/zencast is missing; run pnpm ops build")
  log("Starting headless Zen…")
  const zen = await launchZen({ sourceProfile: profileDir(), dist: DIST, ...size })
  try {
    return await work(zen)
  } finally {
    await zen.stop()
    if (values.keep) log(`Kept profile ${zen.profile}`)
    else await removeProfile(zen.profile)
  }
}

async function e2e() {
  const results = await withZen(runScenarios)
  let screenshots: string[] = []
  const dir = values.screenshots
  // A fresh Zen, so state left by the scenarios doesn't leak into the screenshots.
  if (dir) {
    try {
      screenshots = await withZen((zen) => captureScreens(zen, resolve(dir)))
    } catch (error) {
      results.push({ name: "screenshots", ok: false, detail: error instanceof Error ? error.message.split("\n")[0] : String(error), ms: 0 })
    }
  }
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

async function evaluate() {
  const code = values.file ? readFileSync(resolve(values.file), "utf8") : positionals[1]
  if (!code) throw new Error("eval needs JS as an argument or --file <path>")
  const value = await withZen((zen) => zen.run(code))
  finish({ ok: true, command: "eval", environment: "headless Zen, temporary profile", value }, JSON.stringify(value, null, 2) ?? "undefined")
}

async function media() {
  const dir = resolve(positionals[1] ?? join(ROOT, "docs", "media"))
  const video = values.video
  // Film clips are recorded at the film's frame size.
  const files = await withZen((zen) => captureMedia(zen, dir, video), video ? { width: 1920, height: 1080 } : undefined)
  finish({ ok: true, command: "media", environment: "headless Zen, temporary profile", files }, files.join("\n"))
}

async function look() {
  const looks = join(ROOT, "src", "looks")
  const files = positionals.length > 1 ? positionals.slice(1).map((file) => resolve(file)) : readdirSync(looks).filter((file) => file.endsWith(".css")).map((file) => join(looks, file))
  const dir = resolve(values.out ?? join(ROOT, "docs", "media", "looks"))
  const shots = await withZen((zen) => captureLooks(zen, files, dir))
  finish({ ok: true, command: "look", environment: "headless Zen, temporary profile", files: shots }, shots.join("\n"))
}

async function release() {
  const dryRun = values["dry-run"]
  const bump = values.bump
  if (bump !== undefined && !isBump(bump)) throw new Error("--bump must be patch, minor or major")
  const dirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: ROOT, encoding: "utf8" }).stdout.trim()
  if (dirty && !dryRun) return finish({ ok: false, command: "release", error: "uncommitted changes", dirty }, `Commit or stash first:\n${dirty}`)

  const bumped = bump ? await bumpSource(ROOT, bump, dryRun) : null
  if (!runBuild()) return finish({ ok: false, command: "release", error: "build failed" }, "Build failed")
  // The version commit and tag go first, so a published build always has its source on GitHub.
  if (bumped && !dryRun && spawnSync("git", ["push", "--quiet", "--atomic", "origin", "HEAD", `v${bumped}`], { cwd: ROOT, stdio: "inherit" }).status !== 0)
    return finish({ ok: false, command: "release", error: "pushing the version commit failed" }, `Could not push v${bumped}`)
  const result = await publish(ROOT, DIST, { dryRun, push: true })
  const version = bumped ?? result.version
  finish(
    { ok: true, command: "release", branch: RELEASE_BRANCH, ...result, version, dryRun },
    [
      `${dryRun ? "Would release" : "Released"} Zencast ${version} from ${result.source}${dryRun && bumped ? " (version bump not written)" : ""}`,
      `  ${RELEASE_BRANCH} ${result.commit ?? ""}  updatedAt ${result.updatedAt}`,
      result.pushed ? `  Install or update from ${REPO_URL}/tree/${RELEASE_BRANCH}` : "  Not pushed",
    ].join("\n"),
  )
}

function site() {
  const result = buildSite(ROOT)
  finish({ command: "site", ...result }, result.ok ? `Built ${result.output}  ${result.bytes ?? 0} B` : "Site build failed")
}

async function deploy() {
  const result = await deploySite(ROOT, values["dry-run"])
  const text = !result.ok
    ? `Deploy failed: ${"error" in result ? result.error : `${result.url} returned ${"status" in result ? result.status : "nothing"}`}`
    : result.dryRun
      ? `Would deploy to ${result.url}`
      : `Deployed ${result.url}\n  ${"status" in result ? result.status : ""}  ${"title" in result ? result.title : ""}`
  finish({ command: "deploy", ...result }, text)
}

const command = positionals[0]
if (values.help || !command) console.log(HELP)
else if (command === "build") build()
else if (command === "install") await install()
else if (command === "doctor") await doctor()
else if (command === "e2e") await e2e()
else if (command === "bench") await bench()
else if (command === "eval") await evaluate()
else if (command === "media") await media()
else if (command === "look") await look()
else if (command === "release") await release()
else if (command === "site") site()
else if (command === "deploy") await deploy()
else {
  console.error(`Unknown command: ${command}\n\n${HELP}`)
  process.exitCode = 2
}
