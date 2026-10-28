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

/** True when a web page has focus rather than a field in Zen's own interface. */
export function isPageFocused(win: Window): boolean {
  return win.document.commandDispatcher.focusedElement === win.gBrowser.selectedBrowser
}

/**
 * True when Ctrl+C would copy from a field in Zen's interface, such as the address bar. Pages are
 * not covered: Firefox reports copy as always enabled for them, so ask `pageHasSelection` instead.
 */
export function canCopy(win: Window): boolean {
  return win.document.commandDispatcher.getControllerForCommand("cmd_copy")?.isCommandEnabled("cmd_copy") ?? false
}

const SELECTION_TIMEOUT_MS = 250

/**
 * The text selected in the page, including inside a focused field; Firefox's finder cuts it at 150
 * characters. Null when the page does not answer in time.
 */
export function selectedText(win: Window): Promise<string | null> {
  const finder = win.gBrowser.selectedBrowser.finder
  return new Promise((resolve) => {
    const listener: FinderListener = {
      onCurrentSelection(selection) {
        settle(selection)
      },
    }
    const timer = win.setTimeout(() => settle(null), SELECTION_TIMEOUT_MS)
    const settle = (value: string | null) => {
      win.clearTimeout(timer)
      finder.removeResultListener(listener)
      resolve(value)
    }
    finder.addResultListener(listener)
    finder.getInitialSelection()
  })
}

/** Whether any text is selected; a page that does not answer counts as selected, so Ctrl+C still copies. */
export const pageHasSelection = async (win: Window) => (await selectedText(win)) !== ""

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
