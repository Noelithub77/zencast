import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const OUT_DIR = resolve(import.meta.dirname, "dist/zencast")
// Must match the link in src/palette/host.tsx.
const PALETTE_URL = "chrome://sine/content/zencast/palette.css"
const FEATURES = resolve(import.meta.dirname, "src/features")

/**
 * Shadow roots ignore @property and @font-face, so they move from the palette sheet into
 * document.css, which Sine loads as the mod's chrome-wide stylesheet. The palette link also gets a
 * content hash: Gecko caches chrome:// sheets by URL, so a fixed URL can pair new markup with old CSS.
 * Stylesheets in src/features/ restyle the browser itself, so they ship in document.css too.
 */
function documentCss(): Plugin {
  return {
    name: "zencast-document-css",
    apply: "build",
    // Runs after Vite's CSS plugin has emitted the stylesheet.
    enforce: "post",
    generateBundle(_, bundle) {
      const palette = bundle["palette.css"]
      if (palette?.type !== "asset") return
      const hoisted: string[] = []
      palette.source = String(palette.source).replace(/@(?:property|font-face)[^{]*\{[^}]*\}/g, (rule) => {
        hoisted.push(rule)
        return ""
      })
      const looks = readdirSync(FEATURES)
        .filter((file) => file.endsWith(".css"))
        .sort()
        .map((file) => {
          this.addWatchFile(join(FEATURES, file))
          return `/* src/features/${file} */\n${readFileSync(join(FEATURES, file), "utf8")}`
        })
      this.emitFile({ type: "asset", fileName: "document.css", source: [...hoisted, ...looks].join("\n") })

      const version = createHash("sha256").update(palette.source).digest("hex").slice(0, 10)
      const script = bundle["zencast.uc.mjs"]
      if (script?.type !== "chunk" || !script.code.includes(PALETTE_URL)) this.error(`zencast.uc.mjs does not reference ${PALETTE_URL}`)
      script.code = script.code.replaceAll(PALETTE_URL, `${PALETTE_URL}?v=${version}`)
    },
  }
}

const alias = { "@": resolve(import.meta.dirname, "./src") }

// `vite build` bundles the mod script; `vite build --mode settings` builds the settings page.
export default defineConfig(({ mode }) =>
  mode === "settings"
    ? {
        root: resolve(import.meta.dirname, "src/settings"),
        base: "./",
        plugins: [react(), tailwindcss()],
        resolve: { alias },
        build: { outDir: resolve(OUT_DIR, "settings"), emptyOutDir: true, target: "firefox140" },
      }
    : {
        plugins: [react(), tailwindcss(), documentCss()],
        resolve: { alias },
        publicDir: resolve(import.meta.dirname, "mod"),
        // Library mode leaves process.env in place; Gecko has no `process`.
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
        build: {
          outDir: OUT_DIR,
          emptyOutDir: true,
          target: "firefox140",
          // Library mode keeps whitespace in ES output; this bundle is never consumed by another bundler.
          // ZENCAST_PROFILE=1 keeps names readable in Gecko profiles.
          rolldownOptions: { output: { minify: !process.env.ZENCAST_PROFILE } },
          lib: {
            entry: resolve(import.meta.dirname, "src/main.ts"),
            formats: ["es"],
            fileName: () => "zencast.uc.mjs",
            cssFileName: "palette",
          },
        },
      },
)
