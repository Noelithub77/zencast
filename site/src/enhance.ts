// Motion layer, loaded after first paint: smooth scroll, text motion, the keycap field and the hand-drawn scenes.
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { mountPrompt } from "./prompt.ts";
import { build as agent } from "./scenes/agent.ts";
import { build as day } from "./scenes/day.ts";
import { build as firefox } from "./scenes/firefox.ts";
import { build as fork } from "./scenes/fork.ts";
import { build as formats } from "./scenes/formats.ts";
import type { Build, Scene } from "./scenes/motion.ts";
import { build as star } from "./scenes/star.ts";
import { build as wall } from "./scenes/wall.ts";

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, ScrambleTextPlugin);

const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const builders: Record<string, Build> = { day, wall, fork, firefox, formats, agent, star };
// Desktop story scenes follow the scroll; mobile scenes play briefly on entry.
const scrubbed = new Set(["day", "wall", "fork", "firefox", "formats"]);

if (!calm) {
  const lenis = new Lenis({ autoRaf: false, lerp: 0.12, anchors: { offset: -72 } });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

// Header state and reading progress.
const bar = document.querySelector(".bar");
const progress = document.querySelector(".bar-progress");
ScrollTrigger.create({
  start: 0,
  end: "max",
  onUpdate: (self) => {
    bar?.classList.toggle("is-scrolled", self.scroll() > 8);
    document.body.classList.toggle("is-scrolled-past", self.scroll() > 80);
    if (progress) gsap.set(progress, { scaleX: self.progress });
  },
});

/** Restarts the keycap's press, which the logo's own stylesheet animates once. */
function press(logo: Element | null) {
  for (const part of logo?.querySelectorAll<SVGElement>(".cap, .glow") ?? []) {
    part.style.animation = "none";
    void part.getBoundingClientRect();
    part.style.animation = "";
  }
}

// Hero: a field of keycaps that the logo presses, loaded only where WebGL works.
const hero = document.querySelector<HTMLElement>(".hero");
const canvas = document.querySelector<HTMLCanvasElement>("[data-field]");
const heroLogo = document.querySelector(".hero-logo");
if (!calm && hero && canvas && heroLogo) {
  void import("./shader.ts").then(({ startField }) => startField(canvas, hero, heroLogo, () => press(heroLogo)));
}

// Hero: the name flips, letter by letter, into what it is.
const morph = document.querySelector<HTMLElement>("[data-morph]");
const nameWord = morph?.querySelector(".name");
const phrase = morph?.querySelector(".phrase");
if (!calm && morph && nameWord && phrase) {
  const a = SplitText.create(nameWord, { type: "chars" }).chars;
  const b = SplitText.create(phrase, { type: "chars" }).chars;
  gsap.set(phrase, { opacity: 1 });
  const hidden = { yPercent: 40, rotationX: -70, opacity: 0, filter: "blur(4px)" };
  const shown = { yPercent: 0, rotationX: 0, opacity: 1, filter: "blur(0px)" };
  gsap.set(b, hidden);
  const out = { yPercent: -40, rotationX: 70, opacity: 0, filter: "blur(4px)", duration: 0.32, stagger: 0.025, ease: "power2.in" };
  const into = { ...shown, duration: 0.5, stagger: 0.025, ease: "power3.out", immediateRender: false };
  const cycle = gsap
    .timeline({ repeat: -1, delay: 1.6, repeatDelay: 0.4 })
    .to(a, out, 2.2)
    .fromTo(b, hidden, into, 2.45)
    .to(b, out, 5.4)
    .fromTo(a, hidden, into, 5.7);
  ScrollTrigger.create({ trigger: ".hero", start: "top top", end: "bottom top", onToggle: (self) => void (self.isActive ? cycle.resume() : cycle.pause()) });
}

if (!calm) {
  // Only hide what is still below the fold, so nothing visible blinks out.
  const below = gsap.utils.toArray<HTMLElement>("[data-reveal]").filter((element) => element.getBoundingClientRect().top > innerHeight);
  gsap.set(below, { opacity: 0, y: 28 });
  ScrollTrigger.batch(below, { start: "top bottom", interval: 0.03, once: true, onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.25, ease: "expo.out", stagger: 0.02 }) });
  for (const heading of document.querySelectorAll(".section-head h2, .final h2, .star-card h2")) {
    SplitText.create(heading, {
      type: "lines",
      mask: "lines",
      autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, { yPercent: 105, duration: 0.35, stagger: 0.03, ease: "power4.out", scrollTrigger: { trigger: heading, start: "top bottom", fastScrollEnd: true, once: true } }),
    });
  }
  // Kicker numbers scramble in, like a counter settling.
  for (const number of document.querySelectorAll<HTMLElement>(".kicker span")) {
    const value = number.textContent ?? "";
    gsap.to(number, { duration: 0.9, scrambleText: { text: value, chars: "0123456789", speed: 0.6 }, scrollTrigger: { trigger: number, start: "top 90%", once: true } });
  }
}

