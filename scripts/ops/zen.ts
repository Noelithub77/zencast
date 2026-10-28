// Launches an isolated headless Zen on a throwaway profile and drives its chrome window over
// Marionette. Sine's engine is copied from the real profile; nothing in that profile is written.
import { spawn, type ChildProcess } from "node:child_process"
import { createWriteStream } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer, Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { MOD_ID } from "./profile.ts"

export const ZEN_BIN = "/opt/zen-browser-bin/zen-bin"

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }

/** Minimal Marionette client: length-prefixed JSON, `[0, id, name, params]` → `[1, id, error, result]`. */
export class Marionette {
  #socket: Socket
  #buffer = Buffer.alloc(0)
  #id = 0
  #pending = new Map<number, Pending>()

  private constructor(socket: Socket) {
    this.#socket = socket
    socket.on("data", (chunk: Buffer) => this.#read(chunk))
    socket.on("close", () => {
      for (const pending of this.#pending.values()) pending.reject(new Error("Zen closed the Marionette connection"))
      this.#pending.clear()
    })
  }

  static async connect(port: number, timeoutMs: number): Promise<Marionette> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      try {
        const socket = await new Promise<Socket>((resolve, reject) => {
          const s = new Socket()
          s.once("error", reject)
          s.connect(port, "127.0.0.1", () => resolve(s))
        })
        return new Marionette(socket)
      } catch (error) {
        if (Date.now() > deadline) throw new Error(`Marionette did not start on port ${port}`, { cause: error })
        await sleep(250)
      }
    }
  }

  #read(chunk: Buffer) {
    this.#buffer = Buffer.concat([this.#buffer, chunk])
    for (;;) {
      const colon = this.#buffer.indexOf(":")
      if (colon < 0) return
      // The length prefix counts bytes, so the frame is cut from the raw buffer before decoding.
      const length = Number(this.#buffer.subarray(0, colon).toString("ascii"))
      if (this.#buffer.length < colon + 1 + length) return
      const body = this.#buffer.subarray(colon + 1, colon + 1 + length).toString("utf8")
      this.#buffer = this.#buffer.subarray(colon + 1 + length)
      const message: unknown = JSON.parse(body)
      if (!Array.isArray(message)) continue // The greeting.
      const [, id, error, result] = message
      const pending = this.#pending.get(id)
      if (!pending) continue
      this.#pending.delete(id)
      if (error) pending.reject(new Error(typeof error.message === "string" ? `${error.error}: ${error.message}` : JSON.stringify(error)))
      else pending.resolve(result)
    }
  }

  /** Rejects after `timeoutMs` even if Zen never answers, e.g. when a modal dialog blocks it. */
  send(name: string, params: Record<string, unknown> = {}, timeoutMs = 60000): Promise<unknown> {
    const id = ++this.#id
    const body = JSON.stringify([0, id, name, params])
    this.#socket.write(`${Buffer.byteLength(body)}:${body}`)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`${name} got no answer within ${timeoutMs} ms`))
      }, timeoutMs)
      this.#pending.set(id, {
        resolve: (value) => (clearTimeout(timer), resolve(value)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      })
    })
  }

  close() {
    this.#socket.destroy()
  }
}

