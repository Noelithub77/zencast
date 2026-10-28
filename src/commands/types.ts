import type { ComponentProps } from "react"
import type { HugeiconsIcon } from "@hugeicons/react"
import type { ToastAction } from "@/browser/toast"
import type { Jump } from "@/shared/config"

export type Icon = ComponentProps<typeof HugeiconsIcon>["icon"]

export type ItemIcon =
  | { kind: "icon"; icon: Icon; color?: string }
  | { kind: "favicon"; url: string }
  /** Monochrome chrome:// SVG that paints with currentColor via context-fill. */
  | { kind: "chrome"; url: string }
  | { kind: "dot"; color: string }

/** A nested list pushed onto the palette stack (pickers, confirmations). */
export interface ListView {
  id: string
  title: string
  placeholder?: string
  items: PaletteItem[]
  /** Turns the view into a text prompt: the input starts with `initial` and Enter submits it. */
  prompt?: {
    initial: string
    submit: (value: string) => RunResult
    /** The row Enter runs, for the typed value; defaults to "Set to “value”". */
    label?: (value: string) => string
  }
}

export type RunResult = void | ListView | Promise<void | ListView>

export interface ItemAction {
  id: string
  title: string
  /** Shortcut hint shown in the action panel, as a key sequence ("ctrl+enter"). */
  keys?: string
  danger?: boolean
  /** Keep the palette open after running, e.g. for toggles. */
  keepOpen?: boolean
  run: () => RunResult
}

export interface PaletteItem {
  id: string
  title: string
  subtitle?: string
  section: string
  icon?: ItemIcon
  /** Bound key sequence to show as badges. */
  keys?: string
  /** Short right-aligned label, e.g. "Bookmark" or "On". */
  accessory?: string
  accessoryColor?: string
  /** Extra text matched by search but not shown. */
  keywords?: string
  /** First action runs on Enter, second on Ctrl+Enter; all appear in the action panel. */
  actions: ItemAction[]
  /** Static boost added to the search score. */
  boost?: number
  /** Not ranked by usage because the id does not survive a restart (tabs, web results). */
  transient?: boolean
}

export interface PaletteControls {
  /** Shows Zen's native toast, optionally with one button such as Undo. */
  toast(text: string, action?: ToastAction): void
  /** Opens the palette with a list (used by key-bound commands that need a picker). */
  show(view: ListView): void
  /** Sets the container that the next opened URL or search uses. */
  setOpenIn(container: { id: number; name: string; color: string } | null): void
  /** Records a shortcut in the palette for a command, or for a new jump when one is given. */
  record(id: string, title: string, jump?: Jump): void
}

export interface CommandContext {
  win: Window
  tab: XULTab
  ui: PaletteControls
}

export type Section =
  | "Palette"
  | "Tabs"
  | "Pins"
  | "Folders"
  | "Bookmarks"
  | "Spaces"
  | "Containers"
  | "Privacy"
  | "Zen"
  | "Jumps"

export interface Command {
  id: string
  title: string
  section: Section
  icon: Icon
  keywords?: string
  /** Default key sequences; users override them in settings. */
  defaultKeys?: string[]
  /** Hidden commands are key-only (e.g. "move tab to space 3") and stay out of palette results. */
  hidden?: boolean
  /** Availability for the current tab; unavailable commands are hidden and their keys pass through. */
  when?: (ctx: CommandContext) => boolean
  /** Extra condition for the key only; when false the key keeps its usual meaning (Ctrl+C still copies a selection). */
  keysWhen?: (ctx: CommandContext) => boolean
  run: (ctx: CommandContext) => RunResult
}
