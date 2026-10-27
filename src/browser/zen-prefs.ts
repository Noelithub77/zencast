// Readable titles and categories for Zen's boolean prefs. Prefs not listed here still appear,
// placed by their branch and titled from their name.

export const PREF_CATEGORIES = ["Tabs", "Spaces", "Look", "Compact mode", "Address bar", "Features", "Advanced"] as const
export type PrefCategory = (typeof PREF_CATEGORIES)[number]

// Group order within a category; the first group of each category leads.
const GROUP_ORDER = [
  "General", "Spaces", "Theme", "Layout", "Effects", "Pinned tabs", "Folders", "Split view", "Glance", "Ctrl+Tab",
  "Window sync", "Session", "Boosts", "Library", "Mods", "Experimental", "Logging", "Internal", "Other",
]

export function groupRank(group: string): number {
  const rank = GROUP_ORDER.indexOf(group)
  return rank === -1 ? GROUP_ORDER.length : rank
}

interface Placement {
  category: PrefCategory
  group: string
}

// First match wins, so narrower branches come before wider ones.
const BRANCHES: Array<[prefix: string, placement: Placement]> = [
  ["zen.view.compact.", { category: "Compact mode", group: "Compact mode" }],
  ["zen.tabs.ctrl-tab.", { category: "Tabs", group: "Ctrl+Tab" }],
  ["zen.ctrlTab.", { category: "Tabs", group: "Ctrl+Tab" }],
  ["zen.pinned-tab-manager.", { category: "Tabs", group: "Pinned tabs" }],
  ["zen.folders.", { category: "Tabs", group: "Folders" }],
  ["zen.live-folders.", { category: "Tabs", group: "Folders" }],
  ["zen.splitView.", { category: "Tabs", group: "Split view" }],
  ["zen.glance.", { category: "Tabs", group: "Glance" }],
  ["zen.tabs.", { category: "Tabs", group: "General" }],
  ["zen.workspaces.", { category: "Spaces", group: "Spaces" }],
  ["zen.spaces-sync.", { category: "Spaces", group: "Window sync" }],
  ["zen.window-sync.", { category: "Spaces", group: "Window sync" }],
  ["zen.session-store.", { category: "Spaces", group: "Session" }],
  ["zen.urlbar.", { category: "Address bar", group: "Address bar" }],
  ["zen.theme.", { category: "Look", group: "Theme" }],
  ["zen.view.", { category: "Look", group: "Layout" }],
  ["zen.watermark.", { category: "Look", group: "Effects" }],
  ["zen.widget.", { category: "Look", group: "Effects" }],
  ["zen.downloads.", { category: "Look", group: "Effects" }],
  ["zen.haptic-feedback.", { category: "Look", group: "Effects" }],
  ["zen.startup.", { category: "Look", group: "Effects" }],
  ["zen.boosts.", { category: "Features", group: "Boosts" }],
  ["zen.library.", { category: "Features", group: "Library" }],
  ["zen.mods.", { category: "Features", group: "Mods" }],
  ["zen.", { category: "Features", group: "General" }],
]

// Debug switches and internal state never sit beside everyday settings.
const INTERNAL = new Set([
  "zen.welcome-screen.seen",
  "zen.mods.updated-value-observer",
  "zen.session-store.backup-file",
  "zen.live-folders.github.skip-new-pr-ui-check",
  "zen.keyboard.shortcuts.disable-mainkeyset-clear",
])

