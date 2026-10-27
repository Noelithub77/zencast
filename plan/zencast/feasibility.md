# Zencast: feasibility and plan

A keyboard-first, Raycast-style command palette for Zen, shipped as a Sine mod with full chrome privileges.

Researched against the installed Zen 1.23.2b (Firefox 157.0.1), Sine engine 2.3.4.1c, and Zen's own source extracted from `/opt/zen-browser-bin/browser/omni.ja`.

## Why Sine

Sine is built on fx-autoconfig. Its scripts run in the chrome window (`browser.xhtml`) with the system principal, so they get `gBrowser`, `gZen*` managers, `Services.*`, `ChromeUtils`, cookies, clear-data and container services. CSS-only Zen mods cannot reach any of this.

What Sine provides (verified in the installed engine):

| Script type | How it loads | Use for |
| --- | --- | --- |
| `*.uc.mjs` | ES module imported per window; hot unload via `window.addUnloadListener(cb)` | The palette and keybinding engine |
| `*.uc.js` | `loadSubScript` per window | Not needed |
| `*.sys.mjs` | Loaded once per process | Shared state, container and cookie services |

- Mod files are served at `chrome://sine/content/<mod-id>/…`. A Vite build can therefore ship an `index.html` settings page that opens in a normal tab with chrome privileges.
- `browser.xhtml` CSP is `script-src chrome: moz-src: resource:`. A bundled module loaded from `chrome://` passes; inline scripts and `eval` do not. Vite production builds use neither.
- `preferences.json` gives a basic settings panel for free inside Sine; the rich settings live in the custom page.

Prior art installed in this profile: Zen Command Palette (4.7k lines, extends the URL bar), settings-shortcuts-search, zen-missing-hotkeys, open-in-container-window. Zen itself now ships URL-bar "global actions" (`ZenUBGlobalActions.sys.mjs`).

## Stack

- TypeScript, Vite (library build, ES module output named `zencast.uc.mjs`), React.
- React in privileged Firefox documents has precedent: Firefox DevTools is React running in chrome documents.
- Palette UI rendered into a shadow root on an `html:div` inside `browser.xhtml`, so Zen and other mods cannot restyle it and vice versa.
- Settings page: second Vite entry, opened as a tab at `chrome://sine/content/zencast/settings/index.html`.
- Libraries: `cmdk` for list and keyboard semantics, `@leeoniya/ufuzzy` for ranking, `zod` for config validation, shadcn (Luma) components.

## Feature feasibility

Legend: ✅ direct internal API exists · 🟡 doable with our own logic · 🔴 not realistically possible

### Palette and launch

| Feature | Status | Mechanism |
| --- | --- | --- |
| `Ctrl+K` opens the palette; `Ctrl+T` can too, off by default | ✅ | Our keybinding engine overrides Firefox's `Ctrl+K` web-search key. With the General toggle on it also takes `Ctrl+T` before `key_newNavigatorTab` and Zen's floating new-tab URL bar (`zen.urlbar.replace-newtab`) |
| `Ctrl+,` opens the Zencast settings page | ✅ | Opens `chrome://sine/content/zencast/settings/index.html`; Zen's own preferences stay reachable from it. The installed Zen Command Palette mod currently binds `Ctrl+,` to Zen settings, so the two conflict |
| URL, history, bookmarks, search suggestions inside the palette | ✅ | Query Firefox's `UrlbarProvidersManager` so results match the real URL bar |
| Search open tabs, all workspaces, folders, essentials | ✅ | `gBrowser.tabs`, `gZenWorkspaces`, `gZenFolders` |
| Run every Zen and Firefox command | ✅ | `cmd_zen*` commands in `zen-sets.js` (40+), Firefox `<command>` elements |
| Show the keybinding beside every command | ✅ | `gZenKeyboardShortcutsManager._currentShortcutList` exposes id, command, group and display string |
| Search all settings, deep-link to the pane | ✅ | Index `about:preferences` panes plus a curated `zen.*` pref catalog; toggle booleans inline |
| Raw pref search (`about:config` level) | ✅ | `Services.prefs.getBranch("").getChildList("")` |
| Action panel (`Ctrl+K` inside palette / `→`), navigation stack, `Esc` pops | 🟡 | Our UI |
| Extensions, Sine mods, downloads, recently closed | ✅ | `AddonManager`, Sine `mods.json`, `DownloadsCommon`, `SessionStore` |

### Keybinding engine

| Feature | Status | Mechanism |
| --- | --- | --- |
| List all native Zen and Firefox bindings | ✅ | Zen shortcut list plus `<key>` elements in the window keysets |
| Rebind or unbind native Zen bindings | ✅ | `gZenKeyboardShortcutsManager.setShortcut()` (writes `zen-keyboard-shortcuts.json`) |
| Conflict detection | ✅ | `checkForConflicts()` plus our own table |
| Context-aware bindings ("when tab is pinned", "when in folder", "when in essentials", "when split") | 🟡 | Our engine evaluates a `when` condition per binding |
| Chords / leader sequences (`Alt+Space` then `f n`) with which-key hint overlay | 🟡 | Our engine |
| Beat page keyboard handlers (Google Docs, Figma) | 🟡 | Register as reserved `<key>` elements so chrome sees them first; needs testing per binding |
| Recorder UI with live key capture | 🟡 | Settings page |

### Example niche actions

