import { ArrowLeft01Icon, Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Command as CommandPrimitive } from "cmdk"
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"

import { queryWeb, type WebResult } from "@/browser/urlbar"
import type { CommandContext, ItemAction, PaletteItem } from "@/commands/types"
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { readConfig, readUsage } from "@/shared/config"
import { comboFromEvent } from "@/shared/keys"
import { ActionPanel } from "./ActionPanel"
import { closePalette, popView, runAction } from "./controller"
import { Keys } from "@/components/keys"
import { holdBrowserShortcut, ItemGlyph } from "./parts"
import { markOpenPainted, record, timed } from "./perf"
import { buildIndex, isStrongMatch, search } from "./search"
import { queryItems, rootWithSettings, settingsSearchItem, webItems } from "./sources"
import { setState, usePalette } from "./store"

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
  onRun: (item: PaletteItem, action: ItemAction | undefined) => void
}

// Memoized so rows whose item is unchanged skip rendering, including cmdk's per-item registration.
// Optional parts stay mounted and empty, so reusing a row for another item only patches text.
const Row = memo(function Row({ item, heading, onRun }: RowProps) {
  return (
    <>
      <div cmdk-group-heading="" hidden={!heading} className="px-2.5 pt-2.5 pb-1 text-xs font-medium text-faint">
        {heading}
      </div>
      <CommandItem value={item.id} onSelect={() => onRun(item, item.actions[0])} className="h-10 gap-3 rounded-lg px-2.5 font-normal">
        <ItemGlyph icon={item.icon} />
        <span className="shrink-0 truncate">{item.title}</span>
        <span className="min-w-0 truncate text-xs text-faint">{item.subtitle}</span>
        <span data-slot="command-shortcut" className="ml-auto flex shrink-0 items-center gap-2 pl-3">
          <span className="text-xs empty:hidden" style={{ color: item.accessoryColor ?? "var(--muted-foreground)" }}>
            {item.accessory}
          </span>
          {item.keys && <Keys sequence={item.keys} />}
        </span>
      </CommandItem>
    </>
  )
})

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

function caretAtEnd(target: EventTarget): boolean {
  return target instanceof HTMLInputElement && target.selectionStart === target.value.length
}

