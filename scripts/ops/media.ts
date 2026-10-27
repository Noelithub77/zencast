// Captures the README's screenshots and GIFs with demo spaces and sites only; run through `pnpm ops media`.
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import type { Zen } from "./zen.ts"

const execute = promisify(execFile)
const GIF_WIDTH = 1000
const GIF_FPS = 15
const VIDEO_FPS = 30
const SETTING = "zen.view.compact.animate-sidebar"

// Demo spaces in order. The first is Zen's default space, renamed.
const SPACES = [
  {
    name: "Work",
    sites: ["https://github.com", "https://mail.google.com", "https://linear.app", "https://www.figma.com", "https://docs.google.com"],
    pinned: ["github.com", "linear.app"],
  },
  { name: "Acad", sites: ["https://en.wikipedia.org", "https://scholar.google.com", "https://www.notion.so"], pinned: [] },
  {
    name: "Personal",
    sites: ["https://www.youtube.com", "https://www.reddit.com", "https://open.spotify.com", "https://www.google.com"],
    pinned: [],
  },
]

// Each step runs a browser-window script, then keeps grabbing screenshots for `hold` ms.
interface Step {
  body?: string
  hold: number
}

interface Frame {
  png: Buffer
  at: number
}

// Waits for the mod to mount in the browser window.
const READY = String.raw`await until(() => window.Zencast && document.getElementById("zencast-host"), 20000)`

// Opens the palette from a clean state: closes it, returns to the first space and selects GitHub.
export const RESET = String.raw`${READY}
  if (paletteOpen()) await dismiss()
  const first = gZenWorkspaces.getWorkspaces()[0]
  if (gZenWorkspaces.activeWorkspace !== first.uuid) await gZenWorkspaces.changeWorkspaceWithID(first.uuid)
  gBrowser.selectedTab = gBrowser.tabs.find((tab) => tab.getAttribute("data-demo")?.includes("github.com"))
  await sleep(400)`

const OPEN = String.raw`press("ctrl+k", document.documentElement)
  await until(paletteOpen)
  await sleep(60)`

/** One step per prefix, so the query appears to be typed. */
function typing(text: string, hold: number): Step[] {
  return [...text].map((_, i) => ({ body: `typeQuery(${JSON.stringify(text.slice(0, i + 1))}); await sleep(40)`, hold }))
}

function key(combo: string, after = 120): string {
  return `press(${JSON.stringify(combo)}); await sleep(${after})`
}

export const SETUP = String.raw`${READY}
  const spaces = ${JSON.stringify(SPACES)}
  const initial = gBrowser.tabs[0]
  const first = gZenWorkspaces.getWorkspaces()[0]
  if (first.name !== spaces[0].name) {
    first.name = spaces[0].name
    await gZenWorkspaces.saveWorkspace(first)
  }
  for (const space of spaces.slice(1))
    if (!gZenWorkspaces.getWorkspaces().some((workspace) => workspace.name === space.name)) await gZenWorkspaces.createAndSaveWorkspace(space.name)
  const uuidOf = (name) => gZenWorkspaces.getWorkspaces().find((workspace) => workspace.name === name).uuid
  const opened = []
  for (const space of spaces) {
    await gZenWorkspaces.changeWorkspaceWithID(uuidOf(space.name))
    await sleep(400)
    for (const url of space.sites) {
      const tab = gBrowser.addTrustedTab(url, { skipAnimation: true })
      tab.setAttribute("data-demo", url)
      gBrowser.selectedTab = tab
      opened.push({ tab, url, pinned: space.pinned.some((host) => url.includes(host)) })
    }
  }
  const settle = async () => {
    const deadline = Date.now() + 40000
    while (Date.now() < deadline && opened.some(({ tab }) => !tab.linkedBrowser.contentTitle)) await sleep(300)
  }
  await settle()
  // Demo sites occasionally fail on the first load; one reload recovers them.
  const failed = opened.filter(({ tab }) => /problem loading|not found/i.test(tab.linkedBrowser.contentTitle))
  for (const { tab } of failed) tab.linkedBrowser.reload()
  await sleep(2000)
  await settle()
  for (const { tab, pinned } of opened) if (pinned) gBrowser.pinTab(tab)
  gBrowser.removeTab(initial)
  await gZenWorkspaces.changeWorkspaceWithID(uuidOf(spaces[0].name))
  await sleep(1500)
  return opened.map(({ tab, url }) => url + " -> " + (tab.linkedBrowser.contentTitle || "(no title)"))`

