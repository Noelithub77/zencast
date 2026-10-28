// Ambient types for the Firefox and Zen chrome globals Zencast uses.
// Only the members we call are declared; everything else stays unknown.

export {}

declare global {
  interface nsIURI {
    readonly spec: string
    readonly scheme: string
    readonly host: string
    readonly asciiHost: string
    readonly prePath: string
  }

  interface nsIPrincipal {
    readonly origin: string
  }

  interface OriginAttributes {
    userContextId?: number
    privateBrowsingId?: number
    firstPartyDomain?: string
    partitionKey?: string
  }

  interface nsICookie {
    readonly host: string
    readonly path: string
    readonly name: string
    readonly value: string
    readonly isSecure: boolean
    readonly isHttpOnly: boolean
    readonly isSession: boolean
    readonly expiry: number
    readonly sameSite: number
    readonly schemeMap: number
    readonly isPartitioned: boolean
    readonly originAttributes: OriginAttributes
  }

  interface SessionHistory {
    readonly count: number
    purgeHistory(count: number): void
  }

  interface XULBrowser extends Element {
    readonly currentURI: nsIURI
    readonly contentDocument: Document | null
    readonly browsingContext: { readonly sessionHistory: SessionHistory | null } | null
    reload(): void
    reloadWithFlags(flags: number): void
    purgeSessionHistory(): void
    focus(): void
    /** Find-in-page helper; also reports the page's selected text, including inside a focused field. */
    readonly finder: Finder
  }

  interface FinderListener {
    onCurrentSelection?(selection: string, initial: boolean): void
  }

  interface Finder {
    addResultListener(listener: FinderListener): void
    removeResultListener(listener: FinderListener): void
    getInitialSelection(): void
  }

  interface ZenFolder extends Element {
    readonly id: string
    readonly isZenFolder: boolean
    readonly isLiveFolder?: boolean
    readonly group: ZenFolder | null
    label: string
    readonly tabs: XULTab[]
    readonly allItems: Element[]
    readonly groupContainer: Element
    readonly iconURL: string | null
    collapsed: boolean
    createSubfolder(): void
    rename(): void
    addTabs(tabs: XULTab[]): void
    delete(): Promise<void>
    unpackTabs(): Promise<void>
  }

  interface XULTab extends Element {
    readonly linkedBrowser: XULBrowser | null
    readonly pinned: boolean
    readonly selected: boolean
    readonly label: string
    readonly userContextId: number
    readonly group: ZenFolder | null
    readonly multiselected: boolean
    /** Epoch ms of the last time the tab was selected. */
    readonly lastAccessed: number
  }

  interface AddTabOptions {
    triggeringPrincipal: nsIPrincipal
    userContextId?: number
    inBackground?: boolean
    skipAnimation?: boolean
    pinned?: boolean
    createLazyBrowser?: boolean
    title?: string
  }

  interface TabBrowser {
    readonly tabs: XULTab[]
    readonly tabGroups: ZenFolder[]
    readonly tabContainer: EventTarget
    selectedTab: XULTab
    readonly selectedBrowser: XULBrowser
    addTab(url: string, options: AddTabOptions): XULTab
    addTrustedTab(url: string, options?: Partial<AddTabOptions>): XULTab
    removeTab(tab: XULTab, options?: { animate?: boolean }): void
    ungroupTab(tab: XULTab): void
    duplicateTab(tab: XULTab): XULTab
    pinTab(tab: XULTab): void
    unpinTab(tab: XULTab): void
    moveTabAfter?(tab: XULTab, target: XULTab): void
  }

  interface ZenWorkspace {
    readonly uuid: string
    readonly name: string
    readonly icon?: string
    readonly containerTabId?: number
    readonly theme?: { readonly gradientColors: ReadonlyArray<{ readonly c?: readonly number[]; readonly isPrimary?: boolean }> }
  }

  interface ZenWorkspaces {
    readonly activeWorkspace: string
    getWorkspaces(): ZenWorkspace[]
    changeWorkspaceWithID(id: string): Promise<void>
    moveTabToWorkspace(tab: XULTab, id: string): void
    switchTabIfNeeded(tab: XULTab): Promise<void>
  }

  interface ZenFolders {
    createFolder(
      tabs: XULTab[],
      options: {
        renameFolder?: boolean
        label?: string
        workspaceId?: string
        collapsed?: boolean
        insertAfter?: Element | null
        insertBefore?: Element | null
      },
    ): ZenFolder
    changeFolderToSpace(folder: ZenFolder, workspaceId: string): void
    collapseAllFolders(): void
    expandAllFolders(): void
  }

  interface ZenPinnedTabManager {
    resetPinnedTab(tab: XULTab): void
    replacePinnedUrlWithCurrent(tab: XULTab): void
    editPinnedUrl(tab: XULTab): Promise<void>
    addToEssentials(tab: XULTab): void
    removeEssentials(tab: XULTab, unpin?: boolean): void
  }


  interface ZenKeyShortcut {
    getID(): string
    getAction(): string
    getGroup(): string
    getKeyNameOrCode(): string
    isEmpty(): boolean
    isDisabled(): boolean
    isInternal(): boolean
    isUserEditable(): boolean
    toDisplayString(): string
    toJSONForm(): { l10nId: string; key: string | null; keycode: string | null; modifiers: Partial<Record<"control" | "alt" | "shift" | "meta" | "accel", boolean>> }
  }

  interface ZenKeyboardShortcutsManager {
    readonly _currentShortcutList?: ZenKeyShortcut[]
    getModifiableShortcuts(): Promise<ZenKeyShortcut[]>
  }

  interface ZenToastOptions {
    l10nArgs?: Record<string, string>
    timeout?: number
    button?: { id: string; command: () => void }
  }

  interface ZenUIManager {
    showToast(l10nId: string, options?: ZenToastOptions): Promise<void>
  }

  interface DOMLocalization {
    setAttributes(element: Element, id: string, args?: Record<string, string>): void
    addResourceIds(ids: string[]): void
    removeResourceIds(ids: string[]): number
  }

  interface Document {
    readonly l10n: DOMLocalization
    createXULElement(tagName: string): Element
    /** Routes edit commands to the focused element's controllers, including a remote page's. */
    readonly commandDispatcher: {
      readonly focusedElement: Element | null
      getControllerForCommand(command: string): nsIController | null
    }
  }

  interface nsIController {
    isCommandEnabled(command: string): boolean
  }

  interface L10nFileSource {
    readonly name: string
  }

  interface PrefBranch {
    getPrefType(name: string): number
    getBoolPref(name: string, fallback?: boolean): boolean
    getIntPref(name: string, fallback?: number): number
    getStringPref(name: string, fallback?: string): string
    setBoolPref(name: string, value: boolean): void
    setIntPref(name: string, value: number): void
    setStringPref(name: string, value: string): void
    prefHasUserValue(name: string): boolean
    clearUserPref(name: string): void
    getChildList(prefix: string): string[]
    getDefaultBranch(root: string): PrefBranch
    addObserver(domain: string, observer: { observe(subject: unknown, topic: string, data: string): void }): void
    removeObserver(domain: string, observer: { observe(subject: unknown, topic: string, data: string): void }): void
    readonly PREF_INVALID: number
    readonly PREF_STRING: number
    readonly PREF_INT: number
    readonly PREF_BOOL: number
  }

  interface CookieValidation {
    readonly result: number
  }

  interface StorageLike {
    readonly length: number
    key(index: number): string | null
    getItem(key: string): string | null
    setItem(key: string, value: string): void
  }

  interface GeckoObserver {
    observe(subject: unknown, topic: string, data: string): void
  }

  interface CookieNotification {
    readonly baseDomain: string
    readonly cookie: nsICookie | null
  }

  /** "cookie-changed" passes a subject that becomes a notification once queried. */
  interface CookieObserver {
    observe(subject: { QueryInterface(iface: GeckoComponentsInterfaces["nsICookieNotification"]): CookieNotification }): void
  }

  interface GeckoServices {
    prefs: PrefBranch
    obs: {
      addObserver(observer: CookieObserver, topic: "cookie-changed"): void
      addObserver(observer: GeckoObserver, topic: string): void
      removeObserver(observer: CookieObserver, topic: "cookie-changed"): void
      removeObserver(observer: GeckoObserver, topic: string): void
      notifyObservers(subject: unknown, topic: string, data?: string): void
    }
    io: { newURI(spec: string): nsIURI }
    startup: { getStartupInfo(): { process?: Date } }
    appinfo: { processID: number }
    eTLD: { getBaseDomain(uri: nsIURI): string; getBaseDomainFromHost(host: string): string; getSchemelessSite(uri: nsIURI): string }
    scriptSecurityManager: {
      getSystemPrincipal(): nsIPrincipal
      createContentPrincipal(uri: nsIURI, attrs: OriginAttributes): nsIPrincipal
    }
    cookies: {
      getCookiesWithOriginAttributes(pattern: string, host?: string): nsICookie[]
      add(
        host: string,
        path: string,
        name: string,
        value: string,
        isSecure: boolean,
        isHttpOnly: boolean,
        isSession: boolean,
        expiry: number,
        originAttributes: OriginAttributes,
        sameSite: number,
        schemeMap: number,
        isPartitioned: boolean,
      ): CookieValidation
    }
    clearData: {
      deleteDataFromSite(
        site: string,
        pattern: OriginAttributes,
        isUserRequest: boolean,
        flags: number,
        callback: (failedFlags: number) => void,
      ): void
      deleteDataFromOriginAttributesPattern(pattern: OriginAttributes): void
    }
    domStorageManager: {
      createStorage(window: null, principal: nsIPrincipal, storagePrincipal: nsIPrincipal, documentURI: string): StorageLike
    }
    wm: {
      getMostRecentWindow(type: string): Window | null
      getEnumerator(type: string): Iterable<Window>
    }
  }

  interface SubprocessProcess {
    readonly stdout: { readString(): Promise<string> }
    readonly exitCode: Promise<number>
    wait(): Promise<{ exitCode: number }>
  }

  interface SearchEngine {
    name: string
    getSubmission(query: string): { uri: nsIURI }
  }

  interface GeckoComponentsInterfaces {
    nsIClearDataService: Record<string, number>
    nsICookieValidation: { eOK: number }
    nsIWebNavigation: { LOAD_FLAGS_BYPASS_CACHE: number; LOAD_FLAGS_BYPASS_PROXY: number }
    nsIDashboard: object
    nsIDNSService: { RESOLVE_TYPE_DEFAULT: number }
    nsICookieNotification: object
    nsIRequest: { LOAD_ANONYMOUS: number; LOAD_BYPASS_CACHE: number }
    nsIHttpChannel: object
    nsIUploadChannel2: object
    nsIStringInputStream: object
  }

  interface StringInputStream {
    setByteStringData(data: string): void
    available(): number
  }

  /** A channel queried to nsIHttpChannel and nsIUploadChannel2, whose members then sit on one object. */
  interface HttpChannel {
    loadFlags: number
    readonly responseStatus: number
    setRequestHeader(header: string, value: string, merge: boolean): void
    explicitSetUploadStream(stream: StringInputStream, contentType: string, length: number, method: string, streamHasHeaders: boolean): void
    QueryInterface(iface: GeckoComponentsInterfaces["nsIHttpChannel"] | GeckoComponentsInterfaces["nsIUploadChannel2"]): HttpChannel
  }

  interface DnsCacheEntry {
    readonly hostname: string
    readonly type: number
    readonly originAttributesSuffix: string
  }

  interface NetDashboard {
    requestDNSInfo(callback: (data: { entries: DnsCacheEntry[] }) => void): void
  }

  interface GeckoComponentsClasses {
    "@mozilla.org/network/dashboard;1": { getService(iface: GeckoComponentsInterfaces["nsIDashboard"]): NetDashboard }
    "@mozilla.org/io/string-input-stream;1": {
      createInstance(iface: GeckoComponentsInterfaces["nsIStringInputStream"]): StringInputStream
    }
  }

  interface ContainerIdentity {
    readonly userContextId: number
    readonly icon: string
    readonly color: string
    readonly name?: string
    readonly l10nId?: string
  }

  interface UrlbarResultPayload {
    readonly url?: string
    readonly title?: string
    readonly icon?: string
    readonly engine?: string
    readonly query?: string
    readonly suggestion?: string
    readonly keyword?: string
  }

  interface UrlbarResult {
    readonly type: number
    readonly source: number
    readonly heuristic: boolean
    readonly payload: UrlbarResultPayload
    /** Set on the heuristic result when the URL bar would complete the typed text inline. */
    readonly autofill?: { readonly value: string }
  }

  interface UrlbarQueryOptions {
    allowAutofill: boolean
    isPrivate: boolean
    maxResults: number
    sapName: string
    searchString: string
    userContextId?: number
    currentPage?: string
  }

  interface UrlbarQueryContextInstance {
    readonly results: UrlbarResult[]
  }

  interface UrlbarProvidersManagerInstance {
    startQuery(context: UrlbarQueryContextInstance): Promise<void>
    cancelQuery(context: UrlbarQueryContextInstance): void
  }

  interface ZenGlobalAction {
    readonly l10nId: string
    readonly label: string
    readonly icon?: string
    readonly commandId: string
    readonly command: string | ((win: Window) => void)
    isAvailable(win: Window): boolean
  }

  interface MozStorageRow {
    getResultByName(name: string): unknown
  }

  interface PlacesConnection {
    executeCached(sql: string, params?: Record<string, string | number>): Promise<MozStorageRow[]>
  }

  interface PlacesBookmarks {
    readonly toolbarGuid: string
    readonly menuGuid: string
    readonly unfiledGuid: string
    readonly mobileGuid: string
    readonly tagsGuid: string
    readonly rootGuid: string
    readonly DEFAULT_INDEX: number
    readonly TYPE_FOLDER: number
    insert(info: { parentGuid: string; url?: string; title?: string; type?: number }): Promise<{ guid: string }>
    /** Moving to another folder needs `index` too. */
    update(info: { guid: string; title?: string; parentGuid?: string; index?: number }): Promise<unknown>
    remove(guid: string): Promise<unknown>
  }

  interface PlacesKeywords {
    /** A keyword belongs to a URL, not to one bookmark; inserting a taken keyword moves it. */
    insert(entry: { keyword: string; url: string }): Promise<void>
    remove(keyword: string): Promise<void>
  }

  interface PlacesObserversService {
    addListener(types: string[], listener: (events: unknown[]) => void): void
    removeListener(types: string[], listener: (events: unknown[]) => void): void
  }

  interface GeckoModuleMap {
    "chrome://userscripts/content/core/utils.sys.mjs": {
      default: {
        /** mods.json as Sine keeps it. */
        getMods(): Promise<unknown>
        getModFolder(id: string): string
      }
    }
    "chrome://userscripts/content/core/manager.sys.mjs": {
      /** Flips a mod's `enabled`, writes mods.json and reloads mods, as Sine's own toggle does. */
      default: { toggleTheme(installedMods: unknown, id: string): Promise<unknown> }
    }
    "resource://gre/modules/NetUtil.sys.mjs": {
      NetUtil: {
        newChannel(options: { uri: string; loadUsingSystemPrincipal: true }): HttpChannel
        asyncFetch(channel: HttpChannel, callback: (stream: StringInputStream, status: number) => void): void
        readInputStreamToString(stream: StringInputStream, count: number, options: { charset: string }): string
      }
    }
    "resource://gre/modules/PlacesUtils.sys.mjs": {
      PlacesUtils: {
        bookmarks: PlacesBookmarks
        keywords: PlacesKeywords
        observers: PlacesObserversService
        promiseDBConnection(): Promise<PlacesConnection>
      }
    }
    "resource://gre/modules/Subprocess.sys.mjs": {
      Subprocess: {
        pathSearch(command: string): Promise<string>
        call(options: { command: string; arguments: string[]; stderr?: "stdout" | "pipe" }): Promise<SubprocessProcess>
      }
    }
    "moz-src:///toolkit/components/search/SearchService.sys.mjs": {
      SearchService: { getDefault(): Promise<SearchEngine> }
    }
    "resource:///modules/ZenUBGlobalActions.sys.mjs": { globalActions: ZenGlobalAction[] }
    "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs": {
      ContextualIdentityService: {
        getPublicIdentities(): ContainerIdentity[]
        getUserContextLabel(userContextId: number): string
        create(name: string, icon: string, color: string): ContainerIdentity
        remove(userContextId: number): boolean
      }
    }
    "moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs": {
      ProvidersManager: { getInstanceForSap(sapName: string): UrlbarProvidersManagerInstance }
    }
    "chrome://browser/content/urlbar/UrlbarQueryContext.mjs": {
      UrlbarQueryContext: new (options: UrlbarQueryOptions) => UrlbarQueryContextInstance
    }
  }

  interface GeckoChromeUtils {
    importESModule<K extends keyof GeckoModuleMap>(
      url: K,
      options?: { global?: "shared" | "current" | "contextual" },
    ): GeckoModuleMap[K]
  }

  interface Window {
    gBrowser: TabBrowser
    gZenWorkspaces: ZenWorkspaces
    gZenFolders: ZenFolders
    gZenPinnedTabManager: ZenPinnedTabManager
    gZenKeyboardShortcutsManager: ZenKeyboardShortcutsManager
    gZenUIManager: ZenUIManager
    openPreferences(pane?: string): void
    /** Runs a XUL edit command such as "cmd_copy" on the focused element. */
    goDoCommand(command: string): void
    readonly BrowserAddonUI: { openAddonsMgr(view?: string): Promise<unknown> }
    openTrustedLinkIn(url: string, where: "current" | "tab" | "window", params?: Record<string, unknown>): void
    addUnloadListener?(callback: () => void): void
    /** Resolves once the window's delayed startup (gBrowser, Zen managers) has finished. */
    readonly delayedStartupPromise: Promise<void>
    readonly SessionStore: {
      readonly promiseAllWindowsRestored: Promise<void>
      /** JSON of `{ windows: [window] }`, with each tab's history entries and Zen's tab fields. */
      getCustomWindowValue(win: Window, key: string): string
      setCustomWindowValue(win: Window, key: string, value: string): void
    }
    /** Hooks installed by the mod for the settings page and benchmarks. */
    Zencast?: ZencastApi
  }

  interface ZencastApi {
    open(): void
    close(): void
    perf(): Record<"open" | "search" | "web", number[]>
    /** Pauses keybindings while the settings page records a shortcut. */
    setRecording(on: boolean): void
  }

  interface Event {
    stopCrossProcessForwarding?(): void
  }

  interface XULCommandElement extends Element {
    doCommand(): void
  }

  var IOUtils: {
    readJSON(path: string): Promise<unknown>
    writeJSON(path: string, value: unknown, options?: { tmpPath?: string }): Promise<number>
    exists(path: string): Promise<boolean>
    readUTF8(path: string): Promise<string>
    getChildren(path: string, options?: { ignoreAbsent?: boolean }): Promise<string[]>
    stat(path: string): Promise<{ type: "regular" | "directory" | "other" }>
    makeDirectory(path: string, options?: { ignoreExisting?: boolean; createAncestors?: boolean }): Promise<void>
    remove(path: string, options?: { ignoreAbsent?: boolean }): Promise<void>
  }
  var PathUtils: {
    readonly profileDir: string
    join(...parts: string[]): string
    filename(path: string): string
  }
  var L10nRegistry: {
    getInstance(): {
      hasSource(name: string): boolean
      registerSources(sources: L10nFileSource[]): void
    }
  }
  var L10nFileSource: {
    new (name: string, metaSource: string, locales: string[], prePath: string, options?: object, index?: string[]): L10nFileSource
  }
  var Services: GeckoServices
  var ChromeUtils: GeckoChromeUtils
  var Ci: GeckoComponentsInterfaces
  var Cc: GeckoComponentsClasses
}
