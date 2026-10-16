// Throwaway prototype for the labeling API proposal, part 2: which SIDE of a
// path a label goes on, and labels on the BOUNDARY of a region. NOT library
// code. Builds on place.ts (geometry readers, text measuring, collisions).
//
//   Place.along({ at, side, orient, offset })
//     at:     fraction of arc length 0..1 | "start" | "middle" | "end"
//             (on a boundary: a named part, "top", "top-right", ...)
//     side:   screen frame "above" | "below" | "on"
//             path frame   "left" | "right"   (of the direction of travel)
//             boundary     "inset" | "outset" | "on"
//             a list = candidates in order
//     orient: "horizontal" | "sloped" | "curved"
//
// See NOTES.md, section "Sides and boundaries", for the approximations.

import {
  FONT,
  corners,
  hits,
  type Obstacle,
  type Pt,
  type TextStyle,
} from "./place";

export type Side = "above" | "below" | "on" | "left" | "right" | "inset" | "outset";
export type Orient = "horizontal" | "sloped" | "curved";
export type At = number | "start" | "middle" | "end";

/** Most a curved label's path may turn under the text, in degrees. */
export const MAX_TURN = 70;

/** A placed label. A curved label also carries the polyline its glyphs
 *  follow, in reading order, and is drawn with an SVG textPath. */
export type Label = {
  text: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
  style: TextStyle;
  curve?: Pt[];
  /** for the figures: which side this candidate came from */
  side?: Side;
};

// ─── polyline helpers ───────────────────────────────────────────────────────

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
/** Left of the direction of travel, on screen (y points down). */
const leftOf = (u: Pt): Pt => [u[1], -u[0]];

export function cumulative(pts: Pt[]): number[] {
  const c = [0];
  for (let i = 0; i + 1 < pts.length; i++) c.push(c[i] + len(sub(pts[i + 1], pts[i])));
  return c;
}

export function atLength(pts: Pt[], cum: number[], s: number): Pt {
  s = Math.min(Math.max(s, 0), cum[cum.length - 1]);
  let i = 0;
  while (i + 2 < cum.length && cum[i + 1] < s) i++;
  const seg = cum[i + 1] - cum[i];
  const u = seg === 0 ? 0 : (s - cum[i]) / seg;
  return add(pts[i], mul(sub(pts[i + 1], pts[i]), u));
}

/** Smoothed tangent at arc length s (chord over ±win px). */
function tangentAt(pts: Pt[], cum: number[], s: number, win = 3): Pt {
  return unit(sub(atLength(pts, cum, s + win), atLength(pts, cum, s - win)));
}

/** Signed area on screen; > 0 means the ring runs clockwise as seen. */
export function signedArea(ring: Pt[]) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Drop a duplicated closing point. */
export function openRing(ring: Pt[]): Pt[] {
  const a = ring[0],
    b = ring[ring.length - 1];
  return len(sub(a, b)) < 0.5 ? ring.slice(0, -1) : ring;
}

// ─── the side rule ──────────────────────────────────────────────────────────

/**
 * The unit normal a label moves along, given the direction of travel `u`
 * at the label. `outsideIsLeft` is known only for a closed path.
 * Returns null when the side is undefined there ("above" on a vertical
 * stretch), and [0, 0] for "on".
 */
export function sideNormal(side: Side, u: Pt, outsideIsLeft?: boolean): Pt | null {
  const L = leftOf(u);
  switch (side) {
    case "on":
      return [0, 0];
    case "left":
      return L;
    case "right":
      return mul(L, -1);
    case "above":
    case "below": {
      // screen frame: the normal whose y points up (above) or down (below).
      // On a near-vertical stretch neither normal points up: undefined.
      if (Math.abs(L[1]) < 0.26) return null; // steeper than ~75 degrees
      const up = L[1] < 0 ? L : mul(L, -1);
      return side === "above" ? up : mul(up, -1);
    }
    case "outset":
    case "inset": {
      if (outsideIsLeft === undefined)
        throw new Error(`side "${side}" needs a closed path (a boundary)`);
      const out = outsideIsLeft ? L : mul(L, -1);
      return side === "outset" ? out : mul(out, -1);
    }
  }
}

// ─── Place.along on a path ──────────────────────────────────────────────────

export type AlongOpts = {
  at?: At;
  side?: Side | Side[];
  orient?: Orient;
  offset?: number;
  /** slide candidates: at ± k·stepSize, k = 1..steps */
  steps?: number;
  stepSize?: number;
  /** closed path: which side is outside (from the ring's orientation) */
  outsideIsLeft?: boolean;
  /** keep the label's span inside [s0, s1] of arc length (an edge) */
  within?: [number, number];
  /** obstacles a horizontal label pushes away from (its own path) */
};

