# Sessions, localhost and bookmark management

Owner's choices (2026-10-28):

- Sessions: every run of Zen, from its start time, saved per window. Shown as "Today 14:22", "Yesterday 09:10", then weekday or date, 24-hour. Restoring picks tabs into the current window. Kept 7 days. `Alt+S`, plus a "Sessions" tab in settings.
- Localhost: the dev servers listening on this machine, jump to an open tab or open one. `Alt+L`.
- Bookmarks in the palette: browse folders, edit and move, delete with undo. No folder create or rename.

## Shape

- `src/browser/sessions.ts`: one JSON file per session in `<profile>/zencast/sessions/<start>.json`. The most recent window writes all windows after SessionStore writes (at most every 30 s) and at quit; windows closed earlier keep their last tabs. Old files are deleted at start.
- `src/commands/sessions.ts`: sessions → windows → tabs, opening tabs into this window.
- `src/settings/sections/SessionsSection.tsx`: the same list in settings.
- `src/browser/localhost.ts`: listening ports from `ss`, then `lsof`, then `netstat`, probed over HTTP for a page title.
- `src/commands/localhost.ts`: the switcher.
- Bookmarks: extend `src/commands/bookmarks.ts` and `src/palette/bookmarks.ts`.

## Done when

- e2e covers: a snapshot file appears with this window's tabs and reopens a tab; a local HTTP server shows in the switcher; a bookmark is moved, edited and deleted with undo.
- typecheck, lint, e2e and bench pass; README and `PREFERENCE.md` updated; installed.
