import type { ReactNode } from "react"

export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex items-center gap-3">
      <h1 className="text-lg font-medium">{title}</h1>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  )
}

export function GroupHeading({ children }: { children: ReactNode }) {
  return <h2 className="px-3 pt-6 pb-1.5 text-xs font-medium text-faint">{children}</h2>
}

/** A small coloured dot with an accessible label, used for state such as conflicts or changes. */
export function StatusDot({ color, label }: { color: string; label: string }) {
  return <span role="img" aria-label={label} className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
}
