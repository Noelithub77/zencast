import type { Engine } from "@/browser/engines"
import type { Scope } from "./scopes"

/** What was typed in the root list, kept when the palette closes before anything runs. */
export interface Draft {
  query: string
  scope: Scope | null
  engine: Engine | null
}

const EMPTY: Draft = { query: "", scope: null, engine: null }
let draft = EMPTY

export const readDraft = () => draft

export function saveDraft(next: Draft) {
  draft = next
}

export function clearDraft() {
  draft = EMPTY
}
