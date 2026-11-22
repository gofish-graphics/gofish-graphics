// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * Focus behaviors (#1395): which mark a tooltip describes, given the pointer.
 *
 * INTERNAL. Nothing here is exported from `src/lib.ts` yet. The shape is the
 * proposed `Focus` family's: plain types and pure functions, no DOM, no
 * Solid, no GoFish node. A behavior, like a Dragology drag behavior, is a
 * function from a frame to a result. Calls start a behavior or join several
 * (`Focus.first`); a step that transforms one behavior is a chained method
 * (`.within`). Exposing the family later is exporting this module as a
 * family namespace (`src/families/`), with `.tooltip({ focus })` taking one.
 *
 * The runtime that hands a behavior its frames is `tooltipFocus.ts`.
 */
import { convexHull, segDist, type PlanePoint } from "../ast/geometry/plane";

/* -------------------------------- types --------------------------------- */

export type Point = { x: number; y: number };
/** A box in the pointer's coordinates. */
export type Box = { x0: number; y0: number; x1: number; y1: number };
/**
 * A drawn outline: the boxes, circles and line segments a mark is drawn as.
 * A part is a box, a circle (a `round` box), or a segment of a path (a
 * line's), whose box bounds it.
 */
export type Outline = {
  box: Box;
  round: boolean;
  segment?: readonly [Point, Point];
}[];

/** A mark the focus can land on. */
export type Candidate = {
  /** Stable across re-runs (#673). */
  key: unknown;
  /** The mark's rows. */
  datum: unknown[];
  /** The drawn box. */
  box: Box;
  /** Where the layout placed the mark. An axis with only a size is absent,
   *  and so is every axis of a mark drawn across its data (a line): such a
   *  mark is as near as its outline. */
  position: { x?: number; y?: number };
  outline: Outline;
};

export type Frame = {
  /** Undefined when the pointer is off the chart. */
  pointer: Point | undefined;
  candidates: Candidate[];
  /** The focus the last frame chose. */
  current: Candidate | undefined;
  /** True on the frame of a click. */
  clicked: boolean;
};

/** `gap`: the pointer's distance to the choice, in px, as the behavior
 *  measures it (Dragology's `gap`). */
export type Result = { choice: Candidate | undefined; gap: number };
export type FocusBehavior = (frame: Frame) => Result;

/** A behavior with the chained steps. A plain `FocusBehavior` is accepted
 *  wherever a behavior is an argument. */
export type Chain = FocusBehavior & {
  /** Drop the choice when the pointer is more than `gap` px from the hull
   *  of the drawn marks; once there is a focus, `out` px. */
  within(gap: number, out?: number): Chain;
  /** Run this behavior only on a click; between clicks the focus stays. */
  onClick(): Chain;
};

const NONE: Result = { choice: undefined, gap: Infinity };

/* ------------------------------- the family ------------------------------ */

/** Lift a plain behavior so it can be chained. */
function from(run: FocusBehavior): Chain {
  const chain = ((frame: Frame) => run(frame)) as Chain;
  // The hull is measured first: a pointer far from every mark (most of a
  // sparse chart) runs no inner behavior.
  chain.within = (gap, out = gap + 4) =>
    from((f) => {
      const limit = f.current ? out : gap;
      if (f.pointer && hullDistance(f.pointer, hullOf(f.candidates)) > limit)
        return NONE;
      return run(f);
    });
  chain.onClick = () =>
    from((f) => (f.clicked ? run(f) : { choice: f.current, gap: 0 }));
  return chain;
}

/** The mark the pointer is inside. */
function hit(): Chain {
  return from(({ pointer, candidates }) => {
    const c = pointer && candidates.find((c) => inside(pointer, c.outline));
    return c ? { choice: c, gap: 0 } : NONE;
  });
}

/**
 * The nearest candidate. `to` is what distance is measured to: the placed
 * `position` (absent axes drop out; a mark with none is measured to its
 * outline), the box `center`, or the `outline`. The current focus gets a
 * head start of `stickiness` px. A candidate more than `radius` px away is
 * not picked.
 */
function closest({
  to = "position",
  stickiness = 0,
  radius = Infinity,
}: {
  to?: "position" | "center" | "outline";
  stickiness?: number;
  radius?: number;
} = {}): Chain {
  return from(({ pointer, candidates, current }) => {
    if (!pointer) return NONE;
    let best = NONE;
    let bestScore = Infinity;
    for (const c of candidates) {
      const d = distance(pointer, c, to);
      const score = d - (c.key === current?.key ? stickiness : 0);
      if (score < bestScore) [best, bestScore] = [{ choice: c, gap: d }, score];
    }
    return best.gap <= radius ? best : NONE;
  });
}

