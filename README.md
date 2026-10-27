<img src="src/shared/logo.svg" alt="" width="72" />

# Zencast

A keyboard-first command palette for [Zen browser](https://zen-browser.app), built as a [Sine](https://github.com/CosmoCreeper/Sine) mod.

| Key | Action |
| --- | --- |
| `Ctrl+K` | Open the palette (turn on "Open with Ctrl+T" in General to use `Ctrl+T` too) |
| `Ctrl+,` | Zencast settings: shortcuts, Zen settings, folders, general |
| `Ctrl+Shift+,` | Extensions |
| `Ctrl+Shift+N` | New folder, or a subfolder inside the current tab's folder |
| `Alt+P` | Pin or unpin the tab |
| `Alt+Shift+P` | Set the pinned URL to the current URL |
| `Alt+1…9` | Move the tab to space 1…9 |
| `Ctrl+C` | Open in a container, when nothing is selected to copy |

Every binding can be changed or recorded as a chord in settings.

The palette searches every tab in every space and folder, including pinned, essential and unloaded ones, and folders by name. Loaded and recently used tabs come first. While it is open, its keys take priority over Zen's.

In the palette:

| Key | Action |
| --- | --- |
| Hold `Ctrl` | Mark a letter in each visible result (`Ctrl+letter` runs it) and number the containers |
| Hold `Alt` | Number the spaces |
| `Alt+1…9` | Open results in that space; Enter on a tab moves it there. Press again to clear |
| `Ctrl+1…9` | Open results in that container; Enter on a tab reopens it there. Press again to clear |
| `Ctrl+.` | Record a shortcut for a command, or assign one to a tab, folder or site |
| `Ctrl+K` | More actions for the selected result |

Typing the start of a site still in the browser's DNS cache completes it inline and takes Enter, even when a command starts the same way: `allpyq` becomes `allpyq.in`. History autofill comes next. `Tab` or `→` accepts the completion.

Search also covers every Zen setting and Zencast's own: toggles switch in place, and number or text values open a prompt.

## Install

Requires Zen with Sine.

```bash
pnpm install
```

```bash
pnpm ops build
```

```bash
pnpm ops install --dry-run
```

```bash
pnpm ops install
```

Then, in Sine's settings, turn on "Allow unsafe JS": Sine skips scripts from locally installed mods until it is on. Restart Zen.

`pnpm ops doctor` reports anything still blocking the mod. If the Zen Command Palette mod is enabled, Zencast handles `Ctrl+K` first; disable one of the two to avoid confusion.

## Development

See `AGENTS.md` for layout and the `pnpm ops` commands.
