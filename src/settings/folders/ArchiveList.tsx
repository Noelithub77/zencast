import { ArrowDown01Icon, ArrowRight01Icon, Folder01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { formatDistanceToNow } from "date-fns"
import { useEffect, useState } from "react"

import {
  countTabs,
  deleteArchived,
  onArchiveChange,
  readArchive,
  restoreFolder,
  type ArchivedFolder,
  type ArchivedFolderNode,
} from "@/browser/archive"
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { notify } from "@/browser/toast"
import { fuzzyFilter } from "@/palette/search"

/** The archive file, re-read whenever any window writes it. */
export function useArchive(): ArchivedFolder[] {
  const [entries, setEntries] = useState<ArchivedFolder[]>([])
  useEffect(() => {
    let live = true
    const load = () => void readArchive().then((next) => live && setEntries(next))
    load()
    const stop = onArchiveChange(load)
    return () => {
      live = false
      stop()
    }
  }, [])
  return entries
}

function TabPreview({ node, depth = 0 }: { node: ArchivedFolderNode; depth?: number }) {
  return node.items.map((item, index) =>
    item.type === "folder" ? (
      <div key={index}>
        <div className="flex h-7 items-center gap-2 text-xs text-muted-foreground" style={{ paddingLeft: depth * 16 }}>
          <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.8} className="size-3.5 text-lilac" />
          {item.label}
        </div>
        <TabPreview node={item} depth={depth + 1} />
      </div>
    ) : (
      <div key={index} className="flex h-7 items-center gap-2 text-xs" style={{ paddingLeft: depth * 16 }}>
        <img src={`page-icon:${item.url}`} alt="" className="size-3.5 rounded-sm" />
        <span className="truncate">{item.title || item.url}</span>
      </div>
    ),
  )
}

export function ArchiveList({ win, entries, query }: { win: Window; entries: ArchivedFolder[]; query: string }) {
  const [deleting, setDeleting] = useState<ArchivedFolder | null>(null)
  const visible = fuzzyFilter(entries, (entry) => `${entry.root.label} ${entry.workspaceName}`, query)

  if (!visible.length) return <p className="py-10 text-center text-sm text-faint">{query ? "No matches" : "Nothing archived"}</p>

  return (
    <>
      {visible.map((entry) => (
        <Collapsible key={entry.id} className="group/archive rounded-lg hover:bg-muted/40 data-[state=open]:bg-muted/40">
          <div className="flex h-12 items-center gap-2 pr-2 pl-2">
            <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-3.5 text-faint group-data-[state=open]/archive:hidden"
              />
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                strokeWidth={2}
                className="hidden size-3.5 text-faint group-data-[state=open]/archive:block"
              />
              <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.8} className="size-4 text-lilac" />
              <span className="min-w-0">
                <span className="block truncate text-sm">{entry.root.label}</span>
                <span className="block truncate text-xs text-faint">
                  {entry.workspaceName} · {countTabs(entry.root)} tabs · {formatDistanceToNow(entry.archivedAt, { addSuffix: true })}
                </span>
              </span>
            </CollapsibleTrigger>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void restoreFolder(win, entry.id).then((folder) => {
                  notify(win, folder ? `Restored ${entry.root.label}` : "Couldn't restore folder")
                })
              }
            >
              Restore
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(entry)}>
              Delete
            </Button>
          </div>
          <CollapsibleContent className="pr-3 pb-2 pl-12">
            <TabPreview node={entry.root} />
          </CollapsibleContent>
        </Collapsible>
      ))}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.root.label} permanently?</AlertDialogTitle>
            <AlertDialogDescription>The archived tabs can't be restored afterwards.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleting && void deleteArchived(deleting.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
