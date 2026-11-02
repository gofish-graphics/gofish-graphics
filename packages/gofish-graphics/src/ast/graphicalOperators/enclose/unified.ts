/**
 * PROTOTYPE (scratch, not for merge): one `Shape.blob` outline built on the
 * exact arcs closing (`arcs.ts`):
 *
 *   Shape.blob({ convexity, radius, connected, holes, avoiding, clearance })
 *
 *  1. Links. `connected: true` joins the members by the spanning tree of
 *     their centers (zero-width segment members, as `ARCS_PROTOTYPE.spine`).
 *     `connected: false` joins only the members the closing disc cannot pass
 *     between (padded gap < 2 × radius), shortest gaps first (Kruskal), with
 *     a zero-width link between their nearest points. Either way, every two
 *     pieces of the padded members and links that the disc cannot pass
 *     between are in one piece. That is the no-cusp rule: the closing only
 *     makes a sharp tip where two outside discs overlap across a gap the
 *     disc cannot pass, and that gap is now always bridged.
 *  2. The exact closing of members + links, grown by padding, by a disc of
 *     radius r. `convexity` picks r: the r whose closed area fills that share
 *     of the area between the padded union (r = 0) and the padded convex hull
 *     (r = ∞), found by bisection (area grows with r). convexity 1 is the
 *     padded convex hull itself. An explicit `radius` skips the bisection.
 *  3. Keep-outs (`avoiding`, grown by `clearance`) cut out of the closing.
 *  4. The approved smoothing: Gaussian along arclength, then the least
 *     uniform outward offset that holds every padded member and link again.
 *     With keep-outs, the cut is redone after the offset, grown by what the
 *     offset pushed into them, until both hold.
 */
import { signedArea2, pointInRing, segDist } from "../../geometry/plane";
import { convexHull, type BlobMember, type Pt } from "./blob";
import { closingRings, keepIns } from "./arcs";
import { resample, smoothOutline, type SmoothSpec } from "./arcsSmooth";

export type UnifiedOptions = {
  padding: number;
  /** Share of the gap between padded union and padded hull to fill. */
  convexity?: number;
  /** The closing radius in px; when given, convexity is not used. */
  radius?: number;
  connected?: boolean;
  holes?: boolean;
  avoiding?: BlobMember[];
  clearance?: number;
  /** Width of the spine links (connected), px. Default 0. */
  linkWidth?: number;
  /** null: no smoothing. Default: the approved blur, sigma 6. */
  smooth?: SmoothSpec | null;
};

/** Stats from the last call, for the scratch measurement scripts. */
export const UNIFIED_STATS: {
  radius?: number;
  iterations?: number;
  ms?: number;
  links?: number;
  areaTarget?: number;
  areaGot?: number;
  areaUnion?: number;
  areaHull?: number;
} = {};

// ── members as a core (point, segment or box) plus a radius ─────────────────

type Core =
  | { k: "seg"; a: Pt; b: Pt; rho: number }
  | { k: "box"; x0: number; y0: number; x1: number; y1: number };

const coreOf = (m: BlobMember): Core =>
  m.kind === "disc"
    ? { k: "seg", a: [m.cx, m.cy], b: [m.cx, m.cy], rho: m.r }
    : m.kind === "segment"
      ? { k: "seg", a: m.a, b: m.b, rho: m.w / 2 }
      : { k: "box", x0: m.x, y0: m.y, x1: m.x + m.w, y1: m.y + m.h };

const segsOf = (c: Core): [Pt, Pt][] =>
  c.k === "seg"
    ? [[c.a, c.b]]
    : [
        [
          [c.x0, c.y0],
          [c.x1, c.y0],
        ],
        [
          [c.x1, c.y0],
          [c.x1, c.y1],
        ],
        [
          [c.x1, c.y1],
          [c.x0, c.y1],
        ],
        [
          [c.x0, c.y1],
          [c.x0, c.y0],
        ],
      ];

const rhoOf = (c: Core) => (c.k === "seg" ? c.rho : 0);

