// Google accounts signed in to a container, read from the account list Chrome's account menu uses.
// Google's cookies hold one session for every account and name none of them, so only this list says
// who is signed in. The endpoint is undocumented; a change on Google's side reads as no accounts.
import { z } from "zod"

const LIST_URL = "https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard"
const LIST_HOST = "accounts.google.com"
const LIST_PATH = "/ListAccounts"
const CACHE_PREF = "zencast.googleAccounts"
// Cookies that change on sign-in and sign-out; their rotating siblings (…PSIDTS) change all the time.
const SIGN_IN_COOKIES = new Set(["SID", "LSID", "__Secure-1PSID", "__Secure-3PSID"])

// ["gaia.l.a.r", [[…, name, email, …, valid (9), id (10), …, signed out (14)], …]], as Chromium parsed it.
const LIST = z.tuple([z.literal("gaia.l.a.r"), z.array(z.array(z.unknown()))])

export function parseAccounts(text: string): string[] {
  const parsed = LIST.safeParse(JSON.parse(text))
  if (!parsed.success) throw new Error("Google's account list changed shape")
  return parsed.data[1].flatMap((account) => {
    const email = account[3]
    return typeof email === "string" && email && account[9] !== 0 && account[14] !== 1 ? [email.toLowerCase()] : []
  })
}

/** The Cookie header a page in this container would send to the account list. */
function cookieHeader(userContextId: number): string {
  return Services.cookies
    .getCookiesWithOriginAttributes(JSON.stringify({ userContextId, privateBrowsingId: 0 }), "google.com")
    .filter(
      (cookie) =>
        !cookie.originAttributes.partitionKey &&
        (cookie.host === LIST_HOST || (cookie.host.startsWith(".") && `.${LIST_HOST}`.endsWith(cookie.host))) &&
        LIST_PATH.startsWith(cookie.path),
    )
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ")
}

/** The emails signed in to Google in a container (0 is no container). */
export async function googleAccounts(userContextId = 0): Promise<string[]> {
  const cookie = cookieHeader(userContextId)
  if (!cookie) return []
  const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs")
  const channel = NetUtil.newChannel({ uri: LIST_URL, loadUsingSystemPrincipal: true }).QueryInterface(Ci.nsIHttpChannel)
  // Anonymous, with the container's cookies set by hand: the request reads any container, and
  // nothing Google sends back lands in a cookie jar.
  channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS | Ci.nsIRequest.LOAD_BYPASS_CACHE
  const empty = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream)
  empty.setByteStringData("")
  // The list only answers POST.
  channel.QueryInterface(Ci.nsIUploadChannel2).explicitSetUploadStream(empty, "text/plain", 0, "POST", false)
  channel.setRequestHeader("Cookie", cookie, false)
  const text = await new Promise<string>((resolve, reject) =>
    NetUtil.asyncFetch(channel, (stream, status) => {
      if (status !== 0 || channel.responseStatus !== 200) reject(new Error(`Google's account list failed (${channel.responseStatus || status})`))
      else resolve(NetUtil.readInputStreamToString(stream, stream.available(), { charset: "UTF-8" }))
    }),
  )
  return parseAccounts(text)
}

export function cachedGoogleAccounts(): string[] {
  try {
    const parsed = z.array(z.string()).safeParse(JSON.parse(Services.prefs.getStringPref(CACHE_PREF, "[]")))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/** Reads the accounts outside any container and caches them; returns them with the ones not cached before. */
export async function refreshGoogleAccounts(): Promise<{ accounts: string[]; added: string[] }> {
  const before = new Set(cachedGoogleAccounts())
  const accounts = await googleAccounts()
  Services.prefs.setStringPref(CACHE_PREF, JSON.stringify(accounts))
  return { accounts, added: accounts.filter((email) => !before.has(email)) }
}

/** Opens Google's sign-in with the email filled in, then the account page. */
export const signInUrl = (email: string) =>
  `https://accounts.google.com/ServiceLogin?Email=${encodeURIComponent(email)}&continue=${encodeURIComponent("https://myaccount.google.com/")}`

/**
 * Reports accounts newly signed in outside any container. Every window registers; only the most
 * recent one reads the list, so a sign-in asks Google once.
 */
export function watchGoogleSignIns(win: Window, onAdded: (emails: string[]) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const check = () => {
    if (Services.wm.getMostRecentWindow("navigator:browser") !== win) return
    refreshGoogleAccounts()
      .then(({ added }) => added.length && onAdded(added))
      .catch((error: unknown) => console.error("[zencast] google accounts", error))
  }
  const observer: CookieObserver = {
    observe(subject) {
      const { baseDomain, cookie } = subject.QueryInterface(Ci.nsICookieNotification)
      if (baseDomain !== "google.com" || !cookie || cookie.originAttributes.userContextId || !SIGN_IN_COOKIES.has(cookie.name)) return
      // A sign-in sets several cookies in a row.
      if (timer) clearTimeout(timer)
      timer = setTimeout(check, 2000)
    },
  }
  Services.obs.addObserver(observer, "cookie-changed")
  return () => {
    if (timer) clearTimeout(timer)
    Services.obs.removeObserver(observer, "cookie-changed")
  }
}
