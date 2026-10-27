// The agent prompt box: types a request, shows the skills and ops calls the agent makes, then its answer.
import { gsap } from "gsap";

type Example = { ask: string; tools: string[]; answer: string };

const examples: Example[] = [
  {
    ask: "Add Alt+S to send this tab to my Acad space and mute it",
    tools: ["read .claude/skills/add-command", "pnpm ops eval: is Alt+S free in Zen?", "edit src/commands/catalog.ts", "pnpm ops e2e: all passed", "pnpm ops install"],
    answer: "Added “Send to Acad and mute” on Alt+S. Zen doesn't use that key, a new scenario proves it in a headless Zen, and it's installed. Restart Zen to use it.",
  },
  {
    ask: "Whenever I open a GitHub link, put it in my Work space",
    tools: ["read .claude/skills/zen-internals", "pnpm ops eval: probe gBrowser's TabOpen event", "add src/browser/rules.ts", "pnpm ops e2e: all passed"],
    answer: "New github.com tabs now move to Work as they open, using Zen's own workspace manager so its animations and session restore still work. Run pnpm ops install to try it.",
  },
  {
    ask: "Ship my version to my friends",
    tools: ["read .claude/skills/release", "pnpm ops release --bump minor"],
    answer: "Released 0.2.0 on your fork's release branch. Friends install it with the one-line setup pointed at your fork, and Sine updates them whenever Zen restarts.",
  },
];

export function mountPrompt(box: HTMLElement, calm: boolean): { play: () => void; pause: () => void } {
  const text = box.querySelector("[data-prompt-text]");
  const tools = box.querySelector("[data-prompt-tools]");
  const answer = box.querySelector<HTMLElement>("[data-prompt-answer]");
  const picks = [...box.querySelectorAll<HTMLButtonElement>("[data-pick]")];
  let index = 0;
  let timeline: gsap.core.Timeline | undefined;
  let advance: gsap.core.Tween | undefined;
  let live = false;

  const show = (next: number, animate: boolean) => {
    index = next;
    const example = examples[index];
    for (const pick of picks) pick.setAttribute("aria-pressed", String(Number(pick.dataset.pick) === index));
    if (!text || !tools || !answer) return;
    tools.replaceChildren(
      ...example.tools.map((tool) => {
        const item = document.createElement("li");
        item.textContent = tool;
        return item;
      }),
    );
    answer.textContent = example.answer;
    timeline?.kill();
    advance?.kill();
    if (!animate) {
      text.textContent = example.ask;
      box.classList.remove("is-typing");
      return;
    }
    const typed = { n: 0 };
    const items = [...tools.children];
    timeline = gsap.timeline({
      onComplete: () => {
        if (live) advance = gsap.delayedCall(5, () => live && show((index + 1) % examples.length, true));
      },
    });
    timeline
      .call(() => box.classList.add("is-typing"))
      .set(items, { opacity: 0, x: -8 })
      .set(answer, { opacity: 0, y: 8 })
      .to(typed, { n: example.ask.length, duration: example.ask.length * 0.028, ease: "none", onUpdate: () => void (text.textContent = example.ask.slice(0, Math.round(typed.n))) })
      .call(() => box.classList.remove("is-typing"))
      .to(items, { opacity: 1, x: 0, duration: 0.35, stagger: 0.5, ease: "power2.out" }, ">+0.3")
      .to(answer, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, ">+0.5");
  };

  box.addEventListener("click", (event) => {
    const pick = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-pick]") : null;
    if (!pick) return;
    show(Number(pick.dataset.pick), !calm);
  });

  return {
    play: () => {
      if (live || calm) return;
      live = true;
      show(index, true);
    },
    pause: () => {
      live = false;
      advance?.kill();
    },
  };
}
