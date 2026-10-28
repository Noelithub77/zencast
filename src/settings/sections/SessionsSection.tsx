import { AppWindowIcon, ArrowDown01Icon, ArrowRight01Icon, Clock01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useState } from "react"

import { listSessions, onSessionsChange, openSavedTabs, sessionStart, sessionTime, tabCount, type SavedWindow, type Session } from "@/browser/sessions"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useBrowserWindow } from "../hooks"
import { SectionHeader } from "../parts"

function useSessions(): Session[] {
  const [sessions, setSessions] = useState<Session[]>([])
  useEffect(() => {
    let live = true
    const load = () => void listSessions().then((next) => live && setSessions(next))
    load()
    const stop = onSessionsChange(load)
    return () => {
      live = false
      stop()
    }
  }, [])
  return sessions
}

// Written out in full so Tailwind finds the classes.
const CHEVRON = {
  session: ["group-data-[state=open]/session:hidden", "group-data-[state=open]/session:block"],
  window: ["group-data-[state=open]/window:hidden", "group-data-[state=open]/window:block"],
}

function Chevron({ group }: { group: keyof typeof CHEVRON }) {
  const [closed, open] = CHEVRON[group]
  return (
    <>
      <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className={`size-3.5 text-faint ${closed}`} />
      <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className={`hidden size-3.5 text-faint ${open}`} />
    </>
  )
}

// "(3) WhatsApp" names the app WhatsApp.
const appName = (title = "") => title.replace(/^\(\d+\)\s*/, "")

function WindowRow({ win, saved, index }: { win: Window; saved: SavedWindow; index: number }) {
  const app = saved.quick ? saved.tabs[0] : undefined
  return (
    <Collapsible className="group/window">
      <div className="flex h-9 items-center gap-2 pr-2 pl-6">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Chevron group="window" />
          {app ? (
            <img src={app.icon || `page-icon:${app.url}`} alt="" className="size-4 rounded-sm" />
          ) : (
            <HugeiconsIcon icon={AppWindowIcon} strokeWidth={1.8} className="size-4 text-faint" />
          )}
          <span className="truncate">{app ? appName(app.title) : `Window ${index + 1}`}</span>
          <span className="shrink-0 text-xs text-faint">
            {app ? "Quick" : `${saved.tabs.length} ${saved.tabs.length === 1 ? "tab" : "tabs"}`}
          </span>
        </CollapsibleTrigger>
        <Button variant="ghost" size="sm" onClick={() => openSavedTabs(win, saved.tabs, true)}>
          Open all
        </Button>
      </div>
      <CollapsibleContent className="pb-2 pl-14">
        {saved.tabs.map((tab, i) => (
          <button
            key={i}
            type="button"
            onClick={() => openSavedTabs(win, [tab])}
            className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-muted"
          >
            <img src={tab.icon || `page-icon:${tab.url}`} alt="" className="size-3.5 rounded-sm" />
            <span className="truncate">{tab.title}</span>
            {tab.space && <span className="ml-auto shrink-0 text-faint">{saved.spaces[tab.space]}</span>}
          </button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function SessionsSection() {
  const win = useBrowserWindow()
  const sessions = useSessions()
  const current = sessionStart()
  return (
    <>
      <SectionHeader title="Sessions" />
      {sessions.length ? (
        sessions.map((session) => (
          <Collapsible key={session.start} className="group/session rounded-lg hover:bg-muted/40 data-[state=open]:bg-muted/40">
            <CollapsibleTrigger className="flex h-12 w-full items-center gap-2 rounded-lg px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Chevron group="session" />
              <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.8} className="size-4 text-peach" />
              <span className="text-sm">{sessionTime(session.start)}</span>
              {session.start === current && <span className="size-1.5 rounded-full bg-mint" role="img" aria-label="This session" />}
              <span className="ml-auto text-xs text-faint">
                {session.windows.length} windows · {tabCount(session)} tabs
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="pb-2">
              {session.windows.toSorted((a, b) => b.tabs.length - a.tabs.length).map((saved, index) => (
                <WindowRow key={saved.id} win={win} saved={saved} index={index} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))
      ) : (
        <p className="py-10 text-center text-sm text-faint">No sessions saved yet</p>
      )}
    </>
  )
}
