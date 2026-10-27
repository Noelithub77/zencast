import { ArrowRight01Icon, Undo02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMemo, useState } from "react"

import { openPane, paneSettings, prefSettings, prefValue, searchPreferences, type PrefSetting } from "@/browser/settings-index"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { fuzzyFilter } from "@/palette/search"
import { useBrowserWindow } from "../hooks"
import { GroupHeading, SectionHeader, StatusDot } from "../parts"

const MAX_UNFILTERED = 80

export function ZenSettingsSection() {
  const win = useBrowserWindow()
  const [query, setQuery] = useState("")
  // Bumped after a toggle or reset so switches re-read their prefs.
  const [, setRevision] = useState(0)
  const refresh = () => setRevision((r) => r + 1)

  const panes = useMemo(() => fuzzyFilter(paneSettings(), (pane) => `${pane.title} ${pane.keywords}`, query), [query])
  const prefs = useMemo(() => {
    const matches = fuzzyFilter(prefSettings(), (pref) => `${pref.title} ${pref.section} ${pref.name}`, query)
    return query ? matches : matches.slice(0, MAX_UNFILTERED)
  }, [query])
  const groups = useMemo(() => {
    const map = new Map<string, PrefSetting[]>()
    for (const pref of prefs) map.set(pref.section, [...(map.get(pref.section) ?? []), pref])
    return [...map]
  }, [prefs])

  return (
    <section>
      <SectionHeader title="Zen settings">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settings"
          className="h-8 w-64"
        />
      </SectionHeader>

      {panes.length > 0 && (
        <>
          <GroupHeading>Pages</GroupHeading>
          {panes.map((pane) => (
            <button
              key={pane.pane}
              type="button"
              onClick={() => openPane(win, pane.pane)}
              className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {pane.title}
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} className="ml-auto size-4 text-faint" />
            </button>
          ))}
        </>
      )}

      {groups.map(([section, list]) => (
        <div key={section}>
          <GroupHeading>{section}</GroupHeading>
          {list.map((pref) => (
            <PrefRow key={pref.name} pref={pref} onChange={refresh} />
          ))}
        </div>
      ))}

      {query.trim().length > 1 && (
        <Button variant="ghost" size="sm" className="mt-6" onClick={() => searchPreferences(win, query)}>
          Search all Firefox settings for “{query.trim()}”
        </Button>
      )}
    </section>
  )
}

function PrefRow({ pref, onChange }: { pref: PrefSetting; onChange: () => void }) {
  const changed = Services.prefs.prefHasUserValue(pref.name)
  return (
    <div className="group flex h-12 items-center gap-2.5 rounded-lg px-3 hover:bg-muted/40">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm">
          {pref.title}
          {changed && <StatusDot color="var(--peach)" label="Changed from default" />}
        </div>
        <div className="truncate font-mono text-[11px] text-faint">{pref.name}</div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {changed && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Reset to default"
            title="Reset to default"
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => {
              Services.prefs.clearUserPref(pref.name)
              onChange()
            }}
          >
            <HugeiconsIcon icon={Undo02Icon} strokeWidth={2} />
          </Button>
        )}
        <Switch
          checked={prefValue(pref.name)}
          aria-label={pref.title}
          onCheckedChange={(checked) => {
            Services.prefs.setBoolPref(pref.name, checked)
            onChange()
          }}
        />
      </div>
    </div>
  )
}