| Binding (proposed) | Action | Status | Mechanism |
| --- | --- | --- | --- |
| `Ctrl+Shift+N` | Smart folder: root folder if the tab is loose, subfolder if it is in a folder | ✅ | `gZenFolders.createFolder()` and `zen-folder.createSubfolder()`; respects `zen.folders.max-subfolders` |
| `Alt+P` | Pin or unpin current tab | ✅ | `cmd_zenTogglePinTab` |
| `Alt+Shift+P` on a pinned tab | Replace pinned URL with current URL | ✅ | `gZenPinnedTabManager.replacePinnedUrlWithCurrent()` |
| — | Reset pinned tab to its pinned URL | ✅ | `resetPinnedTab()` |
| — | Edit pinned URL | ✅ | `editPinnedUrl()` |
| — | Move tab to workspace N, to essentials, to folder by name | ✅ | `gZenWorkspaces`, essentials commands, folder `addTabs()` |
| — | Collapse or expand all folders, unload workspace | ✅ | Existing Zen functions |

### Containers

| Feature | Status | Mechanism |
| --- | --- | --- |
| Open next tab in a container, picked by keyboard with container colours and icons | ✅ | `ContextualIdentityService.getPublicIdentities()`, `gBrowser.addTab(url, { userContextId })` |
| Reopen current tab in another container | ✅ | New tab with `userContextId`, close or keep the old one |
| Create, rename, recolour, delete containers from the palette | ✅ | `ContextualIdentityService.create/update/remove` |
| Temporary throwaway container, deleted with its data on close | ✅ | Create container, `Services.clearData.deleteDataFromOriginAttributesPattern({ userContextId })` on close |

### Session move and tab wipe

| Feature | Status | Mechanism |
| --- | --- | --- |
| Move cookies (including `HttpOnly` auth cookies) for the tab's site to another container | ✅ | `Services.cookies.getCookiesWithOriginAttributes` then `Services.cookies.add` with the target `userContextId` |
| Move `localStorage` and `sessionStorage` | 🟡 | Our own JSWindowActor reads the source page and writes the target page after load |
| Move IndexedDB, Cache Storage, service workers | 🔴 | No copy API; sites that keep auth tokens only there (some SPAs) will need a fresh login |
| Full tab wipe: clear the site's cookies, storage, cache, permissions in that container, purge back/forward history, reload | ✅ | `Services.clearData.deleteDataFromSite(site, { userContextId }, …)` plus `sessionHistory.purgeHistory()` |
| Wipe an entire container | ✅ | `deleteDataFromOriginAttributesPattern({ userContextId })` |

Caveat: in the default (no-container) context, wiping a site logs you out of that site in every non-container tab, because they share one cookie jar. The confirmation must say so.

## Design direction

Vesper (Rauno Freiberg's theme, which Raycast itself uses) as the base, extended with pastels and almost no blue.

| Token | Value | Role |
| --- | --- | --- |
| `bg` | `#101010` | Window |
| `surface` | `#161616` | Panels, detail |
| `input` | `#1C1C1C` | Search field |
| `selected` | `#232323` | Selected row |
| `hover` | `#282828` | Hover row, borders |
| `fg` | `#FFFFFF` at 92% | Primary text |
| `muted` | `#A0A0A0` | Secondary text, icons |
| `faint` | `#505050` | Tertiary, shortcut badge text |
| `peach` | `#FFC799` | Primary accent, focus |
| `mint` | `#99FFE4` | Success, "on" |
| `rose` | `#FF8080` | Destructive |
| `lilac` | `#C8B6FF` (proposed) | Workspaces, chords |
| `butter` | `#F5E6A8` (proposed) | Warnings |

Container colours keep Firefox's names but are mapped to softened pastel equivalents so they sit inside the palette.

Interaction rules adopted from Raycast:

- Visible within one frame of the keypress; results under 50 ms; data streams in without blocking input.
- `Enter` primary action, `Ctrl+Enter` secondary, `Ctrl+K` or `→` action panel, `Esc` pops the stack, hold `Ctrl` for letter hints on results and numbers on actions. `Alt+1…9` is left free for moving the tab to a space.
- Shortcuts shown inline as small badges on every row, never only in tooltips.
- Short confirmation through Zen's own toast after actions that leave the palette; no decorative motion.

## Open decisions

Tracked in the conversation; marked **[chosen]** here once answered.

1. UI framework: React 19 **[chosen]**.
2. Palette surface: own overlay, opened by `Ctrl+K`, and by `Ctrl+T` when turned on in General; `Ctrl+,` opens settings **[chosen]**.
3. Session move: ask each time; `Enter` copies, `Ctrl+Enter` moves and clears the source **[chosen]**.
4. First milestone: palette core, keybinding engine, containers and wipe, settings page **[chosen]**.
5. Dependencies beyond React: `cmdk`, `@leeoniya/ufuzzy`, `zod`, shadcn **[chosen]**.
6. Coexistence with the installed Zen Command Palette mod: pending. Zencast handles its keys first and `pnpm ops doctor` warns while both are enabled.

## Performance

Measured with `pnpm ops bench` (headless Zen, 300 lazy tabs). Budgets are p95.

| Metric | What it covers | Budget | Latest p50 / p95 |
| --- | --- | --- | --- |
| Open | Key press to the first painted frame, including vsync alignment | 33.4 ms | 19.5 / 22.7 ms |
| Search | Ranking one query | 4 ms | 0.6 / 3.3 ms |
| Keystroke | Work a key press blocks before the next paint | 16.7 ms | 5.9 / 10.5 ms |

What got it there: the root list stays mounted between opens; rows use positional keys and are memoized; only the first screen of new results renders synchronously while the rest follows in a deferred pass; the settings index is cached per root list and built while idle; the palette stylesheet scans only palette sources (199 KB to 19 KB).

Remaining cost is React committing row changes when the result count shrinks sharply, and the first open, which mounts the list (about 35 ms).
