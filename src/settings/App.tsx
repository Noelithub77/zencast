import { Clock01Icon, FolderLibraryIcon, KeyboardIcon, Settings02Icon, SlidersHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { Icon } from "@/commands/types"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import logo from "@/shared/logo.svg"
import { useRoute, type SectionId } from "./hooks"
import { FoldersSection } from "./folders/FoldersSection"
import { GeneralSection } from "./sections/GeneralSection"
import { KeysSection } from "./sections/KeysSection"
import { SessionsSection } from "./sections/SessionsSection"
import { ZenSettingsSection } from "./sections/ZenSettingsSection"

const NAV: Array<{ id: SectionId; label: string; icon: Icon }> = [
  { id: "keys", label: "Shortcuts", icon: KeyboardIcon },
  { id: "settings", label: "Zen settings", icon: SlidersHorizontalIcon },
  { id: "folders", label: "Folders", icon: FolderLibraryIcon },
  { id: "sessions", label: "Sessions", icon: Clock01Icon },
  { id: "general", label: "General", icon: Settings02Icon },
]

export function App() {
  const { section, param } = useRoute()
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen">
        <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r p-3">
          <div className="flex items-center gap-2 px-2 pt-1 pb-4 text-sm font-medium">
            <img src={logo} alt="" className="size-6" />
            Zencast
          </div>
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={section === item.id ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                section === item.id && "bg-muted text-foreground",
              )}
            >
              <HugeiconsIcon icon={item.icon} strokeWidth={1.8} className="size-4" />
              {item.label}
            </a>
          ))}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-8 py-8">
            {section === "keys" && <KeysSection focusId={param} />}
            {section === "settings" && <ZenSettingsSection />}
            {section === "folders" && <FoldersSection />}
            {section === "sessions" && <SessionsSection />}
            {section === "general" && <GeneralSection />}
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}
