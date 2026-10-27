// Chrome: an extension sits in a sandbox and never reaches the browser's own interface.
import { gsap } from "gsap";
import { box, browser, cross, lock, person } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import type { Build } from "./motion.ts";

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1100, narrow ? 720 : 340, 31);
  const story = gsap.timeline({ paused: true });
  const at = (wide: Point, tall: Point): Point => (narrow ? tall : wide);
  const agent = at([90, 150], [210, 60]);
  const ext = at([340, 170], [210, 290]);
  const ui = at([820, 170], [210, 580]);

  const you = s.group(null, () => {
    person(s, agent[0], agent[1], 24);
    s.text(agent[0], agent[1] + 94, "your agent", { size: 18, color: ink.soft });
  });
  const write = s.arrow(narrow ? [[agent[0], agent[1] + 106], [ext[0], ext[1] - 74]] : [[agent[0] + 46, agent[1] + 6], [ext[0] - 116, ext[1]]], { stroke: ink.line, width: 1.6 });
  const extension = s.group(null, () => box(s, ext[0], ext[1], 170, 64, "extension", { stroke: ink.peach, fill: ink.peachFill }, 21));
  const sandbox = s.group(null, () => {
    s.rect(ext[0] - 120, ext[1] - 70, 240, 140, { stroke: ink.soft, dash: true, width: 1.6 }, 18);
    s.text(ext[0] - 108, ext[1] - 80, "sandbox", { size: 17, color: ink.soft, anchor: "start" });
    s.text(ext[0], ext[1] + 102, "4 suggested shortcuts, max", { size: 17, color: ink.rose });
  });
  const frame = s.group(null, () => {
    browser(s, ui[0], ui[1], narrow ? 340 : 420, narrow ? 220 : 250, { stroke: ink.line });
    s.text(ui[0], ui[1] + (narrow ? 50 : 56), "tabs, toolbar, dialogs:\nnative C++ views", { size: 19, color: ink.soft });
  });
  const reach = s.arrow(narrow ? [[ext[0], ext[1] + 118], [ui[0], ui[1] - 122]] : [[ext[0] + 126, ext[1]], [ui[0] - 218, ui[1]]], { stroke: ink.rose, width: 1.6, dash: true });
  const blocked = s.group(null, () => {
    const mid: Point = narrow ? [ext[0], (ext[1] + 118 + ui[1] - 122) / 2] : [(ext[0] + 126 + ui[0] - 218) / 2, ext[1]];
    cross(s, mid[0], mid[1], 26);
    lock(s, narrow ? ui[0] + 150 : ui[0] + 200, narrow ? ui[1] - 130 : ui[1] - 140, 30);
  });

  story.addLabel("step0", 0);
  drawOn(story, you, "step0", 0.5);
  drawOn(story, [write.group, extension], ">-0.1", 0.6);
  story.addLabel("step1", ">+=0.2");
  drawOn(story, sandbox, "step1", 0.8);
  story.addLabel("step2", ">+=0.2");
  drawOn(story, frame, "step2", 0.8);
  drawOn(story, reach.group, ">-0.1", 0.5);
  drawOn(story, blocked, ">", 0.4);
  story.fromTo(blocked, { scale: 0.8, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.3, ease: "back.out(3)" }, "<");
  story.to({}, { duration: 0.3 });
  return { story };
};
