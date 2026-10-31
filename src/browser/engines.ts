// The search engines from Zen's settings, with their keywords, for the palette's engine mode: typing
// a keyword ("y") and Tab searches only that engine, as Zen's address bar does.

export interface Engine {
  name: string
  /** Keywords and aliases from Zen's search settings, lower case: "y", "@youtube". */
  aliases: string[]
  icon: string
  /** The icon's main colour as a pastel, so the engine's chip matches its brand without shouting. */
  color: string
}

const FALLBACK_COLOR = "var(--peach)"
// Firefox's SearchUtils.TOPIC_ENGINE_MODIFIED, sent when an engine or its keyword changes.
const TOPIC = "browser-search-engine-modified"

const service = () => ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService

let engines: Engine[] = []

/** One saturation and lightness for every brand, so a loud red tints as gently as a muted blue. */
function pastel(red: number, green: number, blue: number): string {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  if (!delta) return FALLBACK_COLOR
  const hue = max === red ? ((green - blue) / delta + 6) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4
  return `hsl(${Math.round(hue * 60)} 70% 74%)`
}

/** The average of the icon's saturated pixels as a pastel; greys and transparent edges don't count. */
async function iconColor(doc: Document, url: string): Promise<string> {
  if (!url) return FALLBACK_COLOR
  const image = new Image()
  image.src = url
  await image.decode()
  const size = 16
  const canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas")
  if (!(canvas instanceof HTMLCanvasElement)) return FALLBACK_COLOR
  canvas.width = canvas.height = size
  const context = canvas.getContext("2d")
  if (!context) return FALLBACK_COLOR
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
  return weight ? pastel(r / weight, g / weight, b / weight) : FALLBACK_COLOR
}

async function loadEngines(doc: Document) {
  const visible = await service().getVisibleEngines()
  engines = await Promise.all(
    visible.map(async (engine) => {
      const icon = (await engine.getIconURL(32)) ?? ""
      const color = await iconColor(doc, icon).catch(() => FALLBACK_COLOR)
      return { name: engine.name, aliases: engine.aliases.map((alias) => alias.toLowerCase()), icon, color }
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