/** Arc-length centers to try, in order: `at`, then sliding away from it. */
function centers(at: At, L: number, w: number, steps: number, stepSize: number) {
  if (at === "start") return [{ s: w / 2 }]; // label starts at the path start
  if (at === "end") return [{ s: L - w / 2 }];
  const t0 = at === "middle" ? 0.5 : at;
  const out = [{ s: t0 * L }];
  for (let k = 1; k <= steps; k++)
    out.push(
      { s: (t0 + k * stepSize) * L },
      { s: (t0 - k * stepSize) * L }
    );
  return out;
}

/**
 * Candidates for one label along one path. With a list of sides, the order
 * is position-major: at each position along the path every side is tried
 * before sliding on (so a label stays near `at` and flips side first).
 */
export function alongSide(
  pts: Pt[],
  text: string,
  size: { w: number; h: number },
  style: TextStyle,
  o: AlongOpts = {}
): Label[] {
  const at = o.at ?? 0.5;
  const sides = Array.isArray(o.side) ? o.side : [o.side ?? "on"];
  const orient = o.orient ?? "sloped";
  const offset = o.offset ?? 4;
  const cum = cumulative(pts);
  const L = cum[cum.length - 1];
  const out: Label[] = [];
  for (const { s } of centers(at, L, size.w, o.steps ?? 14, o.stepSize ?? 0.03)) {
    if (s - size.w / 2 < 0 || s + size.w / 2 > L) continue;
    if (o.within && (s - size.w / 2 < o.within[0] || s + size.w / 2 > o.within[1])) continue;
    for (const side of sides) {
      const c =
        orient === "curved"
          ? curvedAt(pts, cum, s, text, size, style, side, offset, o.outsideIsLeft)
          : orient === "sloped"
            ? slopedAt(pts, cum, s, text, size, style, side, offset, o.outsideIsLeft)
            : horizontalAt(pts, cum, s, text, size, style, side, offset, o.outsideIsLeft);
      if (c) out.push({ ...c, side });
    }
  }
  return out;
}

/** Signed distance of q from the line through a with direction u, along n. */
const along_n = (q: Pt, a: Pt, n: Pt) => dot(sub(q, a), n);

function slopedAt(
  pts: Pt[], cum: number[], s: number, text: string,
  size: { w: number; h: number }, style: TextStyle,
  side: Side, offset: number, outsideIsLeft?: boolean
): Label | null {
  const a = atLength(pts, cum, s - size.w / 2);
  const b = atLength(pts, cum, s + size.w / 2);
  const u = unit(sub(b, a));
  const n = sideNormal(side, u, outsideIsLeft);
  if (!n) return null;
  const L0 = leftOf(u);
  // how far the path strays from the chord, on each side, inside the span
  let devPos = 0, devNeg = 0;
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] < s - size.w / 2 || cum[i] > s + size.w / 2) continue;
    const d = along_n(pts[i], a, L0);
    devPos = Math.max(devPos, d);
    devNeg = Math.max(devNeg, -d);
  }
  let ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  if (ang > 90) ang -= 180; // keep text upright
  if (ang <= -90) ang += 180;
  const mid = mul(add(a, b), 0.5);
  if (side === "on") {
    if (Math.max(devPos, devNeg) > size.h * 0.3) return null;
    return { text, cx: mid[0], cy: mid[1], ...size, angle: ang, style };
  }
  // the path bulging toward the label pushes it out; past one text height
  // the straight label no longer reads as attached: skip
  const bulge = dot(n, L0) > 0 ? devPos : devNeg;
  if (bulge > size.h) return null;
  const c = add(mid, mul(n, offset + size.h / 2 + bulge));
  return { text, cx: c[0], cy: c[1], ...size, angle: ang, style };
}

function horizontalAt(
  pts: Pt[], cum: number[], s: number, text: string,
  size: { w: number; h: number }, style: TextStyle,
  side: Side, offset: number, outsideIsLeft?: boolean
): Label | null {
  const p = atLength(pts, cum, s);
  if (side === "on") return { text, cx: p[0], cy: p[1], ...size, angle: 0, style };
  const u = tangentAt(pts, cum, s, size.w / 2);
  const n = sideNormal(side, u, outsideIsLeft);
  if (!n) return null;
  // start where the box's near edge is `offset` from the point, then push on
  // along n until the box clears the path itself (a steep line runs into it)
  const reach = Math.abs(n[0]) * (size.w / 2) + Math.abs(n[1]) * (size.h / 2);
  const own: Obstacle = { kind: "polyline", pts };
  for (let d = offset + reach; d < offset + reach + 60; d += 1) {
    const c = add(p, mul(n, d));
    const l = { text, cx: c[0], cy: c[1], ...size, angle: 0, style };
    if (!hits(corners(l, offset - 1), own)) return l;
  }
  return null;
}

