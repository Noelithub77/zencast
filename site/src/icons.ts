// The recurring characters of every diagram, drawn around a center point.
import { ink, type Point, type Sketch, type Style } from "./sketch.ts";

/** A face with shoulders. */
export function person(s: Sketch, cx: number, cy: number, r: number, color: string = ink.line): SVGGElement {
  return s.group("person", () => {
    s.circle(cx, cy, r * 2, { fill: ink.bg, stroke: color });
    s.path(`M${cx - r * 1.5} ${cy + r * 2.7}Q${cx - r * 1.4} ${cy + r * 1.25} ${cx} ${cy + r * 1.25}Q${cx + r * 1.4} ${cy + r * 1.25} ${cx + r * 1.5} ${cy + r * 2.7}`, { stroke: color });
    const eye = r * 0.32;
    s.shape("circle", { cx: cx - eye, cy: cy - r * 0.15, r: Math.max(1.6, r * 0.09), fill: color });
    s.shape("circle", { cx: cx + eye, cy: cy - r * 0.15, r: Math.max(1.6, r * 0.09), fill: color });
    s.path(`M${cx - r * 0.42} ${cy + r * 0.33}Q${cx} ${cy + r * 0.78} ${cx + r * 0.42} ${cy + r * 0.33}`, { stroke: color, width: 2, rough: 0.5 });
  });
}

/** A labeled box; multi-line labels stay centered. */
export function box(s: Sketch, cx: number, cy: number, w: number, h: number, label: string, style: Style = {}, size = 20): SVGGElement {
  return s.group("box", () => {
    s.rect(cx - w / 2, cy - h / 2, w, h, style);
    const lines = label.split("\n").length;
    s.text(cx, cy + size * 0.35 - ((lines - 1) * size * 1.2) / 2, label, { size, color: style.stroke ?? ink.line });
  });
}

/** A browser window: tabs along the top and an address bar. */
export function browser(s: Sketch, cx: number, cy: number, w: number, h: number, style: Style = {}): SVGGElement {
  const x = cx - w / 2;
  const y = cy - h / 2;
  return s.group("browser", () => {
    s.rect(x, y, w, h, { fill: ink.bg, ...style }, 14);
    for (let i = 0; i < 3; i += 1) s.rect(x + 16 + i * (w * 0.2 + 8), y + 10, w * 0.2, 22, { stroke: style.stroke ?? ink.soft, width: 1.4, rough: 0.6 }, 7);
    s.line([x, y + 40], [x + w, y + 40], { stroke: style.stroke ?? ink.soft, width: 1.4, rough: 0.6 });
    s.rect(x + 16, y + 50, w - 32, 22, { stroke: ink.soft, width: 1.3, rough: 0.6 }, 11);
  });
}

/** The command palette: a search field over a few result rows. */
export function palette(s: Sketch, cx: number, cy: number, w: number, color: string = ink.peach): SVGGElement {
  const h = w * 0.6;
  const x = cx - w / 2;
  const y = cy - h / 2;
  return s.group("palette", () => {
    s.rect(x, y, w, h, { stroke: color, fill: ink.peachFill }, 12);
    s.text(x + 16, y + 30, "> ctrl+k", { size: 17, color, anchor: "start" });
    s.line([x, y + 44], [x + w, y + 44], { stroke: color, width: 1.3, rough: 0.6 });
    for (let i = 0; i < 3; i += 1) s.line([x + 18, y + 64 + i * 20], [x + w * (0.8 - i * 0.12), y + 64 + i * 20], { stroke: i ? ink.soft : ink.line, width: 2, rough: 0.6 });
  });
}

/** A folder with a tab, labeled inside. */
export function folder(s: Sketch, cx: number, cy: number, w: number, h: number, label: string, color: string = ink.soft): SVGGElement {
  const x = cx - w / 2;
  const y = cy - h / 2;
  return s.group("folder", () => {
    s.path(`M${x} ${y + 12}V${y + h}H${x + w}V${y + 12}H${x + w * 0.45}L${x + w * 0.38} ${y}H${x}Z`, { stroke: color, fill: ink.greyFill });
    s.text(x + 14, y + 36, label, { size: 17, color, anchor: "start" });
  });
}

/** A padlock. */
export function lock(s: Sketch, cx: number, cy: number, size: number, color: string = ink.rose): SVGGElement {
  return s.group("lock", () => {
    s.path(`M${cx - size * 0.3} ${cy}V${cy - size * 0.25}A${size * 0.3} ${size * 0.3} 0 0 1 ${cx + size * 0.3} ${cy - size * 0.25}V${cy}`, { stroke: color, width: 2.4 });
    s.rect(cx - size / 2, cy, size, size * 0.72, { stroke: color, fill: ink.roseFill }, 6);
  });
}

/** A disk: a short cylinder. */
export function disk(s: Sketch, cx: number, cy: number, w: number, color: string = ink.soft): SVGGElement {
  const h = w * 0.8;
  const e = w * 0.3;
  return s.group("disk", () => {
    s.path(`M${cx - w / 2} ${cy - h / 2}V${cy + h / 2}A${w / 2} ${e / 2} 0 0 0 ${cx + w / 2} ${cy + h / 2}V${cy - h / 2}`, { stroke: color, fill: ink.greyFill });
    s.ellipse(cx, cy - h / 2, w, e, { stroke: color, fill: ink.bg });
  });
}

export function check(s: Sketch, cx: number, cy: number, size: number, color: string = ink.mint): SVGGElement {
  return s.polyline([[cx - size * 0.5, cy], [cx - size * 0.12, cy + size * 0.38], [cx + size * 0.55, cy - size * 0.42]], { stroke: color, width: 3, rough: 0.6 });
}

export function cross(s: Sketch, cx: number, cy: number, size: number, color: string = ink.rose): SVGGElement {
  const h = size / 2;
  return s.group("cross", () => {
    s.line([cx - h, cy - h], [cx + h, cy + h], { stroke: color, width: 3, rough: 0.7 });
    s.line([cx + h, cy - h], [cx - h, cy + h], { stroke: color, width: 3, rough: 0.7 });
  });
}

/** A hand-drawn underline or strike, slightly wavy. */
export function scribble(s: Sketch, from: Point, to: Point, style: Style = {}): SVGGElement {
  const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 4];
  return s.path(`M${from[0]} ${from[1]}Q${mid[0]} ${mid[1]} ${to[0]} ${to[1]}`, { width: 3, rough: 1.2, ...style });
}

/** A small filled dot that travels along guides: crisp, so it reads as data, not ink. */
export function packet(s: Sketch, color: string, r = 6): SVGCircleElement {
  return s.shape("circle", { cx: 0, cy: 0, r, fill: color, opacity: 0, class: "packet" });
}
