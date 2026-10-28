// Draws the blog's figures in the Excalidraw style (rough.js strokes, Excalifont labels) and renders each to images/NN-name.png.
// Needs resvg on PATH. Usage: pnpm --dir blog diagrams [name-filter]
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import rough from "roughjs";
import type { Drawable, Options } from "roughjs/bin/core";

const blogDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const font = join(blogDir, "fonts", "excalifont.ttf");
const filter = process.argv[2] ?? "";

// Excalidraw's own palette, which reads well on Medium's white page.
const c = {
  ink: "#1e1e1e",
  soft: "#868e96",
  orange: "#e8590c",
  orangeFill: "#ffe8cc",
  teal: "#0c8599",
  tealFill: "#c3fae8",
  red: "#e03131",
  redFill: "#ffe3e3",
  violet: "#6741d9",
  violetFill: "#e5dbff",
  grey: "#f1f3f5",
};

type Style = { stroke?: string; fill?: string; width?: number; dash?: boolean; rough?: number; hachure?: boolean };
type Point = readonly [number, number];

class Sketch {
  private readonly gen = rough.generator();
  private readonly parts: string[] = [];
  private seed = 1;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  private options(style: Style): Options {
    return {
      seed: this.seed++,
      stroke: style.stroke ?? c.ink,
      strokeWidth: style.width ?? 2,
      roughness: style.rough ?? 1,
      bowing: 1,
      fill: style.fill,
      fillStyle: style.hachure ? "hachure" : "solid",
      hachureGap: 8,
      strokeLineDash: style.dash ? [10, 8] : undefined,
    };
  }

  private add(drawable: Drawable) {
    for (const p of this.gen.toPaths(drawable)) {
      const dash = drawable.options.strokeLineDash ? ` stroke-dasharray="${drawable.options.strokeLineDash.join(" ")}"` : "";
      this.parts.push(`<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill ?? "none"}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`);
    }
  }

  rect(x: number, y: number, w: number, h: number, style: Style = {}) {
    const r = Math.min(14, w / 4, h / 4);
    const d = `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
    this.add(this.gen.path(d, this.options(style)));
  }

  line(a: Point, b: Point, style: Style = {}) {
    this.add(this.gen.line(a[0], a[1], b[0], b[1], this.options(style)));
  }

  path(d: string, style: Style = {}) {
    this.add(this.gen.path(d, this.options(style)));
  }

  circle(x: number, y: number, d: number, style: Style = {}) {
    this.add(this.gen.circle(x, y, d, this.options(style)));
  }

  arrow(a: Point, b: Point, style: Style = {}) {
    this.line(a, b, style);
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (const turn of [0.45, -0.45]) {
      const t = angle + Math.PI + turn;
      this.line(b, [b[0] + Math.cos(t) * 16, b[1] + Math.sin(t) * 16], style);
    }
  }

  text(x: number, y: number, value: string, size = 22, color = c.ink, anchor: "start" | "middle" | "end" = "middle") {
    const safe = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    this.parts.push(`<text x="${x}" y="${y}" font-family="Excalifont" font-size="${size}" fill="${color}" text-anchor="${anchor}">${safe}</text>`);
  }

  check(x: number, y: number, color = c.teal) {
    this.circle(x, y, 34, { stroke: color, fill: "#fff" });
    this.path(`M${x - 8} ${y}L${x - 2} ${y + 7}L${x + 9} ${y - 7}`, { stroke: color, width: 3, rough: 0.4 });
  }

  lock(x: number, y: number, color = c.red) {
    this.rect(x - 18, y - 6, 36, 28, { stroke: color, fill: "#fff" });
    this.path(`M${x - 11} ${y - 6}V${y - 16}A11 11 0 0 1 ${x + 11} ${y - 16}V${y - 6}`, { stroke: color, width: 2.5 });
  }

  // A browser window: title strip, address bar, and a page area the caller can fill.
  browser(x: number, y: number, w: number, h: number, style: Style = {}) {
    this.rect(x, y, w, h, { fill: "#fff", ...style });
    this.line([x + 4, y + 30], [x + w - 4, y + 30], { ...style, rough: 0.5, fill: undefined });
    for (let i = 0; i < 3; i++) this.circle(x + 16 + i * 14, y + 15, 7, { stroke: c.soft, fill: c.soft, rough: 0.3 });
    this.rect(x + 70, y + 7, w - 140, 17, { stroke: style.stroke ?? c.ink, rough: 0.6 });
  }

  svg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}"><rect width="100%" height="100%" fill="#fff"/>${this.parts.join("")}</svg>`;
  }
}

