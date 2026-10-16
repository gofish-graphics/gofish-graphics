// Throwaway prototype for the labeling API proposal. NOT library code.
//
// It reads the geometry of a chart GoFish already rendered (circles, line and
// area paths, polygons) straight from the SVG, runs the proposed `Place.*`
// strategies and the shared greedy first-fit chooser on it, and appends the
// chosen labels to the same SVG. See NOTES.md for every approximation.

import { autoLabelColorForFill } from "../../../src/ast/labels/autoLabelColor";

export type Pt = [number, number];

export const FONT = "source-sans-pro, sans-serif"; // GoFish's label font

// ─── waiting for the chart ──────────────────────────────────────────────────

/** The stories' container, CSS-zoomed 2× so the captured PNG is crisp for
 *  the design review. Zoom does not change SVG user units or text metrics. */
export function zoomed(container: HTMLElement, zoom = 2) {
  container.style.zoom = String(zoom);
  return container;
}

/** Run `fn` once the chart rendered into `container` has painted. */
export function afterPaint(
  container: HTMLElement,
  fn: (svg: SVGSVGElement) => void,
  ready: (svg: SVGSVGElement) => boolean = (s) => s.childElementCount > 0
) {
  let tries = 0;
  const tick = () => {
    const svgs = container.querySelectorAll("svg");
    const svg = svgs[svgs.length - 1] as SVGSVGElement | undefined;
    if (svg && ready(svg)) {
      try {
        fn(svg);
      } catch (e) {
        console.error("label prototype failed", e);
      }
      return;
    }
    if (tries++ < 60) requestAnimationFrame(tick);
    else console.error("label prototype: chart never painted");
  };
  requestAnimationFrame(tick);
}

// ─── reading geometry ───────────────────────────────────────────────────────

function toRoot(el: SVGGraphicsElement, p: Pt): Pt {
  const m = el.getCTM();
  if (!m) return p;
  return [m.a * p[0] + m.c * p[1] + m.e, m.b * p[0] + m.d * p[1] + m.f];
}

export type CircleGeom = { cx: number; cy: number; r: number; fill: string };

/** Every circle (an ellipse with rx == ry) in document order. */
export function readCircles(svg: SVGSVGElement): CircleGeom[] {
  return [...svg.querySelectorAll("ellipse, circle")]
    .map((el) => {
      const e = el as SVGEllipseElement;
      const rx = +(e.getAttribute("rx") ?? e.getAttribute("r") ?? 0);
      const ry = +(e.getAttribute("ry") ?? e.getAttribute("r") ?? 0);
      const [cx, cy] = toRoot(e, [
        +(e.getAttribute("cx") ?? 0),
        +(e.getAttribute("cy") ?? 0),
      ]);
      return { cx, cy, r: Math.max(rx, ry), fill: e.getAttribute("fill") ?? "", rx, ry };
    })
    .filter((c) => c.r > 0 && Math.abs(c.rx - c.ry) < 0.01)
    .map(({ cx, cy, r, fill }) => ({ cx, cy, r, fill }));
}

export type PathGeom = {
  pts: Pt[]; // sampled outline, root coords
  stroke: string;
  fill: string;
  el: SVGGeometryElement;
};

/** Sample a path every `step` px of arc length (exact, via the SVG API). */
export function samplePath(el: SVGGeometryElement, step = 2): Pt[] {
  const L = el.getTotalLength();
  const n = Math.max(2, Math.ceil(L / step));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const p = el.getPointAtLength((L * i) / n);
    out.push(toRoot(el as any, [p.x, p.y]));
  }
  return out;
}

/** Every <path>/<polygon>/<polyline> matching `pred`, in document order. */
export function readPaths(
  svg: SVGSVGElement,
  pred: (el: Element) => boolean,
  step = 2
): PathGeom[] {
  return [...svg.querySelectorAll("path, polygon, polyline")]
    .filter(pred)
    .map((el) => ({
      pts: samplePath(el as SVGGeometryElement, step),
      stroke: el.getAttribute("stroke") ?? "",
      fill: el.getAttribute("fill") ?? "",
      el: el as SVGGeometryElement,
    }));
}

