// The page's own palette: Ctrl+K (or Cmd+K) jumps to a section or runs an action, the way Zencast works in Zen.
type Item = { label: string; hint: string; run: () => void };

/** Matches when the query's letters appear in order, so "frx" finds "Firefox". */
function matches(label: string, query: string): boolean {
  let at = 0;
  const text = label.toLowerCase();
  for (const char of query.toLowerCase().replaceAll(" ", "")) {
    at = text.indexOf(char, at) + 1;
    if (!at) return false;
  }
  return true;
}

export function mountJump(actions: { copyInstall: () => string; copyAgent: () => string }) {
  const dialog = document.querySelector<HTMLDialogElement>("[data-jump]");
  const input = document.querySelector<HTMLInputElement>("[data-jump-input]");
  const list = document.querySelector("[data-jump-list]");
  if (!dialog || !input || !list) return;

  const go = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const write = (text: () => string) => () => void navigator.clipboard.writeText(text()).catch(() => undefined);
  const items: Item[] = [
    { label: "The agentic era", hint: "01", run: go("era") },
    { label: "Where the day goes: the browser", hint: "02", run: go("why") },
    { label: "The wall: Chrome", hint: "03", run: go("chrome") },
    { label: "Forking Chromium", hint: "04", run: go("fork") },
    { label: "Firefox lets you in", hint: "05", run: go("firefox") },
    { label: "Looks: restyle Zen with CSS", hint: "06", run: go("looks") },
    { label: "Mod formats and Sine", hint: "07", run: go("mods") },
    { label: "Trust: audit what runs", hint: "08", run: go("trust") },
    { label: "My way: Zencast and my keys", hint: "09", run: go("zencast") },
    { label: "The template for your agent", hint: "10", run: go("template") },
    { label: "Copy the agent prompt", hint: "copy", run: write(actions.copyAgent) },
    { label: "Copy the install command", hint: "copy", run: write(actions.copyInstall) },
    { label: "Open on GitHub", hint: "link", run: () => void window.open("https://github.com/Noelithub77/zencast", "_blank", "noopener") },
  ];
  let shown = items;
  let active = 0;

  const render = () => {
    shown = items.filter((item) => matches(item.label, input.value));
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.replaceChildren(
      ...shown.map((item, i) => {
        const row = document.createElement("li");
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(i === active));
        row.dataset.index = String(i);
        const label = document.createElement("span");
        label.textContent = item.label;
        const hint = document.createElement("small");
        hint.textContent = item.hint;
        row.append(label, hint);
        return row;
      }),
    );
  };
  const open = () => {
    input.value = "";
    active = 0;
    render();
    dialog.showModal();
    input.focus();
  };
  const run = (item: Item | undefined) => {
    if (!item) return;
    dialog.close();
    item.run();
  };

  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey) && !event.altKey) {
      event.preventDefault();
      if (dialog.open) dialog.close();
      else open();
    }
  });
  input.addEventListener("input", () => void ((active = 0), render()));
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length);
      render();
    }
    if (event.key === "Enter") run(shown[active]);
  });
  list.addEventListener("click", (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>("li") : null;
    if (row) run(shown[Number(row.dataset.index)]);
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.querySelector("[data-jump-open]")?.addEventListener("click", open);
  if (/Mac|iPhone|iPad/.test(navigator.platform)) for (const key of document.querySelectorAll("[data-mod]")) key.textContent = "⌘";
}
