/**
 * PROTOTYPE(#1395): the `Focus` family, written as user code.
 *
 * Everything in this file could be written by a user against the proposed
 * public API: plain types and pure functions, no DOM, no Solid, no GoFish
 * internals. What the runtime would have to hand a behavior is stood in for
 * by `focusRuntime.ts`.
 *
 * A focus behavior, like a Dragology drag behavior, is a function from a
 * frame to a result. Calls start a behavior or join several (`Focus.first`);
 * a step that transforms one behavior is a chained method (`.within`).
 */

/* -------------------------------- types --------------------------------- */

export type Point = { x: number; y: number };
/** A box in the pointer's coordinates. */
export type Box = { x0: number; y0: number; x1: number; y1: number };
/** A drawn outline: the boxes and circles a mark is drawn as. */
export type Outline = { box: Box; round: boolean }[];

/** A mark the focus can land on. */
export type Candidate = {
  /** Stable across re-runs (#673). */
  key: unknown;
  /** The mark's rows. */
  datum: unknown[];
  /** The drawn box. */
  box: Box;
  /** Where the layout placed the mark. An axis with only a size is absent. */
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
  chain.within = (gap, out = gap + 4) =>
    from((f) => {
      const r = run(f);
      if (!r.choice || !f.pointer) return r;
      const limit = f.current ? out : gap;
      return hullDistance(f.pointer, hullOf(f.candidates)) > limit ? NONE : r;
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
 * `position` (absent axes drop out), the box `center`, or the `outline`.
 * The current focus gets a head start of `stickiness` px. A candidate more
 * than `radius` px away is not picked.
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

/** The default tooltip focus. */
export const defaultFocus = Focus.first([
  Focus.hit(),
  Focus.closest({ stickiness: 4 }),
]).within(8);

/* -------------------------------- geometry -------------------------------- */

const center = (b: Box): Point => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });

/** Distance from a point to a box, zero inside it. */
export const boxDistance = (p: Point, b: Box) =>
  Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1));

function outlineDistance(p: Point, outline: Outline) {
  return Math.min(
    ...outline.map(({ box, round }) => {
      if (!round) return boxDistance(p, box);
      const c = center(box);
      return Math.max(0, Math.hypot(p.x - c.x, p.y - c.y) - (box.x1 - box.x0) / 2);
    })
  );
}

const inside = (p: Point, outline: Outline) => outlineDistance(p, outline) === 0;

function distance(p: Point, c: Candidate, to: "position" | "center" | "outline") {
  if (to === "outline") return outlineDistance(p, c.outline);
  const at = to === "center" ? center(c.box) : c.position;
  return Math.hypot(p.x - (at.x ?? p.x), p.y - (at.y ?? p.y));
}

/** The convex hull of the candidates' outline corners (monotone chain),
 *  kept per candidate list. */
const hulls = new WeakMap<Candidate[], Point[]>();
function hullOf(candidates: Candidate[]): Point[] {
  const known = hulls.get(candidates);
  if (known) return known;
  const pts = candidates
    .flatMap((c) => c.outline)
    .flatMap(({ box: b }) => [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y0 },
      { x: b.x0, y: b.y1 },
      { x: b.x1, y: b.y1 },
    ])
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (ps: Point[]) => {
    const h: Point[] = [];
    for (const p of ps) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  const hull = [...half(pts), ...half([...pts].reverse())];
  hulls.set(candidates, hull);
  return hull;
}

/** Distance from a point to a convex polygon, zero inside it. */
function hullDistance(p: Point, hull: Point[]) {
  let inside = hull.length >= 3;
  let d = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const [vx, vy] = [b.x - a.x, b.y - a.y];
    if (vx * (p.y - a.y) - vy * (p.x - a.x) < 0) inside = false;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
    d = Math.min(d, Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy));
  }
  return inside ? 0 : d;
}
