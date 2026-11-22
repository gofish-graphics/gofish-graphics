/**
 * PROTOTYPE(#1395): "Show regions", a debugging overlay for focus behaviors,
 * after Dragology's overlay visualizer.
 *
 * The regions are found by RUNNING THE BEHAVIOR at every cell of a grid over
 * the chart, with the real candidates and the real current focus. So they are
 * right for every behavior, a plain user function included, with no geometry
 * re-derived per behavior. On top, it draws what the behavior declares it
 * reads (`reads` in focus.ts): the measured points, the hull and the
 * `.within` limits, and the pointer's line to the point it was measured to.
 *
 * This file needs only the behavior, the candidates, the current focus and
 * the pointer, which `inspect` in focusRuntime.ts hands over. With
 * `pointer().snap` public, it would be a user-space tool. The one DOM detail
 * it knows is where to put its layer: in the chart's `<svg>`, under the
 * tooltip box.
 */
import { hullOf, nearestInBox, readsOf, type Candidate, type FocusBehavior, type Point } from "./focus";
import { inspect, type Inspector } from "./focusRuntime";
import { TOOLTIP_STROKE } from "./helpers";

const SVG = "http://www.w3.org/2000/svg";
/** Dragology's overlay color. */
const MAGENTA = "#d100d1";
/** Region tints, fixed light-theme colors: the frame stays white. No blue
 *  (the bars) and no magenta (the geometry). */
const TINTS = ["#f59f00", "#0ca678", "#7048e8", "#f76707", "#74b816"];
const INK = "#1f2937";

/* ------------------------------- sampling -------------------------------- */

export type Regions = {
  cell: number;
  cols: number;
  rows: number;
  /** Per cell, the index of the chosen candidate, or -1 for no focus. */
  labels: Int32Array;
};

/**
 * Run `behavior` at the center of every `cell` px cell of a `w` by `h` area.
 * `clicked` is true, so a click behavior shows where a click would land.
 * The rows are run in slices of at most `budget` ms, so the page, and the
 * tooltip, stay responsive; resolves to undefined if `stale()` turns true
 * between slices. `ms` is the time spent running the behavior.
 */
export async function sampleRegions(
  behavior: FocusBehavior,
  candidates: Candidate[],
  current: Candidate | undefined,
  w: number,
  h: number,
  cell: number,
  stale: () => boolean = () => false,
  budget = 8
): Promise<{ regions: Regions; ms: number } | undefined> {
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const labels = new Int32Array(cols * rows);
  const index = new Map(candidates.map((c, i) => [c, i]));
  let ms = 0;
  let j = 0;
  while (j < rows) {
    const t = performance.now();
    for (; j < rows && performance.now() - t < budget; j++)
      for (let i = 0; i < cols; i++) {
        const pointer = { x: (i + 0.5) * cell, y: (j + 0.5) * cell };
        const { choice } = behavior({ pointer, candidates, current, clicked: true });
        labels[j * cols + i] = choice ? (index.get(choice) ?? -1) : -1;
      }
    ms += performance.now() - t;
    if (j < rows) {
      await new Promise((r) => setTimeout(r, 0));
      if (stale()) return undefined;
    }
  }
  return { regions: { cell, cols, rows, labels }, ms };
}

/** One path per region (row runs) and one path of the borders between them.
 *  With `except`, a border that is also one of `except`'s is left out. */
function regionPaths({ cell, cols, rows, labels }: Regions, except?: Int32Array) {
  const differs = (a: number, b: number) =>
    labels[a] !== labels[b] && !(except && except[a] !== except[b]);
  const fills = new Map<number, string[]>();
  for (let j = 0; j < rows; j++) {
    let i = 0;
    while (i < cols) {
      const l = labels[j * cols + i];
      let k = i + 1;
      while (k < cols && labels[j * cols + k] === l) k++;
      if (l >= 0) {
        const d = fills.get(l) ?? [];
        d.push(`M${i * cell} ${j * cell}h${(k - i) * cell}v${cell}h${-(k - i) * cell}z`);
        fills.set(l, d);
      }
      i = k;
    }
  }
  // Borders, smoothed (marching squares): each square between four cell
  // centers whose labels differ gets segments joining the midpoints of its
  // differing sides, so a slanted border runs at 45 degrees, not in steps.
  const border: string[] = [];
  const f = (v: number) => +v.toFixed(1);
  for (let j = 0; j + 1 < rows; j++)
    for (let i = 0; i + 1 < cols; i++) {
      const [a, b, c, d] = [j * cols + i, j * cols + i + 1, (j + 1) * cols + i + 1, (j + 1) * cols + i];
      const [x0, y0, x1, y1] = [(i + 0.5) * cell, (j + 0.5) * cell, (i + 1.5) * cell, (j + 1.5) * cell];
      const [xm, ym] = [(x0 + x1) / 2, (y0 + y1) / 2];
      const m: [number, number][] = [];
      if (differs(a, b)) m.push([xm, y0]);
      if (differs(b, c)) m.push([x1, ym]);
      if (differs(d, c)) m.push([xm, y1]);
      if (differs(a, d)) m.push([x0, ym]);
      if (m.length === 2) border.push(`M${f(m[0][0])} ${f(m[0][1])}L${f(m[1][0])} ${f(m[1][1])}`);
      else for (const [x, y] of m) border.push(`M${f(x)} ${f(y)}L${f(xm)} ${f(ym)}`);
    }
  return { fills, border: border.join("") };
}

