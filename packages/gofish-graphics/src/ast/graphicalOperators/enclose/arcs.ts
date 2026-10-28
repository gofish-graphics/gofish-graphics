// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * The outline of `Shape.arcs({ radius })`: pure geometry, no GoFish nodes.
 *
 * The region is the morphological closing, by a disc of `radius`, of the
 * union of the members each grown by `padding`, with its holes filled (the
 * bubble treemap contour of Görtler et al., TVCG 2018). Every gap the disc
 * cannot pass through fills, each concave corner becomes a circular arc of
 * `radius`, and the convex parts are the padded members' own boundaries.
 * Between flat members that is a gap narrower than 2 × radius; two padded
 * discs of radius a with a gap g between them join only when
 * 2·a·radius ≥ a·g + g²/4, and otherwise stay separate pieces.
 *
 * The construction is exact up to sampling:
 *  1. Grow every member by padding + radius. Each grown member is convex and
 *     bounded by circular arcs and straight lines: a disc is a circle, a
 *     segment (a piece of a drawn line, as wide as its stroke) a capsule, a
 *     box a rounded box.
 *  2. Trace the union's boundary exactly: split every edge where another
 *     grown member's edge crosses it and keep the parts no other grown member
 *     covers, then link them into loops. Keep the outer loops (holes are
 *     filled), and drop a loop that lies inside another.
 *  3. Shrink the outer boundary by radius: each arc keeps its center and loses
 *     radius (a disc's arc becomes the padded disc's), each line moves inward,
 *     and each corner of the union becomes an arc of `radius` around it.
 *  4. Where the shrunk boundary crosses itself (a neck narrower than
 *     2 × radius, a pocket the disc cannot reach), keep only its points that
 *     are a full radius from the union's boundary: the closing's boundary is
 *     exactly that set. The cut points are found by bisection on the exact
 *     curves, and the kept runs are relinked into loops.
 *
 * Every output point lies on the exact curve; arcs are sampled so a chord
 * strays at most TOL px from its arc. An ellipse member is read, as the blob
 * reads it, as the disc of its larger radius (`members.ts`).
 */
import { signedArea2, pointInRing, segDist } from "../../geometry/plane";
import { ringExtent } from "../../geometry/box";
import {
  boxGrid,
  grownPrim,
  primD,
  type BlobMember,
  type Prim,
  type Pt,
} from "./blob";

/** How far a chord may stray from the arc it samples, in pixels. */
const TOL = 0.2;
/** The longest straight run between two samples, in pixels (the cut search
 *  of step 4 works between samples). */
const MAX_STEP = 4;
const EPS = 1e-7;
const TAU = 2 * Math.PI;

/** An edge of a grown member, run so the member is on its left (angle
 *  increasing on an arc). A curve of the shrunk boundary is one too (an arc
 *  there may run backward). */
type Line = { t: "line"; ax: number; ay: number; bx: number; by: number };
type Arc = {
  t: "arc";
  cx: number;
  cy: number;
  R: number;
  a0: number;
  a1: number;
};
type Edge = Line | Arc;

/** A grown member: its exact primitive (the blob's, whose signed distance
 *  `primD` reads) and its boundary as edges. */
type Grown = { prim: Prim; edges: Edge[] };

/** The edges of a capsule of radius R around segment ab (a disc when a = b). */
function capsuleEdges(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  R: number
): Edge[] {
  const L = Math.hypot(bx - ax, by - ay);
  if (L < 1e-9) return [{ t: "arc", cx: ax, cy: ay, R, a0: 0, a1: TAU }];
  const ux = (bx - ax) / L,
    uy = (by - ay) / L;
  const phi = Math.atan2(uy, ux);
  // right of the direction (uy, -ux) runs a → b with the capsule on the left
  const [nx, ny] = [uy, -ux];
  return [
    {
      t: "line",
      ax: ax + R * nx,
      ay: ay + R * ny,
      bx: bx + R * nx,
      by: by + R * ny,
    },
    {
      t: "arc",
      cx: bx,
      cy: by,
      R,
      a0: phi - Math.PI / 2,
      a1: phi + Math.PI / 2,
    },
    {
      t: "line",
      ax: bx - R * nx,
      ay: by - R * ny,
      bx: ax - R * nx,
      by: ay - R * ny,
    },
    {
      t: "arc",
      cx: ax,
      cy: ay,
      R,
      a0: phi + Math.PI / 2,
      a1: phi + (3 * Math.PI) / 2,
    },
  ];
}

