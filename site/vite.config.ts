import { readFileSync } from "node:fs"
import { defineConfig, type Plugin } from "vite"

const logo = () => readFileSync(new URL("../src/shared/logo.svg", import.meta.url), "utf8").trim()

// The hero and closing marks are inline so the keycap can press; src/shared/logo.svg stays the single source.
const inlineLogo = (): Plugin => ({
  name: "inline-logo",
  transformIndexHtml(html) {
    const svg = logo()
    return html.replaceAll(/<!--logo:([\w-]+)-->/g, (_, className: string) =>
      svg.replace(/<svg [^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" class="logo ${className}" role="img" aria-label="Zencast logo">`),
    )
  },
})

// The favicon and header mark load /logo.svg, served in dev and emitted in builds.
const logoFile = (): Plugin => ({
  name: "logo-file",
  configureServer(server) {
    server.middlewares.use("/logo.svg", (_request, response) => {
      response.setHeader("Content-Type", "image/svg+xml")
      response.end(logo())
    })
  },
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "logo.svg", source: logo() })
  },
})

export default defineConfig({
  plugins: [inlineLogo(), logoFile()],
  server: { port: 4174, strictPort: true },
  build: {
    target: "es2022",
    modulePreload: { polyfill: false },
    // Media stays as files so the browser can cache and lazy-load it.
    assetsInlineLimit: 0,
  },
})
