// Forking Chromium: a huge checkout, a rebuild for every change, and a fork that trails upstream security fixes.
import { gsap } from "gsap";
import { box, disk } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import type { Build } from "./motion.ts";

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1100, narrow ? 560 : 390, 41);
  const story = gsap.timeline({ paused: true });
  const at = (wide: Point, tall: Point): Point => (narrow ? tall : wide);
  const drive = at([130, 110], [70, 90]);
  const fork = at([380, 110], [290, 90]);
  const rebuild = at([680, 110], [290, 240]);
  const w = 170;
  const h = narrow ? 60 : 64;

  const clone = s.group(null, () => {
    disk(s, drive[0], drive[1], narrow ? 60 : 70);
    s.text(drive[0], drive[1] + (narrow ? 70 : 75), "100 GB", { size: 19, color: ink.rose });
    s.arrow([[drive[0] + (narrow ? 40 : 55), drive[1]], [fork[0] - w / 2 - 10, fork[1]]], { stroke: ink.soft, width: 1.6 });
    box(s, fork[0], fork[1], w, h, "your fork", { stroke: ink.peach, fill: ink.peachFill }, 21);
  });
  const loop = s.group(null, () => {
    const from: Point = narrow ? [fork[0], fork[1] + h / 2 + 4] : [fork[0] + w / 2 + 6, fork[1]];
    const to: Point = narrow ? [rebuild[0], rebuild[1] - h / 2 - 6] : [rebuild[0] - w / 2 - 10, rebuild[1]];
    s.arrow([from, to], { stroke: ink.soft, width: 1.6 });
    box(s, rebuild[0], rebuild[1], w, h, "rebuild", { stroke: ink.line }, 21);
    const x = rebuild[0];
    const y = rebuild[1];
    s.arrow(narrow ? [[x + 88, y + 10], [x + 122, y - 75], [x + 88, y - 144]] : [[x - 40, y - h / 2 - 4], [x, y - h / 2 - 34], [x + 40, y - h / 2 - 4]], { stroke: ink.rose, width: 1.6 });
    s.text(x, y + (narrow ? 60 : 70), "every change", { size: 18, color: ink.soft });
  });

  const left = narrow ? 30 : 90;
  const right = narrow ? 390 : 1040;
  const upY = narrow ? 405 : 270;
  const forkY = narrow ? 465 : 330;
  const lag = narrow ? 230 : 680;
  const ticks = narrow ? 7 : 9;
  const step = (right - left - 20) / (ticks - 1);
  const upstream = s.group(null, () => {
    s.text(left, upY - 22, "chromium: a release every 2 weeks", { size: 17, color: ink.mint, anchor: "start" });
    s.line([left, upY], [right, upY], { stroke: ink.mint, width: 1.8 });
    for (let i = 0; i < ticks; i += 1) s.circle(left + 10 + i * step, upY, 12, { stroke: ink.mint, fill: ink.mintFill, width: 1.6 });
  });
  const trailing = s.group(null, () => {
    s.line([left, forkY], [lag, forkY], { stroke: ink.peach, width: 1.8 });
    for (let x = left + 10; x < lag; x += step * 2.4) s.circle(x, forkY, 12, { stroke: ink.peach, fill: ink.peachFill, width: 1.6 });
    s.text(left, forkY + 35, "your fork", { size: 17, color: ink.peach, anchor: "start" });
  });
  const gap = s.group(null, () => {
    const a = lag + 18;
    s.line([a, forkY], [right, forkY], { stroke: ink.rose, width: 2, dash: true });
    s.line([a, forkY - 10], [a, forkY + 10], { stroke: ink.rose, width: 2 });
    s.line([right, forkY - 10], [right, forkY + 10], { stroke: ink.rose, width: 2 });
    s.text((a + right) / 2, forkY + 35, narrow ? "patch gap:\nexploited" : "patch gap: exploited", { size: 18, color: ink.rose });
  });

  story.addLabel("step0", 0);
  drawOn(story, clone, "step0", 0.8);
  story.addLabel("step1", ">+=0.2");
  drawOn(story, loop, "step1", 0.8);
  story.fromTo(loop.querySelectorAll(".arrow")[1] ?? loop, { rotation: -20, transformOrigin: "50% 100%" }, { rotation: 0, duration: 0.5, ease: "back.out(2)" }, ">-0.3");
  story.addLabel("step2", ">+=0.2");
  drawOn(story, upstream, "step2", 1);
  drawOn(story, trailing, "step2+=0.2", 1.1);
  drawOn(story, gap, ">", 0.5);
  story.to({}, { duration: 0.3 });
  return { story };
};