const TITLES: Record<string, string> = {
  "zen.boosts.disable-on-anonymous-content": "Skip boosts on anonymous content",
  "zen.boosts.dissolve-on-zap": "Dissolve effect when zapping",
  "zen.boosts.enabled": "Boosts",
  "zen.ctrlTab.show-pending-tabs": "Show unloaded tabs",
  "zen.downloads.download-animation": "Download animation",
  "zen.folders.owned-tabs-in-folder": "Keep a folder's tabs inside it",
  "zen.folders.search.enabled": "Search inside folders",
  "zen.glance.deactivate-docshell-during-animation": "Pause the page while animating",
  "zen.glance.enable-contextmenu-search": "Glance search in the context menu",
  "zen.glance.enabled": "Glance",
  "zen.glance.open-essential-external-links": "Open external links from essentials in Glance",
  "zen.haptic-feedback.enabled": "Haptic feedback",
  "zen.keyboard.shortcuts.disable-mainkeyset-clear": "Keep Firefox's main key set",
  "zen.library.enabled": "Library",
  "zen.library.history.closed-tabs": "Closed tabs in history",
  "zen.library.media.enabled": "Media in the library",
  "zen.live-folders.github.skip-new-pr-ui-check": "Skip the GitHub pull request check",
  "zen.mediacontrols.enabled": "Media controls",
  "zen.mods.auto-update": "Update mods automatically",
  "zen.mods.updated-value-observer": "Mod update observer",
  "zen.pinned-tab-manager.debug": "Pinned tab logging",
  "zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url": "Restore pinned tabs to their pinned URL",
  "zen.pinned-tab-manager.wheel-close-if-pending": "Middle-click closes unloaded pinned tabs",
  "zen.session-store.backup-file": "Back up the session file",
  "zen.session-store.log": "Session logging",
  "zen.session-store.restore-unsynced-windows": "Restore unsynced windows",
  "zen.share.dont-ask-before-sharing": "Share without asking",
  "zen.spaces-sync.debug": "Space sync logging",
  "zen.spaces-sync.normal-tabs": "Sync unpinned tabs",
  "zen.splitView.enable-drag-over-split": "Drag a tab over another to split",
  "zen.splitView.enable-tab-click-split": "Split from tab clicks",
  "zen.splitView.enable-tab-drop": "Drop tabs into a split",
  "zen.startup.smooth-scroll-in-tabs": "Smooth scrolling",
  "zen.tabs.close-on-back-with-no-history": "Back closes a tab with no history",
  "zen.tabs.close-window-with-empty": "Close the window with its last tab",
  "zen.tabs.ctrl-tab.ignore-essential-tabs": "Skip essentials",
  "zen.tabs.ctrl-tab.ignore-pending-tabs": "Skip unloaded tabs",
  "zen.tabs.open-pinned-in-new-tab": "Open pinned tab links in new tabs",
  "zen.tabs.rename-tabs": "Rename tabs",
  "zen.tabs.select-recently-used-on-close": "Select the last used tab on close",
  "zen.tabs.show-newtab-vertical": "New tab button in the sidebar",
  "zen.tabs.vertical": "Vertical tabs",
  "zen.tabs.vertical.right-side": "Tabs on the right",
  "zen.theme.acrylic-sidebar": "Acrylic sidebar",
  "zen.theme.acrylic-urlbar": "Acrylic address bar",
  "zen.theme.disable-lightweight": "Disable lightweight themes",
  "zen.theme.essentials-favicon-bg": "Backgrounds behind essentials",
  "zen.theme.gradient.show-custom-colors": "Custom gradient colors",
  "zen.theme.hide-tab-throbber": "Hide the tab loading spinner",
  "zen.theme.hide-unified-extensions-button": "Hide the extensions button",
  "zen.theme.styled-status-panel": "Styled status panel",
  "zen.theme.use-system-colors": "Use system colors",
  "zen.updates.show-update-notification": "Update notifications",
  "zen.urlbar.enable-overrides": "Zen address bar",
  "zen.urlbar.hide-one-offs": "Hide one-off search buttons",
  "zen.urlbar.open-on-startup": "Open on startup",
  "zen.urlbar.replace-newtab": "Replace the new tab page",
  "zen.urlbar.show-contextual-id": "Show the container name",
  "zen.urlbar.show-domain-only-in-sidebar": "Show only the domain in the sidebar",
  "zen.urlbar.show-pip-button": "Picture-in-picture button",
  "zen.urlbar.show-protections-icon": "Tracking protection icon",
  "zen.urlbar.single-toolbar-show-copy-url": "Copy URL button",
  "zen.urlbar.suggestions.quick-actions": "Quick action suggestions",
  "zen.view.borderless-fullscreen": "Borderless fullscreen",
  "zen.view.compact.animate-sidebar": "Animate the sidebar",
  "zen.view.compact.debug": "Compact mode logging",
  "zen.view.compact.hide-tabbar": "Hide the sidebar",
  "zen.view.compact.hide-toolbar": "Hide the toolbar",
  "zen.view.compact.show-background-tab-toast": "Toast for tabs opened in the background",
  "zen.view.compact.show-sidebar-and-toolbar-on-hover": "Show the sidebar and toolbar together on hover",
  "zen.view.compact.toolbar-flash-popup": "Flash the toolbar for popups",
  "zen.view.context-menu.refresh": "Reload in the context menu",
  "zen.view.draggable-sidebar": "Draggable sidebar",
  "zen.view.drag-window-from-content": "Drag the window from the page edge",
  "zen.view.enable-loading-indicator": "Loading indicator",
  "zen.view.experimental-force-window-controls-left": "Window controls on the left",
  "zen.view.experimental-no-window-controls": "No window controls",
  "zen.view.grey-out-inactive-windows": "Dim inactive windows",
  "zen.view.hide-window-controls": "Hide window controls",
  "zen.view.overflow-webext-toolbar": "Overflow extension buttons",
  "zen.view.shift-down-site-on-hover": "Shift the page down on hover",
  "zen.view.show-clear-tabs-button": "Clear tabs button",
  "zen.view.show-newtab-button-top": "New tab button at the top",
  "zen.view.sidebar-expanded": "Expanded sidebar",
  "zen.view.use-single-toolbar": "Single toolbar",
  "zen.watermark.enabled": "Startup watermark",
  "zen.welcome-screen.seen": "Welcome screen seen",
  "zen.widget.linux.transparency": "Window transparency",
  "zen.window-sync.enabled": "Window sync",
  "zen.window-sync.log": "Window sync logging",
  "zen.window-sync.open-link-in-new-unsynced-window": "Open links in an unsynced window",
  "zen.window-sync.prefer-unsynced-windows": "Prefer unsynced windows",
  "zen.window-sync.sync-only-pinned-tabs": "Sync only pinned tabs",
  "zen.workspaces.continue-where-left-off": "Continue where you left off",
  "zen.workspaces.debug": "Spaces logging",
  "zen.workspaces.force-container-workspace": "Open container tabs in their space",
  "zen.workspaces.hide-default-container-indicator": "Hide the default container indicator",
  "zen.workspaces.natural-scroll": "Natural scrolling",
  "zen.workspaces.open-new-tab-if-last-unpinned-tab-is-closed": "New tab when the last tab closes",
  "zen.workspaces.separate-essentials": "Separate essentials per space",
  "zen.workspaces.swipe-actions": "Swipe between spaces",
  "zen.workspaces.swipe-actions.edge-actions": "Edge swipe actions",
  "zen.workspaces.wrap-around-navigation": "Wrap around between spaces",
}

function titleFromName(name: string): string {
  const leaf = name.split(".").pop() ?? name
  const words = leaf
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function placementOf(name: string): Placement {
  if (INTERNAL.has(name)) return { category: "Advanced", group: "Internal" }
  if (/\.(debug|log)$/.test(name)) return { category: "Advanced", group: "Logging" }
  if (name.includes(".experimental-")) return { category: "Advanced", group: "Experimental" }
  return BRANCHES.find(([prefix]) => name.startsWith(prefix))?.[1] ?? { category: "Advanced", group: "Other" }
}

export function describePref(name: string): Placement & { title: string } {
  return { title: TITLES[name] ?? titleFromName(name), ...placementOf(name) }
}
