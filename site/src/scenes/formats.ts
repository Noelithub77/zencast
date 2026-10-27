// Three ways to mod Firefox: an extension reaches the page, a Zen mod restyles the window, a Sine mod runs code in it.
import { gsap } from "gsap";
import { browser, check, cross, palette } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import type { Build } from "./motion.ts";

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1100, narrow ? 1020 : 370, 67);
  const story = gsap.timeline({ paused: true });
  const centers: readonly Point[] = narrow ? [[210, 170], [210, 510], [210, 850]] : [[190, 180], [550, 180], [910, 180]];
  const w = 300;
  const h = narrow ? 190 : 200;

  const column = (index: number, title: string, color: string, caption: string, captionColor: string, draw: (x: number, y: number) => void) =>
    s.group("column", () => {
      const [x, y] = centers[index];
      s.text(x, y - h / 2 - 22, title, { size: 26, color });
      draw(x, y);
      s.text(x, y + h / 2 + 36, caption, { size: 18, color: captionColor });
    });

  const extension = column(0, "extension", ink.line, "web pages and a sandboxed API", ink.soft, (x, y) => {
    browser(s, x, y, w, h, { stroke: ink.soft });
    s.rect(x - w / 2 + 12, y - h / 2 + 84, w - 24, h - 96, { stroke: ink.peach, fill: ink.peachFill, dash: true, width: 1.6 }, 10);
    s.text(x, y + 38, "the page", { size: 19, color: ink.peach });
    cross(s, x + w / 2 - 24, y - h / 2 + 21, 16);
  });
  const zen = column(1, "Zen mod", ink.lilac, "CSS and prefs: new looks, no new code", ink.soft, (x, y) => {
    browser(s, x, y, w, h, { stroke: ink.lilac, fill: ink.lilacFill });
    s.text(x, y + 30, "restyled", { size: 19, color: ink.lilac });
    s.text(x, y + 62, "no JS", { size: 17, color: ink.rose });
  });
  const sine = column(2, "Sine mod", ink.peach, "JS, CSS and prefs in every window", ink.mint, (x, y) => {
    browser(s, x, y, w, h, { stroke: ink.peach });
    palette(s, x, y + 38, 170);
    check(s, x + w / 2 - 26, y - h / 2 + 22, 18);
  });

  story.addLabel("step0", 0);
  drawOn(story, extension, "step0", 0.8);
  story.addLabel("step1", ">+=0.2");
  story.to(extension, { opacity: 0.45, duration: 0.4 }, "step1");
  drawOn(story, zen, "step1", 0.8);
  story.addLabel("step2", ">+=0.2");
  story.to(zen, { opacity: 0.45, duration: 0.4 }, "step2");
  drawOn(story, sine, "step2", 0.8);
  story.fromTo(sine.querySelector(".palette"), { scale: 0.9, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.4, ease: "back.out(2)" }, ">-0.3");
  story.to({}, { duration: 0.3 });
  return { story };
};