/** Nearest points of segments pq and rs (each may be a point). */
function segSeg(p: Pt, q: Pt, r: Pt, s: Pt): [Pt, Pt, number] {
  const near = (a: Pt, b: Pt, x: Pt): Pt => {
    const ex = b[0] - a[0],
      ey = b[1] - a[1];
    const L2 = ex * ex + ey * ey;
    const t =
      L2 < 1e-12
        ? 0
        : Math.max(
            0,
            Math.min(1, ((x[0] - a[0]) * ex + (x[1] - a[1]) * ey) / L2)
          );
    return [a[0] + ex * t, a[1] + ey * t];
  };
  // proper crossing: distance 0
  const d = (a: Pt, b: Pt, c: Pt) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p, q, r),
    d2 = d(p, q, s),
    d3 = d(r, s, p),
    d4 = d(r, s, q);
  if (d1 * d2 < 0 && d3 * d4 < 0) {
    const t = d1 / (d1 - d2);
    const x: Pt = [r[0] + (s[0] - r[0]) * t, r[1] + (s[1] - r[1]) * t];
    return [x, x, 0];
  }
  let best: [Pt, Pt, number] = [p, r, Infinity];
  for (const [x, y] of [
    [p, near(r, s, p)],
    [q, near(r, s, q)],
    [near(p, q, r), r],
    [near(p, q, s), s],
  ] as [Pt, Pt][]) {
    const dd = Math.hypot(x[0] - y[0], x[1] - y[1]);
    if (dd < best[2]) best = [x, y, dd];
  }
  return best;
}

/** The nearest points of two members' surfaces and their gap (≤ 0 when
 *  they overlap). */
function nearest(A: Core, B: Core): [Pt, Pt, number] {
  const inBox = (c: Core, p: Pt) =>
    c.k === "box" &&
    p[0] >= c.x0 &&
    p[0] <= c.x1 &&
    p[1] >= c.y0 &&
    p[1] <= c.y1;
  if (
    inBox(A, B.k === "seg" ? B.a : [B.x0, B.y0]) ||
    inBox(B, A.k === "seg" ? A.a : [A.x0, A.y0])
  )
    return [[0, 0], [0, 0], -1];
  let best: [Pt, Pt, number] = [[0, 0], [0, 0], Infinity];
  for (const [p, q] of segsOf(A))
    for (const [r, s] of segsOf(B)) {
      const x = segSeg(p, q, r, s);
      if (x[2] < best[2]) best = x;
    }
  const [x, y, d] = best;
  const ra = rhoOf(A),
    rb = rhoOf(B);
  const gap = d - ra - rb;
  if (d < 1e-9) return [x, y, gap];
  const ux = (y[0] - x[0]) / d,
    uy = (y[1] - x[1]) / d;
  return [
    [x[0] + ux * ra, x[1] + uy * ra],
    [y[0] - ux * rb, y[1] - uy * rb],
    gap,
  ];
}

/**
 * The links for `connected: false`: join every two pieces whose padded gap
 * is under 2 r (grown by pad + r, they overlap), shortest gaps first, each
 * by a zero-width segment between their nearest points. A link is a member
 * too, so a piece near a link (not near its ends) is joined as well; repeat
 * until no two pieces are that near.
 */
