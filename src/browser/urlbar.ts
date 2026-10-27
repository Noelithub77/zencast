// Runs Firefox's own URL bar query engine (history, bookmarks, open tabs, search suggestions)
// so palette results match what Zen's address bar would show.

const RESULT_TYPE = { TAB_SWITCH: 1, SEARCH: 2, URL: 3, KEYWORD: 4 } as const
const RESULT_SOURCE = { BOOKMARKS: 1, HISTORY: 2 } as const

export interface WebResult {
  kind: "url" | "search"
  title: string
  url: string
  /** Search query when kind is "search". */
  query?: string
  engine?: string
  source: "bookmark" | "history" | "tab" | "search" | "suggestion" | "url"
  heuristic: boolean
  /** What the URL bar would complete the typed text to, e.g. "github.com". */
  autofill?: string
}

let manager: UrlbarProvidersManagerInstance | null = null
let QueryContext: GeckoModuleMap["chrome://browser/content/urlbar/UrlbarQueryContext.mjs"]["UrlbarQueryContext"] | null =
  null

function load() {
  manager ??= ChromeUtils.importESModule("moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs")
    .ProvidersManager.getInstanceForSap("urlbar")
  QueryContext ??= ChromeUtils.importESModule("chrome://browser/content/urlbar/UrlbarQueryContext.mjs", {
    global: "current",
  }).UrlbarQueryContext
  return { manager, QueryContext }
}

function toWebResult(result: UrlbarResult): WebResult | null {
  const { payload } = result
  if (result.type === RESULT_TYPE.SEARCH) {
    const query = payload.suggestion ?? payload.query ?? ""
    if (!query) return null
    return {
      kind: "search",
      title: query,
      url: "",
      query,
      engine: payload.engine,
      source: payload.suggestion ? "suggestion" : "search",
      heuristic: result.heuristic,
    }
  }
  if (result.type === RESULT_TYPE.URL || result.type === RESULT_TYPE.KEYWORD || result.type === RESULT_TYPE.TAB_SWITCH) {
    if (!payload.url) return null
    return {
      kind: "url",
      title: payload.title || payload.url,
      url: payload.url,
      source:
        result.type === RESULT_TYPE.TAB_SWITCH
          ? "tab"
          : result.source === RESULT_SOURCE.BOOKMARKS
            ? "bookmark"
            : result.source === RESULT_SOURCE.HISTORY
              ? "history"
              : "url",
      heuristic: result.heuristic,
      autofill: result.autofill?.value.replace(/\/$/, ""),
    }
  }
  return null
}

/** Queries the URL bar providers. Abort the signal to cancel a stale query when the user keeps typing. */
export async function queryWeb(win: Window, searchString: string, signal: AbortSignal, maxResults = 8): Promise<WebResult[]> {
  const { manager, QueryContext } = load()
  const context = new QueryContext({
    allowAutofill: true,
    isPrivate: false,
    maxResults,
    sapName: "urlbar",
    searchString,
    userContextId: win.gBrowser.selectedTab.userContextId,
  })
  const cancel = () => manager.cancelQuery(context)
  signal.addEventListener("abort", cancel, { once: true })
  try {
    await manager.startQuery(context)
  } finally {
    signal.removeEventListener("abort", cancel)
  }
  if (signal.aborted) return []
  const out: WebResult[] = []
  for (const result of context.results) {
    const mapped = toWebResult(result)
    if (mapped) out.push(mapped)
  }
  return out
}

// Firefox 15x dropped Services.search; the service is now a module export.
export function defaultEngine(): Promise<SearchEngine> {
  return ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService.getDefault()
}

export async function searchUrl(query: string): Promise<string> {
  const engine = await defaultEngine()
  return engine.getSubmission(query).uri.spec
}

/** Turns typed text into a URL when it clearly is one ("github.com", "localhost:3000", "https://…"). */
export function typedUrl(text: string): string | null {
  const value = text.trim()
  if (!value || /\s/.test(value)) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^about:/i.test(value)) return value
  if (/^localhost(:\d+)?(\/.*)?$/i.test(value) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(value)) return `http://${value}`
  if (/^[^./]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(value) || /^[^/]+\.[^/]+\.[a-z]{2,}(\/.*)?$/i.test(value)) return `https://${value}`
  return null
}
