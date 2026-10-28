import { ArrowLeft01Icon, Cancel01Icon, Layers01Icon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Command as CommandPrimitive } from "cmdk"
import { memo, useCallback, useDeferredValue, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react"

import { listContainers } from "@/browser/containers"
import { bareHost, completeDomain, readDnsDomains } from "@/browser/hosts"
import { queryWeb, type WebResult } from "@/browser/urlbar"
import { listWorkspaces, workspaceColor } from "@/browser/workspaces"
import type { CommandContext, ItemAction, PaletteItem } from "@/commands/types"
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { paletteKeys } from "@/keys/bindings"
import { CHORD_WAIT_MS, recordKey } from "@/keys/record"
import { cn } from "@/lib/utils"
import { readConfig, readUsage } from "@/shared/config"
import { comboFromEvent, displaySequence } from "@/shared/keys"
import { ActionPanel } from "./ActionPanel"
import { closePalette, popView, runAction, saveRecording, toggleContainerTarget, toggleSpaceTarget } from "./controller"
import { Keys } from "@/components/keys"
import { assignHints, useModifierHold, type Hint, type Modifier } from "./hints"
import { isBrowserShortcut, ItemGlyph } from "./parts"
import { markOpenPainted, record, timed } from "./perf"
import { buildIndex, isStrongMatch, search } from "./search"
import { quickLink } from "./bookmarks"
import { modItems } from "@/commands/mods"
import { scopeFor, SCOPES, type Scope } from "./scopes"
import { queryItems, rootWithSettings, settingsSearchItem, webItems } from "./sources"
import { getState, HOST_ID, setState, usePalette } from "./store"

const WEB_DEBOUNCE_MS = 40

interface Group {
  section: string
  items: PaletteItem[]
}

function groupBySection(items: PaletteItem[]): Group[] {
  const groups = new Map<string, PaletteItem[]>()
  for (const item of items) {
    const list = groups.get(item.section)
    if (list) list.push(item)
    else groups.set(item.section, [item])
  }
  return [...groups].map(([section, list]) => ({ section, items: list }))
}

interface Entry {
  item: PaletteItem
  section: string
}

// Rows that fit in the list without scrolling; the rest render in a deferred, interruptible pass.
const FIRST_SCREEN = 14

/**
 * The first screen of fresh results over the previous results' off-screen rows. Keeping the row
 * count steady lets React patch rows in place instead of removing and re-adding them per keystroke.
 */
function firstScreen(fresh: Entry[], stale: Entry[]): Entry[] {
  if (fresh.length <= FIRST_SCREEN) return fresh
  return [...fresh.slice(0, FIRST_SCREEN), ...stale.slice(FIRST_SCREEN)]
}

interface RowProps {
  item: PaletteItem
  heading: string | undefined
  /** Letter shown while Ctrl or Alt is held, underlined in the title and at the row's end. */
  hint: Hint | undefined
  onRun: (item: PaletteItem, action: ItemAction | undefined) => void
}

// Memoized so rows whose item is unchanged skip rendering, including cmdk's per-item registration.
// Optional parts stay mounted and empty, so reusing a row for another item only patches text.
const Row = memo(function Row({ item, heading, hint, onRun }: RowProps) {
  return (
    <>
      <div cmdk-group-heading="" hidden={!heading} className="px-4 pt-4 pb-1.5 text-[13px] font-medium text-faint">
        {heading}
      </div>
      <CommandItem value={item.id} onSelect={() => onRun(item, item.actions[0])} className="h-13 gap-4 rounded-xl px-4 text-[17px] font-normal">
        <span className="flex w-7 shrink-0 justify-center [&>img]:size-5 [&>svg]:size-5">
          <ItemGlyph icon={item.icon} />
        </span>
        <span className="shrink-0 truncate">
          {hint ? (
            <>
              {item.title.slice(0, hint.index)}
              <span className="underline decoration-2 underline-offset-4" style={{ color: hint.color }}>
                {item.title[hint.index]}
              </span>
              {item.title.slice(hint.index + 1)}
            </>
          ) : (
            item.title
          )}
        </span>
        <span className="min-w-0 truncate text-sm text-faint">{item.subtitle}</span>
        <span data-slot="command-shortcut" className="ml-auto flex shrink-0 items-center gap-2 pl-3">
          {hint ? (
            <kbd
              data-hint=""
              className="flex h-8 min-w-8 items-center justify-center rounded-lg px-2 font-mono text-[17px] font-semibold animate-in fade-in-0 zoom-in-90 duration-150"
              style={{
                color: hint.color,
                backgroundColor: `color-mix(in srgb, ${hint.color} 16%, transparent)`,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hint.color} 35%, transparent)`,
              }}
            >
              {hint.letter.toUpperCase()}
            </kbd>
          ) : (
            <>
              <span className="text-sm empty:hidden" style={{ color: item.accessoryColor ?? "var(--muted-foreground)" }}>
                {item.accessory}
              </span>
              {item.keys && <Keys sequence={item.keys} />}
            </>
          )}
        </span>
      </CommandItem>
    </>
  )
})

/** Keeps the last non-null value, so a target can fade out still showing its name and colour. */
function useLast<T>(value: T | null): T | null {
  const [last, setLast] = useState(value)
  if (value !== null && value !== last) setLast(value)
  return value ?? last
}

interface Target {
  name: string
  color: string
}

/** A soft wash of the target's colour from one top corner, behind the palette's content. */
function TargetWash({ target, corner }: { target: Target | null; corner: "left" | "right" }) {
  const shown = useLast(target)
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] transition-[opacity,color] duration-300 ease-out"
      style={{
        color: shown?.color,
        opacity: target ? 1 : 0,
        backgroundImage: `radial-gradient(110% 85% at ${corner === "left" ? "0%" : "100%"} 0%, color-mix(in srgb, currentColor 17%, transparent), transparent 62%)`,
      }}
    />
  )
}

function TargetChip({ target, kind, onClear }: { target: Target | null; kind: "space" | "container"; onClear: () => void }) {
  const shown = useLast(target)
  if (!shown) return null
  return (
    <span
      aria-hidden={!target}
      className={cn(
        "flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full text-xs whitespace-nowrap transition-all duration-300 ease-out",
        target ? "max-w-52 py-0.5 pr-1 pl-2 opacity-100" : "max-w-0 p-0 opacity-0",
      )}
      style={{ backgroundColor: `color-mix(in srgb, ${shown.color} 16%, transparent)`, color: `color-mix(in srgb, ${shown.color} 65%, var(--foreground))` }}
    >
      {kind === "space" ? (
        <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="size-3" />
      ) : (
        <span className="size-2 rounded-full" style={{ backgroundColor: shown.color }} />
      )}
      <span className="max-w-36 truncate">{shown.name}</span>
      <button
        type="button"
        tabIndex={target ? 0 : -1}
        aria-label={kind === "space" ? "Clear space" : "Clear container"}
        onClick={onClear}
        className="flex size-4 items-center justify-center rounded-full hover:bg-foreground/10"
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
      </button>
    </span>
  )
}

interface StripEntry {
  key: string
  name: string
  color: string
  active: boolean
}

interface LegendEntry {
  key: string
  label: string
}

/** Every key the palette takes with the held modifier, so none has to be learned. */
function legend(held: Modifier, active: PaletteItem | undefined, hinted: boolean, closeKeys: string[]): LegendEntry[] {
  const prefix = `${held}+`
  const entry = (keys: string, label: string) => ({ key: displaySequence(keys)[0]?.at(-1) ?? keys, label })
  const out = (active?.actions ?? []).flatMap((action) => (action.keys?.startsWith(prefix) ? [entry(action.keys, action.title)] : []))
  if (held === "ctrl" && (active?.actions.length ?? 0) > 1) out.push(entry("ctrl+j", "Actions"))
  if (hinted) out.push({ key: "A–Z", label: "Run the marked result" })
  out.push({ key: "1–9", label: held === "alt" ? "Open in space" : "Open in container" })
  out.push(...closeKeys.filter((keys) => keys.startsWith(prefix)).map((keys) => entry(keys, "Close")))
  return out
}

/** Held Ctrl numbers the containers, held Alt the spaces; the number toggles that target. */
function useStrip(held: Modifier | null, win: Window | null, space: string | undefined, container: number | undefined): StripEntry[] | null {
  return useMemo(() => {
    if (!win || !held) return null
    if (held === "alt")
      return listWorkspaces(win).slice(0, 9).map((ws, index) => ({ key: ws.uuid, name: ws.name, color: workspaceColor(ws, index), active: ws.uuid === space }))
    return listContainers().slice(0, 9).map((c) => ({ key: String(c.id), name: c.name, color: c.color, active: c.id === container }))
  }, [held, win, space, container])
}

function useWebResults(context: CommandContext | null, query: string, enabled: boolean): WebResult[] {
  const [web, setWeb] = useState<{ query: string; results: WebResult[] }>({ query: "", results: [] })
  useEffect(() => {
    if (!context || !enabled || !query) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const start = performance.now()
      queryWeb(context.win, query, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return
          record("web", performance.now() - start)
          setWeb({ query, results })
        })
        .catch((error: unknown) => console.error("[zencast] web results", error))
    }, WEB_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [context, query, enabled])
  return web.query === query ? web.results : []
}

// Refreshed on every open; Firefox keeps a host in its DNS cache for a few minutes after a lookup.
function useDnsDomains(open: boolean): string[] {
  const [domains, setDomains] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    let live = true
    readDnsDomains()
      .then((list) => live && setDomains(list))
      .catch((error: unknown) => console.error("[zencast] DNS cache", error))
    return () => {
      live = false
    }
  }, [open])
  return domains
}

// Pages the URL bar found in history or bookmarks.
const visited = (web: WebResult[]) => web.filter((result) => result.source === "history" || result.source === "bookmark")

/**
 * A host from the DNS cache wins, even over a command whose name starts with the query. The URL
 * bar's history autofill comes after, then the host of its top history row (autofill skips origins
 * below its frecency threshold); both yield to such a command.
 */
function completion(typed: string, web: WebResult[], domains: string[], strong: boolean): string | null {
  const dns = completeDomain(typed, domains)
  if (dns || strong) return dns
  const autofill = web.find((result) => result.heuristic && result.autofill)?.autofill
  if (autofill && autofill.length > typed.length && autofill.toLowerCase().startsWith(typed.toLowerCase())) return autofill
  return completeDomain(typed, visited(web).flatMap((result) => bareHost(result.url) ?? []))
}

/** The favicon for a typed URL: a visited page on the same host, else the site's root. */
function typedIcon(url: string, web: WebResult[]): string {
  const host = bareHost(url)
  const page = visited(web).find((result) => bareHost(result.url) === host)?.url
  return `page-icon:${page ?? new URL(url).origin + "/"}`
}

const SCOPE_HINT = SCOPES.map((scope) => `${scope.prefix} ${scope.name.toLowerCase()}`).join("  ")

// Loaded when the "*" scope opens, and again after a keep-open action rebuilds the root.
function useMods(context: CommandContext | null, enabled: boolean, root: PaletteItem[]): PaletteItem[] {
  const [mods, setMods] = useState<PaletteItem[]>([])
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!context || !enabled) return
    let live = true
    modItems(context, () => setVersion((v) => v + 1))
      .then((items) => live && setMods(items))
      .catch((error: unknown) => console.error("[zencast] mods", error))
    return () => {
      live = false
    }
  }, [context, enabled, root, version])
  return mods
}

function caretAtEnd(target: EventTarget | undefined): boolean {
  return target instanceof HTMLInputElement && target.selectionStart === target.value.length
}

export function Palette() {
  const open = usePalette((s) => s.open)
  const session = usePalette((s) => s.session)
  const context = usePalette((s) => s.context)
  const root = usePalette((s) => s.root)
  const stack = usePalette((s) => s.stack)
  const openIn = usePalette((s) => s.openIn)
  const space = usePalette((s) => s.space)
  const recording = usePalette((s) => s.recording)
  const view = stack.at(-1) ?? null

  // Reset local state whenever a new session or view starts (the component stays mounted).
  const viewKey = `${session}:${stack.length}`
  const [seenKey, setSeenKey] = useState(viewKey)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState("")
  const [panel, setPanel] = useState(false)
  // Inline completion is offered only while the user types forward, as in the URL bar.
  const [fill, setFill] = useState(false)
  // A prefix typed first ("@", "/", …) narrows the root search to one kind of result.
  const [scope, setScope] = useState<Scope | null>(null)
  if (seenKey !== viewKey) {
    setSeenKey(viewKey)
    setQuery(view?.prompt?.initial ?? "")
    setSelected("")
    setPanel(false)
    setFill(false)
    setScope(null)
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const config = readConfig()
  const q = query.trim()
  const wantsSettings = !view && !scope && q.length >= 2
  const mods = useMods(context, scope?.id === "mods", root)

  const index = useMemo(() => {
    if (view) return buildIndex(view.items)
    if (scope?.id === "mods") return buildIndex(mods)
    if (scope) return buildIndex((context ? rootWithSettings(context, root).items : root).filter((item) => item.scope === scope.id))
    if (!wantsSettings || !context) return buildIndex(root)
    return rootWithSettings(context, root)
  }, [view, root, wantsSettings, context, scope, mods])

  // Builds the settings index while idle so the second typed character doesn't pay for it.
  useEffect(() => {
    if (!open || !context) return
    const handle = context.win.requestIdleCallback(() => rootWithSettings(context, root))
    return () => context.win.cancelIdleCallback(handle)
  }, [open, context, root])
  const web = useWebResults(context, view || scope ? "" : q, config.urlResults)
  const domains = useDnsDomains(open)

  const { groups, suffix } = useMemo(() => timed("search", () => {
    if (view?.prompt) {
      const { submit, label } = view.prompt
      const item: PaletteItem = {
        id: "prompt",
        transient: true,
        title: label?.(query) ?? (query ? `Set to “${query}”` : "Set to empty"),
        section: view.title,
        icon: { kind: "icon", icon: Tick02Icon },
        actions: [{ id: "save", title: "Save", run: () => submit(query) }],
      }
      return { groups: [{ section: view.title, items: [item] }], suffix: "" }
    }
    const found = search(index, q, readUsage(), config.maxResults).map((r) => r.item)
    if (view || scope || !context || !q) return { groups: groupBySection(found), suffix: "" }

    const out: Group[] = []
    // A typed keyword leads with its quick link, and its bookmark's own row steps aside.
    const quick = quickLink(context, q)
    const ranked = quick ? found.filter((item) => item.id !== `bookmark:${quick.bookmark.guid}`) : found
    if (quick) out.push({ section: "Quick link", items: [quick.item] })
    const strong = ranked.some((item) => isStrongMatch(item, q))
    const host = fill && query === q && !quick ? completion(q, web, domains, strong) : null
    const suffix = host ? host.slice(q.length) : ""
    const { url, search: searchItems } = queryItems(context, q + suffix, (target) => typedIcon(target, web))
    if (url) out.push({ section: "Open", items: [url] })
    else if (!strong) out.push({ section: "Search", items: searchItems })
    if (wantsSettings && q.length >= 3) ranked.push(settingsSearchItem(context, q))
    out.push(...groupBySection(ranked))
    const webList = webItems(context, web, q)
    if (url || strong) webList.unshift(...searchItems)
    if (webList.length) out.push({ section: "Web", items: webList })
    return { groups: out, suffix }
  }), [index, q, query, view, scope, context, wantsSettings, web, domains, fill, config.maxResults])

  const entries = useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ item, section: group.section }))), [groups])
  const rows = useMemo(() => entries.map((entry) => entry.item), [entries])
  // While the full list is still rendering in the background, show the first screen of the new results.
  const deferred = useDeferredValue(entries)
  const shown = deferred === entries ? entries : firstScreen(entries, deferred)
  const active = rows.find((item) => item.id === selected) ?? rows[0] ?? null

  // The completed part stays selected, so typing replaces it and Backspace removes it.
  useLayoutEffect(() => {
    if (suffix) inputRef.current?.setSelectionRange(query.length, query.length + suffix.length)
  }, [query, suffix])

  useLayoutEffect(() => {
    if (!open || !context) return
    inputRef.current?.focus()
    // A prompt starts with its current value selected, so typing replaces it.
    if (view?.prompt) inputRef.current?.select()
    markOpenPainted(context.win)
  }, [open, context, viewKey, view])

  // Hints label only the rows in view when Ctrl goes down; the options panel numbers its actions instead.
  const [held, setHeld] = useState<Modifier | null>(null)
  const [hints, setHints] = useState<Map<string, Hint> | null>(null)
  useModifierHold(open && context ? context.win : null, (modifier) => {
    setHeld(modifier)
    const list = listRef.current
    if (!modifier || panel || recording || view?.prompt || !list) return setHints(null)
    const bounds = list.getBoundingClientRect()
    const visible = [...list.querySelectorAll("[cmdk-item]")].flatMap((element, index) => {
      const rect = element.getBoundingClientRect()
      const middle = rect.top + rect.height / 2
      const entry = shown[index]
      return entry && middle > bounds.top && middle < bounds.bottom ? [entry.item] : []
    })
    const own = new RegExp(`^${modifier}\\+([a-z])$`)
    const taken = [...(active?.actions ?? []).map((action) => action.keys ?? ""), ...paletteKeys(readConfig())].flatMap(
      (keys) => own.exec(keys)?.[1] ?? [],
    )
    const assigned = assignHints(visible.map((item) => item.title), taken)
    setHints(new Map(visible.flatMap((item, i) => {
      const hint = assigned[i]
      return hint ? [[item.id, hint]] : []
    })))
  })
  const strip = useStrip(panel || recording ? null : held, context?.win ?? null, space?.id, openIn?.id)
  const legendEntries = held && !panel && !recording ? legend(held, active, !!hints?.size, paletteKeys(readConfig())) : null

  // A recorded sequence ends after a pause, as in the settings page.
  const recorded = recording?.combos
  useEffect(() => {
    if (!recorded?.length) return
    const timer = setTimeout(saveRecording, CHORD_WAIT_MS)
    return () => clearTimeout(timer)
  }, [recorded])

  const run = useCallback((item: PaletteItem, action: ItemAction | undefined) => {
    if (!action) return
    setPanel(false)
    void runAction(item, action)
  }, [])

  // The palette is modal: it reads keys in the window's capture phase, ahead of Zen's and Firefox's
  // shortcuts (even reserved ones like Ctrl+W), and swallows every modified key it does not use
  // except text editing. Unmodified keys go on to the input and cmdk's list navigation.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.isComposing) return
    const combo = comboFromEvent(event)
    if (!combo) return
    const consume = () => {
      event.preventDefault()
      event.stopImmediatePropagation()
      event.stopCrossProcessForwarding?.()
    }

    if (recording) {
      consume()
      const step = recordKey(recording.combos, combo)
      if (step.kind === "cancel") setState({ recording: null })
      else if (step.kind === "save") saveRecording()
      else if (step.kind === "hint") setState({ recording: { ...recording, hint: step.text } })
      else {
        setState({ recording: { ...recording, combos: step.combos, hint: null } })
        if (step.done) saveRecording()
      }
      return
    }

    // The key that opened the palette closes it again, from any view.
    if (paletteKeys(readConfig()).includes(combo)) {
      consume()
      closePalette(true)
      return
    }

    if (panel) {
      const digit = /^ctrl\+([1-9])$/.exec(combo)
      const numbered = digit && active ? active.actions[Number(digit[1]) - 1] : undefined
      if (combo === "escape" || combo === "ctrl+j") {
        consume()
        setPanel(false)
        inputRef.current?.focus()
      } else if (active && numbered) {
        consume()
        run(active, numbered)
      } else if (isBrowserShortcut(combo)) consume()
      return
    }

    if (suffix && (combo === "tab" || combo === "right" || combo === "end")) {
      consume()
      const full = query + suffix
      setQuery(full)
      setFill(false)
      inputRef.current?.setSelectionRange(full.length, full.length)
      return
    }
    if (combo === "escape") {
      consume()
      if (query) setQuery("")
      else if (stack.length) popView()
      else if (scope) setScope(null)
      else closePalette(true)
      return
    }
    if (combo === "backspace" && !query && !view && scope) {
      consume()
      setScope(null)
      return
    }
    if (combo === "backspace" && !query && (stack.length || openIn || space)) {
      consume()
      if (stack.length) popView()
      else setState(openIn ? { openIn: null } : { space: null })
      return
    }
    if (combo === "ctrl+j" || (combo === "right" && caretAtEnd(event.composedPath()[0]) && (active?.actions.length ?? 0) > 1)) {
      consume()
      if (active) setPanel(true)
      return
    }
    // Alt+N and Ctrl+N pick the space and container that results open in; again clears them.
    const target = /^(alt|ctrl)\+([1-9])$/.exec(combo)
    if (target && !view) {
      consume()
      if (target[1] === "alt") toggleSpaceTarget(Number(target[2]) - 1)
      else toggleContainerTarget(Number(target[2]) - 1)
      return
    }
    if (combo === "enter") {
      consume()
      if (active) run(active, active.actions[0])
      return
    }
    const letter = held ? new RegExp(`^${held}\\+([a-z])$`).exec(combo)?.[1] : undefined
    const hinted = letter && hints ? rows.find((item) => hints.get(item.id)?.letter === letter) : undefined
    if (hinted) {
      consume()
      run(hinted, hinted.actions[0])
      return
    }
    const action = active?.actions.find((candidate) => candidate.keys === combo)
    if (active && action) {
      consume()
      run(active, action)
      return
    }
    if (isBrowserShortcut(combo)) consume()
  })
  useEffect(() => {
    if (!open || !context) return
    const win = context.win
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    // Releasing a held Alt would otherwise show the menu bar.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") event.preventDefault()
    }
    win.addEventListener("keydown", listener, true)
    win.addEventListener("keyup", onKeyUp, true)
    return () => {
      win.removeEventListener("keydown", listener, true)
      win.removeEventListener("keyup", onKeyUp, true)
    }
  }, [open, context])

  // Zen moves focus on its own, such as to the address bar after a tab closes. The palette is modal,
  // so focus goes back to where it was inside the palette (its input or the actions panel).
  useEffect(() => {
    if (!open || !context) return
    const doc = context.win.document
    const host = doc.getElementById(HOST_ID)
    let inside: HTMLElement | null = null
    const onFocus = (event: FocusEvent) => {
      if (!getState().open) return
      const active = host?.shadowRoot?.activeElement
      if (event.target === host) {
        if (active instanceof HTMLElement) inside = active
        return
      }
      ;(inside?.isConnected ? inside : inputRef.current)?.focus()
    }
    doc.addEventListener("focusin", onFocus, true)
    return () => doc.removeEventListener("focusin", onFocus, true)
  }, [open, context])

  const targets = [space?.name, openIn?.name].filter(Boolean).join(" · ")
  const placeholder =
    view?.placeholder ??
    (scope ? `Search ${scope.name.toLowerCase()}` : targets ? `Open in ${targets}` : `Search or type a URL · ${SCOPE_HINT}`)
  const primary = active?.actions[0]
  const accent = space?.color ?? openIn?.color

  return (
    <div
      hidden={!open}
      className="pointer-events-auto fixed inset-0 bg-black/30"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePalette(true)
      }}
    >
      {/* Fixed height, centred a little above the middle, so the input never moves as results change. */}
      <div className="absolute top-1/2 left-1/2 w-[min(1000px,95vw)] -translate-x-1/2 -translate-y-1/2 animate-in fade-in-0 zoom-in-[0.98] duration-100">
        <Command
          shouldFilter={false}
          vimBindings={false}
          loop
          value={active?.id ?? ""}
          onValueChange={setSelected}
          className="relative isolate flex h-[min(760px,86vh)] flex-col rounded-[20px] border bg-popover p-0 shadow-2xl shadow-black/60 transition-[border-color] duration-300 ease-out"
          style={{ borderColor: accent ? `color-mix(in srgb, ${accent} 45%, var(--border))` : undefined }}
        >
          <TargetWash target={space} corner="left" />
          <TargetWash target={openIn} corner="right" />
          <div className="flex h-18 shrink-0 items-center gap-4 border-b px-6">
            {view ? (
              <button
                type="button"
                aria-label="Back"
                onClick={popView}
                className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3.5" />
              </button>
            ) : scope ? (
              <span
                data-scope=""
                className="flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-3 pl-2.5 text-sm font-medium animate-in fade-in-0 zoom-in-90 duration-150"
                style={{ backgroundColor: `color-mix(in srgb, ${scope.color} 18%, transparent)`, color: `color-mix(in srgb, ${scope.color} 70%, var(--foreground))` }}
              >
                <HugeiconsIcon icon={scope.icon} strokeWidth={2} className="size-4" />
                {scope.name}
              </span>
            ) : (
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-6 shrink-0 text-faint" />
            )}
            <CommandPrimitive.Input
              ref={inputRef}
              value={query + suffix}
              onValueChange={(value) => {
                const typed = !view && !scope && !query ? scopeFor(value.charAt(0)) : undefined
                if (typed) {
                  setScope(typed)
                  setQuery(value.slice(1))
                  setSelected("")
                  return
                }
                setFill(value.length > query.length)
                setQuery(value)
                setSelected("")
              }}
              placeholder={placeholder}
              className="h-full min-w-0 flex-1 bg-transparent text-xl outline-hidden placeholder:text-faint"
            />
            <TargetChip target={space} kind="space" onClear={() => setState({ space: null })} />
            <TargetChip target={openIn} kind="container" onClear={() => setState({ openIn: null })} />
          </div>

          <CommandList ref={listRef} className="max-h-none min-h-0 flex-1 scroll-py-2.5 p-2.5">
            <CommandEmpty className="py-8 text-center text-sm text-faint">No results</CommandEmpty>
            {/* Positional keys let a keystroke patch the existing rows instead of replacing them. */}
            {shown.map((entry, index) => (
              <Row
                key={index}
                item={entry.item}
                heading={entry.section === shown[index - 1]?.section ? undefined : entry.section}
                hint={hints?.get(entry.item.id)}
                onRun={run}
              />
            ))}
          </CommandList>

          {legendEntries && (
            <div data-legend="" className="absolute inset-x-0 bottom-14 flex flex-wrap items-center gap-x-5 gap-y-2 border-t bg-popover/95 px-5 py-3 text-sm text-muted-foreground backdrop-blur animate-in fade-in-0 duration-150">
              <span className="text-faint">{held === "alt" ? "Alt" : "Ctrl"} +</span>
              {legendEntries.map(({ key, label }) => (
                <span key={key + label} className="flex items-center gap-2">
                  <kbd className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-muted px-1.5 font-mono text-[15px] font-semibold text-foreground">{key}</kbd>
                  {label}
                </span>
              ))}
            </div>
          )}
          <div className="flex h-14 shrink-0 items-center gap-3 border-t px-5 text-sm text-muted-foreground">
            {recording ? (
              <div key="recording" className="flex min-w-0 flex-1 items-center gap-3 animate-in fade-in-0 duration-150">
                <span className="size-2 shrink-0 rounded-full bg-rose" />
                <span className="truncate text-foreground">{recording.title}</span>
                <span className="ml-auto flex items-center gap-2">
                  {recording.combos.length ? <Keys sequence={recording.combos.join(" ")} /> : <span className="text-faint">{recording.hint ?? "Press keys"}</span>}
                </span>
                <span className="flex items-center gap-1.5 border-l pl-3">
                  Cancel
                  <Kbd>Esc</Kbd>
                </span>
              </div>
            ) : strip ? (
              <div key={held} className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden animate-in fade-in-0 duration-150">
                <span className="mr-2 shrink-0 text-faint">{held === "alt" ? "Space" : "Container"}</span>
                {strip.length ? (
                  strip.map((entry, index) => (
                    <span
                      key={entry.key}
                      className={cn("flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors duration-200", entry.active && "bg-muted text-foreground")}
                    >
                      <kbd
                        className="flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 font-mono text-[15px] font-semibold"
                        style={{ color: entry.color, backgroundColor: `color-mix(in srgb, ${entry.color} 16%, transparent)` }}
                      >
                        {index + 1}
                      </kbd>
                      <span className="max-w-36 truncate">{entry.name}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-faint">None</span>
                )}
              </div>
            ) : (
              <div key="footer" className="flex min-w-0 flex-1 items-center gap-3 animate-in fade-in-0 duration-150">
                <span className="min-w-0 truncate text-faint">{view?.title}</span>
                {primary && (
                  <span className={`ml-auto flex items-center gap-1.5 ${primary.danger ? "text-rose" : "text-foreground"}`}>
                    {primary.title}
                    <Kbd>↵</Kbd>
                  </span>
                )}
                {active && active.actions.length > 1 && (
                  <span className="flex items-center gap-1.5 border-l pl-3">
                    Actions
                    <Keys sequence="ctrl+j" />
                  </span>
                )}
              </div>
            )}
          </div>
        </Command>

        {panel && active && (
          <ActionPanel
            item={active}
            numbered={held === "ctrl"}
            onRun={(action) => run(active, action)}
          />
        )}
      </div>
    </div>
  )
}
