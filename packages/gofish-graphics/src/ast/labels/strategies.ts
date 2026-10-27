// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

/**
 * The `Place` strategies: each turns the outline of a labeled mark into
 * candidate spots for its label, best first. The chooser (`placeStep.ts`)
 * takes the first free one. All geometry is in the frame of the layer the
 * labels are placed in, in pixels with y down.
 */
import { Frontend } from "gofish-ir";
import type {
  AlongPlace,
  AroundPlace,
  BoundarySide,
  Direction,
  Side,
} from "../../families/place";
import type { Outline, OutlinePart } from "../geometry";
import { ringExtent } from "../geometry/box";
import { pointInRing, signedArea2 } from "../geometry/plane";
import type { BoundingBox } from "../../util/bbox";
import {
  corners,
  covers,
  outlineObstacles,
  pathLength,
  pointAt,
  pointsBetween,
  polyline,
  type HalfSize,
  type Obstacle,
  type Polyline,
  type Pt,
  type Spot,
} from "./collide";

/** A candidate: a spot, and whether the label may cover its own mark's
 *  outline there (a label `"on"` a line straddles it). */
export type Candidate = Spot & { onOutline: boolean };

/** The labeled mark as the strategies see it: its outlines in the layer's
 *  frame, and its type, which errors name. */
export type TargetShape = { outlines: Outline[]; type: string };

const STRATEGY_ERROR = (strategy: string, needs: string, t: TargetShape) => {
  const has =
    t.outlines.length === 0
      ? "none"
      : !t.outlines.every((o) => o.closed)
        ? "an open one"
        : t.outlines.every((o) => o.filled)
          ? "a closed one"
          : "a closed one with no fill";
  return new Error(
    `[gofish] ${strategy} needs ${needs}; ${t.type} has ${has}.`
  );
};

/** The outline a strategy that reads one outline reads: the longest of the
 *  kind it needs. */
function longest(outlines: Outline[]): Outline | undefined {
  let best: Outline | undefined;
  let bestLength = -Infinity;
  for (const o of outlines) {
    const length = pathLength(o.points, o.closed);
    if (best === undefined || length > bestLength) {
      best = o;
      bestLength = length;
    }
  }
  return best;
}

