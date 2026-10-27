// The template loop: you ask, the agent learns from the skills, proves the change in a headless Zen, then installs it.
import { gsap } from "gsap";
import { box, check, person } from "../icons.ts";
import { type Arrow, drawOn, ink, type Point, Sketch } from "../sketch.ts";
import { type Build, stream, travel } from "./motion.ts";

export const build: Build = (svg, narrow) => {
  const s = new Sketch(svg, narrow ? 420 : 1100, narrow ? 700 : 360, 61);
  const story = gsap.timeline({ paused: true });
  const loop = gsap.timeline({ paused: true });
  const at = (wide: Point, tall: Point): Point => (narrow ? tall : wide);
  const you = at([70, 150], [70, 70]);
  const agent = at([300, 160], [275, 90]);
  const skills = at([580, 80], [110, 270]);
  const ops = at([580, 240], [310, 270]);
  const headless = at([880, 100], [210, 440]);
  const yours = at([880, 270], [210, 610]);
  const size = narrow ? 17 : 19;
  const bw = narrow ? 180 : 210;

  const ask = s.group(null, () => {
    person(s, you[0], you[1], 24);
    s.text(you[0], you[1] + 92, "you", { size: 18, color: ink.soft });
  });
  const prompt = s.arrow(narrow ? [[you[0] + 42, you[1] - 4], [agent[0] - 100, agent[1] - 4]] : [[you[0] + 44, you[1]], [agent[0] - 112, agent[1]]], { stroke: ink.line, width: 1.6 });
  const brain = s.group(null, () => box(s, agent[0], agent[1], narrow ? 190 : 210, 66, "your agent", { stroke: ink.line, fill: ink.greyFill }, 21));
  const learn = s.group(null, () => {
    box(s, skills[0], skills[1], bw, 70, "skills +\nAGENTS.md", { stroke: ink.lilac, fill: ink.lilacFill }, size);
    box(s, ops[0], ops[1], bw, 70, "pnpm ops", { stroke: ink.peach, fill: ink.peachFill }, size + 2);
  });
  const links: Arrow[] = [
    s.arrow(narrow ? [[agent[0] - 70, agent[1] + 36], [skills[0] + 20, skills[1] - 40]] : [[agent[0] + 108, agent[1] - 16], [skills[0] - bw / 2 - 8, skills[1]]], { stroke: ink.soft, width: 1.4 }),
    s.arrow(narrow ? [[agent[0] + 20, agent[1] + 36], [ops[0], ops[1] - 40]] : [[agent[0] + 108, agent[1] + 16], [ops[0] - bw / 2 - 8, ops[1]]], { stroke: ink.soft, width: 1.4 }),
  ];
  const prove = s.arrow(narrow ? [[ops[0] - 10, ops[1] + 40], [headless[0] + 40, headless[1] - 42]] : [[ops[0] + bw / 2 + 8, ops[1] - 14], [headless[0] - 120, headless[1] + 10]], { stroke: ink.mint, width: 1.6 });
  const test = s.group(null, () => {
    box(s, headless[0], headless[1], narrow ? 250 : 230, 70, "headless copy\nthrowaway profile", { stroke: ink.mint, dash: true }, size);
    s.text(headless[0], headless[1] + (narrow ? 62 : 64), "e2e · bench · eval", { size: 17, color: ink.mint });
  });
  const ship = s.arrow(narrow ? [[yours[0], headless[1] + 76], [yours[0], yours[1] - 40]] : [[headless[0], headless[1] + 76], [yours[0], yours[1] - 38]], { stroke: ink.peach, width: 1.6 });
  const done = s.group(null, () => {
    box(s, yours[0], yours[1], narrow ? 220 : 230, 64, "your browser", { stroke: ink.peach, fill: ink.peachFill }, 21);
    check(s, yours[0] + (narrow ? 130 : 136), yours[1] - 2, 22);
    s.text(yours[0], yours[1] + 58, "pnpm ops install", { size: 16, color: ink.peach });
  });

  story.addLabel("step0", 0);
  drawOn(story, ask, "step0", 0.5);
  drawOn(story, [prompt.group, brain], ">-0.1", 0.6);
  travel(story, s, prompt.guide, ink.line, ">-0.3", 0.6);
  story.addLabel("step1", ">+=0.2");
  drawOn(story, links.map((a) => a.group), "step1", 0.5);
  drawOn(story, learn, ">-0.2", 0.6);
  story.addLabel("step2", ">+=0.2");
  drawOn(story, prove.group, "step2", 0.5);
  drawOn(story, test, ">-0.1", 0.6);
  travel(story, s, prove.guide, ink.mint, ">-0.4", 0.6);
  story.addLabel("step3", ">+=0.2");
  drawOn(story, ship.group, "step3", 0.4);
  drawOn(story, done, ">-0.1", 0.6);
  story.to({}, { duration: 0.3 });

  for (const arrow of links) stream(loop, s, arrow.guide, ink.lilac, 1, 2.6, 4);
  stream(loop, s, prove.guide, ink.mint, 2, 2.2, 4);
  return { story, loop };
};