const HERO: Step[] = [
  { body: RESET, hold: 500 },
  { body: OPEN, hold: 450 },
  ...typing("yout", 170),
  { body: "await sleep(60)", hold: 700 },
  {
    body: String.raw`const first = resultTitles()[0] ?? ""
    if (!/youtube/i.test(first)) throw new Error("Expected YouTube first, got " + first)
    press("enter")
    await until(() => !paletteOpen(), 3000)
    await sleep(100)`,
    hold: 1800,
  },
]

const SPACES_CLIP: Step[] = [
  { body: RESET, hold: 400 },
  { body: OPEN, hold: 500 },
  { body: key("alt+2"), hold: 1100 },
  { body: key("ctrl+1"), hold: 1100 },
  { body: key("ctrl+1"), hold: 500 },
  { body: key("alt+2"), hold: 700 },
]

const HINTS: Step[] = [
  { body: RESET, hold: 400 },
  { body: OPEN, hold: 400 },
  {
    body: String.raw`document.documentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", code: "ControlLeft", ctrlKey: true, bubbles: true, composed: true }))
    await until(() => shadow().querySelector("kbd.text-peach"), 2000)`,
    hold: 800,
  },
  {
    body: String.raw`const row = [...shadow().querySelectorAll("[cmdk-item]")].find((item) => /pin or unpin tab/i.test(item.textContent) && item.querySelector("kbd.text-peach"))
    if (!row) throw new Error("No hinted row to run")
    press("ctrl+" + row.querySelector("kbd.text-peach").textContent)
    await sleep(120)`,
    hold: 600,
  },
  {
    body: String.raw`document.documentElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", code: "ControlLeft", bubbles: true, composed: true }))`,
    hold: 500,
  },
]

const SETTINGS_CLIP: Step[] = [
  { body: RESET, hold: 400 },
  { body: OPEN, hold: 400 },
  ...typing("animate sidebar", 90),
  {
    body: String.raw`const first = [...shadow().querySelectorAll("[cmdk-item]")][0]?.getAttribute("data-value")
    if (first !== "pref:${SETTING}") throw new Error("Expected the setting first, got " + first)
    await sleep(60)`,
    hold: 600,
  },
  { body: key("enter", 150), hold: 1300 },
]

/** Records timed frames: a frame lasts until the next visibly different screenshot. */
async function record(zen: Zen, steps: Step[]): Promise<Array<{ png: Buffer; seconds: number }>> {
  const frames: Frame[] = []
  const start = performance.now()
  const grab = async () => {
    const png = await zen.screenshot()
    const last = frames.at(-1)
    if (!last || !last.png.equals(png)) frames.push({ png, at: (performance.now() - start) / 1000 })
  }
  for (const step of steps) {
    if (step.body) await zen.run(step.body)
    const end = performance.now() + step.hold
    do {
      await grab()
    } while (performance.now() < end)
  }
  const total = (performance.now() - start) / 1000
  return frames.map((frame, i) => {
    const next = frames[i + 1]?.at ?? total
    return { png: frame.png, seconds: Math.max(next - frame.at, 0.05) }
  })
}

// Copies the tab as a Markdown link through the example feature module in src/features/.
const FEATURE_CLIP: Step[] = [
  { body: RESET, hold: 400 },
  { body: OPEN, hold: 450 },
  ...typing("markdown", 150),
  {
    body: String.raw`const first = [...shadow().querySelectorAll("[cmdk-item]")][0]?.getAttribute("data-value")
    if (first !== "tab.copyMarkdownLink") throw new Error("Expected the Markdown command first, got " + first)
    await sleep(60)`,
    hold: 700,
  },
  { body: key("enter", 150), hold: 2200 },
]