function markSteps(key: string, story: gsap.core.Timeline) {
  const steps = document.querySelectorAll(`[data-story="${key}"] li`);
  if (!steps.length) return;
  let active = 0;
  for (const [label, time] of Object.entries(story.labels)) {
    if (label.startsWith("step") && story.time() >= time - 0.01) active = Number(label.slice(4));
  }
  steps.forEach((step, i) => step.classList.toggle("is-active", i === active));
}

/** Builds one scene and drives it: scrubbed, pinned, or played on view. */
function mount(element: Element, narrow: boolean, pin: boolean) {
  const key = element.getAttribute("data-scene") ?? "";
  const svg = element instanceof SVGSVGElement ? element : element.querySelector("svg");
  const build = builders[key];
  if (!svg || !build) return;
  const scene: Scene = build(svg, narrow);
  let inView = false;
  let finished = false;
  const sync = () => {
    const live = inView && finished && !calm;
    svg.classList.toggle("is-live", live);
    if (live) scene.loop?.play();
    else scene.loop?.pause();
  };
  ScrollTrigger.create({ trigger: element, start: "top bottom", end: "bottom top", onToggle: (self) => void ((inView = self.isActive), sync()) });
  if (calm) {
    scene.story.progress(1);
    markSteps(key, scene.story);
    return;
  }
  if (narrow || !scrubbed.has(key)) {
    scene.story.eventCallback("onUpdate", () => markSteps(key, scene.story));
    scene.story.eventCallback("onComplete", () => void ((finished = true), sync()));
    // A fast flick accelerates the drawing without skipping its intermediate frames.
    const catchUp = (self: ScrollTrigger) => {
      if (!finished && Math.abs(self.getVelocity()) > 2500) {
        scene.story.timeScale(Math.max(1, scene.story.duration() / 0.6)).play();
      }
    };
    ScrollTrigger.create({
      trigger: element,
      start: "top 85%",
      end: "bottom top",
      once: true,
      onEnter: (self) => {
        if (finished) return;
        scene.story.play();
        catchUp(self);
      },
      onUpdate: (self) => {
        if (self.progress > 0) catchUp(self);
      },
    });
    return;
  }
  // The story follows the scroll with a little lag, so the steps track the story itself, not the scroll.
  scene.story.eventCallback("onUpdate", () => markSteps(key, scene.story));
  const follow = {
    animation: scene.story,
    scrub: 0.35,
    onUpdate: (self: ScrollTrigger) => {
      self.getTween()?.timeScale(Math.abs(self.getVelocity()) > 2500 ? 3 : 1);
      finished = scene.story.progress() > 0.98;
      sync();
    },
  };
  const section = element.closest("section");
  if (pin && section) {
    ScrollTrigger.create({ trigger: section.querySelector(".pin") ?? section, start: "center center", end: "+=130%", pin: true, ...follow });
  } else {
    ScrollTrigger.create({ trigger: element, start: "top 80%", end: "bottom 55%", ...follow });
  }
}

// Excalifont must be ready before scenes measure their handwriting.
void document.fonts.load("20px Excalifont").then(() => {
  const media = gsap.matchMedia();
  media.add({ all: "all", narrow: "(max-width: 960px)", tall: "(min-height: 760px)" }, (context) => {
    const narrow = context.conditions?.narrow ?? false;
    const tall = context.conditions?.tall ?? false;
    for (const element of document.querySelectorAll("[data-scene]")) {
      mount(element, narrow, !narrow && tall && Boolean(element.closest("[data-pin-section]")));
    }
  });
  ScrollTrigger.refresh();
});

// The agent prompt types while it is on screen.
const promptBox = document.querySelector<HTMLElement>("[data-prompt]");
if (promptBox) {
  const prompt = mountPrompt(promptBox, calm);
  ScrollTrigger.create({ trigger: promptBox, start: "top 80%", end: "bottom top", onToggle: (self) => (self.isActive ? prompt.play() : prompt.pause()) });
}

// The closing keycap presses as it arrives, and on every click.
const finalLogo = document.querySelector(".final-logo");
if (!calm && finalLogo) {
  ScrollTrigger.create({ trigger: ".final", start: "top 70%", onEnter: () => press(finalLogo) });
  finalLogo.addEventListener("click", () => press(finalLogo));
}

// A soft spotlight follows the pointer across cards.
document.addEventListener(
  "pointermove",
  (event) => {
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>(".kit article, .prompt, .star-card") : null;
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - box.left}px`);
    card.style.setProperty("--my", `${event.clientY - box.top}px`);
  },
  { passive: true },
);

void document.fonts.ready.then(() => ScrollTrigger.refresh());