/** The edges of box [x0, x1] × [y0, y1] grown by g: a rounded box (sharp
 *  when g = 0). */
function roundedBoxEdges(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  g: number
): Edge[] {
  const edges: Edge[] = [];
  const line = (ax: number, ay: number, bx: number, by: number) => {
    if (Math.hypot(bx - ax, by - ay) > 1e-9)
      edges.push({ t: "line", ax, ay, bx, by });
  };
  const arc = (cx: number, cy: number, a0: number) => {
    if (g > 0) edges.push({ t: "arc", cx, cy, R: g, a0, a1: a0 + Math.PI / 2 });
  };
  line(x0, y0 - g, x1, y0 - g);
  arc(x1, y0, -Math.PI / 2);
  line(x1 + g, y0, x1 + g, y1);
  arc(x1, y1, 0);
  line(x1, y1 + g, x0, y1 + g);
  arc(x0, y1, Math.PI / 2);
  line(x0 - g, y1, x0 - g, y0);
  arc(x0, y0, Math.PI);
  return edges;
}

/** Member `m` grown by g: the blob's primitive for it (a disc, a capsule or
 *  a rounded box), and the exact edges of that primitive's boundary. */
function grown(m: BlobMember, g: number): Grown {
  const p = grownPrim(m, g);
  const edges =
    p.k === 0
      ? [{ t: "arc", cx: p.x1, cy: p.y1, R: p.r, a0: 0, a1: TAU } as Edge]
      : p.k === 1
        ? capsuleEdges(p.x1, p.y1, p.x2, p.y2, p.r)
        : roundedBoxEdges(p.x1, p.y1, p.x2, p.y2, p.r);
  return { prim: p, edges };
}

// ── Edges as curves ─────────────────────────────────────────────────────────

/** The point at parameter s of an edge (t in [0, 1] on a line, the angle on
 *  an arc), one coordinate at a time. */
const atX = (e: Edge, s: number): number =>
  e.t === "line" ? e.ax + (e.bx - e.ax) * s : e.cx + e.R * Math.cos(s);
const atY = (e: Edge, s: number): number =>
  e.t === "line" ? e.ay + (e.by - e.ay) * s : e.cy + e.R * Math.sin(s);
const at = (e: Edge, s: number): Pt => [atX(e, s), atY(e, s)];
const range = (e: Edge): [number, number] =>
  e.t === "line" ? [0, 1] : [e.a0, e.a1];
/** The angle `a` as the parameter of arc e, or NaN when it is off the arc. */
const onArc = (e: Arc, a: number) => {
  let s = a;
  while (s < e.a0) s += TAU;
  while (s >= e.a0 + TAU) s -= TAU;
  return s <= e.a1 ? s : NaN;
};
/** The parameter on line l of (x, y) projected onto it. */
const lineParam = (l: Line, x: number, y: number): number => {
  const ex = l.bx - l.ax,
    ey = l.by - l.ay;
  return ((x - l.ax) * ex + (y - l.ay) * ey) / (ex * ex + ey * ey);
};

/** The parameter on edge e of a point (x, y) on it, or NaN when it is off e. */
function paramOn(e: Edge, x: number, y: number): number {
  if (e.t === "arc") {
    const d = Math.hypot(x - e.cx, y - e.cy);
    if (Math.abs(d - e.R) > 1e-9) return NaN;
    return onArc(e, Math.atan2(y - e.cy, x - e.cx));
  }
  const t = lineParam(e, x, y);
  if (t < 0 || t > 1) return NaN;
  return Math.hypot(atX(e, t) - x, atY(e, t) - y) <= 1e-9 ? t : NaN;
}

/** Whether a point on the line or circle of edge f lies within f's run. */
const onEdge = (f: Edge, x: number, y: number): boolean =>
  f.t === "line"
    ? (() => {
        const t = lineParam(f, x, y);
        return t >= -1e-12 && t <= 1 + 1e-12;
      })()
    : !Number.isNaN(onArc(f, Math.atan2(y - f.cy, x - f.cx)));

/** The parameters on line l where it meets the circle of arc c, in order
 *  along l; none when it misses or touches the circle. */
