import { readConfig } from "@/shared/config"
import { listContainers, openInContainer } from "./containers"
import { bareHost } from "./hosts"
import { moveTabToWorkspace } from "./workspaces"

// Sites that always open in a container. A page request for one from a tab without a container is
// cancelled before it is sent and opens in its container instead; a tab already in a container is left alone, so
// picking a container on purpose always wins.

/** The container a URL should open in, when its site has one that still exists. */
export function siteContainer(url: string): number | undefined {
  const host = bareHost(url)
  const id = host ? readConfig().siteContainers[host] : undefined
  return id !== undefined && listContainers().some((container) => container.id === id) ? id : undefined
}

export function watchSiteContainers(win: Window): () => void {
  const observer: RequestObserver = {
    observe(subject) {
      const channel = subject.QueryInterface(Ci.nsIHttpChannel)
      const { loadInfo } = channel
      if (loadInfo.externalContentPolicyType !== Ci.nsIContentPolicy.TYPE_DOCUMENT || loadInfo.originAttributes.userContextId !== 0) return
      const browser = loadInfo.browsingContext?.top.embedderElement
      const tab = browser?.ownerDocument === win.document ? win.gBrowser.getTabForBrowser(browser) : null
      const url = channel.URI.spec
      const id = tab ? siteContainer(url) : undefined
      if (!tab || id === undefined) return
      channel.cancel(Cr.NS_BINDING_ABORTED)
      const previous = win.gBrowser.selectedTab
      const opened = openInContainer(win, id, url)
      const space = tab.getAttribute("zen-workspace-id")
      if (space && opened.getAttribute("zen-workspace-id") !== space) moveTabToWorkspace(win, opened, space)
      // A blank tab, or one waking up or reloading this page, is replaced; a tab on another page keeps it.
      const current = tab.linkedBrowser?.currentURI.spec ?? ""
      if (/^about:(blank|newtab|home)$/.test(current) || current === url) win.gBrowser.removeTab(tab)
      // A link opened in the background stays in the background.
      if (previous !== tab) win.gBrowser.selectedTab = previous
    },
  }
  Services.obs.addObserver(observer, "http-on-modify-request")
  return () => Services.obs.removeObserver(observer, "http-on-modify-request")
}
