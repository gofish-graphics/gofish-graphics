/**
 * PROTOTYPE(#1395): the `Focus` family, written as user code.
 *
 * Everything in this file could be written by a user against the proposed
 * public API: plain types and pure functions, no DOM, no Solid, no GoFish
 * internals. What the runtime would have to hand a behavior is stood in for
 * by `focusRuntime.ts`. Version 1 (draft PR #1401) ships this family with
 * the same shape as internal code (`src/interaction/focus.ts`), not exported.
 *
 * A focus behavior, like a Dragology drag behavior, is a function from a
 * frame to what it chooses: a candidate, or none. Calls start a behavior or
 * join several (`Focus.first`); a step that transforms one behavior is a
 * chained method (`.within`, `.snap`, `.onClick`).
 */

/* -------------------------------- types --------------------------------- */

export type Point = { x: number; y: number };
/** A box in the pointer's coordinates. */
export type Box = { x0: number; y0: number; x1: number; y1: number };
/** A segment of a drawn path. */
export type Segment = readonly [Point, Point];
/**
 * A drawn outline: the parts a mark is drawn as. A part is a box, a circle
 * (a `round` box), a segment of a stroked path (a line's), or a `region`, a
 * filled shape (a wedge, an area) given by the segments of its edge. Its box
 * bounds it.
 */
export type Outline = {
  box: Box;
  round: boolean;
  segment?: Segment;
  region?: readonly Segment[];
}[];

/** A mark the focus can land on. */
export type Candidate = {
  /** Stable across re-runs (#673). */
  key: unknown;
  /** The mark's rows. */
  datum: unknown[];
  /** The drawn box. */
  box: Box;
  /** Where the layout placed the mark. An axis where the mark only has a
   *  size is absent, and so is every axis of a mark drawn across its rows
   *  (a line): a mark with no position is as near as its outline. */
  position: { x?: number; y?: number };
  outline: Outline;
  /** The points of the rows a line is drawn through, each a candidate of
   *  its own, placed at its point, with its row as its datum. `.snap` picks
   *  one. */
  points?: Candidate[];
};

export type Frame = {
  /** Undefined when the pointer is off the chart. */
  pointer: Point | undefined;
  /** In paint order: a candidate is drawn over the ones before it. */
  candidates: Candidate[];
  /** The focus the last frame chose (a point, after a snap). */
  current: Candidate | undefined;
  /** True on the frame of a click. */
  clicked: boolean;
};

/** A behavior chooses a candidate, or none. */
export type FocusBehavior = (frame: Frame) => Candidate | undefined;

/** What a built-in behavior reads besides the candidates, as plain data, so
 *  a tool such as the region overlay (focusDebug.ts) can draw it. It plays
 *  the part of Dragology's per-operator `overlayVis`. A plain function
 *  declares nothing, as Dragology's `custom` draws nothing. */
export type Reads =
  | { kind: "closest"; to: "position" | "center" | "outline"; stickiness: number; radius: number }
  | { kind: "within"; reach: number; out: number }
  | { kind: "snap"; stickiness: number };

/** A behavior with the chained steps. A plain `FocusBehavior` is accepted
 *  wherever a behavior is an argument. */
export type Chain = FocusBehavior & {
  /** Run this behavior on the marks within `reach` px of the pointer only:
   *  those whose drawn outline is that near (0 inside it), and the current
   *  focus out to `out` px. With none in reach it chooses nothing. */
  within(reach: number, out?: number): Chain;
  /** Run this behavior only on a click; between clicks the focus stays. */
  onClick(): Chain;
  /** Then, when the choice is drawn through rows (it has `points`), choose
   *  its point nearest the pointer, the current point with a head start of
   *  `stickiness` px. The behavior before it chooses among marks: there, the
   *  current point counts as its line. */
  snap(stickiness?: number): Chain;
  readonly reads: Reads[];
};

/** What a behavior declares it reads; nothing for a plain function. */
export const readsOf = (b: FocusBehavior): Reads[] => (b as Partial<Chain>).reads ?? [];

/* ------------------------------- the family ------------------------------ */

/** Lift a plain behavior so it can be chained. */
function from(run: FocusBehavior, reads: Reads[] = readsOf(run)): Chain {
  const chain = Object.assign((frame: Frame) => run(frame), { reads }) as Chain;
  chain.within = (reach, out = reach + 4) =>
    from(
      (f) => {
        const p = f.pointer;
        if (!p) return undefined;
        const candidates = f.candidates.filter(
          (c) => outlineDistance(p, c.outline) <= (c.key === f.current?.key ? out : reach)
        );
        return candidates.length === 0 ? undefined : run({ ...f, candidates });
      },
      [...reads, { kind: "within", reach, out }]
    );
  chain.onClick = () => from((f) => (f.clicked ? run(f) : f.current), reads);
  chain.snap = (stickiness = 0) =>
    from(
      (f) => {
        // Before the snap, the current point counts as its line.
        const key = f.current?.key;
        const current =
          f.current &&
          f.candidates.find((c) => c.key === key || c.points?.some((p) => p.key === key) === true);
        const choice = run({ ...f, current });
        const points = choice?.points;
        if (!points || points.length === 0) return choice;
        return closest({ stickiness })({ ...f, candidates: points }) ?? choice;
      },
      [...reads, { kind: "snap", stickiness }]
    );
  return chain;
}

