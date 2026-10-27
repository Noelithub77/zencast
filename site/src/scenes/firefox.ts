// Firefox: a loader in the install folder runs your files from the profile inside the browser's own window, while updates keep arriving.
import { gsap } from "gsap";
import { box, browser, check, folder, palette } from "../icons.ts";
import { drawOn, ink, type Point, Sketch } from "../sketch.ts";
import { type Build, stream, travel } from "./motion.ts";

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1100, narrow ? 800 : 400, 53);
  const story = gsap.timeline({ paused: true });
  const loop = gsap.timeline({ paused: true });
  const at = (wide: Point, tall: Point): Point => (narrow ? tall : wide);
  const install = at([140, 120], [110, 90]);
  const profile = at([140, 290], [310, 90]);
  const ui = at([600, 205], [210, 440]);
  const vendor = at([960, 110], [210, 690]);
  const fw = narrow ? 180 : 190;
  const fh = narrow ? 120 : 120;

  const loader = s.group(null, () => {
    folder(s, install[0], install[1], fw, fh, "install folder");
    box(s, install[0], install[1] + 22, 120, 38, "loader", { stroke: ink.peach, fill: ink.peachFill }, 18);
  });
  const files = s.group(null, () => {
    folder(s, profile[0], profile[1], fw, fh, "your profile");
    s.text(profile[0] - fw / 2 + 18, profile[1] + 16, "zencast.uc.mjs", { size: 16, color: ink.peach, anchor: "start" });
    s.text(profile[0] - fw / 2 + 18, profile[1] + 42, "palette.css", { size: 16, color: ink.peach, anchor: "start" });
  });
  const bw = narrow ? 360 : 420;
  const bh = narrow ? 260 : 280;
  const frame = s.group(null, () => browser(s, ui[0], ui[1], bw, bh, { stroke: ink.line }));
  const runs = [
    s.arrow(narrow ? [[install[0], install[1] + fh / 2 + 6], [install[0] + 20, ui[1] - bh / 2 - 60], [ui[0] - 50, ui[1] - bh / 2 - 8]] : [[install[0] + fw / 2 + 8, install[1]], [install[0] + 180, install[1] + 20], [ui[0] - bw / 2 - 8, ui[1] - 40]], { stroke: ink.peach, width: 1.6 }),
    s.arrow(narrow ? [[profile[0], profile[1] + fh / 2 + 6], [profile[0] - 20, ui[1] - bh / 2 - 60], [ui[0] + 50, ui[1] - bh / 2 - 8]] : [[profile[0] + fw / 2 + 8, profile[1]], [profile[0] + 180, profile[1] - 20], [ui[0] - bw / 2 - 8, ui[1] + 40]], { stroke: ink.peach, width: 1.6 }),
  ];
  const live = s.group(null, () => palette(s, ui[0], ui[1] + 30, narrow ? 220 : 250));
  const updates = s.group(null, () => {
    s.text(vendor[0], vendor[1] + 8, "Firefox · Zen", { size: 20, color: ink.mint });
    s.rect(vendor[0] - 85, vendor[1] - 26, 170, 52, { stroke: ink.mint, fill: ink.mintFill }, 26);
  });
  const fixes = s.arrow(narrow ? [[vendor[0], vendor[1] - 32], [ui[0], ui[1] + bh / 2 + 8]] : [[vendor[0], vendor[1] + 32], [vendor[0] - 40, ui[1] + 40], [ui[0] + bw / 2 + 8, ui[1] + 60]], { stroke: ink.mint, width: 1.8 });
  const safe = s.group(null, () => {
    const spot: Point = narrow ? [210, 765] : [960, 320];
    s.text(spot[0], spot[1], narrow ? "security fixes keep coming" : "security fixes\nkeep coming", { size: 18, color: ink.mint });
    check(s, narrow ? 50 : 880, narrow ? 758 : 312, 20);
  });

  story.addLabel("step0", 0);
  drawOn(story, loader, "step0", 0.7);
  story.addLabel("step1", ">+=0.2");
  drawOn(story, files, "step1", 0.7);
  story.addLabel("step2", ">+=0.2");
  drawOn(story, frame, "step2", 0.6);
  drawOn(story, runs.map((arrow) => arrow.group), ">-0.2", 0.6);
  runs.forEach((arrow, i) => travel(story, s, arrow.guide, ink.peach, `>-${i ? 0.6 : 0.2}`, 0.6));
  drawOn(story, live, ">-0.1", 0.5);
  story.fromTo(live, { scale: 0.92, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.4, ease: "back.out(2)" }, "<");
  story.addLabel("step3", ">+=0.2");
  drawOn(story, updates, "step3", 0.6);
  drawOn(story, fixes.group, ">-0.1", 0.5);
  travel(story, s, fixes.guide, ink.mint, ">-0.1", 0.6);
  drawOn(story, safe, ">", 0.5);
  story.to({}, { duration: 0.3 });

  stream(loop, s, fixes.guide, ink.mint, 2, 2.4, 4);
  for (const arrow of runs) stream(loop, s, arrow.guide, ink.peach, 2, 2.8, 4);
  return { story, loop };
};
