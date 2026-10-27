// Helpers shared by every browser operation. Operations take the target window explicitly so the
// palette (its own window) and the settings tab (most recent browser window) reuse them.

export function browserWindow(): Window {
  if ("gBrowser" in window && window.gBrowser) return window
  const recent = Services.wm.getMostRecentWindow("navigator:browser")
  if (!recent) throw new Error("No browser window is open")
  return recent
}

function isCommandElement(element: Element | null): element is XULCommandElement {
  return !!element && "doCommand" in element && typeof element.doCommand === "function"
}

/** Runs a XUL <command> or <key> by id. Returns false when it does not exist in this window. */
export function runCommandElement(win: Window, id: string): boolean {
  const element = win.document.getElementById(id)
  if (!isCommandElement(element)) return false
  element.doCommand()
  return true
}

export function systemPrincipal(): nsIPrincipal {
  return Services.scriptSecurityManager.getSystemPrincipal()
}

export function openUrl(
  win: Window,
  url: string,
  where: "current" | "tab",
  userContextId?: number,
) {
  win.openTrustedLinkIn(url, where, userContextId === undefined ? {} : { userContextId })
}