/** The first behavior in the list that makes a choice. */
function first(behaviors: FocusBehavior[]): Chain {
  return from((f) => {
    for (const b of behaviors) {
      const r = b(f);
      if (r.choice) return r;
    }
    return NONE;
  });
}

export const Focus = { hit, closest, first, from };

/** The default tooltip focus: the mark under the pointer, else the nearest
 *  by placed position with a 4 px head start for the current one, while the
 *  pointer is within 8 px of the drawn marks (12 px once there is a focus). */
export const defaultFocus: Chain = Focus.first([
  Focus.hit(),
  Focus.closest({ stickiness: 4 }),
]).within(8);

/* -------------------------------- geometry -------------------------------- */

const center = (b: Box): Point => ({
  x: (b.x0 + b.x1) / 2,
  y: (b.y0 + b.y1) / 2,
});

/** Distance from a point to a box, zero inside it. */
const boxDistance = (p: Point, b: Box): number =>
  Math.hypot(
    Math.max(b.x0 - p.x, 0, p.x - b.x1),
    Math.max(b.y0 - p.y, 0, p.y - b.y1)
  );

/** The point of the segment `a`–`b` nearest `p`. */
const segmentNearest = (p: Point, a: Point, b: Point): Point => {
  const [vx, vy] = [b.x - a.x, b.y - a.y];
  const len2 = vx * vx + vy * vy;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return { x: a.x + t * vx, y: a.y + t * vy };
};

/** The point of a drawn path (the segments of an outline) nearest `p`;
 *  undefined when the outline has no segment. */
export function nearestOnPath(p: Point, outline: Outline): Point | undefined {
  let best: Point | undefined;
  let d = Infinity;
  for (const { segment } of outline) {
    if (!segment) continue;
    const q = segmentNearest(p, segment[0], segment[1]);
    const dq = Math.hypot(p.x - q.x, p.y - q.y);
    if (dq < d) [best, d] = [q, dq];
  }
  return best;
}

/** Whether a candidate is drawn as a path across its data (a line): it has
 *  no placed position on either axis, and its outline is segments only. Such
 *  a mark is as near as its path, and its tooltip sits beside the point of
 *  the path nearest the pointer. */
export const isPath = (c: Candidate): boolean =>
  c.position.x === undefined &&
  c.position.y === undefined &&
  c.outline.length > 0 &&
  c.outline.every((part) => part.segment !== undefined);

function outlineDistance(p: Point, outline: Outline): number {
  let d = Infinity;
  for (const { box, round, segment } of outline) {
    if (segment) {
      const [a, b] = segment;
      d = Math.min(d, segDist(p.x, p.y, a.x, a.y, b.x, b.y));
    } else if (!round) d = Math.min(d, boxDistance(p, box));
    else {
      const c = center(box);
      d = Math.min(
        d,
        Math.max(0, Math.hypot(p.x - c.x, p.y - c.y) - (box.x1 - box.x0) / 2)
      );
    }
  }
  return d;
}

const inside = (p: Point, outline: Outline) =>
  outlineDistance(p, outline) === 0;

function distance(
  p: Point,
  c: Candidate,
  to: "position" | "center" | "outline"
): number {
  const at = to === "center" ? center(c.box) : c.position;
  if (to === "outline" || (at.x === undefined && at.y === undefined))
    return outlineDistance(p, c.outline);
  return Math.hypot(p.x - (at.x ?? p.x), p.y - (at.y ?? p.y));
}

/** The convex hull of the candidates' outline corners (`convexHull`),
 *  kept per candidate list. */
const hulls = new WeakMap<Candidate[], PlanePoint[]>();
function hullOf(candidates: Candidate[]): PlanePoint[] {
  const known = hulls.get(candidates);
  if (known) return known;
  const pts: PlanePoint[] = [];
  for (const c of candidates)
    for (const { box: b } of c.outline)
      pts.push([b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]);
  const hull = convexHull(pts);
  hulls.set(candidates, hull);
  return hull;
}

/** Distance from a point to a convex polygon that winds positive (as
 *  `convexHull` makes it), zero inside it. A hull of fewer than three
 *  corners (one mark of no width) has no inside. */
function hullDistance(p: Point, hull: PlanePoint[]): number {
  if (hull.length === 1) return Math.hypot(p.x - hull[0][0], p.y - hull[0][1]);
  let isInside = hull.length >= 3;
  let d = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const [ax, ay] = hull[i];
    const [bx, by] = hull[(i + 1) % hull.length];
    if ((bx - ax) * (p.y - ay) - (by - ay) * (p.x - ax) < 0) isInside = false;
    d = Math.min(d, segDist(p.x, p.y, ax, ay, bx, by));
  }
  return isInside ? 0 : d;
}