// ---- figures ----

function cover() {
  const s = new Sketch(1200, 630);
  s.rect(70, 170, 400, 150, { stroke: c.violet, fill: c.violetFill });
  s.text(100, 230, "> make my browser", 34, c.ink, "start");
  s.text(100, 280, "feel like mine", 34, c.ink, "start");
  s.text(270, 360, "you, to your agent", 22, c.soft);
  s.arrow([500, 245], [610, 245], { width: 3 });
  s.browser(640, 90, 490, 330);
  s.rect(690, 150, 390, 46, { stroke: c.orange, fill: c.orangeFill });
  s.text(885, 181, "tabs, commands, settings", 22, c.ink);
  for (let i = 0; i < 3; i++) s.line([740, 220 + i * 30], [740 + 240 - i * 50, 220 + i * 30], { stroke: c.soft, rough: 0.5 });
  ["CSS", "JS", "keys"].forEach((label, i) => {
    const x = 700 + i * 140;
    s.rect(x, 330, 110, 48, { stroke: c.teal, fill: c.tealFill });
    s.text(x + 55, 362, label, 24, c.teal);
  });
  s.text(600, 520, "zencast", 64, c.ink);
  s.text(600, 572, "describe the browser you want. your agent builds it.", 26, c.soft);
  return s;
}

function tools() {
  const s = new Sketch(1200, 470);
  const names = ["VS Code", "Raycast", "Omarchy"];
  names.forEach((name, i) => {
    const x = 60 + i * 260;
    s.rect(x, 110, 210, 150, { fill: c.grey });
    s.text(x + 105, 195, name, 28);
    s.check(x + 200, 112);
  });
  s.text(400, 330, "your editor, launcher and desktop", 24, c.soft);
  s.text(400, 365, "already change with a prompt", 24, c.teal);
  s.browser(860, 90, 280, 190, { stroke: c.red });
  s.lock(1000, 210);
  s.text(1000, 330, "your browser", 24, c.soft);
  s.text(1000, 365, "is the same for everyone", 24, c.red);
  return s;
}

function routes() {
  const s = new Sketch(1200, 560);
  const cols = [
    { x: 40, title: "Chrome extension", note: ["pages only", "at most 4 default keys"], color: c.red },
    { x: 430, title: "Fork Chromium", note: ["100 GB to build", "rebuild every change"], color: c.orange },
    { x: 820, title: "Firefox + Sine", note: ["the whole interface", "edit, restart, done"], color: c.teal },
  ];
  for (const col of cols) s.text(col.x + 170, 60, col.title, 30, col.color);
  // Extension: the page is reachable, the browser around it is not.
  s.browser(40, 100, 340, 250, { stroke: c.ink });
  s.rect(52, 140, 316, 198, { stroke: c.teal, fill: c.tealFill });
  s.text(210, 245, "the page", 24, c.teal);
  s.rect(40, 100, 340, 32, { stroke: c.red, fill: c.redFill, hachure: true, rough: 0.6 });
  // Fork: a build that never ends.
  s.browser(430, 100, 340, 250, { stroke: c.ink });
  s.rect(470, 210, 260, 34, { stroke: c.orange });
  s.rect(474, 214, 40, 26, { stroke: c.orange, fill: c.orangeFill, rough: 0.4 });
  s.text(600, 290, "compiling...", 26, c.orange);
  // Sine: every part of the window is yours.
  s.browser(820, 100, 340, 250, { stroke: c.teal });
  s.rect(820, 100, 340, 32, { stroke: c.teal, fill: c.tealFill, rough: 0.6 });
  s.rect(832, 140, 316, 198, { stroke: c.teal, fill: c.tealFill });
  s.text(990, 245, "all of it", 24, c.teal);
  for (const col of cols) {
    s.text(col.x + 170, 420, col.note[0], 26, c.ink);
    s.text(col.x + 170, 460, col.note[1], 24, c.soft);
  }
  return s;
}

