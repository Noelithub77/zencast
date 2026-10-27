import "./style.css";
import { mountJump } from "./jump.ts";

const repo = "https://raw.githubusercontent.com/Noelithub77/zencast/master/scripts/install";
const commands = {
  agent: "Fork github.com/Noelithub77/zencast, read its AGENTS.md and skills, then reshape my browser the way I ask.",
  unix: `curl -fsSL ${repo}/install.sh | bash`,
  windows: `irm ${repo}/install.ps1 | iex`,
};
const notes = {
  agent: "Paste it into Claude Code, Codex or any coding agent.",
  install: "Installs Sine if needed and asks before enabling scripts.",
};
type Mode = "agent" | "install";

let mode: Mode = "agent";
let windows = /win/i.test(navigator.platform);

// Both get blocks follow one choice, so the closing block matches the hero.
function render() {
  for (const block of document.querySelectorAll("[data-get]")) {
    for (const button of block.querySelectorAll<HTMLElement>("[data-mode]")) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    const code = block.querySelector("[data-cmd]");
    const note = block.querySelector("[data-note]");
    const swap = block.querySelector<HTMLElement>("[data-swap]");
    if (code) code.textContent = mode === "agent" ? commands.agent : windows ? commands.windows : commands.unix;
    if (note) note.textContent = notes[mode];
    if (swap) {
      swap.hidden = mode !== "install";
      swap.textContent = windows ? "On macOS or Linux?" : "On Windows?";
    }
  }
}
render();

/** Copies a command and confirms on the button; without clipboard access, selects it for copying by hand. */
function copy(button: HTMLButtonElement, text: string) {
  navigator.clipboard.writeText(text).then(
    () => {
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = "Copy"), 1600);
    },
    () => {
      const code = button.parentElement?.querySelector("code");
      if (code) getSelection()?.selectAllChildren(code);
    },
  );
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const pick = target?.closest<HTMLElement>("[data-mode]");
  if (pick?.dataset.mode === "agent" || pick?.dataset.mode === "install") {
    mode = pick.dataset.mode;
    render();
  }
  if (target?.closest("[data-swap]")) {
    windows = !windows;
    render();
  }
  const button = target?.closest<HTMLButtonElement>("[data-copy]");
  const text = button?.parentElement?.querySelector("code")?.textContent;
  if (button && text) copy(button, text);

  // Feature tabs: show one recording; the others load only when chosen.
  const tab = target?.closest<HTMLElement>("[data-show]");
  const demo = tab?.closest("[data-demo]");
  if (tab && demo) {
    for (const other of demo.querySelectorAll<HTMLElement>("[data-show]")) other.setAttribute("aria-selected", String(other === tab));
    for (const shot of demo.querySelectorAll<HTMLElement>("[data-shot]")) shot.hidden = shot.dataset.shot !== tab.dataset.show;
  }
});

mountJump({
  copyInstall: () => (windows ? commands.windows : commands.unix),
  copyAgent: () => commands.agent,
});

// Let the hero paint before requesting the motion libraries.
const idle = (callback: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(callback, { timeout: 1500 }) : setTimeout(callback, 120));
requestAnimationFrame(() => idle(() => void import("./enhance.ts")));