// Shared helpers for scripts run in the browser window.
const PRELUDE = String.raw`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() > end) throw new Error("Timed out waiting for " + fn.toString().slice(0, 120))
    await sleep(15)
  }
}
const shadow = () => document.getElementById("zencast-host")?.shadowRoot
const paletteOpen = () => {
  const layer = shadow()?.querySelector("[cmdk-root]")?.parentElement?.parentElement
  return !!layer && !layer.hidden
}
const deepActive = () => {
  let el = document.activeElement
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
  return el
}
const CODES = { ",": "Comma", ".": "Period", "/": "Slash", tab: "Tab", enter: "Enter", escape: "Escape", up: "ArrowUp", down: "ArrowDown", backspace: "Backspace", space: "Space" }
const press = (combo, target) => {
  const parts = combo.split("+")
  const key = parts.pop()
  const code = /^\d$/.test(key) ? "Digit" + key : /^[a-z]$/.test(key) ? "Key" + key.toUpperCase() : CODES[key]
  const init = {
    key: key.length === 1 ? key : code,
    code,
    ctrlKey: parts.includes("ctrl"),
    altKey: parts.includes("alt"),
    shiftKey: parts.includes("shift"),
    metaKey: parts.includes("meta"),
    bubbles: true,
    cancelable: true,
    composed: true,
  }
  const el = target ?? deepActive() ?? document.documentElement
  const down = new KeyboardEvent("keydown", init)
  el.dispatchEvent(down)
  el.dispatchEvent(new KeyboardEvent("keyup", init))
  // Lets a test see whether a handler took the key.
  return down
}
// Trusted key events, which Zen's own <key> shortcuts need; synthetic ones never trigger them.
const pressTrusted = (combo) => {
  const tip = Cc["@mozilla.org/text-input-processor;1"].createInstance(Ci.nsITextInputProcessor)
  tip.beginInputTransactionForTests(window)
  const parts = combo.split("+")
  const key = parts.pop()
  const MODS = { ctrl: ["Control", "ControlLeft", 17], alt: ["Alt", "AltLeft", 18], shift: ["Shift", "ShiftLeft", 16] }
  const mods = parts.map((m) => new KeyboardEvent("", { key: MODS[m][0], code: MODS[m][1], keyCode: MODS[m][2] }))
  const main = new KeyboardEvent("", { key, code: "Key" + key.toUpperCase(), keyCode: key.toUpperCase().charCodeAt(0) })
  for (const mod of mods) tip.keydown(mod)
  tip.keydown(main)
  tip.keyup(main)
  for (const mod of mods.reverse()) tip.keyup(mod)
}
const typeQuery = (text) => {
  const input = shadow().querySelector("[cmdk-input]")
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, text)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}
// Esc first clears the query, then pops a view, then closes; each step needs a render.
const dismiss = async () => {
  for (let i = 0; i < 6 && paletteOpen(); i++) {
    press("escape")
    await sleep(80)
  }
  if (paletteOpen()) {
    const el = deepActive()
    throw new Error("Palette did not close; focus on " + (el ? el.tagName + " " + (el.getAttribute("placeholder") ?? "") : "nothing"))
  }
}
const resultTitles = () => [...shadow().querySelectorAll("[cmdk-item]")].map((item) => item.textContent)
const newTab = (url = "about:blank") => {
  const tab = gBrowser.addTrustedTab(url, { skipAnimation: true })
  gBrowser.selectedTab = tab
  return tab
}
const toastText = () =>
  [...document.querySelectorAll(".zen-toast label")].map((label) => label.textContent.replace(/[⁨⁩]/g, "")).join(" | ")
`

export interface Zen {
  profile: string
  log: string
  /** Runs an async function body in the browser window and returns its JSON result. */
  run(body: string, timeoutMs?: number): Promise<unknown>
  screenshot(): Promise<Buffer>
  stop(): Promise<void>
}

