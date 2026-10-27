import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  BrowserIcon,
  Folder01Icon,
  FolderOpenIcon,
  Layers01Icon,
  MoreHorizontalIcon,
  PinIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"

import { archiveFolder, restoreFolder } from "@/browser/archive"
import { createFolderInSpace, deleteFolder, renameFolder, spaceTrees, type FolderNode } from "@/browser/folders"
import { closeTab, selectTab } from "@/browser/tabs"
import { notify } from "@/browser/toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useTabSnapshot } from "../hooks"
import { MoveDialog, type MoveTarget } from "./MoveDialog"
import { isExpandable, isOpen, searchRows, treeRows, type TreeRow } from "./rows"

interface Action {
  id: "open" | "move" | "rename" | "archive" | "newFolder" | "remove"
  label: string
  key: string
  danger?: boolean
}

function actionsFor(row: TreeRow): Action[] {
  switch (row.kind) {
    case "space":
      return [{ id: "newFolder", label: "New folder", key: "N" }]
    case "folder":
      return [
        { id: "move", label: "Move to space", key: "M" },
        { id: "rename", label: "Rename", key: "R" },
        { id: "archive", label: "Archive", key: "A" },
        { id: "remove", label: "Delete", key: "Del", danger: true },
      ]
    case "tab":
      return [
        { id: "open", label: "Open", key: "↵" },
        { id: "move", label: "Move", key: "M" },
        { id: "remove", label: "Close", key: "Del", danger: true },
      ]
    case "loose":
      return []
  }
}

const KEY_ACTIONS: Record<string, Action["id"]> = { m: "move", r: "rename", a: "archive", n: "newFolder", Delete: "remove" }

