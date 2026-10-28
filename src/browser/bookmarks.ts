// Bookmarks, their folders and keywords, read with one Places query and kept current by Places
// events, so the palette can search them synchronously on open. A keyword with "%s" in its URL is a
// quick link: "gh zencast" fills the query in, as Zen's address bar does.
import { ASSISTANTS } from "@/shared/config"

const places = () => ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs").PlacesUtils

export interface BookmarkFolder {
  guid: string
  title: string
  /** "Bookmarks toolbar / Dev", for telling nested folders apart. */
  path: string
  /** The folder it sits in; null for the toolbar, menu and other roots. */
  parent: string | null
  index: number
}

export interface Bookmark {
  guid: string
  title: string
  url: string
  /** Lower case, or "" when the URL has none. */
  keyword: string
  folder: BookmarkFolder
  /** Position in its folder, so an undo puts it back in place. */
  index: number
}

const ROOT_TITLES: Record<string, string> = {
  toolbar_____: "Bookmarks toolbar",
  menu________: "Bookmarks menu",
  unfiled_____: "Other bookmarks",
  mobile______: "Mobile bookmarks",
}

// A URL can carry more than one keyword; one is enough to show and match.
const QUERY = `SELECT b.id, b.parent, b.guid, b.type, b.title, b.position, p.url,
  (SELECT keyword FROM moz_keywords k WHERE k.place_id = b.fk LIMIT 1) AS keyword
FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk
WHERE b.type IN (1, 2)`

const TYPE_FOLDER = 2

const EVENTS = ["bookmark-added", "bookmark-removed", "bookmark-moved", "bookmark-title-changed", "bookmark-url-changed", "bookmark-keyword-changed"]

// Firefox's star panel remembers its last folder here, as a root alias or a folder guid.
const LAST_FOLDER_PREF = "browser.bookmarks.defaultLocation"

let bookmarks: Bookmark[] = []
let folders: BookmarkFolder[] = []
let byUrl = new Map<string, Bookmark>()
let byKeyword = new Map<string, Bookmark>()

interface Node {
  parent: number
  guid: string
  type: number
  title: string
  position: number
  url: string
  keyword: string
}

const text = (row: MozStorageRow, name: string) => {
  const value = row.getResultByName(name)
  return typeof value === "string" ? value : ""
}

const number = (row: MozStorageRow, name: string) => {
  const value = row.getResultByName(name)
  return typeof value === "number" ? value : 0
}

export async function loadBookmarks() {
  const db = await places().promiseDBConnection()
  const nodes = new Map<number, Node>()
  for (const row of await db.executeCached(QUERY)) {
    nodes.set(number(row, "id"), {
      parent: number(row, "parent"),
      guid: text(row, "guid"),
      type: number(row, "type"),
      title: text(row, "title"),
      position: number(row, "position"),
      url: text(row, "url"),
      keyword: text(row, "keyword").toLowerCase(),
    })
  }

  // The places root and the tags tree resolve to null, which hides them and everything inside.
  const resolved = new Map<number, BookmarkFolder | null>()
  const folderOf = (id: number): BookmarkFolder | null => {
    const known = resolved.get(id)
    if (known !== undefined) return known
    const node = nodes.get(id)
    const rootTitle = node && ROOT_TITLES[node.guid]
    let folder: BookmarkFolder | null = null
    if (node && rootTitle) folder = { guid: node.guid, title: rootTitle, path: rootTitle, parent: null, index: node.position }
    else if (node) {
      const parent = folderOf(node.parent)
      const title = node.title || "Untitled folder"
      if (parent) folder = { guid: node.guid, title, path: `${parent.path} / ${title}`, parent: parent.guid, index: node.position }
    }
    resolved.set(id, folder)
    return folder
  }

  const nextFolders: BookmarkFolder[] = []
  const nextBookmarks: Bookmark[] = []
  for (const [id, node] of nodes) {
    if (node.type === TYPE_FOLDER) {
      const folder = folderOf(id)
      if (folder) nextFolders.push(folder)
      continue
    }
    const folder = node.url ? folderOf(node.parent) : null
    if (folder) nextBookmarks.push({ guid: node.guid, title: node.title || node.url, url: node.url, keyword: node.keyword, folder, index: node.position })
  }
  folders = nextFolders.sort((a, b) => a.path.localeCompare(b.path))
  bookmarks = nextBookmarks
  byUrl = new Map(nextBookmarks.map((bookmark) => [bookmark.url, bookmark]))
  byKeyword = new Map(nextBookmarks.filter((bookmark) => bookmark.keyword).map((bookmark) => [bookmark.keyword, bookmark]))
}

