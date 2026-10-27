# Distribution

How Zencast reaches users, how it updates, and which channels exist. Verified against the Sine engine 2.3.4 source (`chrome/JS/core/manager.sys.mjs` and `utils.sys.mjs` in a profile with Sine).

## Channels

| Channel | Status | How |
| --- | --- | --- |
| Setup script | Live | `scripts/install/install.sh` (Linux, macOS) and `install.ps1` (Windows) install Sine if missing, install Zencast from the `release` branch and, with consent, turn on "Allow unsafe JS" |
| Sine URL install | Live | Paste `https://github.com/Noelithub77/zencast/tree/release` into Sine's install field. Needs "Allow unsafe JS" on |
| Sine store | Not submitted | Submit through an issue on [sineorg/store](https://github.com/sineorg/store). Store mods run their scripts without "Allow unsafe JS" |
| Zen mods store | Not possible | Zen's own mods are CSS and preferences only; Zencast is a script |

## How Sine installs from a URL

1. It fetches `theme.json` from the URL's branch and folder. A bare `owner/repo` means the `main` branch, so the URL must name `tree/release`; `master` holds source, not a build.
2. It downloads the branch as a zip from `codeload.github.com` and unpacks it into `chrome/sine-mods/<id>`.
3. It resolves `style.chrome` (`document.css`) and `preferences` by file name inside the zip, and writes the entry to `chrome/sine-mods/mods.json` with `homepage` set to the URL.

The setup scripts do the same steps themselves and write the same `mods.json` entry, so a scripted install and a URL install behave identically afterwards.

## Allow unsafe JS

Sine loads a mod's scripts only when `sine.allow-unsafe-js` is true or the mod's `origin` is `store` (`utils.getScripts`). A URL install never gets `origin: "store"`; Sine strips it from any non-store `theme.json` so mods cannot claim it. Until Zencast is in the store, every user needs the switch on: Zen settings › Sine › "Enable installing JS from unofficial sources".

The setup scripts explain this, link the repository and ask before writing the pref to `prefs.js` while Zen is closed. Agents never set it in a real profile; the e2e profile sets it as a fixture.

## Updates

At startup, with `sine.auto-updates` on (the default), Sine checks every enabled mod whose entry has `"no-updates": false`. For a URL-installed mod it fetches `theme.json` from `homepage` and re-downloads the branch when that file's `updatedAt` is later than the installed entry's.

- `pnpm ops release` stamps `updatedAt` into the release branch's `theme.json`, so each release reaches users on their next Zen start.
- `--bump patch|minor|major` raises `version` in `mod/theme.json`, commits and tags `vX.Y.Z` first; Sine shows the version on the mod card.
- The Release workflow (`.github/workflows/release.yml`) runs the same command, triggered by hand from the Actions tab.
- `pnpm ops install` writes `"no-updates": true`, so a development install is never replaced by the release branch.

## The mod card

Sine's card for Zencast shows the version, a homepage button and an auto-update toggle from the `mods.json` entry. The homepage button opens `homepage`, the release branch, whose `README.md` is the main README with links made absolute: it doubles as the landing page. Sine only offers a settings button for mods with a `preferences.json`, so Zencast adds its own "Open settings" button to its card (`src/browser/sine-card.ts`), which opens the settings page.

## Sine store

The store lists mods from `marketplace.json` in sineorg/store and pins each to a commit, so store users update when the store entry changes rather than from `updatedAt`. Submission is an issue from the store's template; check its current requirements when submitting. Once listed, the setup scripts no longer need the unsafe JS step for store installs.