export function nearLinks(
  members: BlobMember[],
  pad: number,
  r: number
): BlobMember[] {
  const prims: Core[] = members.map(coreOf);
  const comp = prims.map((_, i) => i);
  const find = (i: number): number =>
    comp[i] === i ? i : (comp[i] = find(comp[i]));
  const links: BlobMember[] = [];
  const reach = 2 * (pad + r);
  // bounding boxes for pruning
  const bb = (c: Core) =>
    c.k === "box"
      ? [c.x0, c.y0, c.x1, c.y1]
      : [
          Math.min(c.a[0], c.b[0]) - c.rho,
          Math.min(c.a[1], c.b[1]) - c.rho,
          Math.max(c.a[0], c.b[0]) + c.rho,
          Math.max(c.a[1], c.b[1]) + c.rho,
        ];
  const boxes = prims.map(bb);
  const close = (i: number, j: number) =>
    boxes[i][0] - reach <= boxes[j][2] &&
    boxes[j][0] - reach <= boxes[i][2] &&
    boxes[i][1] - reach <= boxes[j][3] &&
    boxes[j][1] - reach <= boxes[i][3];
  // overlapping members are one piece already
  let from = 0;
  for (let round = 0; round < 8; round++) {
    const pairs: [number, number, Pt, Pt, number][] = [];
    for (let i = 0; i < prims.length; i++)
      for (let j = Math.max(i + 1, from); j < prims.length; j++) {
        if (!close(i, j)) continue;
        const [p, q, gap] = nearest(prims[i], prims[j]);
        if (gap < reach) pairs.push([i, j, p, q, gap]);
      }
    pairs.sort((a, b) => a[4] - b[4]);
    const n0 = prims.length;
    for (const [i, j, p, q, gap] of pairs) {
      const [ci, cj] = [find(i), find(j)];
      if (ci === cj) continue;
      comp[ci] = cj;
      if (gap <= 0) continue; // overlapping: joined already
      const link: BlobMember = { kind: "segment", a: p, b: q, w: 0 };
      links.push(link);
      prims.push(coreOf(link));
      boxes.push(bb(prims.at(-1)!));
      comp.push(cj);
    }
    if (prims.length === n0) break;
    from = n0; // only pairs involving the new links next round
  }
  return links;
}

// ── area, hull ──────────────────────────────────────────────────────────────

export const ringsArea = (rings: Pt[][]) =>
  rings.reduce((s, r) => s + signedArea2(r) / 2, 0);

/** The padded members' boundary points, about every 0.5 px. */
function paddedSamples(members: BlobMember[], pad: number): Pt[] {
  const out: Pt[] = [];
  const circle = (c: Pt, R: number) => {
    const n = Math.max(16, Math.ceil((2 * Math.PI * R) / 0.5));
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      out.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]);
    }
  };
  for (const m of members) {
    if (m.kind === "disc") circle([m.cx, m.cy], m.r + pad);
    else if (m.kind === "segment") {
      circle(m.a, m.w / 2 + pad);
      circle(m.b, m.w / 2 + pad);
    } else {
      // a box grown by pad: its corners' circles
      for (const c of [
        [m.x, m.y],
        [m.x + m.w, m.y],
        [m.x, m.y + m.h],
        [m.x + m.w, m.y + m.h],
      ] as Pt[])
        circle(c, Math.max(pad, 1e-6));
    }
  }
  return out;
}

/** The padded convex hull, winding as the closing does (positive). */
export function paddedHull(members: BlobMember[], pad: number): Pt[] {
  const h = convexHull(paddedSamples(members, pad));
  return signedArea2(h) > 0 ? h : h.slice().reverse();
}

// ── keep-outs ───────────────────────────────────────────────────────────────

type Disc = { c: Pt; R: number };

/** Keep-out discs: each avoided member grown by clearance (a segment as
 *  discs along it, scratch only). */
export function keepOuts(avoiding: BlobMember[], clearance: number): Disc[] {
  const out: Disc[] = [];
  for (const m of avoiding) {
    if (m.kind === "disc") out.push({ c: [m.cx, m.cy], R: m.r + clearance });
    else if (m.kind === "segment") {
      const L = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]);
      const n = Math.max(1, Math.ceil(L / 2));
      for (let i = 0; i <= n; i++)
        out.push({
          c: [
            m.a[0] + ((m.b[0] - m.a[0]) * i) / n,
            m.a[1] + ((m.b[1] - m.a[1]) * i) / n,
          ],
          R: m.w / 2 + clearance,
        });
    } else
      out.push({
        c: [m.x + m.w / 2, m.y + m.h / 2],
        R: Math.hypot(m.w, m.h) / 2 + clearance,
      });
  }
  return out;
}

/** Cut disc K out of the rings: a run inside K becomes the arc of K's circle
 *  that lies in the region; a disc wholly inside a ring becomes a hole. */
