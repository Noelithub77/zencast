import { z } from "zod"

import { listTabs, loadedBrowser } from "./tabs"
import { systemPrincipal } from "./window"

const CIS_URL = "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs"
const TEMP_PREF = "zencast.tempContainers"

const service = () => ChromeUtils.importESModule(CIS_URL).ContextualIdentityService

export interface Container {
  id: number
  name: string
  color: string
  icon: string
  temporary: boolean
}

// Firefox container colour names mapped onto the pastel palette.
export const CONTAINER_COLORS: Record<string, string> = {
  blue: "#aab4f0",
  turquoise: "#99ffe4",
  green: "#b5d8a6",
  yellow: "#f5e6a8",
  orange: "#ffc799",
  red: "#ff8080",
  pink: "#ffb3d1",
  purple: "#c8b6ff",
  toolbar: "#a0a0a0",
}

const TEMP_COLORS = ["turquoise", "green", "yellow", "orange", "pink", "purple"]

function tempIds(): Set<number> {
  try {
    const parsed = z.array(z.number().int()).safeParse(JSON.parse(Services.prefs.getStringPref(TEMP_PREF, "[]")))
    return new Set(parsed.success ? parsed.data : [])
  } catch {
    return new Set()
  }
}

function saveTempIds(ids: Set<number>) {
  Services.prefs.setStringPref(TEMP_PREF, JSON.stringify([...ids]))
}

export function listContainers(): Container[] {
  const temp = tempIds()
  const cis = service()
  return cis.getPublicIdentities().map((identity) => ({
    id: identity.userContextId,
    name: cis.getUserContextLabel(identity.userContextId),
    color: CONTAINER_COLORS[identity.color] ?? CONTAINER_COLORS.toolbar,
    icon: identity.icon,
    temporary: temp.has(identity.userContextId),
  }))
}

export function containerName(userContextId: number): string {
  return userContextId ? service().getUserContextLabel(userContextId) : "No container"
}

export function openInContainer(win: Window, userContextId: number, url = "about:newtab"): XULTab {
  const tab = win.gBrowser.addTab(url, { triggeringPrincipal: systemPrincipal(), userContextId })
  win.gBrowser.selectedTab = tab
  return tab
}

/** Reopens the tab's page in another container and closes the original. */
export function reopenInContainer(win: Window, tab: XULTab, userContextId: number): XULTab {
  const next = openInContainer(win, userContextId, loadedBrowser(tab).currentURI.spec)
  win.gBrowser.removeTab(tab)
  return next
}

export function createContainer(name: string, color: string, icon = "circle"): number {
  return service().create(name, icon, color).userContextId
}

/** A throwaway container that is deleted, with all its site data, when its last tab closes. */
export function openTemporaryContainer(win: Window, url?: string): XULTab {
  const color = TEMP_COLORS[Math.floor(Math.random() * TEMP_COLORS.length)]
  const id = createContainer(`Temp ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, color, "fingerprint")
  const ids = tempIds()
  ids.add(id)
  saveTempIds(ids)
  return openInContainer(win, id, url)
}

function containerInUse(userContextId: number, closing: XULTab | null): boolean {
  for (const win of Services.wm.getEnumerator("navigator:browser"))
    for (const tab of listTabs(win)) if (tab !== closing && tab.userContextId === userContextId) return true
  return false
}

export function removeContainerWithData(userContextId: number) {
  Services.clearData.deleteDataFromOriginAttributesPattern({ userContextId })
  service().remove(userContextId)
  const ids = tempIds()
  if (ids.delete(userContextId)) saveTempIds(ids)
}

/** Cleans up temporary containers whose last tab is closing, plus any orphaned at startup. */
export function sweepTemporaryContainers(closing: XULTab | null = null) {
  for (const id of tempIds()) if (!containerInUse(id, closing)) removeContainerWithData(id)
}