function lineCircle(l: Line, c: Arc): number[] {
  const dx = l.bx - l.ax,
    dy = l.by - l.ay;
  const ox = l.ax - c.cx,
    oy = l.ay - c.cy;
  const A = dx * dx + dy * dy,
    B = 2 * (ox * dx + oy * dy),
    C = ox * ox + oy * oy - c.R * c.R;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return [];
  const q = Math.sqrt(disc);
  return [(-B - q) / (2 * A), (-B + q) / (2 * A)];
}

/** Cut e (onto `out`) where an end of f lies on it, so an arc that shares a
 *  circle with another, as two lines' joined ends do, or a line that runs
 *  along another, is cut where the other stops. */
function endsOn(e: Edge, f: Edge, out: number[]): void {
  const [s0, s1] = f.t === "line" ? [0, 1] : [f.a0, f.a1];
  const t0 = paramOn(e, atX(f, s0), atY(f, s0));
  if (!Number.isNaN(t0)) out.push(t0);
  const t1 = paramOn(e, atX(f, s1), atY(f, s1));
  if (!Number.isNaN(t1)) out.push(t1);
}

/** The parameters on arc e (onto `out`) where the circle of arc f crosses
 *  it within f's run. */
function arcArc(e: Arc, f: Arc, out: number[]): void {
  const ddx = f.cx - e.cx,
    ddy = f.cy - e.cy,
    d = Math.hypot(ddx, ddy);
  if (d < 1e-12 || d >= e.R + f.R || d <= Math.abs(e.R - f.R)) return;
  const al = Math.acos(
    Math.max(-1, Math.min(1, (e.R * e.R + d * d - f.R * f.R) / (2 * e.R * d)))
  );
  const base = Math.atan2(ddy, ddx);
  for (const a of [base - al, base + al]) {
    const s = onArc(e, a);
    if (!Number.isNaN(s) && onEdge(f, atX(e, s), atY(e, s))) out.push(s);
  }
}

/**
 * Where edges e and f cross, as cut parameters on each: onto `ce` the
 * parameters on e where f crosses it or ends on it, onto `cf` the same on f.
 * Each crossing is solved once for the pair.
 */
