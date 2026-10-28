// Asks Claude or ChatGPT about the current page: the typed question goes in the prompt with the
// page's address, and the selected text quoted when there is some.
import { AiChat02Icon } from "@hugeicons/core-free-icons"

import { fillQuery } from "@/browser/bookmarks"
import { tabUrl } from "@/browser/tabs"
import { ASSISTANTS } from "@/browser/urlbar"
import { selectedText } from "@/browser/window"
import { openTarget } from "@/palette/sources"
import type { Command, CommandContext, ItemAction, ListView } from "./types"

// The finder gives at most this much of a selection, so a selection this long was cut.
const SELECTION_LIMIT = 150

function pagePrompt(question: string, url: string, selection: string) {
  if (!selection) return `${question}\n\n${url}`
  const quote = selection.length >= SELECTION_LIMIT ? `${selection}…` : selection
  return `${question}\n\n> ${quote.replace(/\s*\n\s*/g, " ")}\n\nFrom ${url}`
}

async function askView(ctx: CommandContext): Promise<ListView> {
  const url = tabUrl(ctx.tab)
  const selection = (await selectedText(ctx.win))?.trim() ?? ""
  const fallback = selection ? "Explain this" : "Summarize this page"
  // Claude first: Enter asks it, Ctrl+Enter asks ChatGPT.
  const assistants = [...ASSISTANTS].reverse()
  const actions = (value: string) =>
    assistants.map((assistant, i): ItemAction => ({
      id: `ask-${assistant.keyword}`,
      title: `Ask ${assistant.title}`,
      keys: i === 1 ? "ctrl+enter" : undefined,
      run: () => openTarget(ctx, fillQuery(assistant.url, pagePrompt(value.trim() || fallback, url, selection)), "tab"),
    }))
  return {
    id: "ask-page",
    title: selection ? "Ask about the selection" : "Ask about this page",
    placeholder: selection ? "Question about the selection" : `Question about ${ctx.tab.label}`,
    items: [],
    prompt: {
      initial: "",
      label: (value) => value.trim() || fallback,
      icon: { kind: "icon", icon: AiChat02Icon, color: "var(--lilac)" },
      actions,
    },
  }
}

export const askCommands: Command[] = [
  {
    id: "page.ask",
    title: "Ask about this page",
    section: "Tabs",
    icon: AiChat02Icon,
    keywords: "ai claude chatgpt gpt chat summarize explain question selection",
    when: ({ tab }) => /^https?:/.test(tabUrl(tab)),
    run: askView,
  },
]