// ─── text ───────────────────────────────────────────────────────────────────

export type TextStyle = {
  fontSize?: number;
  fontWeight?: string | number;
  fill?: string;
  halo?: boolean; // white outline behind the glyphs
  background?: string; // filled box behind the text (TikZ `fill=white`)
};

/** The real rendered size of `text` in GoFish's label font. */
export function measure(
  svg: SVGSVGElement,
  text: string,
  style: TextStyle = {}
): { w: number; h: number } {
  const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
  t.setAttribute("font-family", FONT);
  t.setAttribute("font-size", String(style.fontSize ?? 11));
  if (style.fontWeight) t.setAttribute("font-weight", String(style.fontWeight));
  t.textContent = text;
  svg.appendChild(t);
  const b = t.getBBox();
  svg.removeChild(t);
  // getBBox height is the font's line box; trim to the visible cap+descender
  // band the way a layout engine would (ascent+descent ≈ 1.0em for this font).
  return { w: b.width, h: (style.fontSize ?? 11) * 1.0 };
}

/** A placed label: center point + rotation (deg) + size. */
export type Placed = {
  text: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
  style: TextStyle;
};

export function draw(svg: SVGSVGElement, labels: (Placed | null)[]) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "proposal-labels");
  svg.style.overflow = "visible"; // labels may sit outside the plot box
  for (const l of labels) {
    if (!l) continue;
    if (l.style.background) {
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", String(-l.w / 2 - 2));
      r.setAttribute("y", String(-l.h / 2 - 1));
      r.setAttribute("width", String(l.w + 4));
      r.setAttribute("height", String(l.h + 2));
      r.setAttribute("rx", "2");
      r.setAttribute("fill", l.style.background);
      r.setAttribute("transform", `translate(${l.cx},${l.cy}) rotate(${l.angle})`);
      g.appendChild(r);
    }
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", "0");
    t.setAttribute("y", "0");
    t.setAttribute(
      "transform",
      `translate(${l.cx},${l.cy}) rotate(${l.angle})`
    );
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "central");
    t.setAttribute("font-family", FONT);
    t.setAttribute("font-size", String(l.style.fontSize ?? 11));
    if (l.style.fontWeight)
      t.setAttribute("font-weight", String(l.style.fontWeight));
    t.setAttribute("fill", l.style.fill ?? "#333333");
    if (l.style.halo) {
      t.setAttribute("stroke", "white");
      t.setAttribute("stroke-width", "3");
      t.setAttribute("stroke-linejoin", "round");
      t.setAttribute("paint-order", "stroke");
    }
    t.textContent = l.text;
    g.appendChild(t);
  }
  svg.appendChild(g);
}

export const outsideColor = (fill: string | null) =>
  autoLabelColorForFill(fill, false);
export const insideColor = (fill: string | null) =>
  autoLabelColorForFill(fill, true);

// ─── collision geometry ─────────────────────────────────────────────────────

/** Corners of a label's (possibly rotated) rectangle, padded by `pad`. */
export function corners(l: Placed, pad = 1): Pt[] {
  const a = (l.angle * Math.PI) / 180;
  const c = Math.cos(a),
    s = Math.sin(a);
  const hw = l.w / 2 + pad,
    hh = l.h / 2 + pad;
  return (
    [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as Pt[]
  ).map(([x, y]) => [l.cx + x * c - y * s, l.cy + x * s + y * c]);
}

function project(poly: Pt[], ax: Pt): [number, number] {
  let lo = Infinity,
    hi = -Infinity;
  for (const p of poly) {
    const d = p[0] * ax[0] + p[1] * ax[1];
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [lo, hi];
}

/** Separating-axis test between two convex polygons. */
function convexOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length];
      const ax: Pt = [q[1] - p[1], p[0] - q[0]];
      const [a0, a1] = project(a, ax);
      const [b0, b1] = project(b, ax);
      if (a1 <= b0 || b1 <= a0) return false;
    }
  }
  return true;
}

function segOverlapsConvex(p: Pt, q: Pt, poly: Pt[]) {
  return convexOverlap(poly, [p, q]);
}

