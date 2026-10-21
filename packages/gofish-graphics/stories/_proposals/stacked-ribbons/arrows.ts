// Box-to-box arrows as anchors, EMULATED. Three ways to pick where an arrow
// meets a node, computed by hand here and drawn with today's marks:
//
//   clip:  the reference point is the node's center; the line from center to
//          center is cut where it crosses the node's outline (Graphviz
//          headclip, TikZ `(a) -- (b)`, JointJS connectionPoint "boundary").
//   sides: each end picks ONE side of the node (the side the center-to-center
//          ray leaves through), then the ends on one side are spread evenly
//          along it, ordered by the far node's position (ELK: port side
//          first, then port order).
//
// The proposed spellings are in the header of Arrows.stories.tsx.

export type Pt = [number, number];
export type ArrowNode = {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  shape: "rect" | "ellipse";
};
export type Side = "x-min" | "x-max" | "y-min" | "y-max";

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => mul(a, 1 / (len(a) || 1));
const center = (n: ArrowNode): Pt => [n.cx, n.cy];

/** Where the ray from n's center in direction d leaves n's OUTLINE (the
 *  shape, not its box), pushed out by `pad`. */
export function boundaryPoint(n: ArrowNode, d: Pt, pad = 0): Pt {
  const u = unit(d);
  const a = n.w / 2;
  const b = n.h / 2;
  const t =
    n.shape === "ellipse"
      ? 1 / Math.sqrt((u[0] / a) ** 2 + (u[1] / b) ** 2)
      : Math.min(
          Math.abs(u[0]) > 1e-9 ? a / Math.abs(u[0]) : Infinity,
          Math.abs(u[1]) > 1e-9 ? b / Math.abs(u[1]) : Infinity
        );
  return add(center(n), mul(u, t + pad));
}

/** The side the center-to-center ray leaves n through. */
export function facingSide(n: ArrowNode, far: ArrowNode): Side {
  const [dx, dy] = sub(center(far), center(n));
  return Math.abs(dx) / (n.w / 2) >= Math.abs(dy) / (n.h / 2)
    ? dx < 0
      ? "x-min"
      : "x-max"
    : dy < 0
      ? "y-min"
      : "y-max";
}

const normal: Record<Side, Pt> = {
  "x-min": [-1, 0],
  "x-max": [1, 0],
  "y-min": [0, -1],
  "y-max": [0, 1],
};

/** A point on side s at fraction f (0..1) along it, low end first. */
function sidePoint(n: ArrowNode, s: Side, f: number): Pt {
  const x0 = n.cx - n.w / 2;
  const y0 = n.cy - n.h / 2;
  switch (s) {
    case "x-min":
      return [x0, y0 + f * n.h];
    case "x-max":
      return [x0 + n.w, y0 + f * n.h];
    case "y-min":
      return [x0 + f * n.w, y0];
    case "y-max":
      return [x0 + f * n.w, y0 + n.h];
  }
}

/** One drawn arrow: a polyline body and a head triangle. */
export type DrawnArrow = { body: Pt[]; head: Pt[] };

function head(tip: Pt, dir: Pt, size: number): Pt[] {
  const u = unit(dir);
  const p: Pt = [-u[1], u[0]];
  const base = sub(tip, mul(u, size * 1.6));
  return [tip, add(base, mul(p, size * 0.7)), sub(base, mul(p, size * 0.7))];
}

/** (ii) Center anchor + boundary clip. The head's tip sits `gap` px off
 *  the target outline; the tail starts `gap0` px off the source outline. */
export function clipArrows(
  nodes: ArrowNode[],
  edges: [string, string][],
  { gap0 = 2, gap = 2, headSize = 5 } = {}
): DrawnArrow[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges.map(([f, t]) => {
    const a = byId.get(f)!;
    const b = byId.get(t)!;
    const d = sub(center(b), center(a));
    const s = boundaryPoint(a, d, gap0);
    const e = boundaryPoint(b, mul(d, -1), gap);
    const back = sub(e, mul(unit(d), headSize * 1.6));
    return { body: [s, back], head: head(e, d, headSize) };
  });
}

/** One end of an edge on a node: the edge's index, which end, the far node. */
type End = { edge: number; end: 0 | 1; far: ArrowNode };

