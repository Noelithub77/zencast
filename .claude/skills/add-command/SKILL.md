---
name: add-command
description: Add or change a Zencast command, its default keys, its palette results or the browser's look. Use when a fork or a feature needs a new action, a new keybinding, a different default, or CSS for Zen itself.
---

# Add a command

Every action in Zencast, bound to a key or not, is a `Command`; its shape and the meaning of each field are in `src/commands/types.ts`. The palette lists commands, the key engine binds their `defaultKeys`, and the settings page lets users rebind them, so one catalog entry reaches all three.

A new feature goes in its own file in `src/features/`, which exports `commands: Command[]`; `catalog.ts` collects every file there, so nothing else needs editing. A `.css` file beside it restyles Zen itself; the `restyle` skill covers looks. Change Zencast's own core commands in `catalog.ts`.

## Steps

1. Read the neighbouring commands in `catalog.ts` and copy the closest one. Commands that pick from a list return a `ListView` from `run`; key-only variants (one per space number) are `hidden`.
2. Put browser work in a wrapper in `src/browser/` and call it from `run`. When the API is new, follow the `zen-internals` skill first.
3. Choose `defaultKeys` that leave Zen's own keys alone. Check what a key does natively before taking it:

   ```bash
   pnpm ops eval "return [...document.querySelectorAll('key')].filter((k) => k.getAttribute('key')?.toLowerCase() === 'k').map((k) => [k.id, k.getAttribute('modifiers')])"
   ```

   Chords (`ctrl+space f`) avoid conflicts entirely. Use `when` so the key passes through to Zen when the command cannot run, and `keysWhen` when the key must keep its usual meaning in some state (`Ctrl+C` with a selection).
4. Confirm the action from outside the palette with `ctx.ui.toast(...)`, which shows Zen's own toast; actions inside the palette show their result in place.
5. Add a scenario to `scripts/ops/e2e.ts` that presses the key or runs the command and checks Zen's state, then run `pnpm typecheck`, `pnpm lint` and `pnpm ops e2e`. Run `pnpm ops bench` too when the change touches the palette's rendering.
6. Update the key tables in `README.md` when a default key is added, changed or takes over a key Zen already uses.

The command is done when its scenario passes in `pnpm ops e2e` and the README lists its default key.
