// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * Focus behaviors (#1395): which mark a tooltip describes, given the pointer.
 *
 * INTERNAL. Nothing here is exported from `src/lib.ts` yet. The shape is the
 * proposed `Focus` family's: plain types and pure functions, no DOM, no
 * Solid, no GoFish node. A behavior, like a Dragology drag behavior, is a
 * function from a frame to the candidate it chooses, or none. Calls start a behavior or join several
 * (`Focus.first`); a step that transforms one behavior is a chained method
 * (`.within`). Exposing the family later is exporting this module as a
 * family namespace (`src/families/`), with `.tooltip({ focus })` taking one.
 *
 * The runtime that hands a behavior its frames is `tooltipFocus.ts`.
 */
import { segDist } from "../ast/geometry/plane";

/* -------------------------------- types --------------------------------- */

export type Point = { x: number; y: number };
/** A box in the pointer's coordinates. */
export type Box = { x0: number; y0: number; x1: number; y1: number };
/**
 * A drawn outline: the boxes, circles, line segments and regions a mark is
 * drawn as. A part is a box, a circle (a `round` box), a segment of a
 * stroked path (a line's), or a `region`, a filled path (an area, a
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

/** A behavior chooses a candidate, or none. */
export type FocusBehavior = (frame: Frame) => Candidate | undefined;

/** A behavior with the chained steps. A plain `FocusBehavior` is accepted
 *  wherever a behavior is an argument. */
export type Chain = FocusBehavior & {
  /** Run this behavior on the marks within `reach` px of the pointer
   *  only: those whose drawn outline is that near (0 inside it), and the
   *  current focus out to `out` px. With none, it chooses nothing. This is
   *  Dragology's `closest(...).whenFar(...)` turned around: there the
   *  limit is on the gap to the chosen target; here the reach narrows the
   *  targets first, because a mark's size is not part of its position, so
   *  the mark nearest by position can be far from the pointer while
   *  another is near it. */
  within(reach: number, out?: number): Chain;
  /** Run this behavior only on a click; between clicks the focus stays. */
  onClick(): Chain;
  /** Then, when the choice is drawn through rows (it has `points`), choose
   *  its point nearest the pointer, the current point with a head start of
   *  `stickiness` px. The behavior before it chooses among marks: the
   *  current point counts as its mark there. */
  snap(stickiness?: number): Chain;
};

/* ------------------------------- the family ------------------------------ */

/** Lift a plain behavior so it can be chained. */
function from(run: FocusBehavior): Chain {
  const chain = ((frame: Frame) => run(frame)) as Chain;
  chain.within = (reach, out = reach + 4) =>
    from((f) => {
      const p = f.pointer;
      if (!p) return undefined;
      const candidates = f.candidates.filter(
        (c) =>
          outlineDistance(p, c.outline) <=
          (c.key === f.current?.key ? out : reach)
      );
      return candidates.length === 0 ? undefined : run({ ...f, candidates });
    });
  chain.onClick = () => from((f) => (f.clicked ? run(f) : f.current));
  chain.snap = (stickiness = 0) =>
    from((f) => {
      const current =
        f.current &&
        f.candidates.find(
          (c) =>
            c.key === f.current!.key ||
            c.points?.some((p) => p.key === f.current!.key) === true
        );
      const choice = run({ ...f, current });
      const points = choice?.points;
      if (!points || points.length === 0) return choice;
      return closest({ stickiness })({ ...f, candidates: points }) ?? choice;
    });
  return chain;
}

/** The mark the pointer is inside; where marks overlap, the one on top,
 *  the last in the candidates' paint order. */
function hit(): Chain {
  return from(({ pointer, candidates }) => {
    return pointer && candidates.findLast((c) => inside(pointer, c.outline));
  });
}

/**
 * The nearest candidate. `to` is what distance is measured to: the placed
 * `position` (absent axes drop out; a mark with none is measured to its
 * outline), the box `center`, or the `outline`. The current focus gets a
 * head start of `stickiness` px. A candidate more than `radius` px away,
 * so measured, is not picked.
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
    if (!pointer) return undefined;
    let best: Candidate | undefined;
    let bestD = Infinity;
    let bestScore = Infinity;
    for (const c of candidates) {
      const d = distance(pointer, c, to);
      const score = d - (c.key === current?.key ? stickiness : 0);
      if (score < bestScore) [best, bestD, bestScore] = [c, d, score];
    }
    return bestD > radius ? undefined : best;
  });
}

/** The first behavior in the list that makes a choice. */
function first(behaviors: FocusBehavior[]): Chain {
  return from((f) => {
    for (const b of behaviors) {
      const choice = b(f);
      if (choice) return choice;
    }
    return undefined;
  });
}

export const Focus = { hit, closest, first, from };

/**
 * How near the pointer must be to a mark's drawn outline for the tooltip to
 * describe it, in px. It must be more than half an ordinary gap between bars
 * (4 to 12 px), so that crossing a gap never closes the box, and small
 * enough that the hole of a donut and a wide gap between far-apart bars are
 * dead. Observable Plot's pointer uses 40 px to a point's center, Plotly's
 * `hoverdistance` 20 px.
 */
export const TOOLTIP_REACH = 16;

/** The default tooltip focus. Reach first: only the marks whose drawn
 *  outline is within {@link TOOLTIP_REACH} px of the pointer count (the
 *  current one out to 4 px more). Then the mark under the pointer, else
 *  the nearest of them by placed position, with a 4 px head start for the
 *  current one; on a mark drawn through rows (a line), its row nearest the
 *  pointer, with the same head start. The reach is measured to the line's
 *  path, not the row's point, so sliding along a line keeps the box. With
 *  no mark within reach there is no focus. As a spec this would read
 *  `pointer().snap(selectAll("lines"), { by: ... })`: the marks are the
 *  candidates, and each step here is one pure behavior over them. */
export const defaultFocus: Chain = Focus.first([
  Focus.hit(),
  Focus.closest({ stickiness: 4 }),
])
  .within(TOOLTIP_REACH)
  .snap(4);

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
