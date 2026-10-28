import { MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useMemo, useState } from "react"

import { openPane } from "@/browser/settings-index"
import { nativeShortcuts } from "@/browser/zen-shortcuts"
import { allCommands } from "@/commands/jumps"
import { Keys } from "@/components/keys"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { bindSequence, buildIndex, effectiveBindings } from "@/keys/bindings"
import { fuzzyFilter } from "@/palette/search"
import { jumpId, updateConfig, type Config } from "@/shared/config"
import { displaySequence } from "@/shared/keys"
import { useBrowserWindow, useConfig } from "../hooks"
import { GroupHeading, SectionHeader, StatusDot } from "../parts"
import { useRecorder, type Recording } from "./useRecorder"

interface Issue {
  tone: "error" | "warn"
  text: string
}

interface Row {
  id: string
  title: string
  group: string
  sequences: string[]
  editable: boolean
  changed: boolean
  issues: Issue[]
}

const TONE = { error: "var(--rose)", warn: "var(--butter)" } as const

function withBinding(config: Config, id: string, sequences: string[]): Config {
  return { ...config, bindings: { ...config.bindings, [id]: sequences } }
}

function resetBinding(config: Config, id: string): Config {
  return { ...config, bindings: Object.fromEntries(Object.entries(config.bindings).filter(([key]) => key !== id)) }
}

function commitSequence(id: string, mode: Recording["mode"], sequence: string) {
  bindSequence(id, sequence, mode)
}

/** Unbinds a command; a jump has no other use, so it goes too. */
function removeBinding(config: Config, id: string): Config {
  const jumps = config.jumps.filter((jump) => jumpId(jump) !== id)
  return jumps.length === config.jumps.length
    ? withBinding(config, id, [])
    : { ...resetBinding(config, id), jumps }
}

function useRows(win: Window, config: Config): Row[] {
  return useMemo(() => {
    const bindings = effectiveBindings(config)
    const index = buildIndex(config)
    const native = nativeShortcuts(win).filter((shortcut) => shortcut.combo)
    const nativeByCombo = new Map(native.map((shortcut) => [shortcut.combo, shortcut.title]))
    const ownerOfCombo = new Map<string, string>()

    const rows: Row[] = allCommands(config).map((command) => {
      const sequences = bindings.get(command.id) ?? []
      const issues: Issue[] = []
      for (const sequence of sequences) {
        const first = sequence.split(" ")[0]
        if (!ownerOfCombo.has(first)) ownerOfCombo.set(first, command.title)
        const others = (index.exact.get(sequence) ?? []).filter((other) => other.id !== command.id)
        // Commands with `when` conditions may share keys; only unconditional overlaps clash.
        if (others.length && (!command.when || others.some((other) => !other.when)))
          issues.push({ tone: "error", text: `Also bound to ${others.map((other) => other.title).join(", ")}` })
        if (index.prefixes.has(sequence)) issues.push({ tone: "error", text: "Blocks a chord that starts with these keys" })
        const zen = nativeByCombo.get(first)
        // A key that yields when it has nothing to do (Ctrl+C with a selection) does not replace Zen's.
        if (zen && !command.keysWhen) issues.push({ tone: "warn", text: `Replaces Zen's ${zen}` })
      }
      return {
        id: command.id,
        title: command.title,
        group: command.section === "Palette" ? "Zencast" : command.section,
        sequences,
        editable: true,
        changed: command.id in config.bindings,
        issues,
      }
    })

    for (const shortcut of native) {
      const owner = ownerOfCombo.get(shortcut.combo)
      rows.push({
        id: `native:${shortcut.id}`,
        title: shortcut.title,
        group: "Zen",
        sequences: [shortcut.combo],
        editable: false,
        changed: false,
        issues: owner ? [{ tone: "warn", text: `Replaced by ${owner}` }] : [],
      })
    }
    return rows
  }, [win, config])
}

