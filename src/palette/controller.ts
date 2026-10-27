import { notify } from "@/browser/toast"
import { nativeItems } from "@/commands/native"
import type { Command, CommandContext, ItemAction, ListView, PaletteControls, PaletteItem, RunResult } from "@/commands/types"
import { effectiveBindings } from "@/keys/bindings"
import { readConfig, recordUsage } from "@/shared/config"
import { markOpenStart } from "./perf"
import { keybindingsItem, loadEngineName, rootItems } from "./sources"
import { getState, HOST_ID, setState } from "./store"

let win: Window | null = null
let nativeCache: PaletteItem[] | null = null
let previousFocus: Element | null = null
let idleHandle = 0

const ui: PaletteControls = {
  toast: (text, action) => win && notify(win, text, action),
  show: (view) => openPalette(view),
  // Choosing a container returns to the root list so the next query opens in it.
  setOpenIn: (openIn) => setState({ openIn, stack: [] }),
}

function currentWindow(): Window {
  if (!win) throw new Error("Zencast palette is not initialised")
  return win
}

export function initController(target: Window) {
  win = target
  loadEngineName()
  warmNative()
}

export function disposeController() {
  if (win && idleHandle) win.cancelIdleCallback(idleHandle)
  win = null
  nativeCache = null
}

// Zen's action and shortcut lists only change with Zen state, so they are rebuilt off the hot path.
function warmNative() {
  const target = currentWindow()
  if (idleHandle) target.cancelIdleCallback(idleHandle)
  idleHandle = target.requestIdleCallback(() => {
    idleHandle = 0
    nativeCache = nativeItems(target)
  })
}

export function commandContext(): CommandContext {
  const target = currentWindow()
  return { win: target, tab: target.gBrowser.selectedTab, ui }
}

function buildRoot(ctx: CommandContext): PaletteItem[] {
  nativeCache ??= nativeItems(ctx.win)
  return [...rootItems(ctx, effectiveBindings(readConfig()), nativeCache), keybindingsItem(ctx)]
}

export function openPalette(view?: ListView) {
  markOpenStart()
  const ctx = commandContext()
  const current = getState()
  if (!current.open) previousFocus = ctx.win.document.activeElement
  setState({
    open: true,
    session: current.session + 1,
    context: ctx,
    root: buildRoot(ctx),
    stack: view ? [view] : [],
    openIn: current.open ? current.openIn : null,
  })
}

function canFocus(element: Element | null): element is Element & { focus(): void } {
  return !!element?.isConnected && "focus" in element && typeof element.focus === "function"
}

/** Closing on Escape returns focus to where it was; after running an action the browser keeps focus. */
export function closePalette(restoreFocus: boolean) {
  if (!getState().open) return
  // The root list stays so the hidden rows are reused, and only patched, on the next open.
  setState({ open: false, stack: [], context: null })
  const target = currentWindow()
  if (restoreFocus && canFocus(previousFocus)) previousFocus.focus()
  else if (target.document.activeElement?.id === HOST_ID) target.gBrowser.selectedBrowser.focus()
  previousFocus = null
  nativeCache = null
  warmNative()
}

export function togglePalette() {
  if (getState().open) closePalette(true)
  else openPalette()
}

export function popView() {
  setState((current) => ({ stack: current.stack.slice(0, -1) }))
}

/** Rebuilds the root list after an action that keeps the palette open, such as closing a tab. */
function refresh() {
  const { context } = getState()
  if (!context) return
  setState({ root: buildRoot(context) })
}

function isListView(value: unknown): value is ListView {
  return typeof value === "object" && value !== null && "items" in value && "title" in value
}

async function settle(result: RunResult): Promise<ListView | null> {
  const value = await result
  return isListView(value) ? value : null
}

function reportError(error: unknown) {
  console.error("[zencast]", error)
  if (win) notify(win, error instanceof Error ? error.message : "Something went wrong")
}

export async function runAction(item: PaletteItem, action: ItemAction) {
  if (!item.transient) recordUsage(item.id)
  try {
    const view = await settle(action.run())
    if (view) setState((current) => ({ stack: [...current.stack, view] }))
    else if (action.keepOpen) refresh()
    else closePalette(false)
  } catch (error) {
    closePalette(false)
    reportError(error)
  }
}

/** Runs a command from a keybinding; pickers open the palette. */
export async function runCommand(command: Command) {
  if (command.id === "zencast.palette") return togglePalette()
  recordUsage(command.id)
  try {
    const view = await settle(command.run(commandContext()))
    if (view) openPalette(view)
  } catch (error) {
    reportError(error)
  }
}
