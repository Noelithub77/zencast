# Zencast blog

- `main.md`: the article, in Medium-style Markdown.
- `scripts/diagrams.ts`: the hand-drawn figures, written with rough.js and rendered to `images/NN-name.png`. Edit a figure here, never the PNG.
- `images/08-looks.jpg`: the four example looks, tiled from `docs/media/looks/`.
- `fonts/excalifont.ttf`: the figures' font (OFL, see `fonts/EXCALIFONT-LICENSE`).

## Figures

Rendering needs [resvg](https://github.com/linebender/resvg) on the `PATH`.

```bash
pnpm --dir blog diagrams
```

Pass a filter to render only matching figures, for example `node scripts/diagrams.ts 04` from `blog/`. Embed a figure in `main.md` as `![alt text](images/NN-name.png)` with an italic caption line right below.

After `pnpm ops look` refreshes `docs/media/looks/`, rebuild the tile with ImageMagick:

```bash
magick montage docs/media/looks/{candy,pink,terminal,paper}.webp -tile 2x2 -geometry 900x+12+12 -background white -depth 8 -quality 88 blog/images/08-looks.jpg
```

## Publishing to Medium

1. Commit and push, so the images are reachable on GitHub.
2. `pnpm --dir blog medium` writes `blog/dist/medium.html`.
3. Open it in a browser, select all, copy, and paste into a new Medium story. Medium keeps headings, images with captions, code blocks and links, and re-hosts the images. Set the cover image to the first figure.
