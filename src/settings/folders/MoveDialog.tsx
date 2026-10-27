import { Folder01Icon, Layers01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { allFolders, folderPath, moveFolderToWorkspace, moveTabToFolder, moveTabToSpace } from "@/browser/folders"
import { notify } from "@/browser/toast"
import { listWorkspaces } from "@/browser/workspaces"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

export type MoveTarget = { kind: "tab"; tab: XULTab; title: string } | { kind: "folder"; folder: ZenFolder; title: string }

interface MoveDialogProps {
  win: Window
  target: MoveTarget | null
  onClose: () => void
}

export function MoveDialog({ win, target, onClose }: MoveDialogProps) {
  const spaces = listWorkspaces(win)
  const spaceName = (id: string | null) => spaces.find((ws) => ws.uuid === id)?.name ?? ""
  const currentSpace =
    target?.kind === "tab" ? target.tab.getAttribute("zen-workspace-id") : target?.folder.getAttribute("zen-workspace-id")

  const done = (where: string, move: () => void) => {
    move()
    notify(win, `Moved ${target?.title ?? ""} to ${where}`)
    onClose()
  }

  return (
    <CommandDialog open={!!target} onOpenChange={(open) => !open && onClose()} title="Move" description="Choose a destination">
      <CommandInput placeholder={target ? `Move ${target.title}` : "Move"} />
      <CommandList className="max-h-80">
        <CommandEmpty>No destinations</CommandEmpty>
        {target?.kind === "tab" && (
          <CommandGroup heading="Folders">
            {allFolders(win)
              .filter((folder) => folder !== target.tab.group)
              .map((folder) => (
                <CommandItem
                  key={folder.id}
                  value={`${folderPath(folder)} ${spaceName(folder.getAttribute("zen-workspace-id"))} ${folder.id}`}
                  onSelect={() => done(folder.label, () => moveTabToFolder(win, target.tab, folder))}
                >
                  <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.8} className="text-lilac" />
                  <span className="truncate">{folderPath(folder)}</span>
                  <span className="ml-auto text-xs text-faint">{spaceName(folder.getAttribute("zen-workspace-id"))}</span>
                </CommandItem>
              ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Spaces">
          {spaces
            .filter((ws) => target?.kind === "tab" ? ws.uuid !== currentSpace || !!target.tab.group : ws.uuid !== currentSpace)
            .map((ws) => (
              <CommandItem
                key={ws.uuid}
                value={`${ws.name} ${ws.uuid}`}
                onSelect={() =>
                  target &&
                  done(ws.name, () =>
                    target.kind === "tab" ? moveTabToSpace(win, target.tab, ws.uuid) : moveFolderToWorkspace(win, target.folder, ws.uuid),
                  )
                }
              >
                <HugeiconsIcon icon={Layers01Icon} strokeWidth={1.8} />
                {ws.name}
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
