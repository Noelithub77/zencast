// Omarchy: an agent shapes the whole desktop, yet the window where the day goes stays fixed.
import { gsap } from "gsap";
import { box, browser, check, lock, person } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import type { Build } from "./motion.ts";

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1100, narrow ? 760 : 360, 47);
  const story = gsap.timeline({ paused: true });
  const agent: Point = narrow ? [210, 54] : [84, 186];
  const tiles: Point[] = narrow ? [[85, 232], [210, 232], [335, 232]] : [[300, 116], [300, 186], [300, 256]];
  const page: Point = narrow ? [210, 520] : [720, 190];

  const you = s.group(null, () => {
    person(s, agent[0], agent[1], 22);
    s.text(agent[0], agent[1] + 86, "your agent", { size: 18, color: ink.soft });
  });
  const desktop = s.group(null, () => {
    if (narrow) s.rect(20, 160, 380, 580, { stroke: ink.soft, width: 1.4 }, 22);
    else s.rect(200, 30, 860, 310, { stroke: ink.soft, width: 1.4 }, 22);
    s.text(narrow ? 40 : 222, narrow ? 190 : 62, "Omarchy desktop", { size: 18, color: ink.soft, anchor: "start" });
  });
  const shaped = s.group(null, () => {
    for (const [i, label] of ["keys", "bar", "themes"].entries()) {
      const at = tiles[i] ?? tiles[0];
      if (at) box(s, at[0], at[1], narrow ? 100 : 130, 46, label, { stroke: ink.mint, fill: ink.mintFill }, 18);
    }
  });
  const edit = s.arrow(narrow ? [[agent[0], agent[1] + 100], [agent[0], 200]] : [[agent[0] + 44, agent[1]], [228, agent[1]]], { stroke: ink.mint, width: 1.6 });
  const done = s.group(null, () => check(s, narrow ? 380 : 392, narrow ? 140 : 90, 22));
  const frame = s.group(null, () => {
    browser(s, page[0], page[1], narrow ? 340 : 520, narrow ? 300 : 250, { stroke: ink.line });
    s.text(page[0], page[1] + 20, "where the day goes:\n2.7 hours", { size: 22, color: ink.peach });
  });
  const fixed = s.group(null, () => {
    lock(s, narrow ? page[0] + 140 : page[0] + 230, narrow ? page[1] - 170 : page[1] - 146, 28);
    s.text(page[0], page[1] + (narrow ? 124 : 104), "still the same for everyone", { size: 18, color: ink.rose });
  });

  story.addLabel("step0", 0);
  drawOn(story, [you, desktop], "step0", 0.6);
  drawOn(story, edit.group, ">-0.1", 0.4);
  drawOn(story, shaped, ">", 0.6);
  drawOn(story, done, ">", 0.3);
  story.addLabel("step1", ">+=0.2");
  drawOn(story, frame, "step1", 0.8);
  story.addLabel("step2", ">+=0.2");
  drawOn(story, fixed, "step2", 0.5);
  story.fromTo(fixed, { scale: 0.9, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.3, ease: "back.out(3)" }, "<");
  story.to({}, { duration: 0.3 });
  return { story };
};
