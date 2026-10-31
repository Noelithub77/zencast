// The "!" scope: recently closed tabs, then every visited page, grouped by how long ago it was
// ("Today", "Yesterday", "3 days ago", "Last week", …) and newest first, typed text or not.
import { useEffect, useState } from "react"
import { differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarYears, format } from "date-fns"

import { bareHost } from "@/browser/hosts"
import { closedTabs, reopenClosedTab, searchHistory, type ClosedTab, type Visit } from "@/browser/history"
import type { CommandContext, PaletteItem } from "@/commands/types"
import { fuzzyFilter } from "./search"
import { openActions } from "./sources"

const DEBOUNCE_MS = 40
const CLOSED = "Recently closed"

/** "Today", "Yesterday", "3 days ago", "Last week", "2 weeks ago", "Last month", "5 months ago", "Last year". */
export function relativeDay(ms: number, now = Date.now()): string {
  const days = differenceInCalendarDays(now, ms)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  if (days < 30) return days < 14 ? "Last week" : `${Math.floor(days / 7)} weeks ago`
  const months = Math.max(1, differenceInCalendarMonths(now, ms))
  if (months < 12) return months === 1 ? "Last month" : `${months} months ago`
  const years = Math.max(1, differenceInCalendarYears(now, ms))
  return years === 1 ? "Last year" : `${years} years ago`
}

/** "5 min ago" within the hour, then the time of day, then the date once a week has passed. */
function when(ms: number, now: number): string {
  const minutes = Math.floor((now - ms) / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const days = differenceInCalendarDays(now, ms)
  if (days < 7) return format(ms, "HH:mm")
  return format(ms, new Date(ms).getFullYear() === new Date(now).getFullYear() ? "d MMM" : "d MMM yyyy")
}

function closedItem(ctx: CommandContext, tab: ClosedTab, now: number): PaletteItem {
  return {
    id: `closed:${tab.id}`,
    transient: true,
    scope: "history",
    title: tab.title,
    subtitle: bareHost(tab.url) ?? undefined,
    section: CLOSED,
    icon: { kind: "favicon", url: `page-icon:${tab.url}` },
    accessory: when(tab.closed, now),
    actions: [
      { id: "reopen", title: "Reopen tab", run: () => reopenClosedTab(ctx.win, tab.id) },
      ...openActions(ctx, () => tab.url).slice(1),
    ],
  }
}

function visitItem(ctx: CommandContext, visit: Visit, now: number): PaletteItem {
  return {
    id: `history:${visit.url}`,
    transient: true,
    scope: "history",
    title: visit.title || visit.url,
    subtitle: bareHost(visit.url) ?? undefined,
    section: relativeDay(visit.visited, now),
    icon: { kind: "favicon", url: `page-icon:${visit.url}` },
    accessory: when(visit.visited, now),
    actions: openActions(ctx, () => visit.url),
  }
}

/** Closed tabs first, then visits; a page reopened from "Recently closed" isn't listed twice. */
function historyItems(ctx: CommandContext, closed: ClosedTab[], visits: Visit[]): PaletteItem[] {
  const now = Date.now()
  const reopenable = new Set(closed.map((tab) => tab.url))
  return [
    ...closed.map((tab) => closedItem(ctx, tab, now)),
    ...visits.filter((visit) => !reopenable.has(visit.url)).map((visit) => visitItem(ctx, visit, now)),
  ]
}

/** Rows for the "!" scope, searched as the text changes; the last rows stay up until the next arrive. */
export function useHistory(context: CommandContext | null, enabled: boolean, query: string): PaletteItem[] {
  const [items, setItems] = useState<PaletteItem[]>([])
  useEffect(() => {
    if (!context || !enabled) return
    let live = true
    const timer = setTimeout(() => {
      const all = closedTabs(context.win)
      const matched = new Set(fuzzyFilter(all, (tab) => `${tab.title} ${tab.url}`, query))
      const closed = all.filter((tab) => matched.has(tab))
      searchHistory(query)
        .then((visits) => live && setItems(historyItems(context, closed, visits)))
        .catch((error: unknown) => console.error("[zencast] history", error))
    }, query ? DEBOUNCE_MS : 0)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [context, enabled, query])
  return enabled ? items : []
}