function engines() {
  const s = new Sketch(1200, 560);
  const groups = [
    { x: 40, engine: "Blink", owner: "Google", browsers: ["Chrome", "Edge", "Brave", "Vivaldi", "Arc"], color: c.violet, fill: c.violetFill },
    { x: 330, engine: "Gecko", owner: "Mozilla", browsers: ["Firefox", "Zen", "LibreWolf", "Floorp"], color: c.orange, fill: c.orangeFill },
    { x: 620, engine: "WebKit", owner: "Apple", browsers: ["Safari", "Orion"], color: c.teal, fill: c.tealFill },
  ];
  for (const g of groups) {
    g.browsers.forEach((name, i) => {
      s.rect(g.x + 20, 60 + i * 56, 220, 44, { stroke: c.soft });
      s.text(g.x + 130, 90 + i * 56, name, 22, c.ink);
    });
    s.rect(g.x, 360, 260, 90, { stroke: g.color, fill: g.fill, width: 3 });
    s.text(g.x + 130, 405, g.engine, 34, g.color);
    s.text(g.x + 130, 438, g.owner, 20, c.soft);
  }
  s.rect(920, 360, 240, 90, { stroke: c.soft, dash: true });
  s.text(1040, 405, "Ladybird", 32, c.soft);
  s.text(1040, 438, "new, in development", 20, c.soft);
  s.text(600, 520, "three engines keep up with the web; most browsers are one of them, patched", 24, c.soft);
  return s;
}

function onlyIn() {
  const s = new Sketch(1200, 470);
  s.text(600, 60, "web features that only one engine ships (October 2026)", 28);
  const bars = [
    { name: "Chromium", n: 174, color: c.violet, fill: c.violetFill },
    { name: "Safari", n: 21, color: c.teal, fill: c.tealFill },
    { name: "Firefox", n: 15, color: c.orange, fill: c.orangeFill },
  ];
  bars.forEach((b, i) => {
    const y = 120 + i * 100;
    s.text(220, y + 42, b.name, 30, b.color, "end");
    s.rect(250, y, Math.max(14, b.n * 4.6), 64, { stroke: b.color, fill: b.fill, hachure: true });
    s.text(270 + b.n * 4.6, y + 44, String(b.n), 32, c.ink, "start");
  });
  s.text(600, 440, "source: web-features explorer, web-platform-dx.github.io", 20, c.soft);
  return s;
}

function patchOrHook() {
  const s = new Sketch(1200, 600);
  s.text(300, 60, "a fork patches and rebuilds", 30, c.red);
  s.text(900, 60, "Sine only hooks startup", 30, c.teal);
  s.line([600, 90], [600, 560], { stroke: c.soft, dash: true, rough: 0.4 });
  // Fork
  s.rect(80, 110, 200, 120, { fill: c.grey });
  s.text(180, 165, "browser", 24);
  s.text(180, 195, "source", 24);
  s.rect(320, 110, 200, 120, { stroke: c.red, fill: c.redFill });
  s.text(420, 165, "+ your", 24, c.red);
  s.text(420, 195, "patches", 24, c.red);
  s.arrow([300, 270], [300, 320]);
  s.rect(160, 330, 280, 70, { stroke: c.orange, fill: c.orangeFill });
  s.text(300, 375, "compile: hours", 26, c.orange);
  s.arrow([300, 410], [300, 450]);
  s.rect(180, 460, 240, 70, { stroke: c.red });
  s.text(300, 505, "your own binary", 24, c.red);
  s.path("M440 495 C 585 470, 585 160, 525 170", { stroke: c.red, dash: true });
  s.text(525, 300, "every release", 20, c.red, "end");
  // Sine
  s.rect(680, 110, 220, 120, { stroke: c.teal, fill: c.tealFill });
  s.text(790, 160, "Firefox or Zen", 24, c.teal);
  s.text(790, 195, "as shipped", 22, c.soft);
  s.rect(940, 125, 200, 90, { stroke: c.violet, fill: c.violetFill });
  s.text(1040, 165, "config.js", 24, c.violet);
  s.text(1040, 195, "AutoConfig", 20, c.soft);
  s.arrow([1040, 225], [1040, 300]);
  s.text(1050, 270, "at startup", 20, c.soft, "start");
  s.rect(700, 310, 420, 80, { stroke: c.orange, fill: c.orangeFill });
  s.text(910, 360, "your JS + CSS, from your profile", 24, c.orange);
  s.arrow([910, 400], [910, 450]);
  s.browser(780, 460, 260, 100, { stroke: c.teal });
  s.text(910, 530, "every window", 22, c.teal);
  return s;
}

