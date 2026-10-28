import { ArrowRight01Icon, Undo02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMemo, useState } from "react"

import { openPane, paneSettings, prefSettings, prefValue, searchPreferences, type PrefSetting } from "@/browser/settings-index"
import { PREF_CATEGORIES, type PrefCategory } from "@/browser/zen-prefs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fuzzyFilter } from "@/palette/search"
import { useBrowserWindow } from "../hooks"
import { GroupHeading, SectionHeader } from "../parts"

const TAB_LABELS: Record<PrefCategory, string> = {
  Tabs: "Tabs",
  Spaces: "Spaces",
  Look: "Look",
  "Compact mode": "Compact",
  "Address bar": "Address bar",
  Features: "Features",
  Advanced: "Advanced",
}

/** Splits prefs into [heading, prefs] runs; `label` picks the heading for each pref. */
function grouped(prefs: PrefSetting[], label: (pref: PrefSetting) => string): Array<[string, PrefSetting[]]> {
  const map = new Map<string, PrefSetting[]>()
  for (const pref of prefs) map.set(label(pref), [...(map.get(label(pref)) ?? []), pref])
  return [...map]
}

export function ZenSettingsSection() {
  const win = useBrowserWindow()
  const [query, setQuery] = useState("")
  // Bumped after a toggle or reset so switches re-read their prefs.
  const [, setRevision] = useState(0)
  const refresh = () => setRevision((r) => r + 1)
  const searching = query.trim().length > 0

  const panes = useMemo(() => fuzzyFilter(paneSettings(), (pane) => `${pane.title} ${pane.keywords}`, query), [query])
  const matches = useMemo(
    () => fuzzyFilter(prefSettings(), (pref) => `${pref.title} ${pref.section} ${pref.name}`, query),
    [query],
  )

  const pages = panes.map((pane) => (
    <button
      key={pane.pane}
      type="button"
      onClick={() => openPane(win, pane.pane)}
      className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      {pane.title}
      <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} className="ml-auto size-4 text-faint" />
    </button>
  ))

  const prefList = (prefs: PrefSetting[], label: (pref: PrefSetting) => string) => {
    const groups = grouped(prefs, label)
    return groups.map(([heading, list]) => (
      <div key={heading}>
        {groups.length > 1 && <GroupHeading>{heading}</GroupHeading>}
        {list.map((pref) => (
          <PrefRow key={pref.name} pref={pref} onChange={refresh} />
        ))}
      </div>
    ))
  }

  const search = (
    <Input
      autoFocus
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder="Search settings"
      className="h-8 w-64"
    />
  )

  if (searching) {
    return (
      <section>
        <SectionHeader title="Zen settings">{search}</SectionHeader>
        {panes.length > 0 && (
          <>
            <GroupHeading>Pages</GroupHeading>
            {pages}
          </>
        )}
        {prefList(matches, (pref) => pref.section)}
        {query.trim().length > 1 && (
          <Button variant="ghost" size="sm" className="mt-6" onClick={() => searchPreferences(win, query)}>
            Search all Firefox settings for “{query.trim()}”
          </Button>
        )}
      </section>
    )
  }

  return (
    <Tabs defaultValue="Pages">
      <SectionHeader title="Zen settings">{search}</SectionHeader>
      <TabsList className="mb-3 max-w-full overflow-x-auto">
        <TabsTrigger value="Pages">Pages</TabsTrigger>
        {PREF_CATEGORIES.map((category) => (
          <TabsTrigger key={category} value={category}>
            {TAB_LABELS[category]}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="Pages">{pages}</TabsContent>
      {PREF_CATEGORIES.map((category) => (
        <TabsContent key={category} value={category}>
          {prefList(
            matches.filter((pref) => pref.category === category),
            (pref) => pref.group,
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}

function PrefRow({ pref, onChange }: { pref: PrefSetting; onChange: () => void }) {
  const changed = Services.prefs.prefHasUserValue(pref.name)
  return (
    <div className="group flex h-12 items-center gap-2.5 rounded-lg px-3 hover:bg-muted/40">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm">
          {pref.title}
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
