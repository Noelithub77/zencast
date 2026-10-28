// "Always open this site in a container": picks the container for the current site, and lists every
// site with one so a rule can be dropped again.
import { CancelCircleIcon, UserGroupIcon } from "@hugeicons/core-free-icons"

import { containerName, listContainers, reopenInContainer } from "@/browser/containers"
import { bareHost } from "@/browser/hosts"
import { tabUrl } from "@/browser/tabs"
import { readConfig, updateConfig } from "@/shared/config"
import { containerItems } from "./catalog"
import type { Command, CommandContext, ListView, PaletteItem } from "./types"

function setSiteContainer(host: string, id: number | null) {
  updateConfig((config) => {
    const rest = Object.fromEntries(Object.entries(config.siteContainers).filter(([site]) => site !== host))
    return { ...config, siteContainers: id === null ? rest : { ...rest, [host]: id } }
  })
}

function ruleItems(ctx: CommandContext, except?: string): PaletteItem[] {
  const colors = new Map(listContainers().map((container) => [container.id, container.color]))
  return Object.entries(readConfig().siteContainers)
    .filter(([host]) => host !== except)
    .map(([host, id]) => ({
      id: `site-container:${host}`,
      title: host,
      subtitle: containerName(id),
      section: "Sites with a container",
      icon: { kind: "dot", color: colors.get(id) ?? "var(--faint)" },
      actions: [
        {
          id: "remove",
          title: "Stop always opening here",
          danger: true,
          run: () => {
            setSiteContainer(host, null)
            ctx.ui.toast(`${host} opens anywhere again`, { label: "Undo", run: () => setSiteContainer(host, id) })
          },
        },
      ],
    }))
}

function siteContainerView(ctx: CommandContext): ListView | void {
  const host = /^https?:/.test(tabUrl(ctx.tab)) ? bareHost(tabUrl(ctx.tab)) : null
  const others = ruleItems(ctx, host ?? undefined)
  if (!host && !others.length) return ctx.ui.toast("Open a site to give it a container")
  const current = host ? readConfig().siteContainers[host] : undefined
  const pick = (id: number) => {
    if (!host) return
    setSiteContainer(host, id)
    if (ctx.tab.userContextId === 0) reopenInContainer(ctx.win, ctx.tab, id)
    ctx.ui.toast(`${host} always opens in ${containerName(id)}`, { label: "Undo", run: () => setSiteContainer(host, current ?? null) })
  }
  const choices = host
    ? containerItems(ctx, { title: "Always open here", run: pick }).map((item) => ({
        ...item,
        id: `always-${item.id}`,
        section: host,
        accessory: item.id === `container-${current}` ? "Always" : undefined,
        accessoryColor: "var(--mint)",
      }))
    : []
  const clear: PaletteItem[] =
    host && current !== undefined
      ? [
          {
            id: "site-container-clear",
            title: "Open anywhere",
            subtitle: `Stop always opening ${host} in ${containerName(current)}`,
            section: host,
            icon: { kind: "icon", icon: CancelCircleIcon, color: "var(--rose)" },
            actions: [{ id: "clear", title: "Open anywhere", run: () => setSiteContainer(host, null) }],
          },
        ]
      : []
  return { id: "site-containers", title: "Site containers", placeholder: host ? "Container" : "Site", items: [...choices, ...clear, ...others] }
}

export const siteContainerCommands: Command[] = [
  {
    id: "container.site",
    title: "Always open this site in a container",
    section: "Containers",
    icon: UserGroupIcon,
    keywords: "site default rule assign domain sticky",
    run: siteContainerView,
  },
]
