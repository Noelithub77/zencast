// Sine shows its settings button only for mods with a preferences.json, which opens a small dialog.
// This adds the same button to Zencast's card in Sine's mod list, opening the settings page instead.
const PREFERENCES = "about:preferences"
const CARD_ACTIONS = '.sineItem[mod-id="zencast"] .sineItemActions'
const BUTTON = "zencast-settings-button"

/** Watches about:preferences pages in this window; about:preferences runs in the parent process. */
export function addSineSettingsButton(win: Window, openSettings: () => void): () => void {
  const observers = new Map<Document, MutationObserver>()

  const decorate = (doc: Document) => {
    const actions = doc.querySelector(CARD_ACTIONS)
    if (!actions || actions.querySelector(`.${BUTTON}`)) return
    const button = doc.createXULElement("button")
    // Sine's own class gives the gear icon and its localized "Open settings" title.
    button.className = `sineItemConfigureButton ${BUTTON}`
    button.setAttribute("data-l10n-id", "sine-settings-button")
    button.setAttribute("data-l10n-attrs", "title")
    button.addEventListener("click", openSettings)
    actions.prepend(button)
  }

  const watch = (doc: Document | null) => {
    if (!doc?.documentURI.startsWith(PREFERENCES) || observers.has(doc)) return
    // Sine rebuilds the list on every change, so the button is added again whenever it disappears.
    const observer = new MutationObserver(() => decorate(doc))
    observer.observe(doc.documentElement, { childList: true, subtree: true })
    observers.set(doc, observer)
    doc.defaultView?.addEventListener("unload", () => {
      observer.disconnect()
      observers.delete(doc)
    }, { once: true })
    decorate(doc)
  }

  // The page's document comes from another global, so it is found through the tabs rather than
  // the event target. Only parent-process pages reach this listener, so loads are rare.
  const scan = () => {
    for (const tab of win.gBrowser.tabs) watch(tab.linkedBrowser?.contentDocument ?? null)
  }
  const onLoad = () => scan()
  win.addEventListener("DOMContentLoaded", onLoad, true)
  scan()

  return () => {
    win.removeEventListener("DOMContentLoaded", onLoad, true)
    for (const [doc, observer] of observers) {
      observer.disconnect()
      for (const button of doc.querySelectorAll(`.${BUTTON}`)) button.remove()
    }
    observers.clear()
  }
}