function cutDisc(rings: Pt[][], K: Disc): Pt[][] {
  const inK = (p: Pt) => Math.hypot(p[0] - K.c[0], p[1] - K.c[1]) < K.R;
  const out: Pt[][] = [];
  let touched = false;
  for (const ring0 of rings) {
    const ring = resample(ring0, 0.5);
    const n = ring.length;
    const ins = ring.map(inK);
    if (!ins.some((x) => x)) {
      out.push(ring0);
      continue;
    }
    touched = true;
    if (ins.every((x) => x)) continue; // the ring is inside K: gone
    const first = ins.findIndex((x) => !x);
    const res: Pt[] = [];
    const ang = (p: Pt) => Math.atan2(p[1] - K.c[1], p[0] - K.c[0]);
    const onK = (a: number): Pt => [
      K.c[0] + K.R * Math.cos(a),
      K.c[1] + K.R * Math.sin(a),
    ];
    let k = 0;
    while (k < n) {
      const i = (first + k) % n;
      if (!ins[i]) {
        res.push(ring[i]);
        k++;
        continue;
      }
      // a run inside K: from the last outside point to the next
      const enter = res.at(-1)!;
      let m = k;
      while (m < n && ins[(first + m) % n]) m++;
      const exit = ring[(first + m) % n];
      const mid = ring[(first + Math.floor((k + m) / 2)) % n];
      const a0 = ang(enter),
        a1 = ang(exit);
      // the arc whose middle is inside the ring (the region side) — two
      // candidates, ccw and cw
      let d = a1 - a0;
      while (d <= 0) d += 2 * Math.PI;
      const cands = [d, d - 2 * Math.PI];
      const holeSide = (dd: number) => pointInRingAny(rings, onK(a0 + dd / 2));
      void mid;
      const dd = holeSide(cands[0]) ? cands[0] : cands[1];
      const steps = Math.max(2, Math.ceil((Math.abs(dd) * K.R) / 0.5));
      for (let s = 1; s < steps; s++) res.push(onK(a0 + (dd * s) / steps));
      k = m;
    }
    out.push(res);
  }
  if (!touched) {
    // K wholly inside the region (not touching its boundary): a hole
    const inside = rings.some((r) => signedArea2(r) > 0 && pointInRing(K.c, r));
    const inHole = rings.some((r) => signedArea2(r) < 0 && pointInRing(K.c, r));
    if (inside && !inHole) {
      const n = Math.max(16, Math.ceil((2 * Math.PI * K.R) / 0.5));
      const hole: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const a = (-2 * Math.PI * i) / n; // winds the other way
        hole.push([K.c[0] + K.R * Math.cos(a), K.c[1] + K.R * Math.sin(a)]);
      }
      out.push(signedArea2(hole) < 0 ? hole : hole.reverse());
    }
  }
  return out;
}

/** Whether p is inside the region (nonzero over all rings). */
function pointInRingAny(rings: Pt[][], p: Pt): boolean {
  let w = 0;
  for (const r of rings)
    if (pointInRing(p, r)) w += signedArea2(r) > 0 ? 1 : -1;
  return w > 0;
}

/** How far the rings reach into the keep-outs (0 when clear). */
export function intrusion(rings: Pt[][], K: Disc[]): number {
  let worst = 0;
  for (const k of K) {
    // the region's points within k: the nearest ring point, if k's center
    // is outside the region; if inside, the whole disc intrudes
    let dmin = Infinity;
    for (const r of rings)
      for (let i = 0; i < r.length; i++) {
        const [a, b] = [r[i], r[(i + 1) % r.length]];
        dmin = Math.min(dmin, segDist(k.c[0], k.c[1], a[0], a[1], b[0], b[1]));
      }
    const inside = pointInRingAny(rings, k.c);
    worst = Math.max(worst, inside ? k.R + dmin : Math.max(0, k.R - dmin));
  }
  return worst;
}

/**
 * Links bent around the keep-outs: a link whose capsule (radius pad) would
 * reach into a keep-out disc goes around it instead, along the tangents and
 * an arc pad clear of the disc, on the side the link passes nearer (below,
 * +y, on a tie). Scratch: one disc at a time, a few levels deep.
 */