/** The outline that has a part named `name`, and the part. */
function partNamed(
  outlines: Outline[],
  name: string
): { outline: Outline; part: OutlinePart } | undefined {
  for (const outline of outlines) {
    const part = outline.parts?.find((p) => p.name === name);
    if (part !== undefined) return { outline, part };
  }
  return undefined;
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const unit = (a: Pt): Pt => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
/** Left of the direction of travel `u`, on a y-down screen. */
const leftOf = (u: Pt): Pt => [u[1], -u[0]];

/** A text angle kept upright: in (−90°, 90°]. */
const upright = (deg: number): number => {
  let a = deg;
  while (a > 90) a -= 180;
  while (a <= -90) a += 180;
  return a;
};

// ── around ─────────────────────────────────────────────────────────────────

/** `Place.around`'s directions when it is given none, as the `Place`
 *  family declares them. */
const DEFAULT_DIRECTIONS = Frontend.STRATEGIES.Place.kinds.around.params
  .directions.default as Direction[];

const COMPASS: Record<Direction, Pt> = {
  "top-right": [1, -1],
  "top-left": [-1, -1],
  "bottom-right": [1, 1],
  "bottom-left": [-1, 1],
  right: [1, 0],
  left: [-1, 0],
  top: [0, -1],
  bottom: [0, 1],
};

/** Points within this many pixels of the extreme in a direction tie. */
const TIE = 0.75;

/** What `extremePoint` reads of a target's outlines, once: their box, and
 *  how far they reach in each direction. */
type Reach = { box: BoundingBox; max: Record<Direction, number> };
const DIRECTIONS = Object.keys(COMPASS) as Direction[];
const reaches = new WeakMap<Outline[], Reach>();

function reachOf(outlines: Outline[]): Reach {
  let r = reaches.get(outlines);
  if (r !== undefined) return r;
  const ds = DIRECTIONS.map((dir) => unit(COMPASS[dir]));
  const max = DIRECTIONS.map(() => -Infinity);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const o of outlines)
    for (const p of o.points) {
      for (let k = 0; k < ds.length; k++)
        max[k] = Math.max(max[k], dot(p, ds[k]));
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  r = {
    box: { minX, maxX, minY, maxY },
    max: Object.fromEntries(
      DIRECTIONS.map((dir, k) => [dir, max[k]])
    ) as Record<Direction, number>,
  };
  reaches.set(outlines, r);
  return r;
}

/**
 * The point of the outlines farthest in direction `d`. Tied points form
 * runs along an outline (a flat top edge is one run), and a run stands for
 * the point halfway along it. With several runs (the two arm tips of a C
 * facing right), the one nearest the middle of that side of the outlines'
 * box wins, then the upper one.
 */
export function extremePoint(outlines: Outline[], dir: Direction): Pt {
  const d = unit(COMPASS[dir]);
  const { box, max: reach } = reachOf(outlines);
  const max = reach[dir];
  const runs: Pt[] = [];
  for (const o of outlines) {
    const pts = o.points;
    const n = pts.length;
    const tied = pts.map((p) => dot(p, d) >= max - TIE);
    if (!tied.some(Boolean)) continue;
    // Start the walk at a point that is not tied, so no run is split by
    // the ring's seam; an open path starts at its first point.
    let first = 0;
    if (o.closed) {
      const free = tied.findIndex((t) => !t);
      first = free < 0 ? 0 : free;
    }
    let run: Pt[] = [];
    const flush = () => {
      if (run.length > 0) runs.push(runMiddle(run));
      run = [];
    };
    for (let k = 0; k < n; k++) {
      const i = (first + k) % n;
      if (tied[i]) run.push(pts[i]);
      else flush();
    }
    flush();
  }
  const side: Pt = [
    d[0] > 0 ? box.maxX : d[0] < 0 ? box.minX : (box.minX + box.maxX) / 2,
    d[1] > 0 ? box.maxY : d[1] < 0 ? box.minY : (box.minY + box.maxY) / 2,
  ];
  let best = runs[0];
  let bestDist = Infinity;
  for (const p of runs) {
    const dist = Math.hypot(p[0] - side[0], p[1] - side[1]);
    if (
      dist < bestDist - 0.5 ||
      (Math.abs(dist - bestDist) <= 0.5 && p[1] < best[1])
    ) {
      best = p;
      bestDist = Math.min(dist, bestDist);
    }
  }
  return best;
}

/** The point halfway along a run of points, by arc length. */
function runMiddle(run: Pt[]): Pt {
  if (run.length === 1) return run[0];
  const p = polyline(run, false);
  return pointAt(p, p.length / 2);
}

/**
 * `Place.around`: per direction, per side, a level label just outside (or
 * inside) the outline's extreme point that way. The label's box touches the
 * point moved `offset` along the direction, from the side the direction
 * points to: its lower-left corner for top-right, its bottom edge's middle
 * for top.
 */
export function* aroundCandidates(
  t: TargetShape,
  size: HalfSize,
  angle: number,
  opts: AroundPlace,
  offset: number
): Generator<Candidate> {
  if (t.outlines.length === 0)
    throw STRATEGY_ERROR("Place.around", "an outline", t);
  const directions = opts.directions ?? DEFAULT_DIRECTIONS;
  const sides: BoundarySide[] = Array.isArray(opts.side)
    ? opts.side
    : [opts.side ?? "outset"];
  for (const dir of directions) {
    const c = COMPASS[dir];
    const p = extremePoint(t.outlines, dir);
    const d = unit(c);
    for (const side of sides) {
      const k = side === "inset" ? -1 : 1;
      yield {
        cx: p[0] + k * (d[0] * offset + Math.sign(c[0]) * size.hx),
        cy: p[1] + k * (d[1] * offset + Math.sign(c[1]) * size.hy),
        angle,
        onOutline: false,
      };
    }
  }
}

// ── along ──────────────────────────────────────────────────────────────────

/** Arc-length step between slide positions, in pixels. */
const SLIDE_STEP = 3;
/** Most slide positions tried each way. */
const SLIDE_MAX = 200;
/** A sloped label skips a spot where the outline strays from its chord by
 *  more than this share of the label's height. */
const STRAIGHTNESS = 0.3;

/** The normal a label on `side` moves along, given the direction of travel
 *  `u`; `null` where the side is not defined (above a vertical stretch). */
function sideNormal(
  side: Side,
  u: Pt,
  outsideIsLeft: boolean | undefined
): Pt | null {
  const L = leftOf(u);
  switch (side) {
    case "on":
      return [0, 0];
    case "left":
      return L;
    case "right":
      return [-L[0], -L[1]];
    case "above":
    case "below": {
      // Steeper than about 75°: neither normal points up the screen.
      if (Math.abs(L[1]) < 0.26) return null;
      const up: Pt = L[1] < 0 ? L : [-L[0], -L[1]];
      return side === "above" ? up : [-up[0], -up[1]];
    }
    case "inset":
    case "outset": {
      const out: Pt = outsideIsLeft ? L : [-L[0], -L[1]];
      return side === "outset" ? out : [-out[0], -out[1]];
    }
  }
}

/** Arc lengths to try, in order: `s0`, then sliding away from it, nearest
 *  first, while the label's half-span `e` stays within `[lo, hi]`. */
function* slide(
  s0: number,
  lo: number,
  hi: number,
  closed: boolean
): Generator<number> {
  const ok = (s: number) => closed || (s >= lo - 1e-9 && s <= hi + 1e-9);
  if (ok(s0)) yield s0;
  for (let k = 1; k <= SLIDE_MAX; k++) {
    const a = s0 + k * SLIDE_STEP;
    const b = s0 - k * SLIDE_STEP;
    const span = k * SLIDE_STEP;
    if (closed && span > (hi - lo) / 2) break;
    if (ok(a)) yield a;
    if (ok(b)) yield b;
    if (!closed && a > hi && b < lo) break;
  }
}

/**
 * `Place.along`: spots on the outline from `at` outward; at each, every side
 * listed. A level label beside the outline is moved off it along the side's
 * normal until its box clears the outline; a sloped one is turned to the
 * chord across its width.
 */
export function* alongCandidates(
  t: TargetShape,
  size: HalfSize,
  angle: number,
  opts: AlongPlace,
  offset: number
): Generator<Candidate> {
  const at = opts.at ?? "middle";
  // A part names a stretch of one outline; anything else reads the longest.
  const named =
    typeof at === "number" || at === "start" || at === "middle" || at === "end"
      ? undefined
      : partNamed(t.outlines, at);
  const outline = named?.outline ?? longest(t.outlines);
  const path = outline && polyline(outline.points, outline.closed);
  if (outline === undefined || path === undefined || path.length === 0)
    throw STRATEGY_ERROR("Place.along", "an outline", t);
  const sides: Side[] = Array.isArray(opts.side)
    ? opts.side
    : [opts.side ?? "on"];
  for (const side of sides) {
    if ((side === "inset" || side === "outset") && !path.closed)
      throw new Error(
        `[gofish] Place.along({ side: "${side}" }) needs a closed outline; ` +
          `${t.type} has an open one. On a path, use "left", "right", ` +
          `"above", "below" or "on".`
      );
  }
  const sloped = opts.orient === "sloped";
  const ring = path.points.slice(0, -1);
  const outsideIsLeft = path.closed ? signedArea2(ring) > 0 : undefined;
  const L = path.length;
  // Half the label's span along the outline: its width when sloped; when
  // level, the label's box seen along the outline's direction there.
  const halfSpan = (s: number): number => {
    if (sloped) return size.hx;
    const u = unit(sub(pointAt(path, s + 2), pointAt(path, s - 2)));
    return Math.abs(u[0]) * size.hx + Math.abs(u[1]) * size.hy;
  };

  let s0: number;
  let lo = 0;
  let hi = L;
  if (typeof at === "number") s0 = at * L;
  else if (at === "middle") s0 = L / 2;
  else if (at === "start") s0 = halfSpan(0);
  else if (at === "end") s0 = L - halfSpan(L);
  else {
    const part = named?.part;
    if (part === undefined) {
      const names = t.outlines.flatMap((o) => o.parts ?? []).map((p) => p.name);
      throw new Error(
        `[gofish] Place.along({ at: "${at}" }): ${t.type} has no part ` +
          `"${at}"; ${
            names.length > 0
              ? `its parts are ${names.map((n) => `"${n}"`).join(", ")}`
              : "it has no named parts"
          }. at is a fraction 0 to 1, "start", "middle", "end", or a part.`
      );
    }
    lo = part.from;
    hi = part.to;
    s0 = (lo + hi) / 2;
  }
  const isPart = lo !== 0 || hi !== L;
  const closedSlide = path.closed && !isPart;

  // The outline's own pieces, as wide as its stroke.
  const own = outlineObstacles(outline, undefined).filter(
    (o) => o.kind === "segment"
  );
  for (const s of slide(s0, lo, hi, closedSlide)) {
    const e = halfSpan(s);
    if (!closedSlide && (s - e < lo - 1e-9 || s + e > hi + 1e-9)) continue;
    for (const side of sides) {
      const c = sloped
        ? slopedAt(path, s, size, side, offset, outsideIsLeft)
        : levelAt(path, s, size, angle, side, offset, outsideIsLeft, own);
      if (c !== null) yield c;
    }
  }
}

/** A level label at arc length `s`. */
function levelAt(
  path: Polyline,
  s: number,
  size: HalfSize,
  angle: number,
  side: Side,
  offset: number,
  outsideIsLeft: boolean | undefined,
  own: Obstacle[]
): Candidate | null {
  const p = pointAt(path, s);
  if (side === "on") return { cx: p[0], cy: p[1], angle, onOutline: true };
  const reachAlong = Math.max(2, size.hx);
  const u = unit(
    sub(pointAt(path, s + reachAlong), pointAt(path, s - reachAlong))
  );
  const n = sideNormal(side, u, outsideIsLeft);
  if (n === null) return null;
  // Start with the box's near edge `offset` from the point, then move on
  // along the normal until the box clears the outline itself (a steep line
  // runs into a label set beside it).
  const reach = Math.abs(n[0]) * size.hx + Math.abs(n[1]) * size.hy;
  const limit = offset + reach + 3 * size.hy;
  for (let d = offset + reach; d <= limit; d += 1) {
    const spot = { cx: p[0] + n[0] * d, cy: p[1] + n[1] * d, angle };
    const poly = corners(spot, size, Math.max(0, offset - 1));
    if (!own.some((o) => covers(poly, o))) return { ...spot, onOutline: false };
  }
  return null;
}

/** A sloped label centered at arc length `s`: turned to the chord across
 *  its width, kept upright, skipped where the outline strays from the
 *  chord. */
function slopedAt(
  path: Polyline,
  s: number,
  size: HalfSize,
  side: Side,
  offset: number,
  outsideIsLeft: boolean | undefined
): Candidate | null {
  const a = pointAt(path, s - size.hx);
  const b = pointAt(path, s + size.hx);
  const chord = sub(b, a);
  if (Math.hypot(chord[0], chord[1]) < 1e-9) return null;
  const u = unit(chord);
  const n = sideNormal(side, u, outsideIsLeft);
  if (n === null) return null;
  const L0 = leftOf(u);
  let devPos = 0;
  let devNeg = 0;
  for (const q of pointsBetween(path, s - size.hx, s + size.hx)) {
    const d = dot(sub(q, a), L0);
    devPos = Math.max(devPos, d);
    devNeg = Math.max(devNeg, -d);
  }
  const angle = upright((Math.atan2(u[1], u[0]) * 180) / Math.PI);
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const height = 2 * size.hy;
  if (side === "on") {
    if (Math.max(devPos, devNeg) > STRAIGHTNESS * height) return null;
    return { cx: mid[0], cy: mid[1], angle, onOutline: true };
  }
  // The outline bulging toward the label pushes it out; past one label
  // height the label no longer reads as attached.
  const bulge = dot(n, L0) > 0 ? devPos : devNeg;
  if (bulge > height) return null;
  const d = offset + size.hy + bulge;
  return {
    cx: mid[0] + n[0] * d,
    cy: mid[1] + n[1] * d,
    angle,
    onOutline: false,
  };
}

// ── start / end ────────────────────────────────────────────────────────────

/**
 * `Place.start` / `Place.end`: the spot a level label wants just past the
 * first or last point of an open path, on the side the path heads that way
 * (right of a line's end when it runs rightward). The chooser then slides
 * colliding ones apart vertically (`dodgeVertically`).
 */
export function endSpot(
  t: TargetShape,
  size: HalfSize,
  angle: number,
  which: "start" | "end",
  offset: number
): Spot & { side: 1 | -1 } {
  const open = t.outlines.filter((o) => !o.closed && o.points.length > 0);
  if (open.length === 0)
    throw STRATEGY_ERROR(`Place.${which}`, "an open path", t);
  const o = which === "end" ? open[open.length - 1] : open[0];
  const pts = o.points;
  const p = which === "end" ? pts[pts.length - 1] : pts[0];
  // The way the path heads past this end, in x.
  let dx = 0;
  if (which === "end") {
    for (let i = pts.length - 2; i >= 0 && dx === 0; i--) dx = p[0] - pts[i][0];
  } else {
    for (let i = 1; i < pts.length && dx === 0; i++) dx = p[0] - pts[i][0];
  }
  const side: 1 | -1 = dx === 0 ? (which === "end" ? 1 : -1) : dx > 0 ? 1 : -1;
  return {
    cx: p[0] + side * (offset + size.hx),
    cy: p[1],
    angle,
    side,
  };
}

/**
 * Slide boxes apart along y so no two overlap, each as near the y it wants
 * as it can be (directlabels' `last.qp`, by merging runs): boxes are sorted
 * by the y they want; a run of boxes that would overlap is stacked with
 * `gap` between them and centered on the mean of what its members want;
 * merging repeats until no two runs overlap. Returns each box's center y,
 * in input order.
 */
export function dodgeVertically(
  boxes: { want: number; h: number }[],
  gap: number
): number[] {
  const order = boxes
    .map((_, i) => i)
    .sort((a, b) => boxes[a].want - boxes[b].want || a - b);
  type Run = { members: number[]; top: number; height: number };
  const height = (members: number[]) =>
    members.reduce((s, i) => s + boxes[i].h, 0) + gap * (members.length - 1);
  const place = (members: number[]): Run => {
    const h = height(members);
    // Offsets of each member's center from the run's top.
    let acc = 0;
    let sum = 0;
    for (const i of members) {
      sum += boxes[i].want - (acc + boxes[i].h / 2);
      acc += boxes[i].h + gap;
    }
    return { members, top: sum / members.length, height: h };
  };
  let runs = order.map((i) => place([i]));
  let merged = true;
  while (merged) {
    merged = false;
    for (let k = 0; k + 1 < runs.length; k++) {
      if (runs[k].top + runs[k].height + gap > runs[k + 1].top + 1e-9) {
        runs = [
          ...runs.slice(0, k),
          place([...runs[k].members, ...runs[k + 1].members]),
          ...runs.slice(k + 2),
        ];
        merged = true;
        break;
      }
    }
  }
  const out = new Array<number>(boxes.length);
  for (const r of runs) {
    let y = r.top;
    for (const i of r.members) {
      out[i] = y + boxes[i].h / 2;
      y += boxes[i].h + gap;
    }
  }
  return out;
}

// ── interior ───────────────────────────────────────────────────────────────

/** Pixels kept between an interior label and its region's outline. */
const INTERIOR_PADDING = 2;
/** Most grid points the interior search evaluates per region. */
const INTERIOR_GRID = 4000;
/** Most interior candidates handed to the chooser. */
const INTERIOR_CANDIDATES = 12;

/**
 * How far `c` is from segment `[p, q]` in the label's own measure: the
 * scale `s` at which a box of half size `(a, b)` centered on `c` first
 * touches the segment, i.e. the smallest `max(|dx| / a, |dy| / b)` over the
 * segment's points. It is a convex piecewise-linear function of the
 * segment's parameter, so its minimum is at an end or where a term changes
 * sign or the two terms cross.
 */
function boxDistance(c: Pt, p: Pt, q: Pt, a: number, b: number): number {
  const px = (p[0] - c[0]) / a;
  const py = (p[1] - c[1]) / b;
  const dx = (q[0] - p[0]) / a;
  const dy = (q[1] - p[1]) / b;
  const f = (t: number) =>
    Math.max(Math.abs(px + t * dx), Math.abs(py + t * dy));
  let best = Math.min(f(0), f(1));
  const tryT = (t: number) => {
    if (t > 0 && t < 1) best = Math.min(best, f(t));
  };
  if (dx !== 0) tryT(-px / dx);
  if (dy !== 0) tryT(-py / dy);
  if (dx - dy !== 0) tryT((py - px) / (dx - dy));
  if (dx + dy !== 0) tryT(-(px + py) / (dx + dy));
  return best;
}

/**
 * `Place.interior`: inside a filled closed outline, the spots where the label's
 * own box (with a little padding) can grow largest, best first; only spots
 * where it fits at its own size. The room at a point is the scale at which
 * the box centered there first touches the outline (d3-area-label's rule,
 * for any region, not only a band). Polylabel's farthest-from-every-edge
 * point is the center of the largest circle, which sends a wide label into
 * the corner of an L; the box rule puts it in the middle of an arm.
 *
 * A coarse grid over the region finds the best cells; each is then refined
 * by halving steps.
 */
export function* interiorCandidates(
  t: TargetShape,
  size: HalfSize,
  angle: number
): Generator<Candidate> {
  const rings = t.outlines.filter(
    (o) => o.closed && o.filled && o.points.length >= 3
  );
  if (rings.length === 0)
    throw STRATEGY_ERROR("Place.interior", "a filled region", t);
  const a = size.hx + INTERIOR_PADDING;
  const b = size.hy + INTERIOR_PADDING;
  // Every spot found, best first: by room, then in the order found (for
  // each ring, its refined spots, then the rest of its grid).
  const found = new Heap<{ c: Pt; room: number; order: number[] }>(
    (p, q) => q.room - p.room || compareOrder(p.order, q.order)
  );
  rings.forEach((o, ringIndex) => {
    const ring = o.points;
    const room = roomIn(ring, a, b);
    const box = ringExtent(ring);
    const w = box.maxX - box.minX;
    const h = box.maxY - box.minY;
    let step = Math.min(8, Math.max(1, Math.min(w, h) / 20));
    step = Math.max(step, Math.sqrt((w * h) / INTERIOR_GRID));
    // The grid's spots with room, and the best few, in order: by room,
    // then in scan order.
    const grid: { c: Pt; room: number; scan: number }[] = [];
    const best: typeof grid = [];
    const better = (p: (typeof grid)[number], q: (typeof grid)[number]) =>
      p.room > q.room || (p.room === q.room && p.scan < q.scan);
    for (let x = box.minX + step / 2; x < box.maxX; x += step)
      for (let y = box.minY + step / 2; y < box.maxY; y += step) {
        const c: Pt = [x, y];
        const r = room(c);
        if (!(r > 0)) continue;
        const spot = { c, room: r, scan: grid.length };
        grid.push(spot);
        if (best.length < REFINED || better(spot, best[best.length - 1])) {
          let k = Math.min(best.length, REFINED - 1);
          best[k] = spot;
          for (; k > 0 && better(best[k], best[k - 1]); k--)
            [best[k], best[k - 1]] = [best[k - 1], best[k]];
        }
      }
    const refined = new Set(best);
    // Refine the best few by hill climbing with halving steps.
    best.forEach((start, rank) => {
      let { c, room: r } = start;
      for (let s = step / 2; s >= 0.25; s /= 2) {
        let moved = true;
        while (moved) {
          moved = false;
          for (const [ox, oy] of [
            [s, 0],
            [-s, 0],
            [0, s],
            [0, -s],
            [s, s],
            [-s, s],
            [s, -s],
            [-s, -s],
          ]) {
            const next: Pt = [c[0] + ox, c[1] + oy];
            const nr = room(next);
            if (nr > r + 1e-9) {
              c = next;
              r = nr;
              moved = true;
            }
          }
        }
      }
      found.push({ c, room: r, order: [ringIndex, 0, rank] });
    });
    for (const spot of grid)
      if (!refined.has(spot))
        found.push({
          c: spot.c,
          room: spot.room,
          order: [ringIndex, 1, spot.scan],
        });
  });
  const out: Candidate[] = [];
  for (let f = found.pop(); f !== undefined; f = found.pop()) {
    if (f.room < 1) break;
    // Keep candidates apart, so the chooser's fallbacks are real
    // alternatives.
    if (
      out.some(
        (o) =>
          Math.abs(o.cx - f.c[0]) < size.hx && Math.abs(o.cy - f.c[1]) < size.hy
      )
    )
      continue;
    const c = { cx: f.c[0], cy: f.c[1], angle, onOutline: false };
    out.push(c);
    yield c;
    if (out.length >= INTERIOR_CANDIDATES) break;
  }
}

/** How many of a ring's best grid spots the interior search refines. */
const REFINED = 8;

/** Lexicographic order of two keys of the same length. */
const compareOrder = (p: number[], q: number[]): number => {
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i] - q[i];
  return 0;
};

