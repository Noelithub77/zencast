---
name: zen-internals
description: Find and use Zen, Firefox and Sine internals from the mod. Use when a feature needs a browser API Zencast does not wrap yet, when a Zen update breaks a wrapper, or when typing a new global in globals.d.ts.
---

# Zen internals

Zencast runs in the chrome window (`browser.xhtml`) with the system principal, so anything Zen's own UI can do, the mod can do. The work is finding the right internal, wrapping it thinly, and proving it in a real Zen.

## Read the source

Zen ships its source inside the install, so read the exact version the user runs rather than the web:

```bash
mkdir -p /tmp/zen-src/browser /tmp/zen-src/gre
unzip -qo /opt/zen-browser-bin/browser/omni.ja -d /tmp/zen-src/browser
unzip -qo /opt/zen-browser-bin/omni.ja -d /tmp/zen-src/gre
```

`unzip` warns that the archive is "too long" and compensates; the extract is complete. The install path differs per system (Flatpak, macOS `Zen.app/Contents/Resources`); find `omni.ja` beside the `zen` binary.

| Looking for | Where |
| --- | --- |
| Zen's managers (`gZenWorkspaces`, `gZenFolders`, `gZenPinnedTabManager`, compact mode, glance) | `browser/chrome/browser/content/browser/zen-components/` |
| Zen's commands (`cmd_zen*`) and their keys | `browser/chrome/browser/content/browser/zen-sets.js`, `ZenKeyboardShortcuts` in the same folder |
| Firefox UI (`gBrowser`, tabs, URL bar providers) | `browser/chrome/browser/content/browser/` and `browser/modules/` |
| Platform services (`Services.*`, cookies, clear-data, prefs) | `gre/modules/` and Searchfox for the matching Firefox version (`Services.appinfo.platformVersion`) |
| Sine (mod loading, `mods.json`, preferences, the settings page) | `chrome/JS/` in any profile with Sine; `core/manager.sys.mjs` and `core/utils.sys.mjs` hold the rules |

## Probe in a real Zen

Confirm an API's shape and behaviour in the isolated headless Zen before writing code against it:

```bash
pnpm ops eval "return Object.getOwnPropertyNames(Object.getPrototypeOf(gZenWorkspaces))"
```

The body runs as an async function in the browser window with the test helpers (`until`, `sleep`, `press`). It uses a temporary profile with Sine copied in, never the user's running Zen. `--file` takes a longer probe.

## Wrap it

- Put the wrapper in `src/browser/<domain>.ts`, named for what it does to the user's browser (`moveTabAndFollow`, `openInContainer`), and keep Zen's names out of the commands that call it.
- Type each new global or method in `src/gecko/globals.d.ts` with only the members Zencast uses. Narrow unknown values from `unknown`; the project allows no `any` and no casts.
- Prefer Zen's own manager over reimplementing its behaviour, so Zen's animations, persistence and session restore stay in charge.
- Pages Zencast decorates (about:preferences, Sine's settings) run in the parent process, so their `contentDocument` is reachable; web pages are remote and need an actor.

## Prove it

Add or extend a scenario in `scripts/ops/e2e.ts` that drives the feature the way a user would and checks Zen's state afterwards, then run `pnpm ops e2e`. A typecheck passing proves the typings only; the scenario proves the internal still behaves as the wrapper assumes in this Zen version.