function crossPair(e: Edge, f: Edge, ce: number[], cf: number[]): void {
  endsOn(e, f, ce);
  endsOn(f, e, cf);
  if (e.t === "arc" && f.t === "arc") {
    arcArc(e, f, ce);
    arcArc(f, e, cf);
    return;
  }
  if (e.t === "line" && f.t === "line") {
    const dx = e.bx - e.ax,
      dy = e.by - e.ay;
    const fx = f.bx - f.ax,
      fy = f.by - f.ay;
    const den = dx * fy - dy * fx;
    if (Math.abs(den) < 1e-14) return;
    const t = ((f.ax - e.ax) * fy - (f.ay - e.ay) * fx) / den;
    const u = ((f.ax - e.ax) * dy - (f.ay - e.ay) * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ce.push(t);
    if (u > 0 && u < 1 && t >= 0 && t <= 1) cf.push(u);
    return;
  }
  // a line × an arc
  const [l, c, cl, cc] =
    e.t === "line" ? [e, f as Arc, ce, cf] : [f as Line, e as Arc, cf, ce];
  const dx = l.bx - l.ax,
    dy = l.by - l.ay;
  for (const u of lineCircle(l, c)) {
    if (u > 0 && u < 1 && onEdge(c, atX(l, u), atY(l, u))) cl.push(u);
    if (u < 0 || u > 1) continue;
    const s = onArc(c, Math.atan2(l.ay - c.cy + u * dy, l.ax - c.cx + u * dx));
    if (!Number.isNaN(s)) cc.push(s);
  }
}

/** A box that holds an edge (an arc's own angular run), a little grown. */
function boxOfEdge(e: Edge): number[] {
  if (e.t === "line")
    return [
      Math.min(e.ax, e.bx) - 1e-6,
      Math.min(e.ay, e.by) - 1e-6,
      Math.max(e.ax, e.bx) + 1e-6,
      Math.max(e.ay, e.by) + 1e-6,
    ];
  const lo = Math.min(e.a0, e.a1),
    hi = Math.max(e.a0, e.a1);
  let x0 = Math.min(Math.cos(lo), Math.cos(hi)),
    x1 = Math.max(Math.cos(lo), Math.cos(hi)),
    y0 = Math.min(Math.sin(lo), Math.sin(hi)),
    y1 = Math.max(Math.sin(lo), Math.sin(hi));
  // the axis extremes the run passes
  for (let k = Math.ceil(lo / (Math.PI / 2)); k * (Math.PI / 2) <= hi; k++) {
    const q = ((k % 4) + 4) % 4;
    if (q === 0) x1 = 1;
    else if (q === 1) y1 = 1;
    else if (q === 2) x0 = -1;
    else y0 = -1;
  }
  return [
    e.cx + e.R * x0 - 1e-6,
    e.cy + e.R * y0 - 1e-6,
    e.cx + e.R * x1 + 1e-6,
    e.cy + e.R * y1 + 1e-6,
  ];
}

/** A piece of an edge from parameter s0 to s1. */
type Piece = { e: Edge; s0: number; s1: number };

/** The outward normal (the member on the left, so the normal on the right)
 *  of an edge at parameter s. */
const normal = (e: Edge, s: number): Pt =>
  e.t === "arc"
    ? [Math.cos(s), Math.sin(s)]
    : (() => {
        const L = Math.hypot(e.bx - e.ax, e.by - e.ay);
        return [(e.by - e.ay) / L, -(e.bx - e.ax) / L];
      })();

/** The distance from p to a piece. */
function pieceDist(p: Pt, q: Piece): number {
  const e = q.e;
  if (e.t === "line") {
    const [a, b] = [at(e, q.s0), at(e, q.s1)];
    return segDist(p[0], p[1], a[0], a[1], b[0], b[1]);
  }
  const s = onArc(
    { ...e, a0: q.s0, a1: q.s1 },
    Math.atan2(p[1] - e.cy, p[0] - e.cx)
  );
  if (!Number.isNaN(s))
    return Math.abs(Math.hypot(p[0] - e.cx, p[1] - e.cy) - e.R);
  const [a, b] = [at(e, q.s0), at(e, q.s1)];
  return Math.min(
    Math.hypot(p[0] - a[0], p[1] - a[1]),
    Math.hypot(p[0] - b[0], p[1] - b[1])
  );
}

const overlaps = (a: number[], b: number[]) =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Link curve runs end to start into closed loops: after each run, the run
 *  whose start is nearest its end (the first such on a tie), among the
 *  starts within 1 px, or among them all when none is that near. */
function link<T>(runs: T[], start: (r: T) => Pt, end: (r: T) => Pt): T[][] {
  const used = new Array(runs.length).fill(false);
  const loops: T[][] = [];
  const starts = runs.map(start);
  const near = boxGrid(starts.map(([x, y]) => [x, y, x, y]));
  const all = runs.map((_, k) => k);
  for (let s0 = 0; s0 < runs.length; s0++) {
    if (used[s0]) continue;
    const loop: T[] = [];
    let i = s0;
    while (i >= 0 && !used[i]) {
      used[i] = true;
      loop.push(runs[i]);
      const [ex, ey] = end(runs[i]);
      const dist = (k: number) =>
        Math.hypot(starts[k][0] - ex, starts[k][1] - ey);
      let next = -1,
        best = Infinity;
      const within = near
        .query(ex - 1, ey - 1, ex + 1, ey + 1)
        .filter((k) => dist(k) <= 1);
      // in index order, so a tie goes to the first
      for (const k of within.length > 0 ? within : all) {
        if (used[k] && k !== s0) continue;
        const d = dist(k);
        if (d < best) [best, next] = [d, k];
      }
      if (next === s0) break;
      i = next;
    }
    loops.push(loop);
  }
  return loops;
}

/** Sample a piece: its points from s0 to s1, both ends included. */
function sampleParams(e: Edge, s0: number, s1: number): number[] {
  let n: number;
  if (e.t === "line") {
    const L = Math.hypot(e.bx - e.ax, e.by - e.ay) * Math.abs(s1 - s0);
    n = Math.max(1, Math.ceil(L / MAX_STEP));
  } else {
    const step =
      e.R <= TOL
        ? Math.PI
        : Math.min(2 * Math.acos(1 - TOL / e.R), MAX_STEP / e.R);
    n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / step));
  }
  return Array.from({ length: n + 1 }, (_, i) => s0 + ((s1 - s0) * i) / n);
}

/** The options of {@link arcsOutline}. */
export type ArcsOutlineOptions = {
  /** Pixels between each member and the outline. */
  padding: number;
  /** The radius of the closing disc, in pixels. */
  radius: number;
};

