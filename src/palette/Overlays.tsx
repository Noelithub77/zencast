import { Keys } from "@/components/keys"
import { usePalette } from "./store"

const MAX_HINTS = 10

/** Which-key style hint listing what can follow a pending chord prefix. */
export function ChordHint() {
  const chord = usePalette((s) => s.chord)
  if (!chord) return null
  return (
    <div className="fixed bottom-10 left-1/2 w-[min(420px,90vw)] -translate-x-1/2 animate-in rounded-xl border bg-popover p-2 text-sm shadow-xl shadow-black/50 fade-in-0 duration-100">
      <div className="px-1.5 pb-1.5">
        <Keys sequence={chord.prefix} />
      </div>
      <div className="grid grid-cols-1 gap-0.5">
        {chord.options.slice(0, MAX_HINTS).map(({ next, command }) => (
          <div key={`${next}-${command.id}`} className="flex items-center gap-3 rounded-md px-1.5 py-1">
            <Keys sequence={next} className="w-16 shrink-0" />
            <span className="truncate text-muted-foreground">{command.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
