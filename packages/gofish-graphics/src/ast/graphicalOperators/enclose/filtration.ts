/**
 * PROTOTYPE (scratch, not for merge): the closed area of the unified
 * outline as a function of the closing radius, precomputed once per member
 * set, so `convexity` picks its radius by one lookup instead of a bisection
 * over exact closings.
 *
 * The closing of a region U by a disc of radius r is the complement of the
 * union of the r-discs that miss U. Sample U's boundary densely (points at
 * most h apart, `unionBoundarySamples`). An r-disc that misses U is then an
 * r-disc empty of samples and outside U, so the closing is, up to the
 * sampling, the α-hull of the samples at α = r, with U inside it. Its
 * straight-line version is the α-shape: the Delaunay triangles of the
 * samples that the α-discs cannot reach. That gives every triangle T one
 * number t(T), the radius from which T is closed:
 *
 *  - holes filled (the default): an α-disc reaches T if it can travel from
 *    outside the samples' hull to T, entering each triangle on the way while
 *    α < its circumradius and crossing each edge while α < half its length
 *    (a Gabriel edge; a disc cannot cross between the two ends of an edge
 *    closer than 2α). t(T) is the largest α for which such a path exists: a
 *    max-min path from outside, one Dijkstra-like flood over the triangles.
 *    A triangle inside U is behind the boundary samples' short edges, so its
 *    t is about h / 2; a sealed pocket gets the t of the narrowest gap on
 *    its way out, so it fills all at once, as the closing does.
 *  - `holes` (holes stay open): t(T) is T's circumradius, or 0 when T is
 *    inside U.
 *
 * The closed area at r is then the area of the triangles with t ≤ r, less,
 * on each edge between a closed and an open triangle, the circular segment
 * that the r-disc on the open side cuts off the chord (the α-hull's arc
 * against the α-shape's straight edge). That function is tabulated once at
 * every distinct t (the boundary set is fixed between two of them, and the
 * area grows continuously there as the segments flatten), so a convexity c
 * is a scan of the table and a short bisection inside one interval of it,
 * on the segments alone.
 *
 * What is exact and what is not: the outline drawn is still one exact
 * closing (arcs.ts) at the radius chosen. Only the choice of radius is read
 * off the sampled area, which differs from the exact closed area by the
 * sampling: chords for U's own arcs, and the critical radii (where a pocket
 * seals), each off by a few hundredths of a pixel at h = 1. On the
 * playground's datasets the two areas agree to a few px² at every radius
 * measured (playground/bench/jump.ts). Convexity keeps its
 * meaning, the share of the area between the closing at r = padding and the
 * hull, measured on the sampled area instead of the exact one; it stays
 * monotone in c (the first radius whose area reaches the target), 0 is the
 * closing at padding and 1 the padded hull, exactly as before (those two
 * ends do not use the table).
 */
import { Delaunay } from "d3-delaunay";
import { unionBoundarySamples } from "./arcs";
import { boxGrid, grownPrim, primD, type BlobMember } from "./blob";

export type Filtration = {
  /** sample spacing, sample and triangle counts, build time (ms) */
  h: number;
  samples: number;
  triangles: number;
  knots: number;
  ms: number;
  /** the sampled closed area at the least radius and at infinity (the hull) */
  A0: number;
  A1: number;
  /** the sampled closed area at radius r */
  area: (r: number) => number;
  /** the least radius ≥ rMin whose sampled area holds share c of A1 − A0,
   *  with the area it reaches */
  radiusFor: (c: number) => { r: number; area: number };
  /** PROTOTYPE: the big jumps (a pocket sealing, over 2 % of A1 − A0 at one
   *  knot): the sampled critical radius and the area it adds */
  jumps: { r: number; dA: number }[];
};

/** The circular segment that a disc of radius r cuts off a chord L. */
const seg = (L: number, r: number) => {
  if (!(r < Infinity)) return 0;
  const x = Math.min(1, L / (2 * r));
  return (
    r * r * Math.asin(x) - (L / 2) * Math.sqrt(Math.max(0, r * r - (L * L) / 4))
  );
};

