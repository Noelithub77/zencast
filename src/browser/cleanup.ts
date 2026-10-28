import { format } from "date-fns"
import { z } from "zod"

import { bookmarkPages, removeFolder } from "./bookmarks"
import { listTabs } from "./tabs"

// Tabs nobody has selected for a week, closed together into a dated bookmark folder.

export const IDLE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const GROUP = "Tab cleanup"

/** Unpinned tabs not selected for a week, oldest first; pinned and essential tabs stay. */
export function idleTabs(win: Window, now = Date.now()): XULTab[] {
  const cutoff = now - IDLE_DAYS * DAY_MS
  return listTabs(win)
    .filter((tab) => !tab.pinned && !tab.selected && !tab.hasAttribute("zen-essential") && tab.lastAccessed < cutoff)
    .sort((a, b) => a.lastAccessed - b.lastAccessed)
}

export const idleDays = (tab: XULTab, now = Date.now()) => Math.floor((now - tab.lastAccessed) / DAY_MS)

const bookmarkable = (url: string) => /^(https?|file):/.test(url)

// The page a tab shows, from its SessionStore state; `index` is 1-based and absent on a fresh tab.
const stateSchema = z.object({
  entries: z.array(z.object({ url: z.string(), title: z.string().optional() })),
  index: z.number().int().optional(),
})

function pageOf(state: string): { title: string; url: string } | null {
  const parsed = stateSchema.safeParse(JSON.parse(state))
  const entries = parsed.success ? parsed.data.entries : []
  const entry = entries[(parsed.data?.index ?? entries.length) - 1]
  return entry && bookmarkable(entry.url) ? { title: entry.title || entry.url, url: entry.url } : null
}

export interface Cleanup {
  /** Each tab's SessionStore state: history, container and space. */
  states: string[]
  /** The bookmark folder holding them, when they were bookmarked. */
  folder?: string
}

/** Closes the tabs, first saving the web pages among them to "Other bookmarks / Tab cleanup / <date>". */
export async function cleanUpTabs(win: Window, tabs: XULTab[], bookmark: boolean): Promise<Cleanup> {
  // A sleeping tab's label can still be "New Tab", so titles come from the saved state.
  const states = tabs.map((tab) => win.SessionStore.getTabState(tab))
  const pages = states.flatMap((state) => pageOf(state) ?? [])
  const folder = bookmark && pages.length ? await bookmarkPages(GROUP, format(Date.now(), "d MMM HH:mm"), pages) : undefined
  for (const tab of tabs) win.gBrowser.removeTab(tab)
  return { states, folder }
}

/**
 * Undoes a cleanup: each tab comes back asleep from its saved state, with its title, history, container
 * and space, as Firefox's duplicate does. Reopening closed tabs instead would select and load each one.
 */
export async function undoCleanup(win: Window, cleanup: Cleanup) {
  for (const state of cleanup.states) win.SessionStore.setTabState(win.gBrowser.addTrustedTab("about:blank", { inBackground: true, skipAnimation: true }), state)
  if (cleanup.folder) await removeFolder(cleanup.folder)
}
