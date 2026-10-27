import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const OUT_DIR = resolve(import.meta.dirname, "dist/zencast")

/**
 * Shadow roots ignore @property and @font-face, so they move from the palette sheet into
 * document.css, which Sine loads as the mod's chrome-wide stylesheet.
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
      this.emitFile({ type: "asset", fileName: "document.css", source: hoisted.join("\n") })
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