export function FolderTree({ win, query }: { win: Window; query: string }) {
  const [trees, refresh] = useTabSnapshot(win, spaceTrees)
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set())
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [moving, setMoving] = useState<MoveTarget | null>(null)
  const [deleting, setDeleting] = useState<FolderNode | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => (query.trim() ? searchRows(trees, query) : treeRows(trees, toggled)), [trees, toggled, query])
  const focusedIndex = Math.max(0, rows.findIndex((row) => row.key === focusedKey))
  const focused = rows[focusedIndex] ?? null

  useEffect(() => {
    if (focused) treeRef.current?.querySelector(`[data-key="${CSS.escape(focused.key)}"]`)?.scrollIntoView({ block: "nearest" })
  }, [focused])

  const toggle = (row: TreeRow) =>
    setToggled((current) => {
      const next = new Set(current)
      if (next.has(row.key)) next.delete(row.key)
      else next.add(row.key)
      return next
    })

  const run = (row: TreeRow, id: Action["id"]) => {
    if (!actionsFor(row).some((action) => action.id === id) && id !== "open") return
    switch (id) {
      case "open":
        if (row.kind === "tab") void selectTab(win, row.node.tab)
        else if (isExpandable(row)) toggle(row)
        return
      case "move":
        if (row.kind === "tab") setMoving({ kind: "tab", tab: row.node.tab, title: row.node.title })
        if (row.kind === "folder") setMoving({ kind: "folder", folder: row.node.folder, title: row.node.label })
        return
      case "rename":
        setRenaming(row.key)
        return
      case "archive":
        if (row.kind !== "folder") return
        void archiveFolder(win, row.node.folder).then((entry) =>
          notify(win, `Archived ${entry.root.label}`, { label: "Undo", run: () => void restoreFolder(win, entry.id).then(refresh) }),
        )
        return
      case "newFolder":
        if (row.kind !== "space") return
        createFolderInSpace(win, row.tree.workspace.uuid, "New folder")
        refresh()
        return
      case "remove":
        if (row.kind === "folder") setDeleting(row.node)
        if (row.kind === "tab") closeTab(win, row.node.tab)
        return
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget || event.ctrlKey || event.altKey || event.metaKey || !focused) return
    const move = (index: number) => {
      const row = rows[Math.min(rows.length - 1, Math.max(0, index))]
      if (row) setFocusedKey(row.key)
    }
    const open = isExpandable(focused) && isOpen(focused, toggled)
    let handled = true
    switch (event.key) {
      case "ArrowDown":
        move(focusedIndex + 1)
        break
      case "ArrowUp":
        move(focusedIndex - 1)
        break
      case "Home":
        move(0)
        break
      case "End":
        move(rows.length - 1)
        break
      case "ArrowRight":
        if (isExpandable(focused) && !open && !query) toggle(focused)
        else move(focusedIndex + 1)
        break
      case "ArrowLeft":
        if (open && !query) toggle(focused)
        else {
          // Parent: the nearest row above with a smaller depth.
          for (let i = focusedIndex - 1; i >= 0; i--)
            if (rows[i].depth < focused.depth) {
              move(i)
              break
            }
        }
        break
      case "Enter":
        run(focused, "open")
        break
      default: {
        const action = KEY_ACTIONS[event.key]
        if (action) run(focused, action)
        else handled = false
      }
    }
    if (handled) event.preventDefault()
  }

  return (
    <>
      <div
        ref={treeRef}
        role="tree"
        aria-label="Folders"
        tabIndex={0}
        aria-activedescendant={focused ? `row-${focused.key}` : undefined}
        onKeyDown={onKeyDown}
        className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {rows.length === 0 && <p className="py-10 text-center text-sm text-faint">{query ? "No matches" : "No folders yet"}</p>}
        {rows.map((row) => (
          <TreeItem
            key={row.key}
            row={row}
            open={isExpandable(row) && isOpen(row, toggled)}
            focused={row === focused}
            renaming={renaming === row.key}
            onFocus={() => setFocusedKey(row.key)}
            onToggle={() => toggle(row)}
            onRun={(id) => run(row, id)}
            onRenamed={(label) => {
              if (label && row.kind === "folder") renameFolder(row.node.folder, label)
              setRenaming(null)
              refresh()
              treeRef.current?.focus()
            }}
          />
        ))}
      </div>

      <MoveDialog
        win={win}
        target={moving}
        onClose={() => {
          setMoving(null)
          refresh()
          treeRef.current?.focus()
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.label}?</AlertDialogTitle>
            <AlertDialogDescription>Keep the tabs in the space, or close them with the folder.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="outline" onClick={() => deleting && void deleteFolder(deleting.folder, true).then(refresh)}>
              Keep tabs
            </AlertDialogAction>
            <AlertDialogAction variant="destructive" onClick={() => deleting && void deleteFolder(deleting.folder, false).then(refresh)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface TreeItemProps {
  row: TreeRow
  open: boolean
  focused: boolean
  renaming: boolean
  onFocus: () => void
  onToggle: () => void
  onRun: (id: Action["id"]) => void
  onRenamed: (label: string | null) => void
}

function RowIcon({ row, open }: { row: TreeRow; open: boolean }) {
  switch (row.kind) {
    case "space":
      return <HugeiconsIcon icon={Layers01Icon} strokeWidth={1.8} className="size-4 text-muted-foreground" />
    case "folder":
      return <HugeiconsIcon icon={open ? FolderOpenIcon : Folder01Icon} strokeWidth={1.8} className="size-4 text-lilac" />
    case "loose":
      return <HugeiconsIcon icon={row.label === "Pinned" ? PinIcon : BrowserIcon} strokeWidth={1.8} className="size-4 text-faint" />
    case "tab": {
      const image = row.node.tab.getAttribute("image") || `page-icon:${row.node.url}`
      return <img src={image} alt="" className="size-4 rounded-sm" />
    }
  }
}

function rowLabel(row: TreeRow): string {
  switch (row.kind) {
    case "space":
      return row.tree.workspace.name
    case "folder":
      return row.node.label
    case "loose":
      return row.label
    case "tab":
      return row.node.title
  }
}

function TreeItem({ row, open, focused, renaming, onFocus, onToggle, onRun, onRenamed }: TreeItemProps) {
  const actions = actionsFor(row)
  const count = row.kind === "tab" ? null : row.kind === "loose" ? row.tabs.length : row.count
  return (
    <div
      id={`row-${row.key}`}
      data-key={row.key}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={isExpandable(row) ? open : undefined}
      aria-selected={focused}
      onClick={onFocus}
      onDoubleClick={() => onRun("open")}
      style={{ paddingLeft: 8 + row.depth * 18 }}
      className={cn(
        "group flex h-9 items-center gap-2 rounded-lg pr-2 text-sm hover:bg-muted/40",
        focused && "bg-muted",
        row.kind === "space" && "mt-2 font-medium",
      )}
    >
      {isExpandable(row) ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Collapse" : "Expand"}
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
          className="flex size-4 items-center justify-center text-faint hover:text-foreground"
        >
          <HugeiconsIcon icon={open ? ArrowDown01Icon : ArrowRight01Icon} strokeWidth={2} className="size-3.5" />
        </button>
      ) : (
        <span className="size-4" />
      )}
      <RowIcon row={row} open={open} />

      {renaming ? (
        <Input
          autoFocus
          defaultValue={rowLabel(row)}
          aria-label="Folder name"
          className="h-7 max-w-64"
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Enter") onRenamed(event.currentTarget.value.trim() || null)
            if (event.key === "Escape") onRenamed(null)
          }}
          onBlur={() => onRenamed(null)}
        />
      ) : (
        <span className={cn("truncate", row.kind === "loose" && "text-muted-foreground")}>{rowLabel(row)}</span>
      )}
      {"path" in row && row.path && <span className="min-w-0 truncate text-xs text-faint">{row.path}</span>}

      <span className="ml-auto flex shrink-0 items-center gap-1">
        {count !== null && <span className="text-xs text-faint tabular-nums">{count}</span>}
        {actions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                tabIndex={-1}
                aria-label="Actions"
                className={cn("opacity-0 group-hover:opacity-100 aria-expanded:opacity-100", focused && "opacity-100")}
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map((action) => (
                <span key={action.id}>
                  {action.danger && <DropdownMenuSeparator />}
                  <DropdownMenuItem variant={action.danger ? "destructive" : "default"} onSelect={() => onRun(action.id)}>
                    {action.label}
                    <DropdownMenuShortcut>{action.key}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </span>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </span>
    </div>
  )
}
