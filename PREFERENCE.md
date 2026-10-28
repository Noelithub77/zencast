# Owner's intent and preferences

This file records everything the owner, Noel Georgi, has asked for while building Zencast: why the project exists, how it should be described, what it must do and how the work should be done. Read it before changing the project's direction, its wording, its design or its keybindings. Where a later request replaced an earlier one, the later one is recorded and the earlier one is noted as replaced.

Zencast is a project, not a product. Describe it as a project everywhere.

## Why the project exists

- **The agentic era.** Anyone can make their own software now; it takes a single prompt. The owner believes in custom, malleable software that people shape to their liking.
- **A browser is the exception.** Building your own browser is not realistic: security constraints, a rendering engine, and years of web compatibility work. Forking Chromium means a huge build, a full rebuild for every change, no hot reload, and keeping up with its security updates to stay safe from vulnerabilities.
- **A layer instead of a new browser.** One way to overlay just the small changes you want on top of a maintained browser, with all the creativity that allows, is a large boost in the agentic era. "It changes everything."
- **The browser is where the day goes.** Omarchy is an agentic, malleable OS, but most computer time is spent in the browser. A malleable OS still leaves the browser fixed, so a malleable browser lifts the workflow more and makes you more productive.
- **Firefox is the way in.** Firefox supports loading custom JS and CSS at startup through AutoConfig, so it allows far more live malleability than Chromium. Sine builds on that. Zen already gives a good starting point. This is the easy way to get a secure agentic browser: the browser's own security updates keep coming underneath your changes.
- **Why Sine and not a native Zen mod.** Zen's own mods load only CSS and preferences, never JS. A Sine mod is needed for full access to Zen and Firefox internal APIs. Pre-agentic extension and add-on formats cap what code may touch because they assume you install code you never read; an agent writes and reads every line it ships, so the cap is what's left in the way.
- **Why not Chrome.** Chrome extensions run in a sandbox and can't reach the browser's own interface, and no other route in Chrome gives this level of malleability. List every Chromium limit, but keep the full list collapsed until the reader asks for it.
- **Security is why it's a template, not a product.** Custom JS in a browser, like any extension, can be turned against you: a script with this reach can read every cookie and signed-in session and send them anywhere. Nobody should blindly trust code that runs directly in their browser with full access to cookies and sessions. Use your own agent to audit it, and run only what you've audited. This is a big part of the story; say it plainly.

## The owner's own story (Zencast as "my way")

- The owner has always loved VS Code's command palette: one search box, type anything, get anything. They want everything to work like that. They also love Raycast.
- A fully keyboard-first browser is a productive way to work. Zen is trying to get there, but it's nowhere near a fully keyboard-first experience.
- Zencast is the owner's way of doing it: their palette and their keybindings, which changed their workflow and made it better and easier. Zen is their personal case because it already has a lot customized.
- Anyone can use the same project as a template: fork it, point an agent at it, and change it to fit how they work.

## How to describe it

- **Order of the pitch:**
  1. Browser malleability first, in the agentic era.
  2. Why the browser matters (Omarchy and time spent in the browser).
  3. Why Chromium can't do it and Firefox can.
  4. How Sine mods work, and why other formats limit you.
  5. The owner's workflow and keys, inspired by VS Code and Raycast.
  6. The template: fork it, point your agent, change it.
- **Firefox first.** Zen is niche and Firefox is widely known, so lead with customizing any Firefox-based browser. Zen is the owner's personal case. Generalize wherever the code allows, and stay honest: Zen-specific code lives in `src/browser/`.
- **The hero** says you can change whatever you want in the browser you already use, with just prompts. Don't say Zencast is a browser; it's a one-shot template for fully customizing your browser with your agent. Make it punchy and engaging. Current hero: "Describe the browser you want. Your agent builds it."
- **Headline history:**
  - "Raycast for Zen", plus malleable, and "a powerful keyboard-first browser experience".
  - Then "a malleable Zen power-user setup: one mod to make Zen the way you want".
  - Then "a template to customize Zen, or any Firefox, the way you want".
  - The GitHub description must include the malleable-browser idea.
- **Agent-first wording.** The template ships skills, setup scripts, code references and packaged APIs so agents can onboard quickly. People point their agents at the repo; there is no fork-setup wizard ("Fork only").
- **Emphasize the agent tooling:** the skills, the `pnpm ops` commands that let agents set up and mod the template, and that the APIs come packaged for simple forking.
- **Mention VS Code and Raycast everywhere:** README, landing page, video and blog.
- **Keybindings are personal.** Say plainly that the shown keybindings are the owner's personal setup ("I don't use them so don't worry") and invite people to fork and change them. List every key the owner overrides.
- **Store status.** Zencast is not in the Sine store yet. The setup script turns on "Allow unsafe JS" for users, but only after telling them everything about it and linking the repo.
- **Use ordinary examples:** spaces named Work, Acad and Personal, and common sites like google.com.
- **Ready-made setup.** The setup scripts are ready made and set up Sine for users on their platform (Linux, macOS, Windows). Agents doing the setup get a proper guide too.