/**
 * Curved: the glyphs follow the path offset by `offset + h/2` along the
 * side's normal (per point, so the offset path bends with the path). The
 * window is chosen so the OFFSET path is as long as the text. Rejected when
 * the offset path folds over itself (the path bends tighter than the offset
 * radius on the label's side).
 */
function curvedAt(
  pts: Pt[], cum: number[], s: number, text: string,
  size: { w: number; h: number }, style: TextStyle,
  side: Side, offset: number, outsideIsLeft?: boolean
): Label | null {
  const L = cum[cum.length - 1];
  const chordU = unit(sub(atLength(pts, cum, s + size.w / 2), atLength(pts, cum, s - size.w / 2)));
  const nChord = sideNormal(side, chordU, outsideIsLeft);
  if (!nChord) return null;
  const d = side === "on" ? 0 : offset + size.h / 2;
  // per-point normal, sign fixed relative to the direction of travel
  const sign = side === "on" ? 0 : dot(nChord, leftOf(chordU)) > 0 ? 1 : -1;
  // sample a window generous enough for the inner side of a bend
  const half = size.w / 2 + 2 * d + 6;
  const s0 = Math.max(0, s - half),
    s1 = Math.min(L, s + half);
  const N = Math.max(8, Math.ceil((s1 - s0) / 1));
  const base: Pt[] = [], off: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const si = s0 + ((s1 - s0) * i) / N;
    const p = atLength(pts, cum, si);
    // tangent over ±d: a sharp vertex of a sampled outline gets a rounded
    // normal sweep instead of a jump (outer side) or a fold (inner side)
    const t = tangentAt(pts, cum, si, Math.max(2, d));
    base.push(p);
    off.push(add(p, mul(leftOf(t), sign * d)));
  }
  // fold check: the offset path must keep running the same way as the path
  for (let i = 0; i + 1 < off.length; i++) {
    const bt = sub(base[i + 1], base[i]);
    const ot = sub(off[i + 1], off[i]);
    if (len(bt) > 1e-6 && dot(bt, ot) <= 0) return null;
  }
  // locate base point s on the offset path, then take w of offset length
  const oc = cumulative(off);
  const iMid = Math.round(((s - s0) / (s1 - s0)) * N);
  const sm = oc[iMid];
  if (sm - size.w / 2 < 0 || sm + size.w / 2 > oc[oc.length - 1]) return null;
  const win: Pt[] = [];
  const M = Math.max(4, Math.ceil(size.w / 1.5));
  for (let k = 0; k <= M; k++) win.push(atLength(off, oc, sm - size.w / 2 + (size.w * k) / M));
  // read left to right: reverse when the path runs leftward here
  // bend check (the curved analogue of the sloped label's chord check):
  // glyphs crowd on the inside of a tight bend and fan out on the outside,
  // so the window may turn at most MAX_TURN degrees under the text
  let turn = 0;
  const stride = Math.max(1, Math.round(M / 8));
  for (let k = stride; k + stride < win.length; k += stride) {
    const a1 = Math.atan2(win[k][1] - win[k - stride][1], win[k][0] - win[k - stride][0]);
    const a2 = Math.atan2(win[k + stride][1] - win[k][1], win[k + stride][0] - win[k][0]);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    turn += Math.abs(da);
  }
  if ((turn * 180) / Math.PI > MAX_TURN) return null;
  const curve = win[win.length - 1][0] < win[0][0] ? [...win].reverse() : win;
  const c = atLength(off, oc, sm);
  return { text, cx: c[0], cy: c[1], ...size, angle: 0, style, curve };
}

// ─── boundaries: closed paths with a known inside ───────────────────────────

export const COMPASS: Record<string, Pt> = {
  top: [0, -1],
  bottom: [0, 1],
  left: [-1, 0],
  right: [1, 0],
  "top-left": [-1, -1],
  "top-right": [1, -1],
  "bottom-left": [-1, 1],
  "bottom-right": [1, 1],
};

export type Boundary = {
  ring: Pt[]; // closed outline, sampled, no repeated last point
  outsideIsLeft: boolean;
};

export function boundary(ring: Pt[]): Boundary {
  const r = openRing(ring);
  return { ring: r, outsideIsLeft: signedArea(r) > 0 };
}