/** Assembles timed PNG frames into a looping GIF with a per-clip palette, or an H.264 clip for films. */
async function encode(frames: Array<{ png: Buffer; seconds: number }>, output: string) {
  const work = await mkdtemp(join(tmpdir(), "zencast-clip-"))
  try {
    const lines: string[] = []
    let last = ""
    for (const [i, frame] of frames.entries()) {
      last = `${String(i).padStart(4, "0")}.png`
      await writeFile(join(work, last), frame.png)
      lines.push(`file '${last}'`, `duration ${frame.seconds.toFixed(3)}`)
    }
    // The concat demuxer needs the final file listed again without a duration.
    lines.push(`file '${last}'`)
    await writeFile(join(work, "frames.txt"), lines.join("\n"))
    const input = ["-f", "concat", "-safe", "0", "-i", join(work, "frames.txt")]
    if (output.endsWith(".mp4")) {
      const video = ["-vf", `fps=${VIDEO_FPS},format=yuv420p`, "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-movflags", "+faststart"]
      await execute("ffmpeg", ["-v", "error", "-y", ...input, ...video, output])
      return
    }
    const scale = `fps=${GIF_FPS},scale=${GIF_WIDTH}:-2:flags=lanczos`
    const palette = join(work, "palette.png")
    await execute("ffmpeg", ["-v", "error", "-y", ...input, "-vf", `${scale},palettegen=max_colors=160:stats_mode=diff`, palette])
    await execute("ffmpeg", [
      "-v",
      "error",
      "-y",
      ...input,
      "-i",
      palette,
      "-lavfi",
      `${scale}[frames];[frames][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      "-loop",
      "0",
      output,
    ])
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** Sets up the demo spaces and tabs, then writes the GIFs and screenshots into `dir`, or MP4 clips with `video`. */
export async function captureMedia(zen: Zen, dir: string, video = false): Promise<string[]> {
  await mkdir(dir, { recursive: true })
  const written: string[] = []

  const titles = await zen.run(SETUP, 120000)
  console.error("Demo tabs:", JSON.stringify(titles))

  const clips: Array<[string, Step[]]> = [
    ["hero", HERO],
    ["spaces", SPACES_CLIP],
    ["hints", HINTS],
    ["settings", SETTINGS_CLIP],
    ...(video ? [["feature", FEATURE_CLIP] satisfies [string, Step[]]] : []),
  ]
  for (const [clip, steps] of clips) {
    const frames = await record(zen, steps)
    const name = `${clip}.${video ? "mp4" : "gif"}`
    const output = join(dir, name)
    await encode(frames, output)
    written.push(output)
    console.error(`${name}: ${frames.length} frames`)
  }
  await zen.run(String.raw`Services.prefs.clearUserPref("${SETTING}")`)
  if (video) return written

  const shot = async (name: string) => {
    const path = join(dir, name)
    await writeFile(path, await zen.screenshot())
    written.push(path)
  }

  await zen.run(RESET)
  await zen.run(OPEN + "\n  await sleep(300)")
  await shot("palette.png")

  await zen.run(String.raw`typeQuery("github"); await sleep(150); press("ctrl+k"); await sleep(300)`)
  await shot("actions.png")

  await zen.run(String.raw`await dismiss(); ${OPEN}
    ${key("alt+2", 150)}
    ${key("ctrl+1", 300)}`)
  await shot("targets.png")

  // Ctrl+, is tried first, as a user would; the chrome URL is the fallback if the key does not open it.
  await zen.run(String.raw`await dismiss()
    press("ctrl+,", document.documentElement)
    await sleep(1500)
    if (!gBrowser.selectedBrowser.currentURI.spec.includes("zencast/settings"))
      gBrowser.selectedTab = gBrowser.addTrustedTab("chrome://sine/content/zencast/settings/index.html", { skipAnimation: true })
    const browser = await until(() => gBrowser.selectedBrowser.currentURI.spec.includes("zencast/settings") && gBrowser.selectedBrowser)
    await until(() => browser.contentDocument?.querySelector("nav a"))
    browser.contentWindow.location.hash = "#keys"
    await sleep(400)`)
  await shot("settings.png")

  return written
}
