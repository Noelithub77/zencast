---
name: restyle
description: Restyle Zen itself with CSS, from a colour tweak to a whole new look (candy, pink, terminal, paper). Use when a prompt asks to change how the browser looks: colours, fonts, tabs, sidebar, URL bar, page tint or spacing.
---

# Restyle Zen

A look is one CSS file applied to Zen's chrome window, the same layer as `userChrome.css`. It can recolour every part of the browser and, through the content `<browser>` element, tint the pages too. `src/looks/` holds example looks that are not shipped; `src/features/*.css` is shipped: the build appends it to `document.css`, which Sine applies to every window. CSS needs no "Allow unsafe JS".

## Steps

1. Start from the closest file in `src/looks/` and copy it to `src/looks/<name>.css`. Each one shows the hooks below in use.
2. When the prompt needs a part not listed below, find its selector in Zen's own styles (`zen-styles/` in the extract from the `zen-internals` skill) or ask a running headless Zen: `pnpm ops eval "return getComputedStyle(document.querySelector('<selector>')).backgroundColor"`.
3. Preview it in an isolated headless Zen and look at the PNG:

   ```bash
   pnpm ops look src/looks/<name>.css --out /tmp/looks
   ```

   It writes `default.png` and `<name>.png` from the same tabs and page. Compare them and iterate until the screenshot shows what the prompt asked for.
4. To ship it, copy the file into `src/features/`, then `pnpm ops build`, `pnpm ops install --dry-run` and `pnpm ops install`, and restart Zen. To share a look on its own, a Sine mod with only a `theme.json` (`"style": { "chrome": "<name>.css" }`) and the stylesheet is enough.
5. When the look changes the palette's surroundings, run `pnpm ops e2e` and save fresh README captures with `pnpm ops look`.

The look is done when its screenshot matches the prompt and nothing it did not mean to touch changed from `default.png`.

## Hooks

| Part | Selector or variable |
| --- | --- |
| Window background (sidebar and frame) | `.zen-browser-generic-background::before`, `::after` and `#zen-main-app-wrapper`, painted directly: Zen sets `--zen-main-browser-background` inline on `#browser`, so overriding the variable does nothing |
| Accent, corner radius, gaps | `--zen-primary-color`, `--zen-border-radius`, `--zen-element-separation` on `:root`, with `!important` because Zen sets some of them inline |
| Sidebar text and font | `#navigator-toolbox`, `#tabbrowser-tabs` |
| Tabs | `.tabbrowser-tab .tab-background`, `.tabbrowser-tab[selected] .tab-background`, `.tab-label` |
| URL bar | `#urlbar-background`, `#urlbar` |
| Web view frame | `.browserSidebarContainer` (radius, outline, shadow) |
| Page tint | `filter` on `#tabbrowser-tabpanels browser` for dark or recoloured pages; a `mix-blend-mode: multiply` layer on `.browserStack::after` to tint white pages, which hue filters cannot |

Light looks also set `color-scheme: light !important` on `:root` so Zen's `light-dark()` colours follow.
