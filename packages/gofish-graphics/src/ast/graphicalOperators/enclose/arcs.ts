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
import { signedArea2, pointInRing } from "../../geometry/plane";
import type { BlobMember, Pt } from "./blob";

/** The default radius of `Shape.arcs()`, in pixels. */
export const ARCS_RADIUS = 12;
/** How far a chord may stray from the arc it samples, in pixels. */
const TOL = 0.2;
/** The longest straight run between two samples, in pixels (the cut search
 *  of step 4 works between samples). */
const MAX_STEP = 4;
const EPS = 1e-7;
const TAU = 2 * Math.PI;

/** An edge of a grown member, run so the member is on its left (angle
 *  increasing on an arc). */
type Edge =
  | { t: "arc"; cx: number; cy: number; R: number; a0: number; a1: number }
  | { t: "line"; ax: number; ay: number; bx: number; by: number };

type Prim = {
  edges: Edge[];
  sdf: (x: number, y: number) => number;
  bb: number[];
};

const segDist = (
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) => {
  const ex = bx - ax,
    ey = by - ay,
    L = ex * ex + ey * ey;
  const t =
    L > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L)) : 0;
  return Math.hypot(x - ax - t * ex, y - ay - t * ey);
};

/** A capsule of radius R around segment ab (a disc when a = b). */
function capsule(a: Pt, b: Pt, R: number): Prim {
  const [ax, ay] = a,
    [bx, by] = b;
  const L = Math.hypot(bx - ax, by - ay);
  const bb = [
    Math.min(ax, bx) - R,
    Math.min(ay, by) - R,
    Math.max(ax, bx) + R,
    Math.max(ay, by) + R,
  ];
  if (L < 1e-9)
    return {
      edges: [{ t: "arc", cx: ax, cy: ay, R, a0: 0, a1: TAU }],
      sdf: (x, y) => Math.hypot(x - ax, y - ay) - R,
      bb,
    };
  const ux = (bx - ax) / L,
    uy = (by - ay) / L;
  const phi = Math.atan2(uy, ux);
  // right of the direction (uy, -ux) runs a → b with the capsule on the left
  const [nx, ny] = [uy, -ux];
  return {
    edges: [
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
    ],
    sdf: (x, y) => segDist(x, y, ax, ay, bx, by) - R,
    bb,
  };
}

/** Box [x0, x1] × [y0, y1] grown by g: a rounded box (sharp when g = 0). */
function roundedBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  g: number
): Prim {
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
  return {
    edges,
    sdf: (x, y) => {
      const dx = Math.max(x0 - x, 0, x - x1),
        dy = Math.max(y0 - y, 0, y - y1);
      if (dx > 0 || dy > 0) return Math.hypot(dx, dy) - g;
      return Math.max(x0 - x, x - x1, y0 - y, y - y1) - g;
    },
    bb: [x0 - g, y0 - g, x1 + g, y1 + g],
  };
}

const grown = (m: BlobMember, g: number): Prim =>
  m.kind === "disc"
    ? capsule([m.cx, m.cy], [m.cx, m.cy], m.r + g)
    : m.kind === "segment"
      ? capsule(m.a, m.b, m.w / 2 + g)
      : roundedBox(m.x, m.y, m.x + m.w, m.y + m.h, g);

// ── Edges as curves ─────────────────────────────────────────────────────────

/** The point at parameter s of an edge (t in [0, 1] on a line, the angle on
 *  an arc). */
const at = (e: Edge, s: number): Pt =>
  e.t === "line"
    ? [e.ax + (e.bx - e.ax) * s, e.ay + (e.by - e.ay) * s]
    : [e.cx + e.R * Math.cos(s), e.cy + e.R * Math.sin(s)];
const range = (e: Edge): [number, number] =>
  e.t === "line" ? [0, 1] : [e.a0, e.a1];
/** The angle `a` as the parameter of arc e, or NaN when it is off the arc. */
const onArc = (e: Edge & { t: "arc" }, a: number) => {
  let s = a;
  while (s < e.a0) s += TAU;
  while (s >= e.a0 + TAU) s -= TAU;
  return s <= e.a1 ? s : NaN;
};

/** The parameter on edge e of a point on it, or NaN when it is off e. */
function paramOn(e: Edge, p: Pt): number {
  if (e.t === "arc") {
    const d = Math.hypot(p[0] - e.cx, p[1] - e.cy);
    if (Math.abs(d - e.R) > 1e-9) return NaN;
    return onArc(e, Math.atan2(p[1] - e.cy, p[0] - e.cx));
  }
  const ex = e.bx - e.ax,
    ey = e.by - e.ay,
    L = ex * ex + ey * ey;
  const t = ((p[0] - e.ax) * ex + (p[1] - e.ay) * ey) / L;
  if (t < 0 || t > 1) return NaN;
  const [x, y] = at(e, t);
  return Math.hypot(x - p[0], y - p[1]) <= 1e-9 ? t : NaN;
}