export function Palette() {
  const open = usePalette((s) => s.open)
  const session = usePalette((s) => s.session)
  const context = usePalette((s) => s.context)
  const root = usePalette((s) => s.root)
  const stack = usePalette((s) => s.stack)
  const openIn = usePalette((s) => s.openIn)
  const view = stack.at(-1) ?? null

  // Reset local state whenever a new session or view starts (the component stays mounted).
  const viewKey = `${session}:${stack.length}`
  const [seenKey, setSeenKey] = useState(viewKey)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState("")
  const [panel, setPanel] = useState(false)
  if (seenKey !== viewKey) {
    setSeenKey(viewKey)
    setQuery("")
    setSelected("")
    setPanel(false)
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const config = readConfig()
  const q = query.trim()
  const wantsSettings = !view && q.length >= 2

  const index = useMemo(() => {
    if (view) return buildIndex(view.items)
    if (!wantsSettings || !context) return buildIndex(root)
    return rootWithSettings(context, root)
  }, [view, root, wantsSettings, context])

  // Builds the settings index while idle so the second typed character doesn't pay for it.
  useEffect(() => {
    if (!open || !context) return
    const handle = context.win.requestIdleCallback(() => rootWithSettings(context, root))
    return () => context.win.cancelIdleCallback(handle)
  }, [open, context, root])
  const web = useWebResults(context, view ? "" : q, config.urlResults)

  const groups = useMemo(() => timed("search", () => {
    const ranked = search(index, q, readUsage(), config.maxResults).map((r) => r.item)
    if (view || !context || !q) return groupBySection(ranked)

    const out: Group[] = []
    const { url, search: searchItem } = queryItems(context, q)
    const strong = ranked.some((item) => isStrongMatch(item, q))
    if (url) out.push({ section: "Open", items: [url] })
    else if (!strong) out.push({ section: "Search", items: [searchItem] })
    if (wantsSettings && q.length >= 3) ranked.push(settingsSearchItem(context, q))
    out.push(...groupBySection(ranked))
    const webList = webItems(context, web, q)
    if (url || strong) webList.unshift(searchItem)
    if (webList.length) out.push({ section: "Web", items: webList })
    return out
  }), [index, q, view, context, wantsSettings, web, config.maxResults])

  const entries = useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ item, section: group.section }))), [groups])
  const rows = useMemo(() => entries.map((entry) => entry.item), [entries])
  // While the full list is still rendering in the background, show the first screen of the new results.
  const deferred = useDeferredValue(entries)
  const shown = deferred === entries ? entries : firstScreen(entries, deferred)
  const active = rows.find((item) => item.id === selected) ?? rows[0] ?? null

  useLayoutEffect(() => {
    if (!open || !context) return
    inputRef.current?.focus()
    markOpenPainted(context.win)
  }, [open, context, viewKey])

  const run = useCallback((item: PaletteItem, action: ItemAction | undefined) => {
    if (!action) return
    setPanel(false)
    void runAction(item, action)
  }, [])

  const onKeyDown = (event: KeyboardEvent) => {
    const combo = comboFromEvent(event.nativeEvent)
    if (!combo) return
    const consume = () => {
      event.preventDefault()
      event.stopPropagation()
    }

    if (combo === "escape") {
      consume()
      if (query) setQuery("")
      else if (stack.length) popView()
      else closePalette(true)
      return
    }
    if (combo === "backspace" && !query && (stack.length || openIn)) {
      consume()
      if (stack.length) popView()
      else setState({ openIn: null })
      return
    }
    if (combo === "ctrl+k" || (combo === "right" && caretAtEnd(event.target) && (active?.actions.length ?? 0) > 1)) {
      consume()
      if (active) setPanel(true)
      return
    }
    const digit = /^alt\+([1-9])$/.exec(combo)
    if (digit) {
      consume()
      const item = rows[Number(digit[1]) - 1]
      if (item) run(item, item.actions[0])
      return
    }
    if (combo === "enter") {
      consume()
      if (active) run(active, active.actions[0])
      return
    }
    const action = active?.actions.find((candidate) => candidate.keys === combo)
    if (active && action) {
      consume()
      run(active, action)
      return
    }
    holdBrowserShortcut(event.nativeEvent, combo)
  }

  const placeholder = view?.placeholder ?? (openIn ? `Open in ${openIn.name}` : "Search or type a URL")
  const primary = active?.actions[0]

  return (
    <div
      hidden={!open}
      className="pointer-events-auto fixed inset-0 bg-black/30"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePalette(true)
      }}
    >
      <div className="absolute top-[16vh] left-1/2 w-[min(680px,92vw)] -translate-x-1/2 animate-in fade-in-0 zoom-in-[0.98] duration-100">
        <Command
          shouldFilter={false}
          vimBindings={false}
          loop
          value={active?.id ?? ""}
          onValueChange={setSelected}
          onKeyDown={onKeyDown}
          className="rounded-2xl border bg-popover p-0 shadow-2xl shadow-black/60"
        >
          <div className="flex h-13 items-center gap-3 border-b px-4">
            {view ? (
              <button
                type="button"
                aria-label="Back"
                onClick={popView}
                className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3.5" />
              </button>
            ) : (
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4 shrink-0 text-faint" />
            )}
            <CommandPrimitive.Input
              ref={inputRef}
              value={query}
              onValueChange={(value) => {
                setQuery(value)
                setSelected("")
              }}
              placeholder={placeholder}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-hidden placeholder:text-faint"
            />
            {openIn && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: openIn.color }} />
                {openIn.name}
                <button
                  type="button"
                  aria-label="Clear container"
                  onClick={() => setState({ openIn: null })}
                  className="flex size-4 items-center justify-center rounded-full hover:bg-secondary hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
                </button>
              </span>
            )}
          </div>

          <CommandList className="max-h-[min(420px,56vh)] scroll-py-2 p-1.5">
            <CommandEmpty className="py-8 text-center text-sm text-faint">No results</CommandEmpty>
            {/* Positional keys let a keystroke patch the existing rows instead of replacing them. */}
            {shown.map((entry, index) => (
              <Row
                key={index}
                item={entry.item}
                heading={entry.section === shown[index - 1]?.section ? undefined : entry.section}
                onRun={run}
              />
            ))}
          </CommandList>

          <div className="flex h-10 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
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
                <Keys sequence="ctrl+k" />
              </span>
            )}
          </div>
        </Command>

        {panel && active && (
          <ActionPanel
            item={active}
            onRun={(action) => run(active, action)}
            onClose={() => {
              setPanel(false)
              inputRef.current?.focus()
            }}
          />
        )}
      </div>
    </div>
  )
}
