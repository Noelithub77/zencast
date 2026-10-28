# Bookmarks and quick links

Owner's choices (2026-10-28): Ctrl+B starts keyboard-first bookmarking, Ctrl+D stays duplicate; quick links are Firefox bookmark keywords; a starter set is offered, never added unasked.

## Found

- Bookmarks only reached the palette through the URL bar engine, mixed with history and ranked under "Search Google".
- Keyword bookmarks (`zq hello`) did nothing: the palette drops the engine's heuristic result, which is where keywords land.
- A `%s` bookmark opened its raw URL.
- Zen's commands kept showing keys Zencast had taken.

## Shape

- `src/browser/bookmarks.ts`: one Places query for bookmarks, folders and keywords, cached and refreshed on Places events; writes go through `PlacesUtils`; `%s` is filled as the address bar does (`%s` encoded, `%S` as typed; checked against `UrlbarUtils.getShortcutOrURIAndPostData`).
- `src/commands/bookmarks.ts`: "Bookmark this tab" on Ctrl+B. New page: name, folder, optional keyword, each one prompt or picker (Esc steps back). Bookmarked page: edit name, folder, keyword or key, or remove. "Add starter quick links" fills a "Quick links" folder, skipping keywords already taken.
- `src/palette/bookmarks.ts`: every bookmark in the root index (section "Bookmarks", keyword as accessory); a typed keyword becomes the top row; a `%s` bookmark without a query asks for one.
- Native items lose a key that a Zencast binding owns.

## Done when (all met)

- e2e covers: bookmark found by title above web search, keyword with and without a query, Ctrl+B saving with folder and keyword, editing, starters, and a key on a bookmark.
- `pnpm typecheck`, `pnpm lint`, `pnpm ops e2e`, `pnpm ops bench` pass; README and `PREFERENCE.md` updated.