function anatomy() {
  const s = new Sketch(1200, 640);
  s.browser(40, 40, 1120, 560);
  s.text(600, 110, "Zencast, one Sine mod in every Zen window", 28);
  const boxes = [
    { x: 80, y: 150, title: "palette", sub: "src/palette", color: c.orange, fill: c.orangeFill },
    { x: 440, y: 150, title: "keys", sub: "src/keys", color: c.violet, fill: c.violetFill },
    { x: 800, y: 150, title: "settings", sub: "src/settings", color: c.teal, fill: c.tealFill },
  ];
  for (const b of boxes) {
    s.rect(b.x, b.y, 320, 110, { stroke: b.color, fill: b.fill });
    s.text(b.x + 160, b.y + 52, b.title, 32, b.color);
    s.text(b.x + 160, b.y + 86, b.sub, 20, c.soft);
  }
  s.rect(80, 300, 1040, 110, { fill: c.grey });
  s.text(600, 345, "commands", 32);
  s.text(600, 380, "src/commands, plus every src/features/*.ts dropped in", 22, c.soft);
  for (const x of [240, 600, 960]) s.arrow([x, 295], [x, 268]);
  s.rect(80, 450, 1040, 110, { stroke: c.ink });
  s.text(600, 495, "thin wrappers over Zen and Firefox", 30);
  s.text(600, 530, "tabs, spaces, folders, containers, session, toasts", 22, c.soft);
  s.arrow([600, 445], [600, 418]);
  return s;
}

function loop() {
  const s = new Sketch(1200, 430);
  const steps = [
    { title: "prompt", sub: "you ask", color: c.violet, fill: c.violetFill },
    { title: "edit", sub: "src/features", color: c.orange, fill: c.orangeFill },
    { title: "build", sub: "pnpm ops build", color: c.ink, fill: c.grey },
    { title: "check", sub: "e2e, look: headless", color: c.teal, fill: c.tealFill },
    { title: "install", sub: "restart Zen", color: c.ink, fill: c.grey },
  ];
  steps.forEach((step, i) => {
    const x = 30 + i * 236;
    s.rect(x, 120, 196, 120, { stroke: step.color, fill: step.fill });
    s.text(x + 98, 172, step.title, 32, step.color);
    s.text(x + 98, 208, step.sub, 19, c.soft);
    if (i < steps.length - 1) s.arrow([x + 200, 180], [x + 232, 180]);
  });
  s.path("M1060 250 C 1060 360, 130 360, 128 252", { stroke: c.soft, dash: true });
  s.arrow([140, 290], [128, 252], { stroke: c.soft });
  s.text(600, 390, "your real profile is never touched until install", 22, c.soft);
  s.text(600, 70, "the agent's loop", 30);
  return s;
}

const figures: Record<string, () => Sketch> = {
  "00-cover": cover,
  "01-tools": tools,
  "02-routes": routes,
  "03-engines": engines,
  "04-only-in": onlyIn,
  "05-patch-or-hook": patchOrHook,
  "06-anatomy": anatomy,
  "07-loop": loop,
};

const scratch = mkdtempSync(join(tmpdir(), "zencast-blog-"));
for (const [name, draw] of Object.entries(figures)) {
  if (!name.includes(filter)) continue;
  const svgPath = join(scratch, `${name}.svg`);
  const pngPath = join(blogDir, "images", `${name}.png`);
  writeFileSync(svgPath, draw().svg());
  execFileSync("resvg", ["--use-font-file", font, "--zoom", "2", svgPath, pngPath]);
  console.log(`wrote ${pngPath}`);
}
