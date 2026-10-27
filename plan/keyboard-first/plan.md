# Keyboard-first palette

Decisions confirmed on 2026-10-27. Implemented on 2026-10-28; e2e covers each step.

| Topic | Decision |
| --- | --- |
| DNS completion | Always wins Enter: before URL-bar history autofill and before a command whose name starts with the query **[chosen]** |
| Ctrl letter hints | The hint letter is marked inside each title, plus a badge; appear on Ctrl down with a short fade so quick shortcuts don't flash **[chosen]** |
| Space and container targets | Alt+N toggles a space, Ctrl+N a container, while the palette is open. URLs, searches and new tabs open there; Enter on an existing tab moves it there (space) or reopens it there (container). Commands are unaffected **[chosen]** |
| Additions | Record keys in the palette; all settings in the palette; hold-to-reveal strips; keys for tabs, folders and sites **[chosen]** |

## Steps

1. DNS priority in `Palette.tsx` completion.
2. Hints: `assignHints` returns the letter's position; `Row` marks it in the title.
3. Targets: `space` beside `openIn` in the store; colour from the space's gradient, else a pastel by position; tint, chips and transitions in `Palette.tsx`; `openTarget` and tab switching honour both.
4. Strips: holding Ctrl shows numbered containers in the footer, holding Alt numbered spaces.
5. Record in palette: Ctrl+. on a command records there; conflicts and Undo in the toast.
6. Jumps: `config.jumps` (url or folder) become commands with bindings; "Assign shortcut" on tabs, folders and web results; listed under Shortcuts in settings.
7. Settings: Zencast config as palette items; Zen int and string prefs edited through a prompt view.
8. e2e scenarios for each, bench, install, commit.

Alt+N no longer runs the Nth row while the palette is open; it picks a space.
