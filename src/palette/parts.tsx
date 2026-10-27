import { HugeiconsIcon } from "@hugeicons/react"

import type { ItemIcon } from "@/commands/types"

// Text-editing shortcuts the input keeps; every other modified key is held back from Zen while the
// palette is open so it behaves like a modal.
const EDITING_KEYS = new Set([
  "ctrl+a", "ctrl+c", "ctrl+v", "ctrl+x", "ctrl+z", "ctrl+shift+z", "ctrl+y",
  "ctrl+backspace", "ctrl+delete", "ctrl+left", "ctrl+right", "ctrl+shift+left", "ctrl+shift+right",
  "ctrl+home", "ctrl+end", "ctrl+shift+home", "ctrl+shift+end",
])

/** A modified key that would reach Zen or Firefox, as opposed to editing the palette's input. */
export function isBrowserShortcut(combo: string): boolean {
  return /(^|\+)(ctrl|alt|meta)\+/.test(combo) && !EDITING_KEYS.has(combo)
}

export function ItemGlyph({ icon }: { icon?: ItemIcon }) {
  if (!icon) return <span className="size-4 shrink-0" />
  switch (icon.kind) {
    case "icon":
      return <HugeiconsIcon icon={icon.icon} strokeWidth={1.8} className="size-4 shrink-0 text-muted-foreground" color={icon.color} />
    case "favicon":
      return <img src={icon.url} alt="" className="size-4 shrink-0 rounded-sm" loading="lazy" />
    case "chrome":
      return (
        <img
          src={icon.url}
          alt=""
          className="size-4 shrink-0 text-muted-foreground [-moz-context-properties:fill,fill-opacity] [fill:currentColor]"
        />
      )
    case "dot":
      return (
        <span className="flex size-4 shrink-0 items-center justify-center">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: icon.color }} />
        </span>
      )
  }
}