/** Loads bookmarks and reloads them, batched, whenever Places reports a change. */
export function watchBookmarks(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const report = (error: unknown) => console.error("[zencast] bookmarks", error)
  const reload = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void loadBookmarks().catch(report), 100)
  }
  void loadBookmarks().catch(report)
  places().observers.addListener(EVENTS, reload)
  return () => {
    if (timer) clearTimeout(timer)
    places().observers.removeListener(EVENTS, reload)
  }
}

export const allBookmarks = () => bookmarks
export const bookmarkFolders = () => folders
export const findBookmark = (url: string) => byUrl.get(url)

const byIndex = (a: { index: number }, b: { index: number }) => a.index - b.index

/** What a folder holds directly, in its own order; the roots for null. */
export function folderContents(guid: string | null): { folders: BookmarkFolder[]; bookmarks: Bookmark[] } {
  return {
    folders: folders.filter((folder) => folder.parent === guid).sort(byIndex),
    bookmarks: guid ? bookmarks.filter((bookmark) => bookmark.folder.guid === guid).sort(byIndex) : [],
  }
}
export const keywordBookmark = (keyword: string) => byKeyword.get(keyword.toLowerCase())

/** A keyword is one lower-case word; anything after the first space is dropped. */
export const normalizeKeyword = (value: string) => value.trim().split(/\s+/)[0]?.toLowerCase() ?? ""

/** The URL has a "%s" slot for a query. */
export const takesQuery = (url: string) => /%s/i.test(url)

/** Fills a quick link's slot as the address bar does: %s encoded, %S as typed. */
export const fillQuery = (url: string, query: string) =>
  url.replaceAll("%s", encodeURIComponent(query)).replaceAll("%S", query)

export function lastFolder(): BookmarkFolder | undefined {
  const api = places().bookmarks
  const value = Services.prefs.getStringPref(LAST_FOLDER_PREF, "toolbar")
  const aliases: Record<string, string> = { toolbar: api.toolbarGuid, menu: api.menuGuid, unfiled: api.unfiledGuid }
  const guid = aliases[value] ?? value
  return folders.find((folder) => folder.guid === guid) ?? folders.find((folder) => folder.guid === api.toolbarGuid)
}

export interface NewBookmark {
  url: string
  title: string
  folder: BookmarkFolder
  keyword: string
}

export async function addBookmark({ url, title, folder, keyword }: NewBookmark): Promise<string> {
  const { bookmarks: api, keywords } = places()
  const { guid } = await api.insert({ parentGuid: folder.guid, url, title })
  if (keyword) await keywords.insert({ keyword, url })
  Services.prefs.setStringPref(LAST_FOLDER_PREF, folder.guid)
  await loadBookmarks()
  return guid
}

export interface BookmarkChange {
  title?: string
  url?: string
  folder?: BookmarkFolder
  /** Position in the new folder; the end when left out. */
  index?: number
  keyword?: string
}

