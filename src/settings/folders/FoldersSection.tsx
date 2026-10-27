import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useBrowserWindow } from "../hooks"
import { SectionHeader } from "../parts"
import { ArchiveList, useArchive } from "./ArchiveList"
import { FolderTree } from "./FolderTree"

export function FoldersSection() {
  const win = useBrowserWindow()
  const archive = useArchive()
  const [query, setQuery] = useState("")

  return (
    <Tabs defaultValue="folders">
      <SectionHeader title="Folders">
        <TabsList>
          <TabsTrigger value="folders">Folders</TabsTrigger>
          <TabsTrigger value="archive">
            Archive
            {archive.length > 0 && <span className="text-xs text-faint tabular-nums">{archive.length}</span>}
          </TabsTrigger>
        </TabsList>
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // ↓ hands focus to the list so the tree's keys work without reaching for the mouse.
            if (event.key === "ArrowDown") {
              event.preventDefault()
              document.querySelector<HTMLElement>("[role=tree]")?.focus()
            }
          }}
          placeholder="Filter"
          className="h-8 w-48"
        />
      </SectionHeader>
      <TabsContent value="folders">
        <FolderTree win={win} query={query} />
      </TabsContent>
      <TabsContent value="archive">
        <ArchiveList win={win} entries={archive} query={query} />
      </TabsContent>
    </Tabs>
  )
}
