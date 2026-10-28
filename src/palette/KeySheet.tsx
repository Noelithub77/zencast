// Ctrl+/ shows every Zencast key at once, grouped like the palette. Any other key, a click or leaving
// the window hides it; Escape hides it without reaching the page.
import { useEffect } from "react"

import { allCommands } from "@/commands/jumps"
import { Keys } from "@/components/keys"
import { effectiveBindings } from "@/keys/bindings"
import { readConfig } from "@/shared/config"
import { comboFromEvent } from "@/shared/keys"
import { setState, usePalette } from "./store"

interface SheetRow {
  title: string
  keys: string
}

interface Member extends SheetRow {
  n: string
}

/** One row for a numbered family when every member's key and title end in its own number. */
function familyRows(members: Member[]): SheetRow[] {
  const first = members[0]
  const last = members.at(-1)
  const regular = members.every(({ n, title, keys }) => keys.endsWith(n) && title.endsWith(n))
  if (!first || !last || members.length < 2 || !regular) return members
  const range = `${first.n}…${last.n}`
  return [{ title: first.title.slice(0, -1) + range, keys: first.keys.slice(0, -1) + range }]
}

/** Bound commands by section; a numbered family ("Move tab to space 1…9") shows as one row. */
function sheetSections(): Array<[string, SheetRow[]]> {
  const config = readConfig()
  const bindings = effectiveBindings(config)
  const sections = new Map<string, Array<SheetRow | Member[]>>()
  const families = new Map<string, Member[]>()

  for (const command of allCommands(config)) {
    const keys = bindings.get(command.id)?.[0]
    if (!keys) continue
    const rows = sections.get(command.section) ?? []
    sections.set(command.section, rows)
    const numbered = /^(.*)\.([1-9])$/.exec(command.id)
    if (!command.hidden || !numbered) {
      rows.push({ title: command.title, keys })
      continue
    }
    const [, family, n] = numbered
    let members = families.get(family)
    if (!members) {
      members = []
      families.set(family, members)
      rows.push(members)
    }
    members.push({ n, title: command.title, keys })
  }
  return [...sections].map(([section, rows]) => [section, rows.flatMap((row) => (Array.isArray(row) ? familyRows(row) : [row]))])
}

const hide = () => setState({ keySheet: false })

/** Dismisses the sheet on the next key, except the keys that toggle it, and on leaving the window. */
function useDismiss(win: Window, shown: boolean) {
  useEffect(() => {
    if (!shown) return
    const down = (event: KeyboardEvent) => {
      const combo = comboFromEvent(event)
      if (!combo || effectiveBindings(readConfig()).get("zencast.keys")?.includes(combo)) return
      if (combo === "escape") {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      hide()
    }
    win.addEventListener("keydown", down, true)
    win.addEventListener("blur", hide)
    return () => {
      win.removeEventListener("keydown", down, true)
      win.removeEventListener("blur", hide)
    }
  }, [win, shown])
}

export function KeySheet({ win }: { win: Window }) {
  const shown = usePalette((state) => state.keySheet)
  useDismiss(win, shown)
  if (!shown) return null
  return (
    <div data-keysheet="" onClick={hide} className="fixed inset-0 bg-black/30 animate-in fade-in-0 duration-150">
      <div className="absolute top-1/2 left-1/2 max-h-[86vh] w-[min(1100px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[20px] border bg-popover p-7 shadow-2xl shadow-black/60 animate-in zoom-in-[0.98] duration-150">
        <div className="columns-3 gap-10">
          {sheetSections().map(([section, rows]) => (
            <section key={section} className="mb-6 break-inside-avoid">
              <h2 className="mb-2 text-[13px] font-medium text-faint">{section}</h2>
              {rows.map((row) => (
                <div key={row.title} className="flex items-center gap-3 py-1.5 text-[15px]">
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  <Keys sequence={row.keys} />
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
