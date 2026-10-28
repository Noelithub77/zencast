// Google account containers: each Google account signed in to Zen gets a container named after its
// email, where it signs in once with the email filled in, so accounts stay apart without switching.
import { GoogleIcon, UserAdd01Icon } from "@hugeicons/core-free-icons"

import { createContainer, listContainers, openInContainer, type Container } from "@/browser/containers"
import { googleAccounts, refreshGoogleAccounts, signInUrl } from "@/browser/google"
import { notify } from "@/browser/toast"
import type { Command, CommandContext, ItemAction, ListView, PaletteItem } from "./types"

const COLORS = ["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple"]
const GMAIL = "https://mail.google.com/mail/"

const containerFor = (email: string, containers: Container[]) => containers.find((container) => container.name.toLowerCase() === email)

/** Makes a container for each email without one and opens Google's sign-in in it; returns how many. */
export function makeGoogleContainers(win: Window, emails: string[]): number {
  const containers = listContainers()
  const missing = emails.filter((email) => !containerFor(email, containers))
  missing.forEach((email, i) => openInContainer(win, createContainer(email, COLORS[(containers.length + i) % COLORS.length]), signInUrl(email)))
  return missing.length
}

const madeToast = (count: number) => (count === 1 ? "Container made · sign in once" : `Made ${count} containers · sign in once in each`)

/** The toast after a sign-in outside any container, offering containers for the new accounts. */
export function offerGoogleContainers(win: Window, emails: string[]) {
  const containers = listContainers()
  const missing = emails.filter((email) => !containerFor(email, containers))
  if (!missing.length) return
  const run = () => notify(win, madeToast(makeGoogleContainers(win, missing)))
  if (missing.length === 1) notify(win, `Signed in to Google as ${missing[0]}`, { label: "Make container", run })
  else notify(win, `${missing.length} new Google accounts`, { label: "Make containers", run })
}

function accountAction(ctx: CommandContext, email: string, container: Container | undefined, signedIn: boolean): ItemAction {
  if (!container)
    return { id: "make", title: "Make container", run: () => ctx.ui.toast(madeToast(makeGoogleContainers(ctx.win, [email]))) }
  if (!signedIn) return { id: "sign-in", title: "Sign in", run: () => void openInContainer(ctx.win, container.id, signInUrl(email)) }
  return { id: "open", title: "Open Gmail", run: () => void openInContainer(ctx.win, container.id, GMAIL) }
}

async function accountsView(ctx: CommandContext): Promise<ListView | void> {
  let accounts: string[]
  try {
    ;({ accounts } = await refreshGoogleAccounts())
  } catch (error) {
    console.error("[zencast] google accounts", error)
    return ctx.ui.toast("Couldn't read your Google accounts")
  }
  if (!accounts.length) return ctx.ui.toast("No Google accounts signed in")

  const containers = listContainers()
  const rows = await Promise.all(
    accounts.map(async (email) => {
      const container = containerFor(email, containers)
      const signedIn = container ? (await googleAccounts(container.id).catch((): string[] => [])).includes(email) : false
      return { email, container, signedIn }
    }),
  )
  const missing = rows.filter((row) => !row.container).map((row) => row.email)
  const items: PaletteItem[] = rows.map(({ email, container, signedIn }) => ({
    id: `google-account:${email}`,
    title: email,
    section: "Google accounts",
    icon: container ? { kind: "dot", color: container.color } : { kind: "icon", icon: GoogleIcon },
    accessory: !container ? "No container" : signedIn ? "Signed in" : "Not signed in",
    accessoryColor: "var(--faint)",
    actions: [accountAction(ctx, email, container, signedIn)],
  }))
  if (missing.length > 1)
    items.unshift({
      id: "google-make-all",
      title: `Make ${missing.length} containers`,
      section: "Google accounts",
      icon: { kind: "icon", icon: UserAdd01Icon },
      actions: [{ id: "make", title: "Make", run: () => ctx.ui.toast(madeToast(makeGoogleContainers(ctx.win, missing))) }],
    })
  return { id: "google-accounts", title: "Google accounts", placeholder: "Account", items }
}

export const googleCommands: Command[] = [
  {
    id: "google.containers",
    title: "Google account containers",
    section: "Containers",
    icon: GoogleIcon,
    keywords: "gmail accounts sign in profiles",
    run: accountsView,
  },
]
