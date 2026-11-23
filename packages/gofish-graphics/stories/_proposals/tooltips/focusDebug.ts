/**
 * PROTOTYPE(#1395): "Show regions", a debugging overlay for focus behaviors,
 * after Dragology's overlay visualizer.
 *
 * The regions are found by RUNNING THE BEHAVIOR at every cell of a grid over
 * the chart, with the real candidates and the real current focus. So they are
 * right for every behavior, a plain user function included, with no geometry
 * re-derived per behavior. On top, it draws what the behavior declares it
 * reads (`reads` in focus.ts): each mark's reach (`.within`), the current
 * focus's longer reach, the measured points, and the pointer's line to the
 * point it was measured to.
 *
 * This file needs only the behavior, the candidates, the current focus and
 * the pointer, which `inspect` in focusRuntime.ts hands over. With
 * `pointer().snap` public, it would be a user-space tool. The one DOM detail
 * it knows is where to put its layer: in the chart's `<svg>`, under the
 * tooltip box.
 */
import {
  measuredPoint,
  nearestOnOutline,
  readsOf,
  type Candidate,
  type FocusBehavior,
  type Outline,
  type Point,
} from "./focus";
import { inspect, type Inspector } from "./focusRuntime";
import { TOOLTIP_STROKE } from "./helpers";

const SVG = "http://www.w3.org/2000/svg";
/** Dragology's overlay color. */
const MAGENTA = "#d100d1";
/** Region tints, fixed light-theme colors: the frame stays white. No blue
 *  (the bars) and no magenta (the geometry). */
const TINTS = ["#f59f00", "#0ca678", "#7048e8", "#f76707", "#74b816"];
const INK = "#1f2937";

/** Every candidate a behavior can choose: the marks, and a line's points
 *  after them, so a snap's regions are the rows'. */
const choosable = (candidates: Candidate[]) => [...candidates, ...candidates.flatMap((c) => c.points ?? [])];

/* ------------------------------- sampling -------------------------------- */