/**
 * The outline point extreme in compass direction `name`. Points within
 * `eps` px of the extreme tie; ties form runs along the outline (a flat top
 * edge is one run). With several runs (the two arm tips of a C facing
 * right), take the run whose middle is nearest the middle of the bounding
 * box's side: an EXTRA RULE the bare definition does not give.
 * Returns the ring index of the anchor and the tied run [i0, i1].
 */
export function compassPoint(b: Boundary, name: string, eps = 0.75) {
  const d = unit(COMPASS[name]);
  const r = b.ring;
  const proj = r.map((p) => dot(p, d));
  const m = Math.max(...proj);
  const tied = proj.map((v) => v >= m - eps);
  // runs (cyclic)
  const runs: number[][] = [];
  const n = r.length;
  let start = tied.findIndex((t) => !t);
  if (start < 0) start = 0;
  let cur: number[] = [];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (tied[i]) cur.push(i);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const side: Pt = [
    d[0] > 0 ? box.x1 : d[0] < 0 ? box.x0 : (box.x0 + box.x1) / 2,
    d[1] > 0 ? box.y1 : d[1] < 0 ? box.y0 : (box.y0 + box.y1) / 2,
  ];
  const midOf = (run: number[]) => run[Math.floor(run.length / 2)];
  let best = runs[0];
  for (const run of runs)
    if (len(sub(r[midOf(run)], side)) < len(sub(r[midOf(best)], side)) - 0.5) best = run;
  return { index: midOf(best), run: best, nRuns: runs.length };
}

/** Re-start a ring so index i sits in the middle; returns an open polyline
 *  (closed by repeating the first point at the end). */
export function centeredOn(r: Pt[], i: number): { pts: Pt[]; mid: number } {
  const n = r.length;
  const k = (i + Math.floor(n / 2)) % n;
  const pts = [...r.slice(k), ...r.slice(0, k), r[k]];
  return { pts, mid: (i - k + n) % n };
}

/**
 * A label on a boundary at a compass point. Horizontal labels anchor their
 * box at the point the way today's box positions do (outset-top-right puts
 * the box's lower-left corner at the corner). Sloped and curved labels go
 * through along() on the ring, re-started at the point.
 */
export function onBoundary(
  b: Boundary,
  at: string,
  text: string,
  size: { w: number; h: number },
  style: TextStyle,
  side: Side,
  orient: Orient,
  offset = 3
): Label | null {
  return boundaryCandidates(b, at, text, size, style, side, orient, offset, 0)[0] ?? null;
}

/** Candidates at a compass point of a boundary, then (sloped and curved)
 *  sliding along the outline away from it, `steps` × `stepPx` each way. */
export function boundaryCandidates(
  b: Boundary,
  at: string,
  text: string,
  size: { w: number; h: number },
  style: TextStyle,
  side: Side,
  orient: Orient,
  offset = 3,
  steps = 0,
  stepPx = 4
): Label[] {
  const { index } = compassPoint(b, at);
  const p = b.ring[index];
  if (orient === "horizontal") {
    const d = COMPASS[at];
    const k = side === "inset" ? -1 : side === "on" ? 0 : 1;
    const du = unit(d);
    const c: Pt = [
      p[0] + k * (du[0] * offset + Math.sign(d[0]) * (size.w / 2)),
      p[1] + k * (du[1] * offset + Math.sign(d[1]) * (size.h / 2)),
    ];
    return [{ text, cx: c[0], cy: c[1], ...size, angle: 0, style }];
  }
  const { pts, mid } = centeredOn(b.ring, index);
  const cum = cumulative(pts);
  const L = cum[cum.length - 1];
  return alongSide(pts, text, size, style, {
    at: cum[mid] / L,
    side,
    orient,
    offset,
    steps,
    stepSize: stepPx / L,
    outsideIsLeft: b.outsideIsLeft,
  });
}

// ─── chooser and drawing (curved-aware) ─────────────────────────────────────

/** Convex pieces covering a label: one rotated box, or a chain of boxes
 *  along a curved label's path. */
export function pieces(l: Label, pad = 1): Pt[][] {
  if (!l.curve) {

    return [corners(l as any, pad)];
  }
  const out: Pt[][] = [];
  const cum = cumulative(l.curve);
  const L = cum[cum.length - 1];
  const step = Math.max(3, l.h * 0.6);
  for (let s = 0; s < L; s += step) {
    const a = atLength(l.curve, cum, s),
      b = atLength(l.curve, cum, Math.min(L, s + step));
    const m = mul(add(a, b), 0.5);
    const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    out.push(corners({ ...l, cx: m[0], cy: m[1], w: len(sub(b, a)), angle: ang } as any, pad));
  }
  return out;
}

