// The search engines from Zen's settings, with their keywords, for the palette's engine mode: typing
// a keyword ("y") and Tab searches only that engine, as Zen's address bar does.

export interface Engine {
  name: string
  /** Keywords and aliases from Zen's search settings, lower case: "y", "@youtube". */
  aliases: string[]
  icon: string
  /** The icon's main colour as a pastel, so the engine's chip matches its brand without shouting. */
  color: string
  /** A deep, rich tone of the same hue for the glow behind the header, which a pastel would grey. */
  glow: string
}

const FALLBACK = { color: "var(--peach)", glow: "oklch(0.4 0.14 50)" }
// Firefox's SearchUtils.TOPIC_ENGINE_MODIFIED, sent when an engine or its keyword changes.
const TOPIC = "browser-search-engine-modified"

const service = () => ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService

let engines: Engine[] = []

const linear = (channel: number) => (channel <= 10.31 ? channel / 3294.6 : ((channel / 255 + 0.055) / 1.055) ** 2.4)

/**
 * The colour's OKLCH hue at one lightness and chroma per tone, so every brand looks equally bright: a loud
 * red tints as gently as a muted blue, and green no brighter than either.
 */
function tones(red: number, green: number, blue: number): Pick<Engine, "color" | "glow"> {
  const [r, g, b] = [red, green, blue].map(linear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const labA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  if (Math.hypot(labA, labB) < 0.02) return FALLBACK
  const hue = Math.round(((Math.atan2(labB, labA) * 180) / Math.PI + 360) % 360)
  return { color: `oklch(0.82 0.085 ${hue})`, glow: `oklch(0.4 0.14 ${hue})` }
}

/** Tones of the average of the icon's saturated pixels; greys and transparent edges don't count. */
async function iconTones(doc: Document, url: string): Promise<Pick<Engine, "color" | "glow">> {
  if (!url) return FALLBACK
  const image = new Image()
  image.src = url
  await image.decode()
  const size = 16
  const canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas")
  if (!(canvas instanceof HTMLCanvasElement)) return FALLBACK
  canvas.width = canvas.height = size
  const context = canvas.getContext("2d")
  if (!context) return FALLBACK
  context.drawImage(image, 0, 0, size, size)
  const { data } = context.getImageData(0, 0, size, size)
  let r = 0, g = 0, b = 0, weight = 0
  for (let i = 0; i < data.length; i += 4) {
    const [red = 0, green = 0, blue = 0, alpha = 0] = data.slice(i, i + 4)
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue)
    if (alpha < 128 || saturation < 40) continue
    r += red * saturation
    g += green * saturation
    b += blue * saturation
    weight += saturation
  }
  return weight ? tones(r / weight, g / weight, b / weight) : FALLBACK
}

async function loadEngines(doc: Document) {
  const visible = await service().getVisibleEngines()
  engines = await Promise.all(
    visible.map(async (engine) => {
      const icon = (await engine.getIconURL(32)) ?? ""
      const { color, glow } = await iconTones(doc, icon).catch(() => FALLBACK)
      return { name: engine.name, aliases: engine.aliases.map((alias) => alias.toLowerCase()), icon, color, glow }
    }),
  )
}

/** Loads the engines at idle and again whenever one changes in settings. */
export function watchEngines(win: Window): () => void {
  const report = (error: unknown) => console.error("[zencast] search engines", error)
  const reload = () => void loadEngines(win.document).catch(report)
  const handle = win.requestIdleCallback(reload)
  const observer = { observe: reload }
  Services.obs.addObserver(observer, TOPIC)
  return () => {
    win.cancelIdleCallback(handle)
    Services.obs.removeObserver(observer, TOPIC)
  }
}

export const allEngines = () => engines

/** The engine whose keyword, alias or name is exactly the typed text. */
export function engineFor(text: string): Engine | undefined {
  const typed = text.trim().toLowerCase()
  return typed ? engines.find((engine) => engine.aliases.includes(typed) || engine.name.toLowerCase() === typed) : undefined
}

export function engineSearchUrl(engine: Engine, query: string): string {
  const found = service().getEngineByName(engine.name)
  if (!found) throw new Error(`${engine.name} is no longer a search engine`)
  return found.getSubmission(query).uri.spec
}
