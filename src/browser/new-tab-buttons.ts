import { runCommandElement } from "@/browser/window"

// Zen's sidebar "+" buttons run the new-tab command, which Ctrl+T's key binding bypasses, so the
// buttons follow the same choice as the key: the palette when it owns Ctrl+T, Zen's new tab otherwise.
const BUTTONS = "#vertical-tabs-newtab-button, #tabs-newtab-button, .zen-workspace-empty-space"

export function watchNewTabButtons(win: Window, paletteOwnsNewTab: () => boolean, openPalette: () => void): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element) || !event.target.closest(BUTTONS)) return
    event.preventDefault()
    event.stopPropagation()
    if (paletteOwnsNewTab()) openPalette()
    else runCommandElement(win, "cmd_newNavigatorTab")
  }
  win.document.addEventListener("click", onClick, true)
  return () => win.document.removeEventListener("click", onClick, true)
}
