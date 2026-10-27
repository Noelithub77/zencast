// Interaction timings kept in memory and exposed as window.Zencast.perf for the benchmark runner.

const MAX_SAMPLES = 200

export type Metric = "open" | "search" | "web"

const samples: Record<Metric, number[]> = { open: [], search: [], web: [] }

export function record(metric: Metric, ms: number) {
  const list = samples[metric]
  list.push(ms)
  if (list.length > MAX_SAMPLES) list.shift()
}

/** Runs `work` and records how long it took. */
export function timed<T>(metric: Metric, work: () => T): T {
  const start = performance.now()
  const result = work()
  record(metric, performance.now() - start)
  return result
}

export function perfSnapshot(): Record<Metric, number[]> {
  return { open: [...samples.open], search: [...samples.search], web: [...samples.web] }
}

let openStartedAt = 0

/** Called from the key handler so open latency covers the whole path to the first painted frame. */
export function markOpenStart() {
  openStartedAt = performance.now()
}

export function markOpenPainted(win: Window) {
  if (!openStartedAt) return
  const start = openStartedAt
  openStartedAt = 0
  win.requestAnimationFrame(() => record("open", performance.now() - start))
}
