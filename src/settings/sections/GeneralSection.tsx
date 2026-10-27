import type { ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { effectiveBindings } from "@/keys/bindings"
import { resetConfig, updateConfig } from "@/shared/config"
import { useConfig } from "../hooks"
import { SectionHeader } from "../parts"

const LIMITS = [30, 60, 100, 200]
const PALETTE = "zencast.palette"

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-12 items-center rounded-lg px-3 hover:bg-muted/40">
      <span className="text-sm">{label}</span>
      <div className="ml-auto">{children}</div>
    </div>
  )
}

export function GeneralSection() {
  const config = useConfig()
  const paletteKeys = effectiveBindings(config).get(PALETTE) ?? []
  const ctrlT = paletteKeys.includes("ctrl+t")

  return (
    <section>
      <SectionHeader title="General" />
      <Field label="Open with Ctrl+T">
        <Switch
          checked={ctrlT}
          aria-label="Open with Ctrl+T"
          onCheckedChange={(on) =>
            updateConfig((c) => ({
              ...c,
              bindings: {
                ...c.bindings,
                [PALETTE]: on ? [...paletteKeys, "ctrl+t"] : paletteKeys.filter((keys) => keys !== "ctrl+t"),
              },
            }))
          }
        />
      </Field>
      <Field label="History, bookmarks and suggestions">
        <Switch
          checked={config.urlResults}
          aria-label="History, bookmarks and suggestions"
          onCheckedChange={(urlResults) => updateConfig((c) => ({ ...c, urlResults }))}
        />
      </Field>
      <Field label="Result limit">
        <Select
          value={String(config.maxResults)}
          onValueChange={(value) => updateConfig((c) => ({ ...c, maxResults: Number(value) }))}
        >
          <SelectTrigger size="sm" className="w-24" aria-label="Result limit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIMITS.map((limit) => (
              <SelectItem key={limit} value={String(limit)}>
                {limit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="mt-8 px-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              Reset Zencast
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset Zencast?</AlertDialogTitle>
              <AlertDialogDescription>Shortcuts and options return to their defaults. Archived folders stay.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={resetConfig}>
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  )
}
