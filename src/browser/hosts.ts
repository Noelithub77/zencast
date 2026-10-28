// Inline host completion ("allpyq" → "allpyq.in"). Hosts already known come first: Firefox's live DNS
// cache and the open tabs, then the URL bar's history autofill and history results, which arrive with
// the web results. Only then does a live DNS lookup try the typed name with common endings.
import { listTabs, tabUrl } from "./tabs"

const baseDomain = (host: string): string | null => {
  try {
    // Completing to the registrable domain keeps service hosts like settings.services.mozilla.com out.
    return Services.eTLD.getBaseDomainFromHost(host)
  } catch {
    // IP addresses and single-label hosts have no registrable domain.
    return null
  }
}

/** Registrable domains of every host in the DNS cache, skipping private-browsing lookups. */
export function readDnsDomains(): Promise<string[]> {
  const dashboard = Cc["@mozilla.org/network/dashboard;1"].getService(Ci.nsIDashboard)
  return new Promise((resolve) => {
    dashboard.requestDNSInfo((data) => {
      const domains = new Set<string>()
      for (const entry of data.entries) {
        if (entry.type !== Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT || entry.originAttributesSuffix.includes("privateBrowsingId=1"))
          continue
        const domain = baseDomain(entry.hostname)
        if (domain) domains.add(domain)
      }
      resolve([...domains])
    })
  })
}

/** Registrable domains of the open tabs, which stay known after the DNS cache forgets them. */
export function tabDomains(win: Window): string[] {
  return listTabs(win).flatMap((tab) => {
    const host = bareHost(tabUrl(tab))
    return (host && baseDomain(host)) || []
  })
}

// Tried in this order; the first that resolves wins.
const ENDINGS = ["com", "in", "io", "dev", "app", "org", "net"]

/** The typed name with the first common ending that resolves ("allpyq" → "allpyq.in"), if any. */
export async function guessDomain(name: string, signal: AbortSignal): Promise<string | null> {
  const lookups = ENDINGS.map(
    (ending) =>
      new Promise<string | null>((resolve) => {
        const host = `${name}.${ending}`
        const request = Services.dns.asyncResolve(
          host,
          Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
          0,
          null,
          { onLookupComplete: (_request, _record, status) => resolve(status === 0 ? host : null) },
          Services.tm.mainThread,
          {},
        )
        signal.addEventListener("abort", () => {
          request.cancel(Cr.NS_BINDING_ABORTED)
          resolve(null)
        })
      }),
  )
  // An earlier ending wins, so each answer waits only for the endings before it.
  for (const lookup of lookups) {
    const host = await lookup
    if (host) return host
  }
  return null
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