/** A tint per region such that touching regions differ (greedy coloring). */
function tintsFor({ cols, rows, labels }: Regions, n: number): number[] {
  const near = Array.from({ length: n }, () => new Set<number>());
  const touch = (a: number, b: number) => {
    if (a >= 0 && b >= 0 && a !== b) near[a].add(b), near[b].add(a);
  };
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const l = labels[j * cols + i];
      if (i + 1 < cols) touch(l, labels[j * cols + i + 1]);
      if (j + 1 < rows) touch(l, labels[(j + 1) * cols + i]);
    }
  const tint: number[] = [];
  for (let a = 0; a < n; a++) {
    const used = new Set([...near[a]].filter((b) => b < a).map((b) => tint[b]));
    let t = 0;
    while (used.has(t) && t < TINTS.length - 1) t++;
    tint[a] = t;
  }
  return tint;
}

/* -------------------------------- drawing -------------------------------- */

const el = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
const thin = { "vector-effect": "non-scaling-stroke", fill: "none" };

/** The hull grown by `r` px: its edges pushed out, joined by arcs. */
function grown(hull: Point[], r: number): string {
  if (hull.length < 3) return "";
  const n = hull.length;
  const c = hull.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n }), { x: 0, y: 0 });
  const normal = (a: Point, b: Point) => {
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const len = Math.hypot(dx, dy) || 1;
    let [nx, ny] = [dy / len, -dx / len];
    const mx = (a.x + b.x) / 2 - c.x;
    const my = (a.y + b.y) / 2 - c.y;
    if (nx * mx + ny * my < 0) [nx, ny] = [-nx, -ny];
    return Math.atan2(ny, nx);
  };
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p = hull[i];
    const a0 = normal(hull[(i - 1 + n) % n], p);
    let a1 = normal(p, hull[(i + 1) % n]);
    // turn the short way round the corner
    while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
    const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 0.2));
    for (let s = 0; s <= steps; s++) {
      const t = a0 + ((a1 - a0) * s) / steps;
      pts.push({ x: p.x + r * Math.cos(t), y: p.y + r * Math.sin(t) });
    }
  }
  return "M" + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L") + "Z";
}

const center = (c: Candidate): Point => ({ x: (c.box.x0 + c.box.x1) / 2, y: (c.box.y0 + c.box.y1) / 2 });

/** Where a closest read measures a candidate to, as a point, or as a line
 *  when the position has one axis. */
function measuredMarks(g: Element, candidates: Candidate[], to: string, hull: Point[], radius: number) {
  const xs = hull.map((p) => p.x);
  const ys = hull.map((p) => p.y);
  const [left, bottom] = [Math.min(...xs), Math.max(...ys)];
  for (const c of candidates) {
    if (to === "outline") {
      for (const { box, round } of c.outline)
        g.appendChild(
          round
            ? el("circle", { cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2, r: (box.x1 - box.x0) / 2, stroke: MAGENTA, "stroke-width": 1, ...thin })
            : el("rect", { x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0, stroke: MAGENTA, "stroke-width": 1, ...thin })
        );
      continue;
    }
    const at = to === "center" ? center(c) : c.position;
    if (at.x !== undefined && at.y !== undefined) {
      g.appendChild(el("circle", { cx: at.x, cy: at.y, r: 2.2, fill: MAGENTA, stroke: "white", "stroke-width": 0.75 }));
      if (Number.isFinite(radius))
        g.appendChild(el("circle", { cx: at.x, cy: at.y, r: radius, stroke: MAGENTA, "stroke-width": 0.75, "stroke-dasharray": "2 3", opacity: 0.6, ...thin }));
    } else if (at.y !== undefined) {
      // Placed in y only: a tick on the axis the bars start from.
      g.appendChild(el("path", { d: `M${left} ${at.y}H${left + 7}`, stroke: MAGENTA, "stroke-width": 2, ...thin }));
    } else if (at.x !== undefined) {
      g.appendChild(el("path", { d: `M${at.x} ${bottom - 7}V${bottom}`, stroke: MAGENTA, "stroke-width": 2, ...thin }));
    }
  }
}