export function routeAround(
  links: BlobMember[],
  K: Disc[],
  pad: number,
  depth = 0
): BlobMember[] {
  if (K.length === 0 || depth > 3) return links;
  const out: BlobMember[] = [];
  for (const l of links) {
    if (l.kind !== "segment") {
      out.push(l);
      continue;
    }
    const [a, b] = [l.a, l.b];
    let hit: Disc | undefined;
    let hd = Infinity;
    for (const k of K) {
      const d = segDist(k.c[0], k.c[1], a[0], a[1], b[0], b[1]);
      const Rd = k.R + pad + l.w / 2;
      const da = Math.hypot(a[0] - k.c[0], a[1] - k.c[1]);
      const db = Math.hypot(b[0] - k.c[0], b[1] - k.c[1]);
      if (d < Rd - 1e-6 && da > Rd + 0.5 && db > Rd + 0.5 && d < hd) {
        hit = k;
        hd = d;
      }
    }
    if (!hit) {
      out.push(l);
      continue;
    }
    const c = hit.c;
    const Rd = hit.R + pad + l.w / 2 + 0.5;
    // the side: the normal of ab pointing away from c (below on a tie)
    const ex = b[0] - a[0],
      ey = b[1] - a[1];
    const L = Math.hypot(ex, ey);
    let [nx, ny] = [-ey / L, ex / L];
    const side = (a[0] - c[0]) * nx + (a[1] - c[1]) * ny;
    if (Math.abs(side) < 1e-6) {
      if (ny < 0) [nx, ny] = [-nx, -ny];
    } else if (side < 0) [nx, ny] = [-nx, -ny];
    const mid = Math.atan2(ny, nx);
    // tangent angles from a and b on the chosen side
    const tang = (p: Pt) => {
      const dp = Math.hypot(p[0] - c[0], p[1] - c[1]);
      const th = Math.atan2(p[1] - c[1], p[0] - c[0]);
      const al = Math.acos(Math.min(1, Rd / dp));
      // of th ± al, the one nearer `mid`
      const near = (x: number) => {
        let d = x - mid;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return Math.abs(d);
      };
      return near(th + al) < near(th - al) ? th + al : th - al;
    };
    const t0 = tang(a);
    let t1 = tang(b);
    // go from t0 to t1 through mid
    let d = t1 - t0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const via = (() => {
      let m = mid - t0;
      while (m > Math.PI) m -= 2 * Math.PI;
      while (m < -Math.PI) m += 2 * Math.PI;
      return m;
    })();
    if (Math.sign(via) !== Math.sign(d) || Math.abs(via) > Math.abs(d))
      d = d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI;
    t1 = t0 + d;
    const n = Math.max(2, Math.ceil(Math.abs(d) / 0.2));
    const Rc = Rd / Math.cos(Math.abs(d) / n / 2);
    const pts: Pt[] = [a];
    for (let i = 0; i <= n; i++) {
      const t = t0 + (d * i) / n;
      const R = i === 0 || i === n ? Rd : Rc;
      pts.push([c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]);
    }
    pts.push(b);
    const segs: BlobMember[] = [];
    for (let i = 0; i + 1 < pts.length; i++)
      segs.push({ kind: "segment", a: pts[i], b: pts[i + 1], w: l.w });
    out.push(...routeAround(segs, K, pad, depth + 1));
  }
  return out;
}

// ── the outline ─────────────────────────────────────────────────────────────

