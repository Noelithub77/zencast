import { Command as CommandPrimitive } from "cmdk"

import type { ItemAction, PaletteItem } from "@/commands/types"
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command"
import { comboFromEvent } from "@/shared/keys"
import { Keys } from "@/components/keys"
import { holdBrowserShortcut } from "./parts"

interface ActionPanelProps {
  item: PaletteItem
  onRun: (action: ItemAction) => void
  onClose: () => void
}

export function ActionPanel({ item, onRun, onClose }: ActionPanelProps) {
  return (
    <div className="absolute right-2 bottom-12 z-10 w-72 rounded-xl border bg-popover shadow-2xl shadow-black/60">
      <Command
        vimBindings={false}
        loop
        className="rounded-xl bg-transparent p-1"
        onKeyDown={(event) => {
          // The palette underneath handles its own keys; keep these to the panel.
          event.stopPropagation()
          const combo = comboFromEvent(event.nativeEvent)
          if (combo === "escape" || combo === "ctrl+k") {
            event.preventDefault()
            onClose()
          } else if (combo) holdBrowserShortcut(event.nativeEvent, combo)
        }}
      >
        <CommandList className="max-h-64 p-0.5">
          <CommandEmpty className="py-3 text-xs text-faint">No actions</CommandEmpty>
          {item.actions.map((action, index) => (
            <CommandItem
              key={action.id}
              value={action.title}
              onSelect={() => onRun(action)}
              className={`rounded-lg px-2.5 py-1.5 ${action.danger ? "text-rose data-selected:text-rose" : ""}`}
            >
              <span className="truncate">{action.title}</span>
              <span data-slot="command-shortcut" className="ml-auto">
                <Keys sequence={index === 0 ? "enter" : (action.keys ?? "")} />
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