/** Obstacles the chooser must keep labels off. */
export type Obstacle =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "polyline"; pts: Pt[] }
  | { kind: "label"; poly: Pt[] };

export function hits(poly: Pt[], o: Obstacle): boolean {
  if (o.kind === "label") return convexOverlap(poly, o.poly);
  if (o.kind === "circle") {
    // circle approximated by its 12-gon
    const ring: Pt[] = [];
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * 2 * Math.PI;
      ring.push([o.cx + o.r * Math.cos(t), o.cy + o.r * Math.sin(t)]);
    }
    return convexOverlap(poly, ring);
  }
  const xs = poly.map((p) => p[0]),
    ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  const pts = o.pts;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i],
      q = pts[i + 1];
    if (
      Math.max(p[0], q[0]) < x0 ||
      Math.min(p[0], q[0]) > x1 ||
      Math.max(p[1], q[1]) < y0 ||
      Math.min(p[1], q[1]) > y1
    )
      continue;
    if (segOverlapsConvex(p, q, poly)) return true;
  }
  return false;
}

// ─── the shared chooser ─────────────────────────────────────────────────────

/** One label request: its ranked candidates and the obstacles it must avoid
 *  beyond the shared ones (e.g. every OTHER labeled mark). */
export type Request = {
  candidates: Placed[];
  ownObstacles?: Obstacle[];
};

/**
 * Greedy first-fit (vega-label's scheme): labels are taken in order; each
 * takes its first candidate that stays inside `bounds` and hits neither an
 * already-placed label nor an obstacle. A label with no free candidate is
 * hidden (null).
 */
export function chooseFirstFit(
  reqs: Request[],
  shared: Obstacle[],
  bounds?: { x0: number; y0: number; x1: number; y1: number }
): (Placed | null)[] {
  const placed: Obstacle[] = [];
  return reqs.map((r) => {
    for (const c of r.candidates) {
      const poly = corners(c, 1);
      if (
        bounds &&
        poly.some(
          ([x, y]) =>
            x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1
        )
      )
        continue;
      if (placed.some((o) => hits(poly, o))) continue;
      if (shared.some((o) => hits(poly, o))) continue;
      if (r.ownObstacles?.some((o) => hits(poly, o))) continue;
      placed.push({ kind: "label", poly });
      return c;
    }
    return null;
  });
}

// ─── strategies: each turns geometry into ranked candidates ─────────────────

/** Place.around(): 8 compass candidates outside the circle, Imhof order. */
export function around(
  c: CircleGeom,
  text: string,
  size: { w: number; h: number },
  style: TextStyle,
  offset = 3
): Placed[] {
  const R = c.r + offset;
  const d = R * Math.SQRT1_2;
  const { w, h } = size;
  // [dx, dy] of the label CENTER relative to the circle center
  const order: [number, number][] = [
    [d + w / 2, -d - h / 2], // upper-right
    [-d - w / 2, -d - h / 2], // upper-left
    [d + w / 2, d + h / 2], // lower-right
    [-d - w / 2, d + h / 2], // lower-left
    [R + w / 2, 0], // right
    [-R - w / 2, 0], // left
    [0, -R - h / 2], // top
    [0, R + h / 2], // bottom
  ];
  return order.map(([dx, dy]) => ({
    text,
    cx: c.cx + dx,
    cy: c.cy + dy,
    w,
    h,
    angle: 0,
    style,
  }));
}

/** Place.box("outset-top"): one candidate, centered above the mark's box. */
export function boxOutsetTop(
  c: CircleGeom,
  text: string,
  size: { w: number; h: number },
  style: TextStyle,
  offset = 6
): Placed[] {
  return [
    {
      text,
      cx: c.cx,
      cy: c.cy - c.r - offset - size.h / 2,
      ...size,
      angle: 0,
      style,
    },
  ];
}

/**
 * Place.end() / Place.start() for a set of lines: label at the last (first)
 * point, to the right (left), then slid vertically apart so no two overlap
 * (cluster-merge dodge, as in directlabels' last.qp).
 */
