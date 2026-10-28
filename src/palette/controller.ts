import { listContainers } from "@/browser/containers"
import { notify } from "@/browser/toast"
import { listWorkspaces, workspaceColor } from "@/browser/workspaces"
import { allCommands } from "@/commands/jumps"
import { nativeItems } from "@/commands/native"
import type { Command, CommandContext, ItemAction, ListView, PaletteControls, PaletteItem, RunResult } from "@/commands/types"
import { bindSequence, buildIndex, effectiveBindings } from "@/keys/bindings"
import { jumpId, readConfig, recordUsage, updateConfig, writeConfig } from "@/shared/config"
import { displaySequence } from "@/shared/keys"
import { markOpenStart } from "./perf"
import { bookmarkItems } from "./bookmarks"
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
  record: (id, title, jump) => setState({ recording: { id, title, jump, combos: [], hint: null } }),
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
  const bindings = effectiveBindings(readConfig())
  // A Zen command loses the key a Zencast binding has taken, so the palette shows who owns it.
  const taken = new Set([...bindings.values()].flat())
  const native = nativeCache.map((item) => (item.keys && taken.has(item.keys) ? { ...item, keys: undefined } : item))
  return [...rootItems(ctx, bindings, native), ...bookmarkItems(ctx, bindings), keybindingsItem(ctx)]
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
    space: current.open ? current.space : null,
    recording: null,
  })
}

function canFocus(element: Element | null): element is Element & { focus(): void } {
  return !!element?.isConnected && "focus" in element && typeof element.focus === "function"
}

/** Closing on Escape returns focus to where it was; after running an action the browser keeps focus. */
export function closePalette(restoreFocus: boolean) {
  if (!getState().open) return
  // The root list stays so the hidden rows are reused, and only patched, on the next open.
  setState({ open: false, stack: [], context: null, recording: null })
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

/** Alt+N in the palette: targets space N, or clears it when it is already the target. */
export function toggleSpaceTarget(index: number) {
  const workspace = listWorkspaces(currentWindow())[index]
  if (!workspace) return
  setState((current) => ({
    space: current.space?.id === workspace.uuid ? null : { id: workspace.uuid, name: workspace.name, color: workspaceColor(workspace, index) },
  }))
}

/** Ctrl+N in the palette: targets container N, or clears it when it is already the target. */
export function toggleContainerTarget(index: number) {
  const container = listContainers()[index]
  if (!container) return
  setState((current) => ({
    openIn: current.openIn?.id === container.id ? null : { id: container.id, name: container.name, color: container.color },
  }))
}

const showSequence = (sequence: string) => displaySequence(sequence).map((combo) => combo.join("+")).join(" ")

/** Saves the recorded shortcut, adding its jump if new, and offers Undo in the toast. */
export function saveRecording() {
  const { recording } = getState()
  setState({ recording: null })
  if (!recording?.combos.length) return
  const sequence = recording.combos.join(" ")
  const before = readConfig()
  const jump = recording.jump
  if (jump && !before.jumps.some((existing) => jumpId(existing) === recording.id))
    updateConfig((config) => ({ ...config, jumps: [...config.jumps, jump] }))
  bindSequence(recording.id, sequence)

  const config = readConfig()
  const index = buildIndex(config)
  const titles = new Map(allCommands(config).map((command) => [command.id, command.title]))
  const others = (index.exact.get(sequence) ?? []).filter((command) => command.id !== recording.id)
  const clash = others.length
    ? ` · also ${others.map((command) => titles.get(command.id)).join(", ")}`
    : index.prefixes.has(sequence)
      ? " · blocks a longer chord"
      : ""
  notify(currentWindow(), `${recording.title}: ${showSequence(sequence)}${clash}`, { label: "Undo", run: () => writeConfig(before) })
  refresh()
}