## Claims and sources

- **Why build on an existing engine (owner's point, checked):**
  - Only a few engines keep up with the web. Most new features land in Chromium first and Firefox follows; building or maintaining your own engine and tracking changing standards is very hard for anyone else.
  - Compiling a browser is itself slow and heavy: Chromium asks for 8 GB RAM (16 GB+ recommended) and 100 GB of disk, and its checkout alone takes about 30 minutes; Firefox asks for 30 GB of disk ([Chromium Linux build](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md), [Firefox Linux build](https://firefox-source-docs.mozilla.org/setup/linux_build.html)).
  - Most other projects patch a browser's source and rebuild it (Zen itself patches Firefox). Sine never patches: it uses Firefox's startup hook (AutoConfig) to load the JavaScript and CSS you give it.
  - Correction kept in the copy: there are three maintained engines, not two. WebKit (Safari) is well maintained too, but it is Apple's, and Ladybird is a new engine still in development. Not every feature lands in Chromium first, so say "most", not "every". The checked figure: the [web-features explorer](https://web-platform-dx.github.io/web-features-explorer/only-in/chromium/) lists 174 features implemented only in Chromium, 15 only in Firefox and 21 only in Safari (October 2026); some features do ship in Firefox first (cascade layers, subgrid), so say "usually".

- Always cross-check the owner's claims; they may be wrong. Every claim on the README, landing page, video and blog needs a source.
- Research each point and state honestly whether a better alternative exists, for Chromium or any of its forks.
- Back the ideology with sources: Ink & Switch on malleable software, Chromium docs, Chrome extension docs, Mozilla and fx-autoconfig, Sine, Zen's mod loader, the Omarchy manual, and the Forrester study for Google on browser time.

## Features the owner asked for

### Palette

- A full Raycast-style palette that can do everything in Zen, on Ctrl+K.
- Ctrl+T as an option. It is off by default and replaces Zen's new-tab with the palette only when the toggle is on. An earlier request had both keys always open the palette; the later "by default don't override Ctrl+T" replaced it.
- Ctrl+, opens Zen's own settings; Ctrl+Shift+, opens Zencast's settings page. This replaced an earlier request where Ctrl+, opened Zencast's settings and Ctrl+Shift+, the extensions page; extensions stay in the palette and on Firefox's Ctrl+Shift+A.
- Search every Zen setting, and show each one's keybinding. Change settings from the palette itself.
- Fuzzy-search every tab: active, unloaded and pinned, in all folders, plus folder names. Active tabs rank above unloaded ones.
- **DNS cache fill.** Typing "allpyq" fills "allpyq.in" from the DNS cache plus history. When the DNS cache has a match, it always wins Enter.
- **Hold Ctrl or Alt for hints:** a letter marked in each title, vim-style, and numbers for containers (Ctrl) or spaces (Alt).
  - 2026-10-28: bigger, many pastel colours (one per row). Ctrl shows a coloured key badge at the row's right end; Alt shows just the big coloured letter, no background, in place of the icon on the left.
  - 2026-10-28: holding a modifier also lists every key it takes in the palette, so a user needs to learn nothing.
  - 2026-10-28: Ctrl and Alt look the same: the letter underlined in the title and a matching letter badge at the row's end, in the same pastel colour. Alt no longer replaces the icon.
- **The open key closes (2026-10-28).** Whatever opened the palette (Ctrl+K, Ctrl+T when on) closes it again. The actions panel moved from Ctrl+K to Ctrl+J; the owner first picked Tab, then changed to Ctrl+J.
- **Key sheet (2026-10-28).** Holding Ctrl+Shift anywhere shows every Zencast key at once, grouped by section; numbered families show as one row ("Switch to space 1…9").
- **Mod overlap (2026-10-28).** A report of enabled Sine mods that claim Zencast's keys or do the palette's job, with a way to turn each off. A Zen command Zencast also has shows once, as Zencast's.
- **While the palette is open:**
  - its keybindings override everything else;
  - Alt+1/2/3 tints the palette to that space, names it, and opens the result there;
  - Ctrl+1/2/3 does the same for containers, with container colour and name;
  - both are toggles: pressing again reverts. Transitions are smooth.
- Ideas the owner chose: record keys from the palette, all settings in the palette, keys for tabs and sites, and hold-to-reveal strips.
- A bit bigger, and centred on screen. Made bigger again on 2026-10-28 (wider, taller rows, larger type).
- **Bookmarks (2026-10-28).** Bookmark search and bookmark keys must work. Bookmarking is keyboard-first on Ctrl+B, filled in the palette with an optional keyword; Ctrl+D stays the owner's duplicate key. Quick links are Firefox bookmark keywords, one source of truth with the address bar, and a starter set is offered by a command, never added unasked. Managing them in the palette (2026-10-28): browse folders, edit name, URL, folder and keyword, move, delete with Undo. Folders themselves are not created or renamed there.
- **Ask an assistant (2026-10-28).** Any query can go to ChatGPT or Claude as a prompt, offered right under the web search row.
- **Google account containers (2026-10-28).** Find the Google accounts signed in to Zen and give each its own container named after its email, signed in once per container with the email filled in. Cache the account list, never the cookies, and offer a container when a new account signs in.
- **Tab cleanup (2026-10-28).** Chosen by the agent when the owner said to keep building good ideas. Tabs not selected for 7 days, never pinned or essential ones, close together into "Other bookmarks / Tab cleanup / <date>", with Undo. No default key; it runs from the palette.
- **Site containers (2026-10-28).** Chosen by the agent when the owner said to keep building good ideas. A site (its bare host, `www.` ignored) can always open in one container. Only tabs with no container are moved, so picking a container on purpose always wins; the page request is cancelled before it is sent and opens in the container, in the same space. No default key.
- **Ask about this page (2026-10-28).** Chosen by the agent when the owner said to keep building good ideas. The prompt holds the question, the page's address and the selected text quoted; the page text itself is not sent, so the URL stays short. Firefox's finder gives at most 150 characters of a selection, so a longer one ends in "…". Claude on Enter, ChatGPT on Ctrl+Enter. No default key.
- **Sessions (2026-10-28).** Every run of Zen is a session named by its start time, in 24-hour time with relative days (Today, Yesterday, weekday, then the date), and each window is kept apart. Picking restores tabs into the current window, not a new one. Kept for 7 days, then cleared. Alt+S and a Sessions page in settings.
- **History completion and favicons (2026-10-28).** The inline completion must cover every site in history, not only the DNS cache (typing "instagram" completes instagram.com). Results show real favicons, including the typed-URL row.
- **Tabs first, any-row search and wider completion (2026-10-28).** The owner chose:
  - tabs lead the results when a tab's title or address starts with the query; a loose fuzzy match keeps the normal order;
  - `Shift+Enter` searches the web (the default engine, Google for the owner) for the typed text from any row, with nothing new on screen;
  - completion also uses open tabs' hosts and history even when a command or container starts the same way, and a live DNS lookup of the typed name with common endings comes last. Known hosts must win over the guess: `allpyq.com` resolves too, but the owner's site is `allpyq.in`.
- **Localhost switcher (2026-10-28).** Alt+L lists the dev servers listening on this machine, found from open ports, and jumps to the tab already on one or opens it.
- **Search everything (2026-10-28).** Search covers each result's title, description and keys: typing a key ("ctrl j", "alt s") lists what it runs.
- **Prefixes (2026-10-28).** Like a chat box's "@ files, $ skills, / commands": a first character narrows the search. The owner left the set to the agent: `@` tabs, `/` commands, `#` bookmarks, `$` settings, `*` mods (every Sine mod, toggled with Enter). The placeholder lists them; the prefix becomes a chip that Backspace removes.
- Best fuzzy search for speed and typo tolerance.

### Keys (the owner's current personal setup)

| Key | Action |
| --- | --- |
| Ctrl+K | Find anything: tabs, spaces, history, commands, settings |
| Ctrl+1…9 | Switch to that space |
| Ctrl+Shift+1…9 | Send the tab to that space and follow it (back from Alt+1…9 on 2026-10-28, which now goes to Zen again) |
| Alt+P | Pin or unpin the tab |
| Alt+Shift+P | Change the pin to the current URL |
| Ctrl+Shift+N | New folder in the space, or a subfolder when the tab is already in a folder |
| Ctrl+C | Open in a container, only when nothing is selected for copying (Alt+C was taken) |
| Alt+Shift+T | Tab in a throwaway container |
| Alt+Shift+C | Move the tab to another container: Enter reopens it there, Ctrl+Enter takes its signed-in session (cookies and all), copying the session is in Ctrl+J. Alt+M is free since 2026-10-28 |
| Alt+Shift+W | Full tab wipe: site data and history |
| Ctrl+Space, then a key | Chords: F moves to a folder, S to a space, E toggles essentials. W is only wipe (Alt+Shift+W) since 2026-10-28 |
| Ctrl+. | Give any command, tab, bookmark or site its own key |
| Ctrl+B | Bookmark the tab (name, folder, optional keyword), or edit its bookmark |

The keybinding system should show all native Zen bindings and be more customizable than Zen's. Moving a tab also switches to its space, so the move is visible.

### Feedback

Use Zen's native toast, the one that says "URL copied" on Ctrl+Shift+C, for messages like "moved to this workspace". Don't build a custom overlay.

### Settings page

- Vite + React.
- A file-manager-style page for all folders, with archive (kept in Zencast's own state) and quick moves.
- Workspaces side by side, collapsed to one level: each workspace and its immediate root folders.
- Zen's settings grouped into categories with subtabs.
- A settings button on Zencast's card in Sine.

## Design

- Elegant dark mode, Vesper-like, with pastel accents and few blues.
- shadcn components with the Luma style. Keep it calm and minimal per the minui-nol skill:
  - progressive disclosure;
  - long detail, such as the full Chromium-versus-Firefox list, stays collapsed until clicked;
  - state shown as dots and chips rather than sentences.
- **Logo:**
  - dark, Vesper-like, elegant and minimal, in the spirit of Raycast's mark;
  - an animated SVG, also used as the favicon;
  - the owner chose the pressed keycap from ten options and liked that it had a clever reference.
- Sentence case everywhere; never all caps.

## Engineering

- Use the best packages for the job: TypeScript, React 19, Vite.
- Treat performance as a constraint: build with it in mind, then benchmark and optimize so every interaction stays smooth.
- Provide an `ops` entry point so agents can build, install, test, benchmark, record media, release and deploy without one-off scripts.
- Never test against the owner's running Zen or real profile; tests use a throwaway headless profile.
- **Keep the owner's Zen current (2026-10-28).** After every finished change, install the build into the owner's profile with `pnpm ops install` (dry run first), without asking. Never restart their Zen; a restart loads the new build.
- **Distribution:**
  - one-line setup (`curl | bash` and a PowerShell twin) that checks for Sine and installs it if needed;
  - guide the user through any manual step;
  - a release branch and a working update system through Sine;
  - a hand-triggered GitHub Action that runs the ops release;
  - the landing page in the manifest;
  - Sine store details documented in `docs/`, with skills and `AGENTS.md` updated to match.
- The repository is public.

## Media and writing

- **README:**
  - a concise, elegant, standard README without redundancy;
  - features, setup, fast-paced screen recordings and screenshots;
  - a section answering "How do you make a malleable browser?", with sources.
- **Concise everywhere.**
  - Less text, more icons and visuals.
  - No redundancy: every idea once, short and straight.
  - Keep every main idea (the agentic era, why not Chromium, why Firefox, Omarchy and browser time, security, the owner's way, the template), each in a line or two.
  - Put technical depth and sources behind hover tooltips and expanders so readers choose how much to see.
- **Landing page** at zencast.allpyq.in:
  - built on the Eko and Bunkialo template: rough.js scenes, GSAP, Lenis and an OGL shader;
  - lightweight and fast to load, and agent-first;
  - told as a story: no way in Chromium, then Firefox, then the template and the owner's way.
- **Video:**
  - HyperFrames, like Eko's in `~/Nocs/video`;
  - about browser malleability and customizing your browser with just prompts, with VS Code and Raycast as the inspiration;
  - use HyperFrames assets and record more footage.
- **Blog:**
  - Medium-style Markdown like Eko's blog;
  - Excalidraw or rough.js-style images rendered by a script and placed in the Markdown;
  - explains how everything works.
- **Code to back the claims:**
  - focus on what matters, modding Zen: drop-in feature modules in `src/features/` (commands in `.ts`, looks in `.css`);
  - no rebrand or packaging tooling: agents can rename a fork themselves;
  - more skills.
- **Priority:** the creative work (video and blog) comes before more tooling.
- **Visual customization, not just commands.** Show that a prompt can make the browser look like anything: a candy pastel browser, a full pink browser, entirely different kinds of UI. Show it in the video and on the landing page.
  - Back it with a workflow: looks as CSS files (`src/looks/`), `pnpm ops look` to preview them in a headless Zen, shipping through `src/features/*.css`, and a `restyle` skill. Cover custom CSS, Sine mods and everything visual.
  - The aim is a proper set of skills plus a full template repo with scripts for customizing the browser in any way.
  - The looks are our own CSS, rendered in a real Zen, rather than screenshots of other people's Sine mods.

## Working with the owner

- When the owner is away, finish the whole job, then end with the open questions.
- Creative work, such as the logo, stays with the main agent. Small helper subagents only with the owner's approval.
- Commit and push when asked.
- Keep this file at the repository root as `PREFERENCE.md`, and add every new preference the owner states.

## Name notes

Voice input sometimes garbles names in the owner's messages:

| Heard as | Means |
| --- | --- |
| "Rekha's" | Raycast |
| "Send" | Zen |
| "Haiku sign project" | Sine |
| "Omarchi" | Omarchy |
| "Echo" and "Bangiala" | Eko and Bunkialo, sibling projects in `~/Projects/hobby` |