export function unifiedOutline(
  members: BlobMember[],
  o: UnifiedOptions
): Pt[][] {
  if (members.length === 0) return [];
  const t0 = performance.now();
  const pad = Math.max(0, o.padding);
  const holes = o.holes ?? false;
  const connected = o.connected ?? true;
  const K = keepOuts(o.avoiding ?? [], o.clearance ?? 4);
  // connected: the same Kruskal over gaps with no limit (a spanning tree of
  // the pieces, each link between nearest points); members that already
  // touch get no link. Links bend around the keep-outs.
  const spine = connected
    ? routeAround(nearLinks(members, pad, Infinity), K, pad)
    : [];
  const linksAt = (r: number) =>
    connected ? spine : routeAround(nearLinks(members, pad, r), K, pad);
  const closeAt = (r: number) => {
    const links = linksAt(r);
    const all = [...members, ...links];
    return { all, rings: closingRings(all, pad, r, holes), links };
  };
  let iterations = 0;
  let r: number;
  let res: { all: BlobMember[]; rings: Pt[][]; links: BlobMember[] };
  if (o.radius !== undefined) {
    r = o.radius;
    res = r === Infinity ? hullRes() : closeAt(r);
  } else {
    const c = Math.max(0, Math.min(1, o.convexity ?? 0.5));
    // The least radius is the padding: every concave corner is then an arc
    // of at least padding, as every convex one is (convexity 0).
    const rMin = pad;
    const base = closeAt(rMin);
    const A0 = ringsArea(base.rings);
    const hull = paddedHull([...members, ...spine], pad);
    const A1 = ringsArea([hull]);
    const target = A0 + c * (A1 - A0);
    Object.assign(UNIFIED_STATS, {
      areaUnion: A0,
      areaHull: A1,
      areaTarget: target,
    });
    if (c >= 1) {
      r = Infinity;
      res = hullRes();
    } else if (c <= 0 || target <= A0) {
      r = rMin;
      res = base;
    } else {
      const ext = hull.reduce(
        (m, p) => Math.max(m, Math.hypot(p[0] - hull[0][0], p[1] - hull[0][1])),
        0
      );
      let lo = rMin,
        loRes = base;
      let hi = Math.max(1, 2 * rMin);
      let hiRes = closeAt(hi);
      iterations++;
      while (ringsArea(hiRes.rings) < target && hi < 64 * ext) {
        [lo, loRes] = [hi, hiRes];
        hi *= 2;
        hiRes = closeAt(hi);
        iterations++;
      }
      if (ringsArea(hiRes.rings) < target) {
        r = Infinity;
        res = hullRes();
      } else {
        // bisection to 0.5% of the hull gap, or 0.25 px in r
        while (hi - lo > 0.25 && iterations < 30) {
          if (Math.abs(ringsArea(hiRes.rings) - target) < 0.005 * (A1 - A0))
            break;
          const mid = (lo + hi) / 2;
          const m = closeAt(mid);
          iterations++;
          if (ringsArea(m.rings) >= target) [hi, hiRes] = [mid, m];
          else [lo, loRes] = [mid, m];
        }
        // where the area jumps (a pocket closing into a filled hole), the
        // side nearer the target
        const nearer =
          Math.abs(ringsArea(loRes.rings) - target) <
          Math.abs(ringsArea(hiRes.rings) - target);
        [r, res] = nearer ? [lo, loRes] : [hi, hiRes];
      }
    }
  }
  function hullRes() {
    return {
      all: [...members, ...spine],
      rings: [paddedHull([...members, ...spine], pad)],
      links: spine,
    };
  }
  let rings = res.rings;
  UNIFIED_STATS.areaGot = ringsArea(rings);
  const keep = keepIns(res.all, pad);
  const cut = (rs: Pt[][], grow: number) =>
    K.reduce((acc, k) => cutDisc(acc, { c: k.c, R: k.R + grow }), rs);
  const spec: SmoothSpec | null =
    o.smooth === undefined ? { kind: "blur", sigma: 6 } : o.smooth;
  if (spec === null) rings = cut(rings, 0);
  else {
    let grow = 0;
    let out = rings;
    for (let round = 0; round < 4; round++) {
      out = smoothOutline(cut(rings, grow), keep, spec);
      const into = K.length ? intrusion(out, K) : 0;
      if (into < 0.05) break;
      grow += into + 0.1;
    }
    rings = out;
  }
  Object.assign(UNIFIED_STATS, {
    radius: r,
    iterations,
    ms: performance.now() - t0,
    links: res.links.length,
  });
  return rings;
}
