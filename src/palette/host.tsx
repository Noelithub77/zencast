import { createRoot } from "react-dom/client"

import "./palette.css"
import { KeySheet } from "./KeySheet"
import { ChordHint } from "./Overlays"
import { Palette } from "./Palette"
import { HOST_ID } from "./store"

export const PALETTE_CSS_URL = "chrome://sine/content/zencast/palette.css"

function App({ win }: { win: Window }) {
  return (
    <>
      <Palette />
      <ChordHint />
      <KeySheet win={win} />
    </>
  )
}

/**
 * Mounts the palette into a shadow root on the browser window so Tailwind's styles stay out of
 * Zen's chrome. The tree stays mounted while closed, so opening is a state change, not a mount.
 */
export function mountPalette(win: Window): () => void {
  const doc = win.document
  const body = doc.body
  if (!body) throw new Error("Browser window has no body to mount into")

  const host = doc.createElement("div")
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: "open" })
  const link = doc.createElement("link")
  link.rel = "stylesheet"
  link.href = PALETTE_CSS_URL
  const mount = doc.createElement("div")
  shadow.append(link, mount)
  body.append(host)

  const root = createRoot(mount)
  root.render(<App win={win} />)
  return () => {
    root.unmount()
    host.remove()
  }
}
