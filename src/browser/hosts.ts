// Inline host completion ("allpyq" → "allpyq.in") from Firefox's live DNS cache. The URL bar's own
// history autofill and its history results are the other sources; they arrive with the web results.

/** Registrable domains of every host in the DNS cache, skipping private-browsing lookups. */
export function readDnsDomains(): Promise<string[]> {
  const dashboard = Cc["@mozilla.org/network/dashboard;1"].getService(Ci.nsIDashboard)
  return new Promise((resolve) => {
    dashboard.requestDNSInfo((data) => {
      const domains = new Set<string>()
      for (const entry of data.entries) {
        if (entry.type !== Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT || entry.originAttributesSuffix.includes("privateBrowsingId=1"))
          continue
        try {
          // Completing to the registrable domain keeps service hosts like settings.services.mozilla.com out.
          domains.add(Services.eTLD.getBaseDomainFromHost(entry.hostname))
        } catch {
          // IP addresses and single-label hosts have no registrable domain.
        }
      }
      resolve([...domains])
    })
  })
}

/** Text that can only be the start of a host name. */
export function isHostPrefix(text: string): boolean {
  return /^[a-z0-9][a-z0-9.-]*$/i.test(text)
}

/** The shortest domain that starts with the typed text, if any. */
export function completeDomain(typed: string, domains: string[]): string | null {
  const prefix = typed.toLowerCase()
  if (!isHostPrefix(prefix)) return null
  let best: string | null = null
  for (const domain of domains) {
    if (domain.length > prefix.length && domain.startsWith(prefix) && (!best || domain.length < best.length)) best = domain
  }
  return best
}

/** A URL's host without "www.", or null when it has none. */
export function bareHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null
  } catch {
    return null
  }
}
