import { openInContainer } from "./containers"

export interface SessionCopyResult {
  site: string
  cookies: number
  storage: number
}

function isWebUri(uri: nsIURI): boolean {
  return uri.scheme === "http" || uri.scheme === "https"
}

/** Registrable site for a URI ("mail.google.com" -> "google.com"); falls back to the host for IPs and localhost. */
export function siteOf(uri: nsIURI): string {
  try {
    return Services.eTLD.getSchemelessSite(uri)
  } catch {
    return uri.asciiHost
  }
}

function copyCookies(site: string, from: number, to: number): number {
  let copied = 0
  for (const cookie of Services.cookies.getCookiesWithOriginAttributes(JSON.stringify({ userContextId: from }), site)) {
    const result = Services.cookies.add(
      cookie.host,
      cookie.path,
      cookie.name,
      cookie.value,
      cookie.isSecure,
      cookie.isHttpOnly,
      cookie.isSession,
      cookie.expiry,
      { ...cookie.originAttributes, userContextId: to },
      cookie.sameSite,
      cookie.schemeMap,
      cookie.isPartitioned,
    )
    if (result.result === Ci.nsICookieValidation.eOK) copied++
  }
  return copied
}

// localStorage is read and written from the parent process through the storage manager,
// so no content script is needed. Only the tab's own origin is copied.
function copyLocalStorage(uri: nsIURI, from: number, to: number): number {
  try {
    const ssm = Services.scriptSecurityManager
    const source = ssm.createContentPrincipal(uri, { userContextId: from })
    const target = ssm.createContentPrincipal(uri, { userContextId: to })
    const read = Services.domStorageManager.createStorage(null, source, source, "")
    const write = Services.domStorageManager.createStorage(null, target, target, "")
    for (let i = 0; i < read.length; i++) {
      const key = read.key(i)
      if (key === null) continue
      const value = read.getItem(key)
      if (value !== null) write.setItem(key, value)
    }
    return read.length
  } catch {
    return 0
  }
}

/** Copies the tab site's cookies (including HttpOnly) and the page origin's localStorage into another container. */
export function copySession(tab: XULTab, toUserContextId: number): SessionCopyResult {
  const uri = tab.linkedBrowser.currentURI
  if (!isWebUri(uri)) throw new Error("Only web pages have a session to copy")
  const site = siteOf(uri)
  return {
    site,
    cookies: copyCookies(site, tab.userContextId, toUserContextId),
    storage: copyLocalStorage(uri, tab.userContextId, toUserContextId),
  }
}

function clearSite(site: string, userContextId: number): Promise<void> {
  const flags = Ci.nsIClearDataService
  const mask =
    (flags.CLEAR_COOKIES_AND_SITE_DATA ?? 0) |
    (flags.CLEAR_ALL_CACHES ?? 0) |
    (flags.CLEAR_SITE_PERMISSIONS ?? 0) |
    (flags.CLEAR_DOM_STORAGES ?? 0)
  return new Promise((resolve) => Services.clearData.deleteDataFromSite(site, { userContextId }, true, mask, () => resolve()))
}

/**
 * Copies the session into the target container and opens the page there.
 * In "move" mode the site's data is wiped from the source container and the old tab closes.
 */
export async function transferSession(
  win: Window,
  tab: XULTab,
  toUserContextId: number,
  mode: "copy" | "move",
): Promise<SessionCopyResult> {
  const result = copySession(tab, toUserContextId)
  openInContainer(win, toUserContextId, tab.linkedBrowser.currentURI.spec)
  if (mode === "move") {
    await clearSite(result.site, tab.userContextId)
    win.gBrowser.removeTab(tab)
  }
  return result
}

/**
 * Full tab reset: clears the site's cookies, storage, caches and permissions in the tab's container,
 * drops its back/forward history and reloads from the network.
 */
export async function wipeTab(tab: XULTab): Promise<string> {
  const browser = tab.linkedBrowser
  const uri = browser.currentURI
  const site = isWebUri(uri) ? siteOf(uri) : ""
  if (site) await clearSite(site, tab.userContextId)
  browser.purgeSessionHistory()
  browser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE | Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY)
  return site || uri.spec
}
