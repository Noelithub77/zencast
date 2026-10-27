// Previews looks: applies each CSS file to the chrome window of an isolated headless Zen and screenshots it.
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { basename, join } from "node:path"

import { RESET, SETUP } from "./media.ts"
import type { Zen } from "./zen.ts"

/** Writes `<dir>/<name>.png` per stylesheet, plus `default.png` for comparison. */
export async function captureLooks(zen: Zen, files: string[], dir: string): Promise<string[]> {
  await mkdir(dir, { recursive: true })
  await zen.run(SETUP, 120000)
  await zen.run(String.raw`${RESET}
    const tab = gBrowser.addTrustedTab("https://en.wikipedia.org/wiki/Firefox", { skipAnimation: true })
    gBrowser.selectedTab = tab
    await until(() => tab.linkedBrowser.contentTitle, 20000)
    await sleep(800)`)
  const written: string[] = []
  const shot = async (name: string) => {
    const path = join(dir, `${name}.png`)
    await writeFile(path, await zen.screenshot())
    written.push(path)
  }

  await shot("default")
  for (const file of files) {
    const css = await readFile(file, "utf8")
    // An author sheet on the window cascades after Zen's own sheets, as Sine's chrome.css does.
    await zen.run(String.raw`const uri = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(${JSON.stringify(css)}))
      windowUtils.loadSheet(uri, windowUtils.AUTHOR_SHEET)
      await sleep(700)`)
    await shot(basename(file, ".css"))
    await zen.run(String.raw`windowUtils.removeSheet(Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(${JSON.stringify(css)})), windowUtils.AUTHOR_SHEET)
      await sleep(200)`)
  }
  return written
}
