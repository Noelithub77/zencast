import { Command as CommandPrimitive } from "cmdk"

import type { ItemAction, PaletteItem } from "@/commands/types"
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command"
import { Keys } from "@/components/keys"
import { Kbd } from "@/components/ui/kbd"

interface ActionPanelProps {
  item: PaletteItem
  /** Ctrl is held: show 1–9, which Ctrl+digit runs. */
  numbered: boolean
  onRun: (action: ItemAction) => void
}

export function ActionPanel({ item, numbered, onRun }: ActionPanelProps) {
  return (
    <div className="absolute right-2.5 bottom-14 z-10 w-88 rounded-xl border bg-popover shadow-2xl shadow-black/60">
      <Command
        vimBindings={false}
        loop
        className="rounded-xl bg-transparent p-1"
        // Escape, Ctrl+K and Ctrl+digit are handled by the palette; keep list keys to the panel.
        onKeyDown={(event) => event.stopPropagation()}
      >
        <CommandList className="max-h-64 p-0.5">
          <CommandEmpty className="py-3 text-xs text-faint">No actions</CommandEmpty>
          {item.actions.map((action, index) => (
            <CommandItem
              key={action.id}
              value={action.title}
              onSelect={() => onRun(action)}
              className={`rounded-lg px-3 py-2 ${action.danger ? "text-rose data-selected:text-rose" : ""}`}
            >
              <span className="truncate">{action.title}</span>
              <span data-slot="command-shortcut" className="ml-auto">
                {numbered && index < 9 ? (
                  <Kbd className="bg-peach/15 text-peach">{index + 1}</Kbd>
                ) : (
                  <Keys sequence={index === 0 ? "enter" : (action.keys ?? "")} />
                )}
              </span>
            </CommandItem>
          ))}
        </CommandList>
        <div className="border-t px-2.5 pt-1">
          <CommandPrimitive.Input
            autoFocus
            placeholder="Search actions"
            className="h-8 w-full bg-transparent text-sm outline-hidden placeholder:text-faint"
          />
        </div>
      </Command>
    </div>
  )
}