export function choose(
  reqs: { candidates: Label[]; ownObstacles?: Obstacle[] }[],
  shared: Obstacle[] = [],
  bounds?: { x0: number; y0: number; x1: number; y1: number }
): (Label | null)[] {
  const placed: Obstacle[] = [];
  return reqs.map((r) => {
    for (const c of r.candidates) {
      const ps = pieces(c, 1);
      if (
        bounds &&
        ps.some((poly) =>
          poly.some(([x, y]) => x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1)
        )
      )
        continue;
      const bad = ps.some(
        (poly) =>
          placed.some((o) => hits(poly, o)) ||
          shared.some((o) => hits(poly, o)) ||
          (r.ownObstacles ?? []).some((o) => hits(poly, o))
      );
      if (bad) continue;
      for (const poly of ps) placed.push({ kind: "label", poly });
      return c;
    }
    return null;
  });
}

let uid = 0;
const NS = "http://www.w3.org/2000/svg";

export function drawLabels(svg: SVGSVGElement, labels: (Label | null)[]) {
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", "proposal-labels");
  svg.style.overflow = "visible";
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(NS, "defs");
    svg.prepend(defs);
  }
  for (const l of labels) {
    if (!l) continue;
    const t = document.createElementNS(NS, "text");
    t.setAttribute("font-family", FONT);
    t.setAttribute("font-size", String(l.style.fontSize ?? 11));
    if (l.style.fontWeight) t.setAttribute("font-weight", String(l.style.fontWeight));
    t.setAttribute("fill", l.style.fill ?? "#333333");
    t.setAttribute("dominant-baseline", "central");
    if (l.style.halo) {
      t.setAttribute("stroke", "white");
      t.setAttribute("stroke-width", "3");
      t.setAttribute("stroke-linejoin", "round");
      t.setAttribute("paint-order", "stroke");
    }
    if (l.curve) {
      const id = `lp-curve-${uid++}`;
      const p = document.createElementNS(NS, "path");
      p.setAttribute("id", id);
      p.setAttribute("d", "M" + l.curve.map((q) => q.map((v) => v.toFixed(2)).join(",")).join("L"));
      p.setAttribute("fill", "none");
      defs.appendChild(p);
      const tp = document.createElementNS(NS, "textPath");
      tp.setAttribute("href", `#${id}`);
      tp.setAttribute("startOffset", "50%");
      tp.setAttribute("text-anchor", "middle");
      tp.textContent = l.text;
      t.appendChild(tp);
    } else {
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("transform", `translate(${l.cx},${l.cy}) rotate(${l.angle})`);
      t.textContent = l.text;
    }
    g.appendChild(t);
  }
  svg.appendChild(g);
}

/** Small marker dots (for the vocabulary figure). */
export function drawDots(svg: SVGSVGElement, pts: Pt[], fill = "#e63946", r = 2.2) {
  const g = document.createElementNS(NS, "g");
  for (const p of pts) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", String(p[0]));
    c.setAttribute("cy", String(p[1]));
    c.setAttribute("r", String(r));
    c.setAttribute("fill", fill);
    g.appendChild(c);
  }
  svg.appendChild(g);
}

// ─── reading outlines from any shape element ────────────────────────────────

function toRoot(el: SVGGraphicsElement, p: Pt): Pt {
  const m = el.getCTM();
  if (!m) return p;
  return [m.a * p[0] + m.c * p[1] + m.e, m.b * p[0] + m.d * p[1] + m.f];
}

/** The outline of a <rect>, <ellipse>/<circle> or <path>/<polygon>, sampled
 *  every `step` px, in root coordinates. */
export function outlineOf(el: Element, step = 1): Pt[] {
  const g = el as SVGGeometryElement;
  if (el.tagName === "rect") {
    const x = +el.getAttribute("x")!, y = +el.getAttribute("y")!;
    const w = +el.getAttribute("width")!, h = +el.getAttribute("height")!;
    const corners: Pt[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const out: Pt[] = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const n = Math.max(1, Math.ceil(len(sub(b, a)) / step));
      for (let k = 0; k < n; k++) out.push(toRoot(g as any, add(a, mul(sub(b, a), k / n))));
    }
    return out;
  }
  const L = g.getTotalLength();
  const n = Math.max(8, Math.ceil(L / step));
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = g.getPointAtLength((L * i) / n);
    out.push(toRoot(g as any, [p.x, p.y]));
  }
  return out;
}