/** The parameters on edge e where edge f crosses it, and where f ends on it
 *  (so an arc that shares a circle with another, as two lines' joined ends
 *  do, or a line that runs along another, is cut where the other stops). */
function crossings(e: Edge, f: Edge, out: number[]): number[] {
  for (const s of range(f)) {
    const t = paramOn(e, at(f, s));
    if (!Number.isNaN(t)) out.push(t);
  }
  const onF = (p: Pt) =>
    f.t === "line"
      ? (() => {
          const ex = f.bx - f.ax,
            ey = f.by - f.ay,
            L = ex * ex + ey * ey;
          const t = ((p[0] - f.ax) * ex + (p[1] - f.ay) * ey) / L;
          return t >= -1e-12 && t <= 1 + 1e-12;
        })()
      : !Number.isNaN(onArc(f, Math.atan2(p[1] - f.cy, p[0] - f.cx)));
  if (e.t === "line") {
    const dx = e.bx - e.ax,
      dy = e.by - e.ay;
    if (f.t === "line") {
      const fx = f.bx - f.ax,
        fy = f.by - f.ay;
      const den = dx * fy - dy * fx;
      if (Math.abs(den) < 1e-14) return out;
      const t = ((f.ax - e.ax) * fy - (f.ay - e.ay) * fx) / den;
      const u = ((f.ax - e.ax) * dy - (f.ay - e.ay) * dx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) out.push(t);
      return out;
    }
    // line × circle
    const ox = e.ax - f.cx,
      oy = e.ay - f.cy;
    const A = dx * dx + dy * dy,
      B = 2 * (ox * dx + oy * dy),
      C = ox * ox + oy * oy - f.R * f.R;
    const disc = B * B - 4 * A * C;
    if (disc <= 0) return out;
    const q = Math.sqrt(disc);
    for (const t of [(-B - q) / (2 * A), (-B + q) / (2 * A)])
      if (t > 0 && t < 1 && onF(at(e, t))) out.push(t);
    return out;
  }
  // e is an arc
  if (f.t === "line") {
    const dx = f.bx - f.ax,
      dy = f.by - f.ay;
    const ox = f.ax - e.cx,
      oy = f.ay - e.cy;
    const A = dx * dx + dy * dy,
      B = 2 * (ox * dx + oy * dy),
      C = ox * ox + oy * oy - e.R * e.R;
    const disc = B * B - 4 * A * C;
    if (disc <= 0) return out;
    const q = Math.sqrt(disc);
    for (const u of [(-B - q) / (2 * A), (-B + q) / (2 * A)]) {
      if (u < 0 || u > 1) continue;
      const s = onArc(e, Math.atan2(oy + u * dy, ox + u * dx));
      if (!Number.isNaN(s)) out.push(s);
    }
    return out;
  }
  // circle × circle
  const ddx = f.cx - e.cx,
    ddy = f.cy - e.cy,
    d = Math.hypot(ddx, ddy);
  if (d < 1e-12 || d >= e.R + f.R || d <= Math.abs(e.R - f.R)) return out;
  const al = Math.acos(
    Math.max(-1, Math.min(1, (e.R * e.R + d * d - f.R * f.R) / (2 * e.R * d)))
  );
  const base = Math.atan2(ddy, ddx);
  for (const a of [base - al, base + al]) {
    const s = onArc(e, a);
    if (!Number.isNaN(s) && onF(at(e, s))) out.push(s);
  }
  return out;
}

/** A box that holds an edge (an arc's whole circle), a little grown. */
const boxOfEdge = (e: Edge): number[] =>
  e.t === "arc"
    ? [
        e.cx - e.R - 1e-6,
        e.cy - e.R - 1e-6,
        e.cx + e.R + 1e-6,
        e.cy + e.R + 1e-6,
      ]
    : [
        Math.min(e.ax, e.bx) - 1e-6,
        Math.min(e.ay, e.by) - 1e-6,
        Math.max(e.ax, e.bx) + 1e-6,
        Math.max(e.ay, e.by) + 1e-6,
      ];

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