export function endLabels(
  lines: { pts: Pt[]; text: string; style: TextStyle; size: { w: number; h: number } }[],
  which: "end" | "start",
  gap = 5,
  pad = 1
): Placed[] {
  const items = lines.map((l) => {
    const p = which === "end" ? lineEnd(l.pts, "end") : lineEnd(l.pts, "start");
    const sign = which === "end" ? 1 : -1;
    return {
      text: l.text,
      style: l.style,
      w: l.size.w,
      h: l.size.h,
      cx: p[0] + sign * (gap + l.size.w / 2),
      want: p[1],
      cy: p[1],
      angle: 0,
    };
  });
  // 1-D dodge: sort by wanted y, merge overlapping runs, center each run on
  // the mean wanted y, repeat until stable.
  const sorted = [...items].sort((a, b) => a.want - b.want);
  type Run = { members: typeof sorted; top: number };
  let runs: Run[] = sorted.map((m) => ({ members: [m], top: m.want - m.h / 2 - pad }));
  const height = (r: Run) => r.members.reduce((s, m) => s + m.h + 2 * pad, 0);
  const recenter = (r: Run) => {
    // center the stack on the mean wanted center
    let acc = 0;
    const offs = r.members.map((m) => {
      const o = acc + pad + m.h / 2;
      acc += m.h + 2 * pad;
      return o;
    });
    const mean =
      r.members.reduce((s, m, i) => s + (m.want - offs[i]), 0) / r.members.length;
    r.top = mean;
  };
  let changed = true;
  while (changed) {
    changed = false;
    runs.forEach(recenter);
    for (let i = 0; i + 1 < runs.length; i++) {
      if (runs[i].top + height(runs[i]) > runs[i + 1].top) {
        runs[i] = { members: [...runs[i].members, ...runs[i + 1].members], top: 0 };
        runs.splice(i + 1, 1);
        changed = true;
        break;
      }
    }
  }
  for (const r of runs) {
    let y = r.top;
    for (const m of r.members) {
      m.cy = y + pad + m.h / 2;
      y += m.h + 2 * pad;
    }
  }
  return items.map(({ want, ...rest }) => rest);
}

function lineEnd(pts: Pt[], which: "start" | "end"): Pt {
  // the end that is rightmost (end) / leftmost (start) in x
  const a = pts[0],
    b = pts[pts.length - 1];
  if (which === "end") return a[0] > b[0] ? a : b;
  return a[0] > b[0] ? b : a;
}

/** Point and tangent angle (deg) at fraction `t` of a polyline's length. */
export function pointAt(pts: Pt[], t: number): { p: Pt; angle: number } {
  const seg: number[] = [];
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    seg.push(d);
    L += d;
  }
  let target = Math.min(Math.max(t, 0), 1) * L;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const u = seg[i] === 0 ? 0 : target / seg[i];
      const a = pts[i],
        b = pts[i + 1];
      // tangent: average over a short window for smoothness
      const j0 = Math.max(0, i - 3),
        j1 = Math.min(pts.length - 1, i + 4);
      let ang =
        (Math.atan2(pts[j1][1] - pts[j0][1], pts[j1][0] - pts[j0][0]) * 180) /
        Math.PI;
      if (ang > 90) ang -= 180; // keep text upright
      if (ang <= -90) ang += 180;
      return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], angle: ang };
    }
    target -= seg[i];
  }
  return { p: pts[pts.length - 1], angle: 0 };
}