export type Regions = {
  cell: number;
  cols: number;
  rows: number;
  /** Per cell, the index of the chosen candidate (`choosable`), or -1. */
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
  const index = new Map(choosable(candidates).map((c, i) => [c, i]));
  let ms = 0;
  let j = 0;
  while (j < rows) {
    const t = performance.now();
    for (; j < rows && performance.now() - t < budget; j++)
      for (let i = 0; i < cols; i++) {
        const pointer = { x: (i + 0.5) * cell, y: (j + 0.5) * cell };
        const choice = behavior({ pointer, candidates, current, clicked: true });
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
  const differs = (a: number, b: number) => labels[a] !== labels[b] && !(except && except[a] !== except[b]);
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

/**
 * The parts of an outline as SVG shapes, each painted with `paint` and
 * stroked `grow` px wide on each side with round joins: drawn so, a shape
 * covers exactly the points within `grow` px of the part (a box becomes a
 * rounded box, a segment a capsule).
 */
function parts(g: Element, outline: Outline, paint: string, grow: number) {
  const stroke = { stroke: paint, "stroke-width": 2 * grow, "stroke-linejoin": "round", "stroke-linecap": "round" };
  const solid = grow > 0 ? stroke : { stroke: "none" };
  for (const { box: b, round, segment, region } of outline) {
    if (segment)
      g.appendChild(el("path", { d: `M${segment[0].x} ${segment[0].y}L${segment[1].x} ${segment[1].y}`, fill: "none", ...stroke, "stroke-width": Math.max(2 * grow, 2) }));
    else if (region)
      g.appendChild(el("path", { d: "M" + region.map(([a]) => `${a.x} ${a.y}`).join("L") + "Z", fill: paint, ...solid }));
    else if (round) g.appendChild(el("circle", { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, r: (b.x1 - b.x0) / 2, fill: paint, ...solid }));
    else g.appendChild(el("rect", { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, fill: paint, ...solid }));
  }
}

/**
 * The edge of a candidate's reach, the points `reach` px from its outline,
 * as a 1.2 px ring: the outline grown by `reach` plus half the ring, less
 * the outline grown by `reach` less half, as a mask over a magenta rect.
 * `dashed` paints the ring through a checker pattern.
 */
function reachRing(defs: Element, g: Element, id: string, c: Candidate, reach: number, w: number, h: number, dashed: boolean) {
  const mask = el("mask", { id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: w, height: h });
  const outer = el("g", {});
  const inner = el("g", {});
  parts(outer, c.outline, "white", reach + 0.6);
  parts(inner, c.outline, "black", Math.max(0, reach - 0.6));
  mask.append(outer, inner);
  defs.appendChild(mask);
  g.appendChild(
    el("rect", { x: 0, y: 0, width: w, height: h, fill: dashed ? `url(#${id}-dash)` : MAGENTA, "fill-opacity": dashed ? 1 : 0.7, mask: `url(#${id})` })
  );
  if (dashed) {
    const pattern = el("pattern", { id: `${id}-dash`, patternUnits: "userSpaceOnUse", width: 8, height: 8 });
    pattern.append(el("rect", { x: 0, y: 0, width: 4, height: 4, fill: MAGENTA }), el("rect", { x: 4, y: 4, width: 4, height: 4, fill: MAGENTA }));
    defs.appendChild(pattern);
  }
}

const center = (c: Candidate): Point => ({ x: (c.box.x0 + c.box.x1) / 2, y: (c.box.y0 + c.box.y1) / 2 });

/** Where a closest read measures a candidate to: a point, or a tick when the
 *  position has one axis, or the outline. A mark with no position (a line)
 *  is measured to its outline, which its reach ring already shows. */
function measuredMarks(g: Element, candidates: Candidate[], to: string, radius: number) {
  const left = Math.min(...candidates.map((c) => c.box.x0));
  const bottom = Math.max(...candidates.map((c) => c.box.y1));
  for (const c of candidates) {
    if (to === "outline") {
      const lines = el("g", {});
      parts(lines, c.outline, "none", 0);
      for (const e of lines.children) {
        e.setAttribute("fill", "none");
        e.setAttribute("stroke", MAGENTA);
        e.setAttribute("stroke-width", "1");
        e.setAttribute("vector-effect", "non-scaling-stroke");
      }
      g.appendChild(lines);
      continue;
    }
    const at = to === "center" ? center(c) : c.position;
    if (at.x !== undefined && at.y !== undefined) {
      g.appendChild(el("circle", { cx: at.x, cy: at.y, r: 2.2, fill: MAGENTA, stroke: "white", "stroke-width": 0.75 }));
      if (Number.isFinite(radius))
        g.appendChild(el("circle", { cx: at.x, cy: at.y, r: radius, stroke: MAGENTA, "stroke-width": 0.75, "stroke-dasharray": "2 3", opacity: 0.6, ...thin }));
    } else if (at.y !== undefined) {
      // Placed in y only: a tick on the axis the bars start from.
      g.appendChild(el("path", { d: `M${left} ${at.y}h7`, stroke: MAGENTA, "stroke-width": 2, ...thin }));
    } else if (at.x !== undefined) {
      g.appendChild(el("path", { d: `M${at.x} ${bottom - 7}V${bottom}`, stroke: MAGENTA, "stroke-width": 2, ...thin }));
    }
  }
}

/** Dragology's `DistanceLine`: a dashed magenta line on a white halo,
 *  labeled with the distance. */
function distanceLine(g: Element, from: Point, to: Point) {
  const gap = Math.hypot(to.x - from.x, to.y - from.y);
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
  label.textContent = `${Math.round(gap)}px`;
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
  const ids = `focus-regions-${++overlays}`;
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
    // The live decision: from the pointer to the point the choice was
    // measured to (the pointer itself inside it).
    liveG!.replaceChildren();
    const p = f.pointer;
    const choice = f.choice && choosable(f.candidates).find((c) => c.key === f.choice!.key);
    if (p && choice) {
      const close = readsOf(behavior).find((r) => r.kind === "closest");
      const { at, d } = nearestOnOutline(p, choice.outline);
      distanceLine(liveG!, p, d === 0 ? p : close?.kind === "closest" ? measuredPoint(p, choice, close.to) : at);
    }
  }

  function paint(
    regions: Regions,
    f: NonNullable<ReturnType<Inspector["frame"]>>,
    behavior: FocusBehavior,
    w: number,
    h: number,
    stale: () => boolean
  ) {
    const reads = readsOf(behavior);
    const all = choosable(f.candidates);
    msWithout = 0;
    cells = regions.cols * regions.rows;
    shown = { regions, candidates: all };
    regionsG!.replaceChildren();
    const defs = el("defs", {});
    regionsG!.appendChild(defs);
    const { fills, border } = regionPaths(regions);
    const tint = tintsFor(regions, all.length);
    const cur = f.current ? all.findIndex((c) => c.key === f.current!.key) : -1;
    // The tints stop at the marks, so the marks keep their colors (even a
    // faint tint turns blue bars gray); the borders still cross the marks.
    const mask = el("mask", { id: `${ids}-marks`, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: w, height: h });
    mask.appendChild(el("rect", { x: 0, y: 0, width: w, height: h, fill: "white" }));
    for (const c of f.candidates) parts(mask, c.outline, "black", c.outline.some((o) => o.segment) ? 1 : 0);
    defs.appendChild(mask);
    const tints = el("g", { mask: `url(#${ids}-marks)` });
    for (const [l, d] of fills)
      tints.appendChild(el("path", { d: d.join(""), fill: TINTS[tint[l]], "fill-opacity": l === cur ? 0.5 : 0.25 }));
    regionsG!.appendChild(tints);
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
    // The geometry the behavior declares it reads: each mark's reach, and
    // the current focus's longer one dashed (a line's, for a row).
    const current = f.current && f.candidates.find((c) => c.key === f.current!.key || c.points?.some((q) => q.key === f.current!.key));
    for (const r of reads)
      if (r.kind === "within")
        f.candidates.forEach((c, i) => {
          if (c === current) reachRing(defs, regionsG!, `${ids}-reach-${i}`, c, r.out, w, h, true);
          else reachRing(defs, regionsG!, `${ids}-reach-${i}`, c, r.reach, w, h, false);
        });
    const geo = el("g", {});
    const closests = reads.filter((r) => r.kind === "closest");
    for (const r of closests) measuredMarks(geo, f.candidates, r.to, r.radius);
    // A snap's points, measured to their own positions.
    if (reads.some((r) => r.kind === "snap")) measuredMarks(geo, f.candidates.flatMap((c) => c.points ?? []), "position", Infinity);
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
