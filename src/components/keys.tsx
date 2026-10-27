import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { displaySequence } from "@/shared/keys"

/** A key sequence as badges; chords are separated by a thin gap. */
export function Keys({ sequence, className }: { sequence: string; className?: string }) {
  if (!sequence) return null
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      {displaySequence(sequence).map((combo, i) => (
        <KbdGroup key={i}>
          {combo.map((part) => (
            <Kbd key={part}>{part}</Kbd>
          ))}
        </KbdGroup>
      ))}
    </span>
  )
}
