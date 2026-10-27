import uFuzzy from "@leeoniya/ufuzzy"

import type { PaletteItem } from "@/commands/types"
import type { Usage } from "@/shared/config"

// Single-error mode tolerates one typo per term (swap, missing, extra or wrong letter), which covers
// most fast-typing mistakes without the noise of fully fuzzy matching.
const fuzzy = new uFuzzy({
  intraMode: 1,
  intraIns: 1,
  intraSub: 1,
  intraTrn: 1,
  intraDel: 1,
  interIns: 3,
})

const OUT_OF_ORDER = 3
const DAY_MS = 86_400_000

export interface SearchIndex {
  items: PaletteItem[]
  haystack: string[]
}

export function buildIndex(items: PaletteItem[]): SearchIndex {
  return {
    items,
    haystack: items.map((item) => [item.title, item.subtitle, item.keywords].filter(Boolean).join(" ")),
  }
}

/** Frecency: run count decayed by days since the last run. */
export function usageScore(usage: Usage, id: string, now = Date.now()): number {
  const entry = usage[id]
  if (!entry) return 0
  const [count, last] = entry
  const days = Math.max(0, (now - last) / DAY_MS)
  return Math.log2(1 + count) / (1 + days / 7)
}

/** Title starts with the query, or with each of its words in order. */
export function isStrongMatch(item: PaletteItem, query: string): boolean {
  const title = item.title.toLowerCase()
  const q = query.trim().toLowerCase()
  if (!q) return false
  if (title.startsWith(q)) return true
  const words = title.split(/\s+/)
  return q.split(/\s+/).every((term) => words.some((word) => word.startsWith(term)))
}

export interface Ranked {
  item: PaletteItem
  score: number
}

/**
 * Ranks items for a query. uFuzzy's sorted order is turned into a descending base score, then usage
 * and static boosts lift items the user runs often.
 */
export function search(index: SearchIndex, query: string, usage: Usage, limit: number): Ranked[] {
  const now = Date.now()
  const q = query.trim()
  if (!q) {
    return index.items
      .map((item) => ({ item, score: usageScore(usage, item.id, now) * 10 + (item.boost ?? 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  const [idxs, info, order] = fuzzy.search(index.haystack, q, OUT_OF_ORDER)
  if (!idxs) return []
  const ranked: Ranked[] = []
  if (info && order) {
    // Matches uFuzzy scores the same (same position, gaps and terms) share a rank, so boosts such as
    // "loaded tab" decide between them instead of uFuzzy's final tiebreak on text length.
    let tieRank = 0
    let tieKey = ""
    for (let rank = 0; rank < order.length; rank++) {
      const i = order[rank]
      const key = `${info.start[i]} ${info.chars[i]} ${info.terms[i]} ${info.interIns[i]} ${info.intraIns[i]}`
      if (key !== tieKey) {
        tieKey = key
        tieRank = rank
      }
      const item = index.items[info.idx[i]]
      ranked.push({ item, score: score(item, q, tieRank, order.length, usage, now) })
    }
  } else {
    // Too many candidates for the info pass; keep filter order.
    for (let rank = 0; rank < idxs.length; rank++) {
      const item = index.items[idxs[rank]]
      ranked.push({ item, score: score(item, q, rank, idxs.length, usage, now) })
    }
  }
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit)
}

function score(item: PaletteItem, query: string, rank: number, total: number, usage: Usage, now: number): number {
  const base = 10 * (1 - rank / Math.max(1, total))
  const strong = isStrongMatch(item, query) ? 6 : 0
  return base + strong + usageScore(usage, item.id, now) * 3 + (item.boost ?? 0)
}

/** Fuzzy-filters any list with the palette's matching rules, best match first. */
export function fuzzyFilter<T>(items: T[], text: (item: T) => string, query: string): T[] {
  const q = query.trim()
  if (!q) return items
  const [idxs, info, order] = fuzzy.search(items.map(text), q, OUT_OF_ORDER)
  if (!idxs) return []
  if (!info || !order) return idxs.map((i) => items[i])
  return order.map((i) => items[info.idx[i]])
}
