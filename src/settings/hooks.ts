import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

import { browserWindow } from "@/browser/window"
import { onConfigChange, readConfig, type Config } from "@/shared/config"

export type SectionId = "keys" | "settings" | "folders" | "sessions" | "general"

const SECTIONS: SectionId[] = ["keys", "settings", "folders", "sessions", "general"]

function parseHash(): { section: SectionId; param: string } {
  const [section = "", ...rest] = location.hash.slice(1).split("/")
  const match = SECTIONS.find((id) => id === section)
  return { section: match ?? "keys", param: decodeURIComponent(rest.join("/")) }
}

/** Sections are addressed by hash (#keys/pin.toggle) so the palette can deep-link into them. */
export function useRoute() {
  const [route, setRoute] = useState(parseHash)
  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return route
}

export function useConfig(): Config {
  return useSyncExternalStore(onConfigChange, readConfig)
}

/** The browser window this settings tab acts on. */
export function useBrowserWindow(): Window {
  const [win] = useState(browserWindow)
  return win
}

const TAB_EVENTS = [
  "TabOpen",
  "TabClose",
  "TabMove",
  "TabPinned",
  "TabUnpinned",
  "TabGrouped",
  "TabUngrouped",
  "TabGroupCreate",
  "TabGroupRemoved",
  "TabGroupMoved",
]

/**
 * Reads browser state once, then re-reads it (debounced) whenever tabs or folders change.
 * `read` must be stable, e.g. a module-level function. The returned refresh re-reads on demand.
 */
export function useTabSnapshot<T>(win: Window, read: (win: Window) => T): [T, () => void] {
  const [snapshot, setSnapshot] = useState(() => read(win))
  const refresh = useCallback(() => setSnapshot(read(win)), [win, read])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let removal: ReturnType<typeof setTimeout> | null = null
    // Zen announces a removed folder, then animates it out of the tab strip, so an archived folder
    // would read as empty; the tree is read again once the folder is really gone.
    const afterRemoval = (folder: EventTarget & Record<"isConnected", unknown>, tries: number) => {
      if (!folder.isConnected || !tries) return refresh()
      removal = setTimeout(() => afterRemoval(folder, tries - 1), 100)
    }
    const schedule = (event: Event) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 80)
      const folder = event.target
      if (event.type === "TabGroupRemoved" && folder && "isConnected" in folder) {
        if (removal) clearTimeout(removal)
        afterRemoval(folder, 30)
      }
    }
    const target = win.gBrowser.tabContainer
    for (const type of TAB_EVENTS) target.addEventListener(type, schedule)
    return () => {
      if (timer) clearTimeout(timer)
      if (removal) clearTimeout(removal)
      for (const type of TAB_EVENTS) target.removeEventListener(type, schedule)
    }
  }, [win, refresh])
  return [snapshot, refresh]
}