export async function editBookmark(bookmark: Bookmark, change: BookmarkChange) {
  const { bookmarks: api, keywords } = places()
  const url = change.url ?? bookmark.url
  const keyword = change.keyword ?? bookmark.keyword
  // A keyword belongs to a URL, not a bookmark, so a new URL takes the keyword along.
  const rekey = keyword !== bookmark.keyword || url !== bookmark.url
  if (rekey && bookmark.keyword) await keywords.remove(bookmark.keyword)
  // Places rejects a property that is present but undefined.
  if (change.title !== undefined) await api.update({ guid: bookmark.guid, title: change.title })
  if (change.url !== undefined) await api.update({ guid: bookmark.guid, url: change.url })
  if (change.folder) {
    await api.update({ guid: bookmark.guid, parentGuid: change.folder.guid, index: change.index ?? api.DEFAULT_INDEX })
    if (change.index === undefined) Services.prefs.setStringPref(LAST_FOLDER_PREF, change.folder.guid)
  }
  if (rekey && keyword) await keywords.insert({ keyword, url })
  await loadBookmarks()
}

export async function removeBookmark(bookmark: Bookmark) {
  await places().bookmarks.remove(bookmark.guid)
  await loadBookmarks()
}

/** Puts a removed bookmark back where it was, with its keyword. */
export async function restoreBookmark({ url, title, folder, keyword, index }: Bookmark) {
  const { bookmarks: api, keywords } = places()
  await api.insert({ parentGuid: folder.guid, url, title, index })
  if (keyword) await keywords.insert({ keyword, url })
  await loadBookmarks()
}

const STARTERS = [
  { keyword: "gh", title: "GitHub", url: "https://github.com/search?q=%s" },
  { keyword: "yt", title: "YouTube", url: "https://www.youtube.com/results?search_query=%s" },
  { keyword: "wiki", title: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search=%s" },
  { keyword: "mdn", title: "MDN", url: "https://developer.mozilla.org/search?q=%s" },
  { keyword: "npm", title: "npm", url: "https://www.npmjs.com/search?q=%s" },
  { keyword: "maps", title: "Google Maps", url: "https://www.google.com/maps/search/%s" },
  ...ASSISTANTS,
  { keyword: "cf", title: "Cloudflare dashboard", url: "https://dash.cloudflare.com/" },
]

const STARTER_FOLDER = "Quick links"

/** The folder "Other bookmarks / <title>", created when missing. */
async function otherFolder(title: string): Promise<string> {
  const api = places().bookmarks
  const existing = folders.find((folder) => folder.path === `${ROOT_TITLES[api.unfiledGuid]} / ${title}`)
  return existing?.guid ?? (await api.insert({ parentGuid: api.unfiledGuid, type: api.TYPE_FOLDER, title })).guid
}

/** Saves pages into a new folder at "Other bookmarks / <group> / <title>" and returns its guid. */
export async function bookmarkPages(group: string, title: string, pages: { title: string; url: string }[]): Promise<string> {
  const api = places().bookmarks
  const { guid } = await api.insert({ parentGuid: await otherFolder(group), type: api.TYPE_FOLDER, title })
  for (const page of pages) await api.insert({ parentGuid: guid, url: page.url, title: page.title })
  await loadBookmarks()
  return guid
}

/** Removes a folder and everything in it. */
export async function removeFolder(guid: string) {
  await places().bookmarks.remove(guid)
  await loadBookmarks()
}

/** Adds the starter quick links to "Other bookmarks / Quick links", leaving taken keywords alone. */
export async function addStarterQuickLinks(): Promise<{ added: number; skipped: string[] }> {
  const { bookmarks: api, keywords } = places()
  const skipped = STARTERS.filter((starter) => byKeyword.has(starter.keyword)).map((starter) => starter.keyword)
  const missing = STARTERS.filter((starter) => !byKeyword.has(starter.keyword))
  if (!missing.length) return { added: 0, skipped }
  const parentGuid = await otherFolder(STARTER_FOLDER)
  for (const starter of missing) {
    await api.insert({ parentGuid, url: starter.url, title: starter.title })
    await keywords.insert({ keyword: starter.keyword, url: starter.url })
  }
  await loadBookmarks()
  return { added: missing.length, skipped }
}