/** Dragology's `DistanceLine`: a dashed magenta line on a white halo,
 *  labeled with the gap. */
function distanceLine(g: Element, from: Point, to: Point, gap: number) {
  const line = { x1: from.x, y1: from.y, x2: to.x, y2: to.y, "vector-effect": "non-scaling-stroke" };
  g.appendChild(el("line", { ...line, stroke: "white", "stroke-width": 5, "stroke-linecap": "round" }));
  g.appendChild(el("line", { ...line, stroke: MAGENTA, "stroke-width": 1.5, "stroke-dasharray": "4 3" }));
  g.appendChild(el("circle", { cx: to.x, cy: to.y, r: 3.5, stroke: MAGENTA, "stroke-width": 1.5, ...thin }));
  const label = el("text", {
    x: (from.x + to.x) / 2 + (gap < 12 ? 10 : 0),
    y: (from.y + to.y) / 2 - (gap < 12 ? 8 : 0),
    fill: MAGENTA,
    stroke: "white",
    "stroke-width": 3,
    "paint-order": "stroke",
    "font-size": 11,
    "font-family": "ui-monospace, monospace",
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  label.textContent = Number.isFinite(gap) ? `${Math.round(gap)}px` : "∞";
  g.appendChild(label);
}

/* ------------------------------- the overlay ------------------------------- */

export type RegionsOverlay = {
  set(on: boolean): void;
  /** Recompute now, e.g. after the behavior was switched. */
  refresh(): void;
  /** For tests: recomputes so far; the last one's time in ms running the
   *  behavior (with the current focus, and the second pass without it) and
   *  from start to shown; whether a pass is running; the grid cell; the cells
   *  per pass; the current focus and pointer; and (`keyAt`) the key whose
   *  region holds a point (svg units). */
  stats(): {
    recomputes: number;
    ms: number;
    msWithout: number;
    msWall: number;
    pending: boolean;
    cell: number;
    cells: number;
    current: unknown;
    pointer: Point | undefined;
  };
  keyAt(x: number, y: number): unknown;
};

/**
 * Show the regions of the snap input mounted in `container`. Off by default.
 * The regions are recomputed when the drawn candidates, the current focus or
 * the behavior change, not on every pointer move; the pointer's line is
 * redrawn on every move.
 */
let overlays = 0;
export function regionsOverlay(container: HTMLElement, cell = 3): RegionsOverlay {
  let on = false;
  let layer: SVGGElement | undefined;
  let regionsG: SVGGElement | undefined;
  let liveG: SVGGElement | undefined;
  let signature = "";
  let version = 0;
  let recomputes = 0;
  let ms = 0;
  let msWithout = 0;
  let msWall = 0;
  let cells = 0;
  let jobs = 0;
  let pending = false;
  const maskId = `focus-regions-mask-${++overlays}`;
  let shown: { regions: Regions; candidates: Candidate[] } | undefined;
  let stop: (() => void) | undefined;
  // A re-render draws a new <svg>: put the layer into it. Mutations made by
  // the layer itself are skipped.
  const own = (r: MutationRecord) =>
    !!layer && (layer.contains(r.target) || [...r.addedNodes, ...r.removedNodes].includes(layer));
  const observer = new MutationObserver((records) => {
    if (!records.every(own)) draw();
  });

  function place(svg: SVGSVGElement) {
    if (!layer) {
      layer = el("g", { "data-focus-regions": "", "pointer-events": "none" }) as SVGGElement;
      regionsG = el("g", {}) as SVGGElement;
      liveG = el("g", {}) as SVGGElement;
      layer.append(regionsG, liveG);
    }
    // Above the chart, under the tooltip box: before the box's top-level element.
    let box: Element | null = svg.querySelector(`[stroke="${TOOLTIP_STROKE}"]`);
    while (box && box.parentNode !== svg) box = box.parentElement;
    if (box) {
      if (layer.nextSibling !== box || layer.parentNode !== svg) svg.insertBefore(layer, box);
    } else if (layer.parentNode !== svg || layer !== svg.lastElementChild) svg.appendChild(layer);
  }

  function draw() {
    if (!on) return;
    const f = inspect(container)?.frame();
    if (!f) return;
    const behavior = inspect(container)!.behavior();
    place(f.svg);
    const w = +(f.svg.getAttribute("width") ?? 0);
    const h = +(f.svg.getAttribute("height") ?? 0);
    const sig = [version, String(f.current?.key), w, h, f.candidates.length, ...f.candidates.map((c) => c.box.x0 + c.box.y0 + c.box.x1 + c.box.y1)].join("|");
    if (sig !== signature) {
      signature = sig;
      recomputes++;
      const job = ++jobs;
      const stale = () => job !== jobs || !on;
      pending = true;
      const t = performance.now();
      sampleRegions(behavior, f.candidates, f.current, w, h, cell, stale)
        .then((res) => {
          if (!res) return;
          ms = res.ms;
          msWall = performance.now() - t;
          paint(res.regions, f, behavior, w, h, stale);
        })
        .finally(() => {
          if (job === jobs) pending = false;
        });
    }
    // The live decision: from the pointer to the point the gap was measured to.
    liveG!.replaceChildren();
    const p = f.pointer;
    const r = f.result;
    const choice = r?.choice && f.candidates.find((c) => c.key === r.choice!.key);
    if (p && r && choice) distanceLine(liveG!, p, r.at ?? nearestInBox(p, choice.box), r.gap);
  }

  function paint(
    regions: Regions,
    f: NonNullable<ReturnType<Inspector["frame"]>>,
    behavior: FocusBehavior,
    w: number,
    h: number,
    stale: () => boolean
  ) {
      const hull = hullOf(f.candidates);
      const reads = readsOf(behavior);
      msWithout = 0;
      cells = regions.cols * regions.rows;
      shown = { regions, candidates: f.candidates };
      regionsG!.replaceChildren();
      const { fills, border } = regionPaths(regions);
      const tint = tintsFor(regions, f.candidates.length);
      const cur = f.current ? f.candidates.indexOf(f.current) : -1;
      // The tints stop at the marks, so the marks keep their colors (even a
      // faint tint turns blue bars gray); the borders still cross the marks.
      const mask = el("mask", { id: maskId, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: w, height: h });
      mask.appendChild(el("rect", { x: 0, y: 0, width: w, height: h, fill: "white" }));
      for (const c of f.candidates)
        for (const { box: b, round } of c.outline)
          mask.appendChild(
            round
              ? el("circle", { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, r: (b.x1 - b.x0) / 2, fill: "black" })
              : el("rect", { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, fill: "black" })
          );
      const tints = el("g", { mask: `url(#${maskId})` });
      for (const [l, d] of fills)
        tints.appendChild(el("path", { d: d.join(""), fill: TINTS[tint[l]], "fill-opacity": l === cur ? 0.5 : 0.25 }));
      regionsG!.append(mask, tints);
      regionsG!.appendChild(el("path", { d: border, stroke: INK, "stroke-width": 1, "stroke-opacity": 0.75, ...thin }));
      // The borders with no current focus, where they differ: a second pass,
      // run after the first is shown.
      if (f.current) {
        const slot = el("g", {});
        regionsG!.appendChild(slot);
        pending = true;
        sampleRegions(behavior, f.candidates, undefined, w, h, cell, stale)
          .then((res) => {
            if (!res) return;
            msWithout = res.ms;
            const d = regionPaths(res.regions, regions.labels).border;
            if (d) slot.appendChild(el("path", { d, stroke: INK, "stroke-width": 1, "stroke-dasharray": "3 2", ...thin }));
          })
          .finally(() => {
            if (!stale()) pending = false;
          });
      }
      // The geometry the behavior declares it reads.
      regionsG!.appendChild(el("path", { d: "M" + hull.map((p) => `${p.x} ${p.y}`).join("L") + "Z", stroke: MAGENTA, "stroke-width": 1.25, ...thin }));
      const closests = reads.filter((r) => r.kind === "closest");
      const geo = el("g", {});
      if (!closests.length) measuredMarks(geo, f.candidates, "position", hull, Infinity);
      for (const r of closests) measuredMarks(geo, f.candidates, r.to, hull, r.radius);
      for (const r of reads)
        if (r.kind === "within") {
          regionsG!.appendChild(el("path", { d: grown(hull, r.gap), stroke: MAGENTA, "stroke-width": 1, ...thin }));
          if (f.current) regionsG!.appendChild(el("path", { d: grown(hull, r.out), stroke: MAGENTA, "stroke-width": 1, "stroke-dasharray": "4 3", ...thin }));
        }
      regionsG!.appendChild(geo);
  }

  return {
    set(next) {
      if (next === on) return;
      on = next;
      if (on) {
        signature = "";
        stop = inspect(container)?.listen(draw);
        observer.observe(container, { childList: true, subtree: true });
        draw();
      } else {
        stop?.();
        observer.disconnect();
        layer?.remove();
        signature = "";
      }
    },
    refresh() {
      version++;
      draw();
    },
    stats: () => {
      const f = inspect(container)?.frame();
      return { recomputes, ms, msWithout, msWall, pending, cell, cells, current: f?.current?.key, pointer: f?.pointer };
    },
    keyAt(x, y) {
      if (!shown) return undefined;
      const { regions: g, candidates } = shown;
      const i = Math.floor(x / g.cell);
      const j = Math.floor(y / g.cell);
      if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return undefined;
      const l = g.labels[j * g.cols + i];
      return l >= 0 ? candidates[l].key : undefined;
    },
  };
}