/** (iii) Side choice, then slots. Phase 1: every end picks the side facing
 *  its far node's CENTER. Phase 2: the ends on one side are ordered by where the ray to the far
 *  node's center crosses the side and spread evenly over it (`spread()` with no
 *  spacing). Neither phase reads the other end's slot, so there is no cycle. */
export function sideSlotArrows(
  nodes: ArrowNode[],
  edges: [string, string][],
  { gap = 2, headSize = 5, bend = 0.4, sides }: {
    gap?: number;
    headSize?: number;
    bend?: number;
    /** Candidate sides per node id (default: all four). */
    sides?: Record<string, Side[]>;
  } = {}
): { arrows: DrawnArrow[]; slots: { node: string; side: Side; p: Pt }[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const all: Side[] = ["x-min", "x-max", "y-min", "y-max"];
  // Phase 1: side per end.
  const groups = new Map<string, End[]>();
  const sideOf = new Map<string, Side>();
  edges.forEach(([f, t], i) => {
    for (const [end, me, far] of [
      [0, f, t],
      [1, t, f],
    ] as const) {
      const n = byId.get(me)!;
      const o = byId.get(far)!;
      const cands = sides?.[me] ?? all;
      let s = facingSide(n, o);
      if (!cands.includes(s)) {
        // Best allowed candidate: the side whose normal is closest to the
        // direction of the far node.
        const d = unit(sub(center(o), center(n)));
        s = cands.reduce((best, c) =>
          normal[c][0] * d[0] + normal[c][1] * d[1] >
          normal[best][0] * d[0] + normal[best][1] * d[1]
            ? c
            : best
        );
      }
      sideOf.set(`${i}:${end}`, s);
      const k = `${me}|${s}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push({ edge: i, end, far: o });
    }
  });
  // Phase 2: order on each side by the far center, then spread evenly.
  const point = new Map<string, Pt>();
  const slots: { node: string; side: Side; p: Pt }[] = [];
  for (const [k, ends] of groups) {
    const [id, s] = k.split("|") as [string, Side];
    const n = byId.get(id)!;
    const along = s === "x-min" || s === "x-max" ? 1 : 0;
    // Where the ray toward the far center crosses the side's line: the
    // far position, seen from this node. Crossing-free for straight rays.
    const key = (e: End) => {
      const d = sub(center(e.far), center(n));
      return d[along] / Math.abs(d[1 - along] || 1e-9);
    };
    ends.sort((p, q) => key(p) - key(q));
    ends.forEach((e, j) => {
      const p = sidePoint(n, s, (j + 1) / (ends.length + 1));
      point.set(`${e.edge}:${e.end}`, p);
      slots.push({ node: id, side: s, p });
    });
  }
  const arrows = edges.map((_, i) => {
    const s0 = sideOf.get(`${i}:0`)!;
    const s1 = sideOf.get(`${i}:1`)!;
    const p0 = add(point.get(`${i}:0`)!, mul(normal[s0], 0));
    const tip = add(point.get(`${i}:1`)!, mul(normal[s1], gap));
    const L = len(sub(tip, p0)) * bend;
    // A cubic that leaves and enters along each side's normal.
    const c0 = add(p0, mul(normal[s0], L));
    const back = add(tip, mul(normal[s1], headSize * 1.6));
    const c1 = add(back, mul(normal[s1], L));
    const body: Pt[] = [];
    for (let k = 0; k <= 32; k++) {
      const t = k / 32;
      const mt = 1 - t;
      body.push([
        mt ** 3 * p0[0] + 3 * mt * mt * t * c0[0] + 3 * mt * t * t * c1[0] + t ** 3 * back[0],
        mt ** 3 * p0[1] + 3 * mt * mt * t * c0[1] + 3 * mt * t * t * c1[1] + t ** 3 * back[1],
      ]);
    }
    return { body, head: head(tip, mul(normal[s1], -1), headSize) };
  });
  return { arrows, slots };
}

/** A polyline as a closed ring that doubles back on itself, so a stroked
 *  `polygon` draws it as an open line. */
export const lineRing = (pts: Pt[]): Pt[] =>
  pts.length === 2 ? [pts[0], pts[1], pts[0]] : [...pts, ...pts.slice(1, -1).reverse()];
