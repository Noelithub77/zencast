# Google account containers

Owner's choice (2026-10-28): find the Google accounts signed in to Zen and give each its own container, signing in once per container. Cache the account list, never the cookies.

## Found

- Google's cookies hold one session for every signed-in account and name none of them. Copying them into containers would share one session, so each container signs in on its own.
- `POST accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard` returns `["gaia.l.a.r", [account…]]`; a GET returns 400. Chromium's old JSON parser reads the email at index 3, a valid session at 9 and signed out at 14 (`google_apis/gaia/gaia_auth_util.cc`, tag 100.0.4896.0). Undocumented.
- A chrome-window `fetch` sends no cookies and strips a `Cookie` header. An anonymous channel with an explicit `Cookie` header works, reads any container's jar, and keeps Google's reply cookies out of the jar.
- `ServiceLogin?Email=…` redirects to the v3 sign-in page with the email carried over.
- `cookie-changed` gives an `nsICookieNotification` with `baseDomain`, the cookie and its `userContextId`.

## Shape

- `src/browser/google.ts`: read the accounts of a container; cache the default container's emails in a pref; watch Google's sign-in cookies in the default container and report new accounts.
- `src/commands/google.ts`: "Google account containers" lists each account with its container state (no container, not signed in, signed in) and makes the missing ones, opening a prefilled sign-in tab in each. A new account in the default container gets a toast with "Make container".

## Done when (met, except what can't be checked here)

- e2e: with a stand-in Google cookie, the command reads Google's real (empty) list, says no accounts are signed in and leaves the cookie jar unchanged. Parsing was checked once against a fixture in Chromium's shape (valid kept, signed out and invalid dropped, other shapes rejected).
- `pnpm typecheck`, `pnpm lint`, `pnpm ops e2e` pass; README and `PREFERENCE.md` updated; installed into the owner's Zen.
- Not verifiable here: the list with real accounts, the prefilled sign-in, and the toast after a real sign-in.