/** Cumulative arc length of a polyline. */
function cumulative(pts: Pt[]): number[] {
  const c = [0];
  for (let i = 0; i + 1 < pts.length; i++)
    c.push(c[i] + Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
  return c;
}

/** Point at arc length `s` (clamped). */
function atLength(pts: Pt[], cum: number[], s: number): Pt {
  s = Math.min(Math.max(s, 0), cum[cum.length - 1]);
  let i = 0;
  while (i + 2 < cum.length && cum[i + 1] < s) i++;
  const seg = cum[i + 1] - cum[i];
  const u = seg === 0 ? 0 : (s - cum[i]) / seg;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
}

/**
 * Place.along({ at, sloped }): candidates on the line at fraction `at` of its
 * arc length, then at fractions stepping away from it (at±0.03, ±0.06, …), so
 * a label that would collide slides along its own line.
 *
 * Sloped labels take the angle of the CHORD the label spans (arc length
 * s ± w/2), not the point tangent, so a wiggly line does not spin the text;
 * a candidate where the line bends away from that chord by more than 0.3×
 * the text height is skipped (the text would not sit on the line).
 */
export function along(
  pts: Pt[],
  text: string,
  size: { w: number; h: number },
  style: TextStyle,
  at = 0.5,
  sloped = true,
  steps = 14,
  stepSize = 0.03,
  measureBy: "length" | "x" = "length"
): Placed[] {
  const cum = cumulative(pts);
  const L = cum[cum.length - 1];
  const ts = [at];
  for (let k = 1; k <= steps; k++) ts.push(at + k * stepSize, at - k * stepSize);
  const xs = pts.map((p) => p[0]);
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs);
  // fraction -> arc length: by arc length (TikZ `pos`), or by x extent
  const sOf = (t: number) => {
    if (measureBy === "length") return t * L;
    const X = xmin + t * (xmax - xmin);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, x1] = [pts[i][0], pts[i + 1][0]];
      if ((x0 <= X && X <= x1) || (x1 <= X && X <= x0)) {
        const u = x1 === x0 ? 0 : (X - x0) / (x1 - x0);
        return cum[i] + u * (cum[i + 1] - cum[i]);
      }
    }
    return t * L;
  };
  const out: Placed[] = [];
  for (const t of ts) {
    const s = sOf(t);
    if (s - size.w / 2 < 0 || s + size.w / 2 > L) continue;
    const p = atLength(pts, cum, s);
    if (!sloped) {
      out.push({ text, cx: p[0], cy: p[1], ...size, angle: 0, style });
      continue;
    }
    const a = atLength(pts, cum, s - size.w / 2);
    const b = atLength(pts, cum, s + size.w / 2);
    let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (ang > 90) ang -= 180; // keep text upright
    if (ang <= -90) ang += 180;
    // how far does the line stray from the chord inside the label's span?
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let dev = 0;
    for (let i = 0; i < pts.length; i++) {
      if (cum[i] < s - size.w / 2 || cum[i] > s + size.w / 2) continue;
      const q = pts[i];
      dev = Math.max(
        dev,
        Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / len
      );
    }
    if (dev > size.h * 0.3) continue;
    // center the text on the chord's midpoint so it straddles the line
    out.push({ text, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, ...size, angle: ang, style });
  }
  return out;
}

// ─── area interior: band thickness (d3-area-label style) ────────────────────

/** Vertical extent [top, bottom] of a closed polygon at x (largest run). */
function verticalRun(poly: Pt[], x: number): [number, number] | null {
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)) {
      ys.push(a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]));
    }
  }
  ys.sort((p, q) => p - q);
  let best: [number, number] | null = null;
  for (let i = 0; i + 1 < ys.length; i += 2) {
    if (!best || ys[i + 1] - ys[i] > best[1] - best[0]) best = [ys[i], ys[i + 1]];
  }
  return best;
}

/**
 * Place.interior() on a band: slide a w×h window across x; at each x the
 * room is the intersection of the band's vertical runs over the window. Take
 * the x with the most room; null (hidden) if the label does not fit.
 */
export function bandInterior(
  poly: Pt[],
  text: string,
  size: { w: number; h: number },
  style: TextStyle,
  pad = 3
): Placed | null {
  const xs = poly.map((p) => p[0]);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs);
  const w = size.w + 2 * pad,
    h = size.h + 2 * pad;
  let best: { cx: number; cy: number; room: number } | null = null;
  for (let left = x0 + 1; left + w <= x1 - 1; left += 2) {
    let top = -Infinity,
      bot = Infinity,
      ok = true;
    for (let x = left; x <= left + w; x += 2) {
      const r = verticalRun(poly, x);
      if (!r) {
        ok = false;
        break;
      }
      top = Math.max(top, r[0]);
      bot = Math.min(bot, r[1]);
    }
    if (!ok) continue;
    const room = bot - top;
    if (!best || room > best.room)
      best = { cx: left + w / 2, cy: (top + bot) / 2, room };
  }
  if (!best || best.room < h) return null;
  return { text, cx: best.cx, cy: best.cy, ...size, angle: 0, style };
}