/** A uniform grid over boxes, for candidate lookups. */
function grid(bbs: number[][], cell: number) {
  const m = new Map<string, number[]>();
  const key = (i: number, j: number) => `${i},${j}`;
  bbs.forEach((b, k) => {
    for (let i = Math.floor(b[0] / cell); i <= Math.floor(b[2] / cell); i++)
      for (let j = Math.floor(b[1] / cell); j <= Math.floor(b[3] / cell); j++) {
        const l = m.get(key(i, j));
        if (l) l.push(k);
        else m.set(key(i, j), [k]);
      }
  });
  return (b: number[]): number[] => {
    const seen = new Set<number>();
    for (let i = Math.floor(b[0] / cell); i <= Math.floor(b[2] / cell); i++)
      for (let j = Math.floor(b[1] / cell); j <= Math.floor(b[3] / cell); j++)
        for (const k of m.get(key(i, j)) ?? []) seen.add(k);
    return [...seen];
  };
}

const overlaps = (a: number[], b: number[]) =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Link curve runs end to start (nearest start first) into closed loops. */
function link<T>(runs: T[], start: (r: T) => Pt, end: (r: T) => Pt): T[][] {
  const used = new Array(runs.length).fill(false);
  const loops: T[][] = [];
  const starts = runs.map(start);
  const near = grid(
    starts.map(([x, y]) => [x, y, x, y]),
    4
  );
  for (let s0 = 0; s0 < runs.length; s0++) {
    if (used[s0]) continue;
    const loop: T[] = [];
    let i = s0;
    while (i >= 0 && !used[i]) {
      used[i] = true;
      loop.push(runs[i]);
      const [ex, ey] = end(runs[i]);
      let next = -1,
        best = Infinity;
      let cands = near([ex - 1, ey - 1, ex + 1, ey + 1]);
      if (cands.length === 0) cands = runs.map((_, k) => k);
      for (const k of cands) {
        if (used[k] && k !== s0) continue;
        const d = Math.hypot(starts[k][0] - ex, starts[k][1] - ey);
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

  // 2. The union's boundary.
  const near = grid(
    prims.map((p) => p.bb),
    Math.max(8, 2 * (o.padding + r))
  );
  const pieces: Piece[] = [];
  const edgeBB = prims.map((P) => P.edges.map(boxOfEdge));
  prims.forEach((P, i) => {
    const others = near(P.bb).filter(
      (j) => j !== i && overlaps(P.bb, prims[j].bb)
    );
    P.edges.forEach((e, ei) => {
      const [lo, hi] = range(e);
      const cuts = [lo, hi];
      const eb = edgeBB[i][ei];
      const touching = others.filter((j) => overlaps(eb, prims[j].bb));
      for (const j of touching)
        prims[j].edges.forEach((f, fi) => {
          if (overlaps(eb, edgeBB[j][fi])) crossings(e, f, cuts);
        });
      cuts.sort((a, b) => a - b);
      // covered by another member; on a tie (two equal members) the first
      // keeps it. The member that covered the last part is tried first.
      const covers = (j: number, x: number, y: number) => {
        const d = prims[j].sdf(x, y);
        return d < -EPS || (d <= EPS && j < i);
      };
      let lastCover = -1;
      for (let k = 0; k + 1 < cuts.length; k++) {
        const [s0, s1] = [cuts[k], cuts[k + 1]];
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
  // A curve of the shrunk boundary, as an edge (an arc may run backward).
  type Curve = Edge;
  const shrunk: Curve[][] = kept.map(({ loop }) => {
    const out: Curve[] = [];
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
    const pts = sampleParams(q.e, q.s0, q.s1).map((s) => at(q.e, s));
    const xs = pts.map((p) => p[0]),
      ys = pts.map((p) => p[1]);
    return [
      Math.min(...xs) - 1,
      Math.min(...ys) - 1,
      Math.max(...xs) + 1,
      Math.max(...ys) + 1,
    ];
  });
  const nearPiece = grid(pieceBB, Math.max(8, r));
  const valid = (p: Pt) => {
    if (r <= 0) return true;
    for (const k of nearPiece([p[0] - r, p[1] - r, p[0] + r, p[1] + r]))
      if (pieceDist(p, boundary[k]) < r - 1e-6) return false;
    return true;
  };

  // The samples of each curve, in loop order.
  type Sample = { p: Pt; c: Curve; s: number; ok: boolean };
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
    // where validity changes between two samples, bisect on the exact curve
    const cut = (a: Sample, b: Sample): Pt => {
      if (a.c !== b.c) return (a.ok ? a : b).p;
      let [sOk, sBad] = a.ok ? [a.s, b.s] : [b.s, a.s];
      for (let it = 0; it < 50; it++) {
        const m = (sOk + sBad) / 2;
        if (valid(at(a.c, m))) sOk = m;
        else sBad = m;
      }
      return at(a.c, sOk);
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