/**
 * The outline of `Shape.arcs()` around `members`: its closed loops, in the
 * members' frame, all winding one way (it has no holes). A gap the closing
 * disc passes through leaves the pieces apart, one loop each. No members, no
 * outline.
 */
export function arcsOutline(
  members: BlobMember[],
  o: ArcsOutlineOptions
): Pt[][] {
  if (members.length === 0) return [];
  const r = Math.max(0, o.radius);
  const prims = members.map((m) => grown(m, Math.max(0, o.padding) + r));
  const sdf = (j: number, x: number, y: number) =>
    primD(prims[j].prim, x, y, false);

  // 2. The union's boundary.
  const near = boxGrid(prims.map((p) => p.prim.bb));
  const others = prims.map((P, i) => {
    const [xa, ya, xb, yb] = P.prim.bb;
    return near
      .query(xa, ya, xb, yb)
      .filter((j) => j !== i && overlaps(P.prim.bb, prims[j].prim.bb));
  });
  const edgeBB = prims.map((P) => P.edges.map(boxOfEdge));
  // Every edge's cut parameters: its ends, and where another member's edge
  // crosses it or ends on it, each crossing solved once for its pair.
  const cuts = prims.map((P) => P.edges.map(range));
  prims.forEach((P, i) => {
    for (const j of others[i]) {
      if (j < i) continue;
      P.edges.forEach((e, ei) => {
        const eb = edgeBB[i][ei];
        prims[j].edges.forEach((f, fi) => {
          if (overlaps(eb, edgeBB[j][fi]))
            crossPair(e, f, cuts[i][ei], cuts[j][fi]);
        });
      });
    }
  });
  const pieces: Piece[] = [];
  prims.forEach((P, i) => {
    P.edges.forEach((e, ei) => {
      const eb = edgeBB[i][ei];
      const touching = others[i].filter((j) => overlaps(eb, prims[j].prim.bb));
      const cs = cuts[i][ei].sort((a, b) => a - b);
      // covered by another member; on a tie (two equal members) the first
      // keeps it. The member that covered the last part is tried first.
      const covers = (j: number, x: number, y: number) => {
        const d = sdf(j, x, y);
        return d < -EPS || (d <= EPS && j < i);
      };
      let lastCover = -1;
      for (let k = 0; k + 1 < cs.length; k++) {
        const [s0, s1] = [cs[k], cs[k + 1]];
        if (s1 - s0 < 1e-12) continue;
        const [mx, my] = at(e, (s0 + s1) / 2);
        if (lastCover >= 0 && covers(lastCover, mx, my)) continue;
        lastCover = touching.find((j) => covers(j, mx, my)) ?? -1;
        if (lastCover >= 0) continue;
        const last = pieces.at(-1);
        if (last && last.e === e && Math.abs(last.s1 - s0) < 1e-12)
          last.s1 = s1;
        else pieces.push({ e, s0, s1 });
      }
    });
  });
  const loops = link(
    pieces,
    (q) => at(q.e, q.s0),
    (q) => at(q.e, q.s1)
  ).map((loop) => ({
    loop,
    ring: loop.flatMap((q) =>
      sampleParams(q.e, q.s0, q.s1).map((s) => at(q.e, s))
    ),
  }));
  // Outer loops wind as the members do; the holes the other way.
  const outer = loops
    .filter(({ ring }) => signedArea2(ring) > 0)
    .sort((a, b) => signedArea2(b.ring) - signedArea2(a.ring));
  const kept = outer.filter(
    (L, k) => !outer.slice(0, k).some((B) => pointInRing(L.ring[0], B.ring))
  );
  const boundary = kept.flatMap((L) => L.loop);

  // 3. Shrink by r: offset each piece inward, with an arc of r at each corner.
  // A curve of the shrunk boundary is an edge (an arc may run backward).
  const shrunk: Edge[][] = kept.map(({ loop }) => {
    const out: Edge[] = [];
    loop.forEach((q, k) => {
      const e = q.e;
      if (e.t === "arc") {
        const R = e.R - r;
        if (R > 1e-9) out.push({ ...e, R, a0: q.s0, a1: q.s1 });
      } else {
        const [nx, ny] = normal(e, 0);
        const [a, b] = [at(e, q.s0), at(e, q.s1)];
        out.push({
          t: "line",
          ax: a[0] - r * nx,
          ay: a[1] - r * ny,
          bx: b[0] - r * nx,
          by: b[1] - r * ny,
        });
      }
      if (r <= 0) return;
      // the corner after this piece
      const nxt = loop[(k + 1) % loop.length];
      const v = at(e, q.s1);
      const [n1x, n1y] = normal(e, q.s1);
      const [n2x, n2y] = normal(nxt.e, nxt.s0);
      const f0 = Math.atan2(-n1y, -n1x);
      let sweep = Math.atan2(-n2y, -n2x) - f0;
      while (sweep > Math.PI) sweep -= TAU;
      while (sweep < -Math.PI) sweep += TAU;
      if (Math.abs(sweep) < 1e-9) return;
      // an arc of r around the corner (a1 < a0 when it turns the other way)
      out.push({ t: "arc", cx: v[0], cy: v[1], R: r, a0: f0, a1: f0 + sweep });
    });
    return out;
  });

  // 4. Keep the points a full radius from the boundary.
  const pieceBB = boundary.map((q) => {
    const e = ringExtent(sampleParams(q.e, q.s0, q.s1).map((s) => at(q.e, s)));
    return [e.minX - 1, e.minY - 1, e.maxX + 1, e.maxY + 1];
  });
  const nearPiece = boxGrid(pieceBB);
  const valid = (p: Pt) => {
    if (r <= 0) return true;
    for (const k of nearPiece.query(p[0] - r, p[1] - r, p[0] + r, p[1] + r))
      if (pieceDist(p, boundary[k]) < r - 1e-6) return false;
    return true;
  };

  // The samples of each curve, in loop order.
  type Sample = { p: Pt; c: Edge; s: number; ok: boolean };
  const runs: Pt[][] = [];
  for (const curves of shrunk) {
    const samples: Sample[] = [];
    for (const c of curves) {
      const [lo, hi] = range(c);
      const ps = sampleParams(c, lo, hi);
      // drop the first sample: it is the previous curve's last
      for (const s of ps.slice(samples.length > 0 ? 1 : 0)) {
        const p = at(c, s);
        samples.push({ p, c, s, ok: valid(p) });
      }
    }
    if (samples.length > 1) {
      const [f, l] = [samples[0].p, samples.at(-1)!.p];
      if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) samples.pop();
    }
    if (samples.every((x) => x.ok)) {
      runs.push(samples.map((x) => x.p));
      continue;
    }
    // Where validity changes between two samples, bisect on the exact curve
    // between them. A curve's first sample is dropped (it is the previous
    // curve's last), so the stretch from `prev` to `cur` runs along `cur`'s
    // curve, from `prev` or from the curve's start; only the loop's first
    // sample is a curve's start, and the stretch to it (the loop wrapping)
    // runs along `prev`'s curve to its end.
    const cut = (prev: Sample, cur: Sample): Pt => {
      const [lo] = range(cur.c);
      const [c, a, b] =
        cur.s === lo
          ? [prev.c, prev.s, range(prev.c)[1]]
          : [cur.c, prev.c === cur.c ? prev.s : lo, cur.s];
      let [sOk, sBad] = prev.ok ? [a, b] : [b, a];
      for (let it = 0; it < 50; it++) {
        const m = (sOk + sBad) / 2;
        if (valid(at(c, m))) sOk = m;
        else sBad = m;
      }
      return at(c, sOk);
    };
    const n = samples.length;
    const first = samples.findIndex((x) => !x.ok);
    let run: Pt[] | null = null;
    for (let k = 1; k <= n; k++) {
      const prev = samples[(first + k - 1) % n],
        cur = samples[(first + k) % n];
      if (cur.ok && !prev.ok) run = [cut(prev, cur), cur.p];
      else if (cur.ok && run) run.push(cur.p);
      else if (!cur.ok && prev.ok && run) {
        run.push(cut(prev, cur));
        runs.push(run);
        run = null;
      }
    }
  }
  const out = link(
    runs,
    (r) => r[0],
    (r) => r.at(-1)!
  ).map((loop) => loop.flat());
  // A loop of the closing winds as the members do (it has no holes); a tiny
  // or backward one is a sliver from a cut, not part of the region.
  return out.filter((ring) => ring.length > 2 && signedArea2(ring) > 1e-3);
}
