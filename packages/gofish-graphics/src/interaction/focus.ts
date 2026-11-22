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
 * A drawn outline: the boxes, circles, line segments and regions a mark is
 * drawn as. A part is a box, a circle (a `round` box), a segment of a
 * stroked path (a line's), or a `region`, a filled closed path (an area, a
 * wedge) given by the segments of its edge; its box bounds it.
 */
export type Outline = {
  box: Box;
  round: boolean;
  segment?: readonly [Point, Point];
  region?: readonly (readonly [Point, Point])[];
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
  /** The points of the rows the mark is drawn through (a line's), each a
   *  candidate of its own, placed at its point, with its row as its datum:
   *  {@link Chain.snap} picks one. */
  points?: Candidate[];
};

export type Frame = {
  /** Undefined when the pointer is off the chart. */
  pointer: Point | undefined;
  /** In paint order: a candidate is drawn over the ones before it. */
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
  /** Then, when the choice is drawn through rows (it has `points`), choose
   *  its point nearest the pointer, the current point with a head start of
   *  `stickiness` px. The behavior before it chooses among marks: the
   *  current point counts as its mark there. */
  snap(stickiness?: number): Chain;
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
  chain.snap = (stickiness = 0) =>
    from((f) => {
      const current =
        f.current &&
        f.candidates.find(
          (c) =>
            c.key === f.current!.key ||
            c.points?.some((p) => p.key === f.current!.key) === true
        );
      const r = run({ ...f, current });
      const points = r.choice?.points;
      if (!points || points.length === 0) return r;
      const p = closest({ stickiness })({ ...f, candidates: points });
      return p.choice ? { choice: p.choice, gap: r.gap } : r;
    });
  return chain;
}

/** The mark the pointer is inside; where marks overlap, the one on top,
 *  the last in the candidates' paint order. */
function hit(): Chain {
  return from(({ pointer, candidates }) => {
    const c = pointer && candidates.findLast((c) => inside(pointer, c.outline));
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
 *  by placed position with a 4 px head start for the current one; on a mark
 *  drawn through rows (a line), its row nearest the pointer, with the same
 *  head start; while the pointer is within 8 px of the drawn marks (12 px
 *  once there is a focus). As a spec this would read
 *  `pointer().snap(selectAll("lines"), { by: ... })`: the marks are the
 *  candidates, and each step here is one pure behavior over them. */
export const defaultFocus: Chain = Focus.first([
  Focus.hit(),
  Focus.closest({ stickiness: 4 }),
])
  .snap(4)
  .within(8);

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

/** Distance from a point to a region (its edge segments), zero inside it.
 *  Inside is the nonzero rule, as SVG fills a path by default. */
function regionDistance(
  p: Point,
  edge: readonly (readonly [Point, Point])[]
): number {
  let winding = 0;
  let d = Infinity;
  for (const [a, b] of edge) {
    d = Math.min(d, segDist(p.x, p.y, a.x, a.y, b.x, b.y));
    const cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
    if (a.y <= p.y) {
      if (b.y > p.y && cross > 0) winding++;
    } else if (b.y <= p.y && cross < 0) winding--;
  }
  return winding !== 0 ? 0 : d;
}

function outlineDistance(p: Point, outline: Outline): number {
  let d = Infinity;
  for (const { box, round, segment, region } of outline) {
    if (segment) {
      const [a, b] = segment;
      d = Math.min(d, segDist(p.x, p.y, a.x, a.y, b.x, b.y));
    } else if (region) {
      if (boxDistance(p, box) < d) d = Math.min(d, regionDistance(p, region));
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