/**
 * The room at a point inside `ring` for a box of half size `(a, b)`
 * (0 outside it): the least `boxDistance` to an edge. The edges are filed
 * in a grid of cells `s·a` wide and `s·b` tall, so the search visits the
 * cells around the point ring by ring and stops once no edge left can be
 * nearer: every point of a cell `r` rings out is at least `(r − 1)·s` away
 * in the box's measure. It finds the same least distance as reading every
 * edge.
 */
function roomIn(ring: Pt[], a: number, b: number): (c: Pt) => number {
  const n = ring.length;
  const box = ringExtent(ring);
  // About √n cells a side.
  const s =
    Math.max((box.maxX - box.minX) / a, (box.maxY - box.minY) / b) /
      Math.sqrt(n) || 1;
  const cw = s * a;
  const ch = s * b;
  const col = (x: number) => Math.floor((x - box.minX) / cw);
  const row = (y: number) => Math.floor((y - box.minY) / ch);
  const cols = col(box.maxX) + 1;
  const rows = row(box.maxY) + 1;
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    const i0 = col(Math.min(p[0], q[0]));
    const i1 = col(Math.max(p[0], q[0]));
    const j0 = row(Math.min(p[1], q[1]));
    const j1 = row(Math.max(p[1], q[1]));
    for (let ci = i0; ci <= i1; ci++)
      for (let cj = j0; cj <= j1; cj++) cells[ci * rows + cj].push(i);
  }
  const seen = new Int32Array(n);
  let stamp = 0;
  return (c: Pt): number => {
    if (!pointInRing(c, ring)) return 0;
    stamp++;
    const ci = Math.min(Math.max(col(c[0]), 0), cols - 1);
    const cj = Math.min(Math.max(row(c[1]), 0), rows - 1);
    let m = Infinity;
    const reach = Math.max(ci, cols - 1 - ci, cj, rows - 1 - cj);
    for (let r = 0; r <= reach; r++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || i >= cols) continue;
        for (let j = cj - r; j <= cj + r; j++) {
          if (j < 0 || j >= rows) continue;
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          for (const e of cells[i * rows + j]) {
            if (seen[e] === stamp) continue;
            seen[e] = stamp;
            m = Math.min(m, boxDistance(c, ring[e], ring[(e + 1) % n], a, b));
          }
        }
      }
      // Every edge not read yet is at least `r · s` away.
      if (r * s > m + 1e-9) break;
    }
    return m;
  };
}

/** A binary heap: `pop` gives the least item by `less`'s order. */
class Heap<T> {
  private readonly items: T[] = [];
  constructor(private readonly compare: (p: T, q: T) => number) {}

  push(item: T): void {
    const a = this.items;
    a.push(item);
    for (let i = a.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (this.compare(a[i], a[parent]) >= 0) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }

  pop(): T | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.compare(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.compare(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