export function buildFiltration(
  members: BlobMember[],
  pad: number,
  rMin: number,
  holes: boolean | "lake",
  h = 1
): Filtration {
  const t0 = performance.now();
  const pts = unionBoundarySamples(members, pad, h);
  const n = pts.length;
  const coords = new Float64Array(2 * n);
  pts.forEach((p, i) => {
    coords[2 * i] = p[0];
    coords[2 * i + 1] = p[1];
  });
  const { triangles: V, halfedges: H } = new Delaunay(coords);
  const nT = V.length / 3;
  const X = (i: number) => coords[2 * i],
    Y = (i: number) => coords[2 * i + 1];

  // per triangle: area and circumradius
  const area = new Float64Array(nT),
    rho = new Float64Array(nT);
  for (let T = 0; T < nT; T++) {
    const [a, b, c] = [V[3 * T], V[3 * T + 1], V[3 * T + 2]];
    const abx = X(b) - X(a),
      aby = Y(b) - Y(a),
      acx = X(c) - X(a),
      acy = Y(c) - Y(a);
    const cr = abx * acy - aby * acx;
    area[T] = Math.abs(cr) / 2;
    const ab = Math.hypot(abx, aby),
      ac = Math.hypot(acx, acy),
      bc = Math.hypot(X(c) - X(b), Y(c) - Y(b));
    rho[T] =
      Math.abs(cr) < 1e-12 ? Infinity : (ab * ac * bc) / (2 * Math.abs(cr));
  }
  // per half-edge: its length, and whether its opposite vertex sees it at an
  // acute angle (the edge is Gabriel when both of its triangles' do)
  const next = (e: number) => (e % 3 === 2 ? e - 2 : e + 1),
    prev = (e: number) => (e % 3 === 0 ? e + 2 : e - 1);
  const len = new Float64Array(V.length);
  const acute = new Uint8Array(V.length);
  for (let e = 0; e < V.length; e++) {
    const a = V[e],
      b = V[next(e)],
      o = V[prev(e)];
    len[e] = Math.hypot(X(b) - X(a), Y(b) - Y(a));
    acute[e] =
      (X(a) - X(o)) * (X(b) - X(o)) + (Y(a) - Y(o)) * (Y(b) - Y(o)) > 0 ? 1 : 0;
  }
  // the radius below which a disc can cross edge e: half its length when it
  // is Gabriel; otherwise the circumradius of a triangle on it already
  // bounds the crossing (min of the two), so the edge itself adds nothing
  const cross = (e: number) => {
    const o = H[e];
    return acute[e] && (o < 0 || acute[o]) ? len[e] / 2 : Infinity;
  };

  // t(T): the radius from which T is closed
  const t = new Float64Array(nT);
  if (holes !== true) {
    // max-min flood from outside the hull (a binary max-heap of triangles)
    t.fill(-1);
    const heapT: number[] = [],
      heapV: number[] = [];
    const push = (T: number, v: number) => {
      let i = heapT.length;
      heapT.push(T);
      heapV.push(v);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heapV[p] >= heapV[i]) break;
        [heapT[p], heapT[i]] = [heapT[i], heapT[p]];
        [heapV[p], heapV[i]] = [heapV[i], heapV[p]];
        i = p;
      }
    };
    const pop = () => {
      const T = heapT[0],
        v = heapV[0];
      const lt = heapT.pop()!,
        lv = heapV.pop()!;
      if (heapT.length) {
        heapT[0] = lt;
        heapV[0] = lv;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1,
            r = l + 1;
          let m = i;
          if (l < heapT.length && heapV[l] > heapV[m]) m = l;
          if (r < heapT.length && heapV[r] > heapV[m]) m = r;
          if (m === i) break;
          [heapT[m], heapT[i]] = [heapT[i], heapT[m]];
          [heapV[m], heapV[i]] = [heapV[i], heapV[m]];
          i = m;
        }
      }
      return [T, v] as const;
    };
    for (let e = 0; e < V.length; e++)
      if (H[e] < 0) {
        const T = (e / 3) | 0;
        const v = Math.min(cross(e), rho[T]);
        if (v > t[T]) {
          t[T] = v;
          push(T, v);
        }
      }
    while (heapT.length) {
      const [T, v] = pop();
      if (v < t[T]) continue;
      for (let k = 0; k < 3; k++) {
        const e = 3 * T + k,
          o = H[e];
        if (o < 0) continue;
        const U = (o / 3) | 0;
        const w = Math.min(v, cross(e), rho[U]);
        if (w > t[U]) {
          t[U] = w;
          push(U, w);
        }
      }
    }
    for (let T = 0; T < nT; T++) if (t[T] < 0) t[T] = 0;
    // PROTOTYPE "lake": a triangle closed at rMin (in the spine, its own
    // holes filled) stays closed; one outside closes at its circumradius,
    // as with holes open, so a sealed bay stays open while a disc fits
    if (holes === "lake")
      for (let T = 0; T < nT; T++) t[T] = t[T] <= rMin ? 0 : rho[T];
  } else {
    // holes stay open: a triangle outside U closes at its circumradius
    const prims = members.map((m) => grownPrim(m, pad));
    const grid = boxGrid(prims.map((p) => p.bb));
    for (let T = 0; T < nT; T++) {
      const [a, b, c] = [V[3 * T], V[3 * T + 1], V[3 * T + 2]];
      const x = (X(a) + X(b) + X(c)) / 3,
        y = (Y(a) + Y(b) + Y(c)) / 3;
      const inside = grid
        .query(x, y, x, y)
        .some((j) => primD(prims[j], x, y, false) < 0);
      t[T] = inside ? 0 : rho[T];
    }
  }

  // edges once each: closed on one side from lo, on both from hi
  const eLo: number[] = [],
    eHi: number[] = [],
    eLen: number[] = [];
  for (let e = 0; e < V.length; e++) {
    const o = H[e];
    if (o >= 0 && o < e) continue;
    const t1 = t[(e / 3) | 0],
      t2 = o < 0 ? Infinity : t[(o / 3) | 0];
    if (t1 === t2) continue;
    eLo.push(Math.min(t1, t2));
    eHi.push(Math.max(t1, t2));
    eLen.push(len[e]);
  }
  const nE = eLo.length;
  const filledBelow = (r: number) => {
    let s = 0;
    for (let T = 0; T < nT; T++) if (t[T] <= r) s += area[T];
    return s;
  };
  const segsAt = (r: number, set?: number[]) => {
    let s = 0;
    if (set) for (const k of set) s += seg(eLen[k], r);
    else
      for (let k = 0; k < nE; k++)
        if (eLo[k] <= r && r < eHi[k]) s += seg(eLen[k], r);
    return s;
  };
  const areaAt = (r: number) =>
    r === Infinity ? filledBelow(Infinity) : filledBelow(r) - segsAt(r);

  // the table: knots at rMin and every distinct t above it (closer than
  // closer than 1e-6 of it merged into the knot below), the area at each knot,
  // and the triangle area filled by then (for the segments' bisection)
  const ts = Array.from(t)
    .filter((x) => x > rMin && x < Infinity)
    .sort((a, b) => a - b);
  const knots: number[] = [rMin];
  for (const x of ts) if (x - knots[knots.length - 1] > 1e-6 * x) knots.push(x);
  const nK = knots.length;
  // sweep: triangles by t, edges by lo and hi, an active set of edges
  const byT = Array.from({ length: nT }, (_, i) => i).sort(
    (a, b) => t[a] - t[b]
  );
  const byLo = Array.from({ length: nE }, (_, i) => i).sort(
    (a, b) => eLo[a] - eLo[b]
  );
  const byHi = Array.from({ length: nE }, (_, i) => i).sort(
    (a, b) => eHi[a] - eHi[b]
  );
  const pos = new Int32Array(nE).fill(-1);
  const active: number[] = [];
  const add = (k: number) => {
    pos[k] = active.length;
    active.push(k);
  };
  const remove = (k: number) => {
    const i = pos[k];
    if (i < 0) return;
    const last = active.pop()!;
    if (last !== k) {
      active[i] = last;
      pos[last] = i;
    }
    pos[k] = -1;
  };
  const gK = new Float64Array(nK), // area at each knot
    fK = new Float64Array(nK), // triangle area filled at each knot
    leftK = new Float64Array(nK); // area just below each knot
  let iT = 0,
    iLo = 0,
    iHi = 0,
    filled = 0;
  for (let k = 0; k < nK; k++) {
    leftK[k] = filled - segsAt(knots[k], active);
    // everything with t at or below this knot (a merged knot takes the t's
    // just above it, to the next knot)
    const upTo = k + 1 < nK ? knots[k + 1] : Infinity;
    const lim = (x: number) => x < upTo;
    while (iT < nT && lim(t[byT[iT]])) filled += area[byT[iT++]];
    while (iLo < nE && lim(eLo[byLo[iLo]])) add(byLo[iLo++]);
    while (iHi < nE && lim(eHi[byHi[iHi]])) remove(byHi[iHi++]);
    fK[k] = filled;
    gK[k] = filled - segsAt(knots[k], active);
  }
  // the boundary set the sweep holds between the knot before b and b
  const activeBefore = (b: number) => {
    const out: number[] = [];
    for (let k = 0; k < nE; k++) if (eLo[k] < b && eHi[k] >= b) out.push(k);
    return out;
  };
  const A0 = gK[0];
  const A1 = filledBelow(Infinity);
  // The big jumps (a pocket sealing: over 2 % of A1 − A0 at one knot). The
  // knot is the sampled critical radius, off the exact one by up to a few
  // hundredths of a pixel, so a radius chosen near it keeps JUMP px clear
  // of it, on the side it was chosen for: one side or the other of the
  // exact closing's jump, as the bisection was. A monotone map, so r stays
  // monotone in c.
  const JUMP = 0.1;
  const jumps: number[] = [];
  const jumpsAt: { r: number; dA: number }[] = [];
  for (let k = 1; k < nK; k++)
    if (gK[k] - leftK[k] > 0.02 * (A1 - A0)) {
      jumps.push(knots[k]);
      jumpsAt.push({ r: knots[k], dA: gK[k] - leftK[k] });
    }
  const clear = (r: number) => {
    for (const b of jumps)
      if (r > b - JUMP && r < b) r = Math.max(rMin, b - JUMP);
      else if (r >= b && r < b + JUMP) r = b + JUMP;
    return r;
  };

  const radiusFor = (c: number) => {
    const { r, area } = pick(c);
    return { r: clear(r), area };
  };
  const pick = (c: number) => {
    if (c <= 0) return { r: rMin, area: A0 };
    if (c >= 1) return { r: Infinity, area: A1 };
    const target = A0 + c * (A1 - A0);
    // the first knot whose area reaches the target
    let k = 1;
    while (k < nK && gK[k] < target) k++;
    if (k >= nK) {
      // past the last knot only the segments flatten: bisect toward ∞
      const set = activeBefore(Infinity);
      let lo = knots[nK - 1],
        hi = Math.max(2 * lo, 1);
      while (fK[nK - 1] - segsAt(hi, set) < target && hi < 1e7) hi *= 2;
      for (let it = 0; it < 50 && hi - lo > 1e-3; it++) {
        const m = (lo + hi) / 2;
        if (fK[nK - 1] - segsAt(m, set) >= target) hi = m;
        else lo = m;
      }
      return { r: hi, area: fK[nK - 1] - segsAt(hi, set) };
    }
    // on [knot_k−1, knot_k) the boundary is knot_k−1's, the area there
    // continuous and growing; at knot_k it jumps to gK[k]
    const set = activeBefore(knots[k]),
      f = fK[k - 1];
    const a = knots[k - 1],
      b = knots[k];
    const left = f - segsAt(b, set);
    if (left >= target) {
      let lo = a,
        hi = b;
      for (let it = 0; it < 50 && hi - lo > 1e-3; it++) {
        const m = (lo + hi) / 2;
        if (f - segsAt(m, set) >= target) hi = m;
        else lo = m;
      }
      return { r: hi, area: f - segsAt(hi, set) };
    }
    // the target falls in the jump at knot_k: the side nearer it (just
    // below the knot, or the knot itself, so r stays monotone in c)
    return target - left < gK[k] - target
      ? { r: Math.max(a, b - 1e-3), area: left }
      : { r: b, area: gK[k] };
  };

  return {
    h,
    samples: n,
    triangles: nT,
    knots: nK,
    ms: performance.now() - t0,
    A0,
    A1,
    area: areaAt,
    radiusFor,
    jumps: jumpsAt,
  };
}
