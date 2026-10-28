# Zencast

A keyboard-first command palette for Zen browser, shipped as a Sine mod. It runs in the chrome window with full privileges: commands, tabs, settings, containers, folders, session move, tab wipe and a custom keybinding engine. It doubles as a template: people fork it and have their agent reshape Zen, or any Firefox, from here.

Read `PREFERENCE.md` before changing the project's direction, wording, design or keys: it records the owner's intent and every preference they've stated. Background research and decisions live in `plan/zencast/feasibility.md`. How users install and update it (Sine, the release branch, the store) lives in `docs/distribution.md`; the `release` skill covers cutting a version. The `add-command` skill covers new commands and keys; `zen-internals` covers finding and wrapping browser internals.

## Layout

| Path | Owns |
| --- | --- |
| `src/main.ts` | Mod entry: mounts the palette, keybinding engine and toasts per window, and undoes it all on unload |
| `src/browser/` | Thin wrappers over Zen and Firefox internals (tabs, folders, workspaces, containers, session, toasts), plus the settings button on Zencast's card in Sine |
| `src/features/` | Drop-in features: each `.ts` exports `commands`, each `.css` restyles Zen. The way to mod Zen without touching the core |
| `src/looks/` | Example looks (candy, pink, terminal, paper): CSS for Zen's own window, previewed with `pnpm ops look`, shipped by copying into `src/features/`. The `restyle` skill covers the workflow |
| `src/commands/` | The command catalog, Zen's native commands and shared types |
| `src/keys/` | Keybinding engine: matching, chords and `when` contexts |
| `src/palette/` | Palette UI in a shadow root, its store, search (uFuzzy) and result sources |
| `src/settings/` | The settings page, a second Vite entry opened at `chrome://sine/content/zencast/settings/index.html` |
| `src/shared/` | Config schema (zod), key parsing and the theme shared by both bundles |
| `src/gecko/globals.d.ts` | Types for the Gecko and Zen globals the mod uses |
| `src/components/ui/` | shadcn components (Luma); edit through the shadcn CLI where possible |
| `mod/` | Static mod files copied into the build: `theme.json` and Fluent strings |
| `scripts/ops/` | The operator CLI |
| `scripts/install/` | The public setup scripts, `install.sh` and its Windows twin `install.ps1` |
| `docs/` | Distribution reference and the README's media |
| `site/` | The landing page at zencast.allpyq.in: Vite, rough.js scenes, GSAP and an OGL shader, deployed as a static-assets Worker (`site/wrangler.jsonc`) |
| `blog/` | The Medium article, its rough.js figures and the Medium export; `blog/README.md` covers the workflow |
| `PREFERENCE.md` | The owner's intent and every stated preference |
| `.github/workflows/release.yml` | Hand-triggered release, running `pnpm ops release` |

## Operating the project

Use `pnpm ops`; run `pnpm ops --help` for commands and options. Every command takes `--json`.

- `build`: typecheck and build into `dist/zencast`.
- `doctor`: report what blocks the mod from loading in a profile.
- `install`: copy the build into a Zen profile and register it in Sine's `mods.json`. Use `--dry-run` first. It never changes prefs.
- `e2e`: end-to-end scenarios in an isolated headless Zen. `--screenshots <dir>` saves palette and settings captures.
- `eval`: run JavaScript in the browser window of an isolated headless Zen and print the result as JSON, to probe internals before wrapping them.
- `media`: re-record the README's GIFs and screenshots into `docs/media` with demo spaces and sites. Needs ffmpeg and network.
- `bench`: open, search and keystroke latency against p95 budgets, with 300 lazy tabs by default.
- `look`: screenshot Zen restyled by each stylesheet in `src/looks/` (or the files given), beside the default look.
- `release`: build and publish to the `release` branch, which Sine installs and updates from. `--bump` raises the version, commits and tags it.
- `site`: typecheck and build the landing page.
- `deploy`: build the landing page, deploy it with wrangler and check the live page. It uses `CLOUDFLARE_API_TOKEN`, or the `cf` CLI's login.

`e2e`, `bench`, `eval` and `media` copy Sine from the default profile into a temporary profile and never write to the original. Never drive the user's running Zen for tests.

## Conventions

- Sine only loads scripts from non-store mods when "Allow unsafe JS" (`sine.allow-unsafe-js`) is on. The setup scripts set it with the user's consent; agents leave it alone in a real profile and never mark the mod as a store install. The temporary test profile sets it as a fixture.
- Feedback after an action uses Zen's own toast through `notify()` in `src/browser/toast.ts`, not a custom overlay.
- Treat performance as a constraint. Run `pnpm ops bench` after changes to the palette's render path. `ZENCAST_PROFILE=1 pnpm build` keeps names readable for Gecko profiles.
- The palette stylesheet scans only the palette's own sources (`src/palette/palette.css`). Add a component's file there when the palette starts using it.
- Checks: `pnpm typecheck`, `pnpm lint`, `pnpm ops e2e`.
