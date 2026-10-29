import { loadedBrowser } from "./tabs"
import { systemPrincipal } from "./window"

const CIS_URL = "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs"

const service = () => ChromeUtils.importESModule(CIS_URL).ContextualIdentityService

export interface Container {
  id: number
  name: string
  color: string
  icon: string
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

export function listContainers(): Container[] {
  const cis = service()
  return cis.getPublicIdentities().map((identity) => ({
    id: identity.userContextId,
    name: cis.getUserContextLabel(identity.userContextId),
    color: CONTAINER_COLORS[identity.color] ?? CONTAINER_COLORS.toolbar,
    icon: identity.icon,
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
