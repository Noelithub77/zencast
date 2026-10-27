// Copies the tab as a Markdown link. Each file in src/features/ exports its own `commands`, so a
// fork adds a feature by adding a file; the catalog, keys and settings page pick it up.
import { Link01Icon } from "@hugeicons/core-free-icons"

import type { Command } from "@/commands/types"

export const commands: Command[] = [
  {
    id: "tab.copyMarkdownLink",
    title: "Copy as Markdown link",
    section: "Tabs",
    icon: Link01Icon,
    keywords: "markdown md link title url clipboard",
    when: ({ tab }) => !["", "about", "chrome", "moz-extension"].includes(tab.linkedBrowser?.currentURI?.scheme ?? ""),
    run: async ({ win, tab, ui }) => {
      const url = tab.linkedBrowser?.currentURI?.spec ?? ""
      const title = tab.label.replaceAll(/[[\]]/g, "")
      await win.navigator.clipboard.writeText(`[${title}](${url})`)
      ui.toast("Copied as Markdown")
    },
  },
]