async function makeProfile(sourceProfile: string, dist: string, port: number): Promise<string> {
  const profile = await mkdtemp(join(tmpdir(), "zencast-e2e-"))
  const chrome = join(profile, "chrome")
  await mkdir(join(chrome, "sine-mods"), { recursive: true })
  for (const dir of ["JS", "utils"]) await cp(join(sourceProfile, "chrome", dir), join(chrome, dir), { recursive: true })
  await cp(dist, join(chrome, "sine-mods", MOD_ID), { recursive: true })
  const theme: unknown = JSON.parse(await readFile(join(dist, "theme.json"), "utf8"))
  const entry = typeof theme === "object" && theme ? { ...theme, enabled: true, "no-updates": true } : {}
  await writeFile(join(chrome, "sine-mods", "mods.json"), JSON.stringify({ [MOD_ID]: entry }))
  const prefs: Record<string, string | number | boolean> = {
    "marionette.port": port,
    // Local test fixture only: lets Sine load the mod's script in this throwaway profile.
    "sine.allow-unsafe-js": true,
    "sine.auto-updates": false,
    "sine.engine.auto-update": false,
    "toolkit.legacyUserProfileCustomizations.stylesheets": true,
    "browser.shell.checkDefaultBrowser": false,
    "browser.startup.homepage_override.mstone": "ignore",
    "browser.aboutwelcome.enabled": false,
    "zen.welcome-screen.seen": true,
    "datareporting.policy.dataSubmissionEnabled": false,
    "toolkit.telemetry.reportingpolicy.firstRun": false,
    "browser.tabs.warnOnClose": false,
    "app.update.disabledForTesting": true,
    // Chrome console messages (including mod errors) go to zen.log.
    "devtools.console.stdout.chrome": true,
  }
  await writeFile(
    join(profile, "user.js"),
    Object.entries(prefs)
      .map(([name, value]) => `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`)
      .join("\n"),
  )
  return profile
}

export async function launchZen(options: { sourceProfile: string; dist: string; width?: number; height?: number }): Promise<Zen> {
  const port = await freePort()
  const profile = await makeProfile(options.sourceProfile, options.dist, port)
  const log = join(profile, "zen.log")
  const out = createWriteStream(log)
  const child: ChildProcess = spawn(
    ZEN_BIN,
    ["--headless", "--marionette", "--remote-allow-system-access", "--no-remote", "--profile", profile],
    {
      env: {
        ...process.env,
        MOZ_HEADLESS: "1",
        MOZ_HEADLESS_WIDTH: String(options.width ?? 1400),
        MOZ_HEADLESS_HEIGHT: String(options.height ?? 900),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  child.stdout?.pipe(out)
  child.stderr?.pipe(out)

  const stop = async () => {
    marionette?.close()
    child.kill("SIGTERM")
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(5000)])
    if (child.exitCode === null) child.kill("SIGKILL")
  }

  let marionette: Marionette | undefined
  try {
    marionette = await Marionette.connect(port, 30000)
    await marionette.send("WebDriver:NewSession", { capabilities: { alwaysMatch: { "moz:accessibilityChecks": false } } })
    await marionette.send("Marionette:SetContext", { value: "chrome" })
  } catch (error) {
    await stop()
    throw new Error(`Zen did not start; see ${log}`, { cause: error })
  }
  const client = marionette

  return {
    profile,
    log,
    async run(body, timeoutMs = 30000) {
      await client.send("WebDriver:SetTimeouts", { script: timeoutMs })
      const script = `${PRELUDE}
const done = arguments[arguments.length - 1]
;(async () => { ${body} })().then(
  (value) => done(JSON.stringify(value ?? null)),
  // SpiderMonkey stacks omit the message, so send both.
  (error) => done(JSON.stringify({ __error: String(error) + "\\n" + (error?.stack ?? "") })),
)`
      const response = await client.send("WebDriver:ExecuteAsyncScript", { script, args: [] }, timeoutMs + 10000)
      const raw = typeof response === "object" && response && "value" in response ? response.value : response
      const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw
      if (typeof value === "object" && value && "__error" in value) throw new Error(String(value.__error))
      return value
    },
    async screenshot() {
      const response = await client.send("WebDriver:TakeScreenshot", { full: false, hash: false })
      const data = typeof response === "object" && response && "value" in response ? response.value : response
      if (typeof data !== "string") throw new Error("Screenshot returned no data")
      return Buffer.from(data, "base64")
    },
    stop,
  }
}

export async function removeProfile(profile: string) {
  await rm(profile, { recursive: true, force: true })
}
