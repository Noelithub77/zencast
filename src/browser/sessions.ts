import { differenceInCalendarDays, format } from "date-fns"
import { z } from "zod"

import { listContainers } from "./containers"
import { describeTab, listTabs } from "./tabs"
import { systemPrincipal } from "./window"

// Every run of Zen is a session, named by its start time. Its windows' tabs are saved to one file
// per session, so a past session's tabs can be picked back. Files older than a week are removed.

const KEEP_MS = 7 * 24 * 60 * 60 * 1000
const WINDOW_KEY = "zencast-window"
const CHANGED_TOPIC = "zencast-sessions-changed"

const tabSchema = z.object({
  title: z.string(),
  url: z.string(),
  userContextId: z.number().int(),
  space: z.string().optional(),
  icon: z.string().optional(),
})

const windowSchema = z.object({
  id: z.string(),
  opened: z.number(),
  closed: z.number().optional(),
  spaces: z.record(z.string(), z.string()),
  tabs: z.array(tabSchema),
})

const sessionSchema = z.object({ start: z.number(), updated: z.number(), windows: z.array(windowSchema) })

export type SavedTab = z.infer<typeof tabSchema>
export type SavedWindow = z.infer<typeof windowSchema>
export type Session = z.infer<typeof sessionSchema>

const sessionsDir = () => PathUtils.join(PathUtils.profileDir, "zencast", "sessions")
const sessionPath = (start: number) => PathUtils.join(sessionsDir(), `${start}.json`)

/** "Today 14:22", "Yesterday 09:10", "Monday 18:05", then "26 Oct 18:05"; always 24-hour. */
export function sessionTime(ms: number, now = Date.now()): string {
  const days = differenceInCalendarDays(now, ms)
  const time = format(ms, "HH:mm")
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Yesterday ${time}`
  if (days < 7) return `${format(ms, "EEEE")} ${time}`
  return `${format(ms, "d MMM")} ${time}`
}

export function tabCount(session: Session): number {
  return session.windows.reduce((sum, win) => sum + win.tabs.length, 0)
}

/** When this run of Zen started. */
export function sessionStart(): number {
  return Services.startup.getStartupInfo().process?.getTime() ?? Date.now()
}

/** A window's id, kept by SessionStore so it survives a restart. */
function windowId(win: Window): string {
  const known = win.SessionStore.getCustomWindowValue(win, WINDOW_KEY)
  if (known) return known
  const id = crypto.randomUUID()
  win.SessionStore.setCustomWindowValue(win, WINDOW_KEY, id)
  return id
}

function saveable(url: string): boolean {
  return !/^about:(blank|newtab|home)$/.test(url)
}

// A sleeping tab's browser still reports the URL it will load, so every tab is read live.
function snapshotWindow(win: Window, previous: SavedWindow | undefined): SavedWindow {
  const tabs = listTabs(win).flatMap((tab): SavedTab[] => {
    const { title, url, workspaceId, userContextId } = describeTab(tab)
    const image = tab.getAttribute("image")
    if (!url || !saveable(url)) return []
    return [{ title: title || url, url, userContextId, space: workspaceId ?? undefined, icon: image?.startsWith("data:") ? undefined : (image ?? undefined) }]
  })
  const spaces = Object.fromEntries(win.gZenWorkspaces.getWorkspaces().map((space) => [space.uuid, space.name]))
  return { id: windowId(win), opened: previous?.opened ?? Date.now(), spaces, tabs }
}

async function readSession(path: string): Promise<Session | null> {
  try {
    const parsed = sessionSchema.safeParse(await IOUtils.readJSON(path))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Saves every open window into this session's file; windows closed earlier keep their last tabs. */
export async function saveSession() {
  const start = sessionStart()
  const path = sessionPath(start)
  const now = Date.now()
  const before = new Map((await readSession(path))?.windows.map((win) => [win.id, win]))
  const open = [...Services.wm.getEnumerator("navigator:browser")].filter((win) => win.gBrowser)
  const windows = open.map((win) => snapshotWindow(win, before.get(windowId(win))))
  const openIds = new Set(windows.map((win) => win.id))
  for (const old of before.values()) if (!openIds.has(old.id)) windows.push({ ...old, closed: old.closed ?? now })
  const session: Session = { start, updated: now, windows: windows.filter((win) => win.tabs.length) }
  await IOUtils.makeDirectory(sessionsDir(), { ignoreExisting: true, createAncestors: true })
  await IOUtils.writeJSON(path, session, { tmpPath: `${path}.tmp` })
  Services.obs.notifyObservers(null, CHANGED_TOPIC)
}

/** Saved sessions, newest first. */
export async function listSessions(): Promise<Session[]> {
  const files = await IOUtils.getChildren(sessionsDir(), { ignoreAbsent: true })
  const sessions = await Promise.all(files.filter((file) => file.endsWith(".json")).map(readSession))
  return sessions.filter((session) => session !== null).sort((a, b) => b.start - a.start)
}

export function onSessionsChange(listener: () => void): () => void {
  const observer = { observe: listener }
  Services.obs.addObserver(observer, CHANGED_TOPIC)
  return () => Services.obs.removeObserver(observer, CHANGED_TOPIC)
}

async function pruneSessions() {
  const cutoff = Date.now() - KEEP_MS
  for (const file of await IOUtils.getChildren(sessionsDir(), { ignoreAbsent: true })) {
    const start = Number(PathUtils.filename(file).replace(/\.json$/, ""))
    if (Number.isFinite(start) && start < cutoff) await IOUtils.remove(file)
  }
}

/** Opens saved tabs in the window's current space, in their container when it still exists. */
export function openSavedTabs(win: Window, tabs: SavedTab[], select = false) {
  const containers = new Set(listContainers().map((container) => container.id))
  let first: XULTab | null = null
  for (const tab of tabs) {
    const userContextId = containers.has(tab.userContextId) ? tab.userContextId : 0
    const opened = win.gBrowser.addTab(tab.url, { triggeringPrincipal: systemPrincipal(), userContextId, inBackground: true })
    first ??= opened
  }
  if (select && first) win.gBrowser.selectedTab = first
}

/**
 * Keeps this session's file current: the most recent window saves every window after each
 * SessionStore write (which runs at most every 15 seconds, and only on changes) and when Zen quits.
 * Saves run one at a time. Old sessions are pruned once per window.
 */
export function watchSessions(win: Window): () => void {
  let queue = Promise.resolve()
  const save = () => {
    if (Services.wm.getMostRecentWindow("navigator:browser") !== win) return
    queue = queue.then(saveSession).catch((error: unknown) => console.error("[zencast] session save", error))
  }
  const observer = { observe: save }
  Services.obs.addObserver(observer, "sessionstore-state-write-complete")
  Services.obs.addObserver(observer, "quit-application-granted")
  pruneSessions().catch((error: unknown) => console.error("[zencast] session prune", error))
  return () => {
    Services.obs.removeObserver(observer, "sessionstore-state-write-complete")
    Services.obs.removeObserver(observer, "quit-application-granted")
  }
}
