# Zencast

A keyboard-first command palette for [Zen browser](https://zen-browser.app), built as a [Sine](https://github.com/CosmoCreeper/Sine) mod.

| Key | Action |
| --- | --- |
| `Ctrl+K`, `Ctrl+T` | Open the palette |
| `Ctrl+,` | Zencast settings: shortcuts, Zen settings, folders, general |
| `Ctrl+Shift+N` | New folder, or a subfolder inside the current tab's folder |
| `Alt+P` | Pin or unpin the tab |
| `Alt+Shift+P` | Set the pinned URL to the current URL |
| `Ctrl+Shift+1…9` | Move the tab to space 1…9 |

Every binding can be changed or recorded as a chord in settings.

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
