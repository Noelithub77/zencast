// Mod entry: Sine imports this module once per browser window.
import { watchBookmarks } from "@/browser/bookmarks"
import { sweepTemporaryContainers } from "@/browser/containers"
import { isTab } from "@/browser/folders"
import { addSineSettingsButton } from "@/browser/sine-card"
import { registerToasts } from "@/browser/toast"
import { openSettings } from "@/commands/catalog"
import { buildIndex } from "@/keys/bindings"
import { startKeyEngine } from "@/keys/engine"
import { closePalette, commandContext, disposeController, initController, openPalette, runCommand } from "@/palette/controller"
import { mountPalette } from "@/palette/host"
import { perfSnapshot } from "@/palette/perf"
import { getState, setState } from "@/palette/store"
import { onConfigChange, readConfig } from "@/shared/config"

function start(win: Window): () => void {
  const disposers: Array<() => void> = []
  initController(win)
  disposers.push(disposeController, registerToasts(win), watchBookmarks())

  let index = buildIndex(readConfig())
  let recording = false
  disposers.push(onConfigChange((config) => (index = buildIndex(config))))

  disposers.push(
    startKeyEngine(win, {
      index: () => index,
      context: commandContext,
      paused: () => recording || getState().open,
      dispatch: (command) => void runCommand(command),
      onChord: (chord) => setState({ chord }),
    }),
  )

  // Mounting is the slowest step, so it happens at idle; a key pressed before then only updates the
  // store and the palette renders open as soon as it mounts.
  let unmount: (() => void) | null = null
  const idle = win.requestIdleCallback(() => (unmount = mountPalette(win)))
  disposers.push(() => {
    win.cancelIdleCallback(idle)
    unmount?.()
  })

  disposers.push(addSineSettingsButton(win, () => openSettings(win)))

  const onTabClose = (event: Event) => {
    if (event.target instanceof Element && isTab(event.target)) sweepTemporaryContainers(event.target)
  }
  win.gBrowser.tabContainer.addEventListener("TabClose", onTabClose)
  disposers.push(() => win.gBrowser.tabContainer.removeEventListener("TabClose", onTabClose))
  // Containers left over from a crash or a closed window; wait until restored tabs exist.
  void win.SessionStore.promiseAllWindowsRestored.then(() => sweepTemporaryContainers())

  win.Zencast = {
    open: () => openPalette(),
    close: () => closePalette(false),
    perf: perfSnapshot,
    setRecording: (on) => (recording = on),
  }
  disposers.push(() => delete win.Zencast)

  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

void window.delayedStartupPromise.then(() => {
  const stop = start(window)
  window.addUnloadListener?.(stop)
})
