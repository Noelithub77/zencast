// Browsing history, newest first, and the tabs closed recently enough for SessionStore to reopen.
// History is matched in Places' own database, so a search reaches every visited page without
// loading tens of thousands of rows into the window.
import { entryOf } from "./tabs"

const places = () => ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs").PlacesUtils

export interface Visit {
  url: string
  title: string
  /** Last visit, in milliseconds. */
  visited: number
}

export interface ClosedTab {
  /** SessionStore's id, which reopens the tab with its back history and container. */
  id: number
  url: string
  title: string
  closed: number
}

const LIMIT = 300

// Each word must appear in the URL or the title; LIKE ignores ASCII case.
const historyQuery = (words: number) => `SELECT url, title, last_visit_date FROM moz_places
WHERE hidden = 0 AND last_visit_date NOT NULL${Array.from({ length: words }, (_, i) => `\n  AND (url || ' ' || IFNULL(title, '')) LIKE :w${i} ESCAPE '\\'`).join("")}
ORDER BY last_visit_date DESC LIMIT ${LIMIT}`

const escapeLike = (word: string) => `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/** The most recently visited pages matching every word of the text, newest first. */
export async function searchHistory(text: string): Promise<Visit[]> {
  const words = text.split(/\s+/).filter(Boolean)
  const params = Object.fromEntries(words.map((word, i) => [`w${i}`, escapeLike(word)]))
  const db = await places().promiseDBConnection()
  const visits: Visit[] = []
  for (const row of await db.executeCached(historyQuery(words.length), params)) {
    const url = row.getResultByName("url")
    const title = row.getResultByName("title")
    const visited = row.getResultByName("last_visit_date")
    if (typeof url !== "string" || typeof visited !== "number") continue
    visits.push({ url, title: typeof title === "string" ? title : "", visited: Math.floor(visited / 1000) })
  }
  return visits
}

/** Tabs closed in any window, most recent first. */
export function closedTabs(win: Window): ClosedTab[] {
  const tabs: ClosedTab[] = []
  for (const data of win.SessionStore.getClosedTabData()) {
    const entry = entryOf(data.state)
    if (!entry) continue
    tabs.push({ id: data.closedId, url: entry.url, title: data.title || entry.title || entry.url, closed: data.closedAt })
  }
  return tabs.sort((a, b) => b.closed - a.closed)
}

export function reopenClosedTab(win: Window, id: number) {
  win.SessionStore.undoCloseById(id, true, win)
}
