# Zencast

A keyboard-first command palette for Zen browser, shipped as a Sine mod. It runs in the chrome window with full privileges: commands, tabs, settings, containers, folders, session move, tab wipe and a custom keybinding engine.

Background research and decisions live in `plan/zencast/feasibility.md`.

## Layout

| Path | Owns |
| --- | --- |
| `src/main.ts` | Mod entry: mounts the palette, keybinding engine and toasts per window, and undoes it all on unload |
| `src/browser/` | Thin wrappers over Zen and Firefox internals (tabs, folders, workspaces, containers, session, toasts) |
| `src/commands/` | The command catalog, Zen's native commands and shared types |
| `src/keys/` | Keybinding engine: matching, chords and `when` contexts |
| `src/palette/` | Palette UI in a shadow root, its store, search (uFuzzy) and result sources |
| `src/settings/` | The settings page, a second Vite entry opened at `chrome://sine/content/zencast/settings/index.html` |
| `src/shared/` | Config schema (zod), key parsing and the theme shared by both bundles |
| `src/gecko/globals.d.ts` | Types for the Gecko and Zen globals the mod uses |
| `src/components/ui/` | shadcn components (Luma); edit through the shadcn CLI where possible |
| `mod/` | Static mod files copied into the build: `theme.json` and Fluent strings |
| `scripts/ops/` | The operator CLI |

## Operating the project

Use `pnpm ops`; run `pnpm ops --help` for commands and options. Every command takes `--json`.

- `build`: typecheck and build into `dist/zencast`.
- `doctor`: report what blocks the mod from loading in a profile.
- `install`: copy the build into a Zen profile and register it in Sine's `mods.json`. Use `--dry-run` first. It never changes prefs.
- `e2e`: end-to-end scenarios in an isolated headless Zen. `--screenshots <dir>` saves palette and settings captures.
- `bench`: open, search and keystroke latency against p95 budgets, with 300 lazy tabs by default.

`e2e` and `bench` copy Sine from the default profile into a temporary profile and never write to the original. Never drive the user's running Zen for tests.

## Conventions

- Sine only loads scripts from local mods when the user turns on "Allow unsafe JS" (`sine.allow-unsafe-js`). Do not set it in a real profile, and do not mark the mod as a store install to get around it. The temporary test profile sets it as a fixture.
- Feedback after an action uses Zen's own toast through `notify()` in `src/browser/toast.ts`, not a custom overlay.
- Treat performance as a constraint. Run `pnpm ops bench` after changes to the palette's render path. `ZENCAST_PROFILE=1 pnpm build` keeps names readable for Gecko profiles.
- The palette stylesheet scans only the palette's own sources (`src/palette/palette.css`). Add a component's file there when the palette starts using it.
- Checks: `pnpm typecheck`, `pnpm lint`, `pnpm ops e2e`.
