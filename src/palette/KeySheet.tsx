// Holding Ctrl+Shift shows every Zencast key at once, grouped like the palette, and hides on release.
import { useEffect, useState } from "react"

import { allCommands } from "@/commands/jumps"
import { Keys } from "@/components/keys"
import { effectiveBindings } from "@/keys/bindings"
import { readConfig } from "@/shared/config"
import { getState } from "./store"

// Longer than a quick Ctrl+Shift+T, so the sheet only shows when the keys are held on purpose.
const HOLD_MS = 450

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

function useCtrlShiftHold(win: Window): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    let timer = 0
    const hide = () => {
      win.clearTimeout(timer)
      timer = 0
      setHeld(false)
    }
    const down = (event: KeyboardEvent) => {
      const modifier = event.key === "Control" || event.key === "Shift"
      if (!modifier || event.altKey || event.metaKey || !event.ctrlKey || !event.shiftKey || getState().open) return hide()
      if (!timer && !event.repeat) timer = win.setTimeout(() => setHeld(true), HOLD_MS)
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === "Control" || event.key === "Shift") hide()
    }
    win.addEventListener("keydown", down, true)
    win.addEventListener("keyup", up, true)
    win.addEventListener("blur", hide)
    return () => {
      hide()
      win.removeEventListener("keydown", down, true)
      win.removeEventListener("keyup", up, true)
      win.removeEventListener("blur", hide)
    }
  }, [win])
  return held
}

export function KeySheet({ win }: { win: Window }) {
  const held = useCtrlShiftHold(win)
  if (!held) return null
  return (
    <div data-keysheet="" className="pointer-events-none fixed inset-0 bg-black/30 animate-in fade-in-0 duration-150">
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