/** The mark the pointer is inside; where marks overlap, the one on top,
 *  the last in paint order. */
function hit(): Chain {
  return from(({ pointer, candidates }) =>
    pointer ? candidates.findLast((c) => inside(pointer, c.outline)) : undefined
  );
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
  return from(
    ({ pointer, candidates, current }) => {
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
    },
    [{ kind: "closest", to, stickiness, radius }]
  );
}

/** The first behavior in the list that makes a choice. */
function first(behaviors: FocusBehavior[]): Chain {
  return from(
    (f) => {
      for (const b of behaviors) {
        const choice = b(f);
        if (choice) return choice;
      }
      return undefined;
    },
    behaviors.flatMap(readsOf)
  );
}

export const Focus = { hit, closest, first, from };

/**
 * How near the pointer must be to a mark's drawn outline, in px. More than
 * half an ordinary gap between bars (4 to 12 px), so crossing a gap never
 * closes the box, and small enough that the hole of a donut and a gap
 * between far-apart bars are quiet. Observable Plot's pointer uses 40 px to
 * a point's center, Plotly's `hoverdistance` 20 px.
 */
export const TOOLTIP_REACH = 16;

/** The default tooltip focus: reach first, then position. Only the marks
 *  whose outline is within 16 px of the pointer count (the current one out
 *  to 20 px). Among them, the mark the pointer is inside, else the nearest
 *  by placed position, with a 4 px head start for the current one. On a
 *  line drawn through rows, then its row nearest the pointer, with the same
 *  head start. With no mark in reach there is no focus. */
export const defaultFocus: Chain = Focus.first([Focus.hit(), Focus.closest({ stickiness: 4 })])
  .within(TOOLTIP_REACH)
  .snap(4);

/* -------------------------------- geometry -------------------------------- */

const center = (b: Box): Point => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
/** The length of (dx, dy). `Math.hypot` is several times slower, which
 *  shows when the region overlay runs a behavior at every grid cell. */
const len = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy);

/** Distance from a point to a box, zero inside it. */
export const boxDistance = (p: Point, b: Box) =>
  len(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1));

/** The point of segment a-b nearest to p. */
function onSegment(p: Point, [a, b]: Segment): Point {
  const [vx, vy] = [b.x - a.x, b.y - a.y];
  const l2 = vx * vx + vy * vy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
  return { x: a.x + t * vx, y: a.y + t * vy };
}

/** True when p is inside a region, by the nonzero rule, as SVG fills a path. */
function inRegion(p: Point, edge: readonly Segment[]): boolean {
  let winding = 0;
  for (const [a, b] of edge) {
    const cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
    if (a.y <= p.y) {
      if (b.y > p.y && cross > 0) winding++;
    } else if (b.y <= p.y && cross < 0) winding--;
  }
  return winding !== 0;
}

/** The point of one outline part nearest to p (p itself inside it). */
function nearestOnPart(p: Point, { box, round, segment, region }: Outline[number]): Point {
  if (segment) return onSegment(p, segment);
  if (region) {
    if (boxDistance(p, box) === 0 && inRegion(p, region)) return p;
    let best = p;
    let bestD = Infinity;
    for (const s of region) {
      const q = onSegment(p, s);
      const d = len(p.x - q.x, p.y - q.y);
      if (d < bestD) [best, bestD] = [q, d];
    }
    return best;
  }
  if (round) {
    const m = center(box);
    const r = (box.x1 - box.x0) / 2;
    const d = len(p.x - m.x, p.y - m.y);
    return d <= r ? p : { x: m.x + ((p.x - m.x) * r) / d, y: m.y + ((p.y - m.y) * r) / d };
  }
  return nearestInBox(p, box);
}

/** The point of an outline nearest to p, and its distance (0 inside). */
export function nearestOnOutline(p: Point, outline: Outline): { at: Point; d: number } {
  let at = p;
  let d = Infinity;
  for (const part of outline) {
    // A part whose box is already farther than the best cannot be nearer.
    if (boxDistance(p, part.box) >= d) continue;
    const q = nearestOnPart(p, part);
    const e = len(p.x - q.x, p.y - q.y);
    if (e < d) [at, d] = [q, e];
  }
  return { at, d };
}

export const outlineDistance = (p: Point, outline: Outline) => nearestOnOutline(p, outline).d;

const inside = (p: Point, outline: Outline) => outlineDistance(p, outline) === 0;

function distance(p: Point, c: Candidate, to: "position" | "center" | "outline") {
  const q = measuredPoint(p, c, to);
  return len(p.x - q.x, p.y - q.y);
}

/** The point `closest` measures to: a placed position (an absent axis takes
 *  the pointer's value; with no axis, the outline), a center, or the
 *  nearest point of the outline. */
export function measuredPoint(p: Point, c: Candidate, to: "position" | "center" | "outline"): Point {
  if (to === "center") return center(c.box);
  const at = c.position;
  if (to === "outline" || (at.x === undefined && at.y === undefined)) return nearestOnOutline(p, c.outline).at;
  return { x: at.x ?? p.x, y: at.y ?? p.y };
}

/** The point of a box nearest to `p` (`p` itself inside). */
export const nearestInBox = (p: Point, b: Box): Point => ({
  x: Math.min(Math.max(p.x, b.x0), b.x1),
  y: Math.min(Math.max(p.y, b.y0), b.y1),
});
