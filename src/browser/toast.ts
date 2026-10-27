// Confirmations use Zen's own toast (the one behind "Copied current URL"). It only shows Fluent
// messages, so a one-message Fluent file carries our text as an argument.

const SOURCE = "zencast"
const RESOURCE = "zencast.ftl"
const MESSAGE = "zencast-toast"
const ACTION = "zencast-toast-action"
const BASE = "chrome://sine/content/zencast/locales/"

/** Makes the toast message available in a window. Returns the cleanup for unload. */
export function registerToasts(win: Window): () => void {
  const registry = L10nRegistry.getInstance()
  if (!registry.hasSource(SOURCE))
    registry.registerSources([new L10nFileSource(SOURCE, "app", ["en-US"], `${BASE}{locale}/`, {}, [`${BASE}en-US/${RESOURCE}`])])
  win.document.l10n.addResourceIds([RESOURCE])
  return () => win.document.l10n.removeResourceIds([RESOURCE])
}

export interface ToastAction {
  label: string
  run: () => void
}

export function notify(win: Window, text: string, action?: ToastAction) {
  const doc = win.document
  // Zen reuses a visible toast with the same id rather than stacking a new one, keeping its old
  // label and button, so refresh the label and drop the button before showing.
  const label = doc.querySelector(`.zen-toast label[data-l10n-id="${MESSAGE}"]`)
  if (label) doc.l10n.setAttributes(label, MESSAGE, { text })
  doc.getElementById(ACTION)?.remove()

  void win.gZenUIManager.showToast(MESSAGE, {
    l10nArgs: { text },
    timeout: action ? 5000 : undefined,
    button: action && { id: ACTION, command: action.run },
  })
  const button = action && doc.getElementById(ACTION)
  if (action && button) doc.l10n.setAttributes(button, ACTION, { label: action.label })
}