// ─── area interior: polylabel (pole of inaccessibility) ─────────────────────

function pointInPoly(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

function segDist2(p: Pt, a: Pt, b: Pt) {
  let x = a[0],
    y = a[1];
  let dx = b[0] - x,
    dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

/** Signed distance from p to the polygon outline (+ inside). */
function signedDist(p: Pt, poly: Pt[]) {
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    m = Math.min(m, segDist2(p, poly[i], poly[j]));
  return (pointInPoly(p, poly) ? 1 : -1) * Math.sqrt(m);
}

/** Mapbox polylabel (grid + best-first refinement), single ring. */
export function polylabel(poly: Pt[], precision = 0.5): { p: Pt; d: number } {
  const xs = poly.map((p) => p[0]),
    ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs),
    minY = Math.min(...ys),
    maxX = Math.max(...xs),
    maxY = Math.max(...ys);
  const cell = Math.min(maxX - minX, maxY - minY);
  type Cell = { x: number; y: number; h: number; d: number; max: number };
  const mk = (x: number, y: number, h: number): Cell => {
    const d = signedDist([x, y], poly);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const queue: Cell[] = [];
  let h = cell / 2;
  for (let x = minX; x < maxX; x += cell)
    for (let y = minY; y < maxY; y += cell) queue.push(mk(x + h, y + h, h));
  let best = mk((minX + maxX) / 2, (minY + maxY) / 2, 0);
  while (queue.length) {
    queue.sort((a, b) => b.max - a.max);
    const c = queue.shift()!;
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h / 2;
    queue.push(mk(c.x - h, c.y - h, h), mk(c.x + h, c.y - h, h));
    queue.push(mk(c.x - h, c.y + h, h), mk(c.x + h, c.y + h, h));
  }
  return { p: [best.x, best.y], d: best.d };
}

/** Does the label's rectangle lie entirely inside the polygon? */
export function fitsInside(l: Placed, poly: Pt[]) {
  const c = corners(l, 1);
  if (!c.every((p) => pointInPoly(p, poly))) return false;
  return !hits(c, { kind: "polyline", pts: [...poly, poly[0]] });
}

export function polyInterior(
  poly: Pt[],
  text: string,
  size: { w: number; h: number },
  style: TextStyle
): Placed | null {
  const { p } = polylabel(poly);
  const l: Placed = { text, cx: p[0], cy: p[1], ...size, angle: 0, style };
  return fitsInside(l, poly) ? l : null;
}

/**
 * Box-aware interior (variant): the point where the label's own rectangle can
 * grow largest and still lie inside the polygon. polylabel maximizes an
 * inscribed CIRCLE, which lands in the corner of an L; a wide text box wants
 * the middle of an arm. Grid search + per-point binary search on the scale.
 */
export function boxInterior(
  poly: Pt[],
  text: string,
  size: { w: number; h: number },
  style: TextStyle,
  pad = 4,
  step = 3
): Placed | null {
  const xs = poly.map((p) => p[0]),
    ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const ring = [...poly, poly[0]];
  const fits = (cx: number, cy: number, s: number) => {
    const l: Placed = { text, cx, cy, w: (size.w + 2 * pad) * s, h: (size.h + 2 * pad) * s, angle: 0, style };
    const c = corners(l, 0);
    return c.every((p) => pointInPoly(p, poly)) && !hits(c, { kind: "polyline", pts: ring });
  };
  let best = { cx: 0, cy: 0, s: 0 };
  for (let cx = x0 + step / 2; cx < x1; cx += step)
    for (let cy = y0 + step / 2; cy < y1; cy += step) {
      if (!pointInPoly([cx, cy], poly)) continue;
      if (!fits(cx, cy, best.s + 0.01)) continue; // cannot beat the best
      let lo = best.s,
        hi = 20;
      for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) / 2;
        if (fits(cx, cy, mid)) lo = mid;
        else hi = mid;
      }
      best = { cx, cy, s: lo };
    }
  if (best.s < 1) return null; // the label does not fit at its own size
  return { text, cx: best.cx, cy: best.cy, ...size, angle: 0, style };
}
