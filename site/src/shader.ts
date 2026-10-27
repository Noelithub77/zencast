// Hero field: a dim grid of keycaps. A press wave rolls out from the logo, keys flicker as if typed, and keys under the pointer light up.
import { Mesh, Program, Renderer, Triangle } from "ogl";

export const period = 3.6;

const vertex = /* glsl */ `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uCell;
uniform vec2 uRes;
uniform vec2 uSource;
uniform vec3 uPointer;
const vec3 peach = vec3(1.0, 0.78, 0.6);
const vec3 mint = vec3(0.6, 1.0, 0.894);
const float period = ${period.toFixed(2)};

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Signed distance to a rounded square of half size b and corner radius r.
float roundBox(vec2 p, float b, float r) {
  vec2 q = abs(p) - vec2(b - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 cell = floor(frag / uCell);
  vec2 local = fract(frag / uCell) - 0.5;
  vec2 center = (cell + 0.5) * uCell;

  // The press wave: a ring leaving the logo once per period.
  float d = distance(center, uSource) / uCell;
  float since = mod(uTime - d * 0.09, period);
  float wave = exp(-since * 7.0) * smoothstep(14.0, 2.0, d);

  // Typing: a few keys flash at random, each for a beat.
  float beat = floor(uTime * 3.0);
  float typed = step(0.992, hash(cell + beat)) * (1.0 - fract(uTime * 3.0));

  float near = smoothstep(4.0, 0.0, distance(center, uPointer.xy) / uCell) * uPointer.z;
  float press = clamp(wave + typed + near * 0.6, 0.0, 1.0);

  // Pressed keys sink a little.
  vec2 p = local + vec2(0.0, press * 0.04);
  float edge = roundBox(p, 0.36, 0.11);
  float outline = smoothstep(0.03, 0.0, abs(edge));
  float fill = smoothstep(0.01, -0.02, edge);

  // Keep the middle calm so the headline reads.
  vec2 uv = frag / uRes - 0.5;
  float calm = smoothstep(0.08, 0.5, length(uv * vec2(uRes.x / uRes.y, 1.0) * vec2(0.8, 1.4)));

  vec3 tint = mix(peach, mint, near);
  float base = outline * 0.07 * calm;
  float lit = (outline * 0.5 + fill * 0.16) * press * mix(0.35, 1.0, calm);
  vec3 color = mix(vec3(0.85), tint, clamp(lit / max(base + lit, 0.0001), 0.0, 1.0));
  gl_FragColor = vec4(color, clamp(base + lit, 0.0, 1.0));
}
`;

type Field = { stop: () => void };

/** Starts the field in `canvas`, sized to `host`. The wave starts at `source`. */
export function startField(canvas: HTMLCanvasElement, host: HTMLElement, source: Element, onPress: () => void): Field | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * 0.75;
  let renderer: Renderer;
  try {
    renderer = new Renderer({ canvas, dpr, alpha: true, premultipliedAlpha: false, antialias: false });
  } catch {
    return null;
  }
  const gl = renderer.gl;
  const uniforms = {
    uTime: { value: 0 },
    uCell: { value: 64 },
    uRes: { value: [1, 1] },
    uSource: { value: [0, 0] },
    uPointer: { value: [0, 0, 0] },
  };
  const program = new Program(gl, { vertex, fragment, uniforms, transparent: true });
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

  // Shader coordinates are in device pixels with y up.
  const toField = (x: number, y: number, box: DOMRect) => [(x - box.left) * dpr, (box.bottom - y) * dpr];
  const measure = () => {
    const box = host.getBoundingClientRect();
    renderer.setSize(box.width, box.height);
    uniforms.uRes.value = [box.width * dpr, box.height * dpr];
    uniforms.uCell.value = (box.width < 640 ? 52 : 68) * dpr;
    const logo = source.getBoundingClientRect();
    uniforms.uSource.value = toField(logo.left + logo.width / 2, logo.top + logo.height / 2, box);
  };
  const pointer = (event: PointerEvent) => {
    const box = host.getBoundingClientRect();
    uniforms.uPointer.value = [...toField(event.clientX, event.clientY, box), event.pointerType === "mouse" ? 1 : 0];
  };
  const leave = () => void (uniforms.uPointer.value = [0, 0, 0]);

  let frame = 0;
  let visible = true;
  let beat = -1;
  const start = performance.now();
  const render = (now: number) => {
    frame = requestAnimationFrame(render);
    const t = (now - start) / 1000;
    uniforms.uTime.value = t;
    // The logo presses with each wave it sends.
    const next = Math.floor(t / period);
    if (next !== beat && t > 0.2) onPress();
    beat = next;
    renderer.render({ scene: mesh });
  };
  const resume = () => {
    cancelAnimationFrame(frame);
    if (visible && !document.hidden) frame = requestAnimationFrame(render);
  };

  const resize = new ResizeObserver(measure);
  resize.observe(host);
  const view = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    resume();
  });
  view.observe(host);
  document.addEventListener("visibilitychange", resume);
  host.addEventListener("pointermove", pointer, { passive: true });
  host.addEventListener("pointerleave", leave);
  measure();
  canvas.classList.add("is-live");

  return {
    stop: () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      view.disconnect();
      document.removeEventListener("visibilitychange", resume);
      host.removeEventListener("pointermove", pointer);
      host.removeEventListener("pointerleave", leave);
    },
  };
}