export function KeysSection({ focusId }: { focusId: string }) {
  const win = useBrowserWindow()
  const config = useConfig()
  const rows = useRows(win, config)
  const [query, setQuery] = useState("")
  const { recording, start } = useRecorder(win, commitSequence)

  const visible = useMemo(
    () =>
      fuzzyFilter(
        rows,
        (row) => `${row.title} ${row.group} ${row.sequences.map((s) => displaySequence(s).flat().join(" ")).join(" ")}`,
        query,
      ),
    [rows, query],
  )
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>()
    for (const row of visible) map.set(row.group, [...(map.get(row.group) ?? []), row])
    return [...map]
  }, [visible])
  const issueCount = rows.filter((row) => row.editable && row.issues.some((issue) => issue.tone === "error")).length

  useEffect(() => {
    if (focusId) document.getElementById(`key-${focusId}`)?.scrollIntoView({ block: "center" })
  }, [focusId])

  return (
    <section>
      <SectionHeader title="Shortcuts">
        {issueCount > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-rose/10 px-2 py-0.5 text-xs text-rose">
            <span className="size-1.5 rounded-full bg-rose" />
            {issueCount} {issueCount === 1 ? "conflict" : "conflicts"}
          </span>
        )}
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter" className="h-8 w-56" />
      </SectionHeader>

      {groups.map(([group, list]) => (
        <div key={group}>
          <div className="flex items-center">
            <GroupHeading>{group}</GroupHeading>
            {group === "Zen" && (
              <Button variant="ghost" size="xs" className="mt-4 ml-auto" onClick={() => openPane(win, "paneZenCKS")}>
                Edit in Zen
              </Button>
            )}
          </div>
          {list.map((row) => (
            <KeyRow
              key={row.id}
              row={row}
              focused={row.id === focusId}
              recording={recording?.id === row.id ? recording : null}
              onRecord={(mode) => start(row.id, mode)}
            />
          ))}
        </div>
      ))}
    </section>
  )
}

interface KeyRowProps {
  row: Row
  focused: boolean
  recording: Recording | null
  onRecord: (mode: Recording["mode"]) => void
}

function KeyRow({ row, focused, recording, onRecord }: KeyRowProps) {
  const replaced = !row.editable && row.issues.length > 0
  return (
    <div
      id={`key-${row.id}`}
      className={cn("group flex h-11 items-center gap-2.5 rounded-lg px-3 hover:bg-muted/40", focused && "bg-muted/60")}
    >
      <span className={cn("truncate text-sm", replaced && "text-faint")}>{row.title}</span>
      {row.changed && <StatusDot color="var(--peach)" label="Changed from default" />}
      {row.issues.map((issue) => (
        <Tooltip key={issue.text}>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="flex size-4 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <StatusDot color={TONE[issue.tone]} label={issue.text} />
            </span>
          </TooltipTrigger>
          <TooltipContent>{issue.text}</TooltipContent>
        </Tooltip>
      ))}

      <div className="ml-auto flex items-center gap-1">
        {recording ? (
          <span className="flex h-7 items-center gap-2 rounded-md px-2 ring-2 ring-ring">
            {recording.combos.length ? (
              <Keys sequence={recording.combos.join(" ")} />
            ) : (
              <span className="text-xs text-muted-foreground">{recording.hint ?? "Press keys"}</span>
            )}
          </span>
        ) : row.editable ? (
          <button
            type="button"
            onClick={() => onRecord("replace")}
            aria-label={`Record shortcut for ${row.title}`}
            className="flex h-7 items-center gap-2 rounded-md px-1.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.sequences.length ? (
              row.sequences.map((sequence) => <Keys key={sequence} sequence={sequence} />)
            ) : (
              <span className="text-xs text-faint">Record</span>
            )}
          </button>
        ) : (
          <span className={cn("flex h-7 items-center px-1.5", replaced && "opacity-40")}>
            <Keys sequence={row.sequences[0]} />
          </span>
        )}

        {row.editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="More"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onRecord("add")}>Add another</DropdownMenuItem>
              <DropdownMenuItem disabled={!row.changed} onSelect={() => updateConfig((c) => resetBinding(c, row.id))}>
                Reset to default
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={!row.sequences.length}
                onSelect={() => updateConfig((c) => removeBinding(c, row.id))}
              >
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
