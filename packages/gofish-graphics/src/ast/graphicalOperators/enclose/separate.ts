// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * The keep-out cut. Where a shape's outline (a blob piece,
 * a fillet piece, the box) may be drawn: out of its keep-outs, which are the avoided members
 * (`avoiding`) grown by `clearance` and, for a blob split into pieces (`connection` below 1),
 * the set's other pieces: their padded members and links grown by the padding and the
 * clearance, so two outlines stay `clearance` apart (outline.ts, blobOutline). One kind of keep-out, one cut (outline.ts, avoidCut), so a piece
 * keeps away from its neighbors exactly as it keeps away from an avoided mark. One field per
 * outline, on a grid over its box; the smoothed outline is cut by it once, after the smoothing
 * (outline.ts, finish), so neither the smoothing nor its outward offset ever moves an outline
 * back across it.
 *
 * Allowed: the shape's own padded members (always: the members win over every keep-out), or a
 * point outside the keep-out region: the keep-out discs' union closed by a disc of
 * SEPARATE.open px (keepRegion), so the ground between the keep-outs is opened by it: no
 * sliver of it narrower than about 2 · open px, and its corners between keep-outs are round.
 * As one field, negative where allowed:
 *
 *   Ψ = min(sd, k),
 *
 * sd the signed distance to the padded members, k the signed distance to the keep-out region
 * (positive inside). A plain min, no smooth one: the cut never enters a keep-out but where the
 * padded members do, and there it leaves a sharp concave corner (rounding it would enter one
 * or the other). Ψ is 1-Lipschitz.
 *
 * The cut outline is the zero level of max(sd_R, Ψ), sd_R the signed distance to the outline,
 * traced by marching squares on a grid of step h (1 px) (cutRings): one field, so the cut has
 * no crossings and grows with the outline. Ψ is evaluated exactly only near that level: blocks
 * of the grid are refined by halves (a quadtree) where it can cross, and Ψ is kept with the
 * field once asked.
 */
import type { Pt } from "./prims";
import { SegGrid, Inside, segsOf } from "./meshBlend";
import { closingRings } from "./arcs";
import { signedArea2, pointInRing } from "../../geometry/plane";

type Box = [number, number, number, number];

const boxOf = (rings: Pt[][]): Box => {
  let [xa, ya, xb, yb] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < xa) xa = x;
      if (x > xb) xb = x;
      if (y < ya) ya = y;
      if (y > yb) yb = y;
    }
  return [xa, ya, xb, yb];
};

/** The cut's knobs. h: the grid step, px; round: the width, px, of the rounding
 *  of the convex corners the cut leaves (smooth.ts, roundCut); open: the radius, px, of
 *  the disc the keep-out region is closed by (keepRegion). */
export const SEPARATE = { h: 1, round: 3, open: 3 };

/** A keep-out: a disc the outline stays out of (an avoided member grown by
 *  the clearance). */
export type KeepDisc = { c: Pt; R: number };

/**
 * The ground the keep-outs forbid: their union closed (arcs.ts, the exact closing) by a disc
 * of radius `rho`, holes kept. The allowed ground less the keep-outs is opened by the same
 * disc (the opening of a set is the complement of the closing of its complement): a sliver of
 * ground narrower than about 2 rho between two keep-outs is forbidden too, and the corners
 * between two keep-outs are rounded. The closing holds the union, so the cut never enters a
 * keep-out; the padded members alone are allowed inside it (cutField).
 */
export function keepRegion(K: KeepDisc[], rho: number): Pt[][] {
  if (!K.length) return [];
  // sampled to 0.02 px, not the arcs' 0.2: a chord cuts inside its arc, and the cut keeps
  // off the rings, so their chord error is clearance lost
  return closingRings(
    K.map((k) => ({ kind: "disc" as const, cx: k.c[0], cy: k.c[1], r: k.R })),
    0,
    Math.max(0, rho),
    true,
    0.02
  );
}

/** An outline's allowed ground (see the top of the file) on its grid, with what the cut
 *  evaluates lazily and keeps between calls: Ψ at each node once asked. */
export type CutField = {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  W: number;
  h: number;
  /** Ψ at the nodes asked so far (NaN: not yet) */
  PSI: Float64Array;
  psi: (q: number) => number;
};

/** Values past this are only kept as signs (the quadtree's blocks are at
 *  most B = 8 steps, so a sign is sure past √2·8·h). */
const B = 8;
const SURE = Math.SQRT2 * B + 4;

/** Refine blocks of B steps by halves where `at` can change sign (it is
 *  2-Lipschitz; a block whose corners all have one sign and |value| >
 *  margin + √2 · its side keeps that sign, and |value| > margin), then fill
 *  the sure blocks (after: their nodes may be shared with blocks that need
 *  them exactly). */
function quad(
  at: (q: number) => number,
  A: Float64Array,
  W: number,
  nx: number,
  ny: number,
  h: number,
  margin: number,
  value: (sign: number) => number
) {
  const later: number[] = [];
  const refine = (i0: number, j0: number, n: number) => {
    const q = j0 * W + i0;
    const a = at(q),
      b = at(q + n),
      c = at(q + n * W),
      d = at(q + n * W + n);
    if (
      Math.min(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) >
        margin + Math.SQRT2 * n * h &&
      Math.sign(a) === Math.sign(b) &&
      Math.sign(b) === Math.sign(c) &&
      Math.sign(c) === Math.sign(d)
    ) {
      later.push(q, n, Math.sign(a));
      return;
    }
    if (n === 1) return;
    const k = n >> 1;
    refine(i0, j0, k);
    refine(i0 + k, j0, k);
    refine(i0, j0 + k, k);
    refine(i0 + k, j0 + k, k);
  };
  for (let j = 0; j < ny; j += B)
    for (let i = 0; i < nx; i += B) refine(i, j, B);
  for (let k = 0; k < later.length; k += 3) {
    const [q0, n, sg] = [later[k], later[k + 1], later[k + 2]];
    const v = value(sg);
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const q = q0 + j * W + i;
        if (Number.isNaN(A[q])) A[q] = v;
      }
  }
}

/**
 * An outline's allowed ground (see the top of the file), on a grid over its box. `members`:
 * the shape's padded members' rings (outer rings winding positive), which the cut never
 * enters; `keep`: the keep-out region's rings (keepRegion). A function of these alone, so it
 * is cached with them. null when no keep-out reaches the box: nothing to cut.
 */
export function cutField(
  members: Pt[][],
  box: Box,
  keep: Pt[][]
): CutField | null {
  const h = SEPARATE.h;
  const [bx0, by0, bx1, by1] = box;
  // the grid: step h over the box grown by M steps (the smoothed outline's offset stays well
  // inside that)
  const M = 8;
  // the keep-out region's rings that reach the grid: a ring farther than SURE from every node
  // gives each the cap (the grid runs M steps before the box and up to M + B past it, its
  // sides rounded up to whole blocks)
  const reach = (M + B) * h + SURE;
  const K = keep.filter((r) => {
    const [xa, ya, xb, yb] = boxOf([r]);
    return (
      xb >= bx0 - reach &&
      xa <= bx1 + reach &&
      yb >= by0 - reach &&
      ya <= by1 + reach
    );
  });
  if (!K.length) return null;
  const S0 = segsOf(members);
  const meG = new SegGrid(S0, 4),
    meIn = new Inside(S0);
  const SK = segsOf(K);
  const kg = new SegGrid(SK, 4),
    kin = new Inside(SK);
  const x0 = bx0 - M * h,
    y0 = by0 - M * h;
  const nx = B * Math.ceil((Math.ceil((bx1 - bx0) / h) + 2 * M) / B),
    ny = B * Math.ceil((Math.ceil((by1 - by0) / h) + 2 * M) / B);
  const W = nx + 1,
    N = W * (ny + 1);
  // Ψ = min(sd, k), capped to ±SURE
  const PSI = new Float64Array(N).fill(NaN);
  const psi = (q: number) => {
    if (!Number.isNaN(PSI[q])) return PSI[q];
    const x = x0 + (q % W) * h,
      y = y0 + Math.floor(q / W) * h;
    const sd = meIn.has(x, y)
      ? -capped(meG, x, y, SURE)
      : Math.min(SURE, capped(meG, x, y, SURE));
    let v = sd;
    if (sd > -SURE) {
      const d = capped(kg, x, y, SURE);
      v = Math.max(-SURE, Math.min(sd, kin.has(x, y) ? d : -d));
    }
    return (PSI[q] = Math.max(-SURE, Math.min(SURE, v)));
  };
  return { x0, y0, nx, ny, W, h, PSI, psi };
}

/** The distance from (x, y) to the grid's nearest segment, or `cap` when
 *  that is at least cap (the search stops there). */
function capped(G: SegGrid, x: number, y: number, cap: number): number {
  const { x0, y0, cell, nx, ny, start, items, S } = G;
  const ci = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell))),
    cj = Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / cell)));
  const off = Math.max(
    0,
    x0 - x,
    x - (x0 + nx * cell),
    y0 - y,
    y - (y0 + ny * cell)
  );
  if (off >= cap) return cap;
  let best = cap * cap;
  const R = Math.max(nx, ny);
  for (let k = 0; k <= R; k++) {
    for (let j = cj - k; j <= cj + k; j++) {
      if (j < 0 || j >= ny) continue;
      const edge = j === cj - k || j === cj + k;
      for (let i = ci - k; i <= ci + k; i += edge ? 1 : 2 * k || 1) {
        if (i < 0 || i >= nx) continue;
        const c = j * nx + i;
        for (let q = start[c]; q < start[c + 1]; q++) {
          const s = items[q];
          const ax = S[4 * s],
            ay = S[4 * s + 1],
            ex = S[4 * s + 2] - ax,
            ey = S[4 * s + 3] - ay;
          const L = ex * ex + ey * ey;
          let t = L > 0 ? ((x - ax) * ex + (y - ay) * ey) / L : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = x - ax - t * ex,
            dy = y - ay - t * ey;
          const d = dx * dx + dy * dy;
          if (d < best) best = d;
        }
      }
    }
    // every segment not yet seen is at least k·cell − off away
    if (Math.sqrt(best) <= k * cell - off) break;
  }
  return Math.min(cap, Math.sqrt(best));
}

/** Marching squares: the closed loops of {V > 0} (the border is ≤ 0), and
 *  each point's grid edge (2 (j W + i), + 1 for a vertical edge). */
function march(
  V: Float64Array,
  nx: number,
  ny: number,
  x0: number,
  y0: number,
  h: number
): { loops: Pt[][]; ids: number[][] } {
  const W = nx + 1;
  // edge ids: horizontal (i, j)-(i+1, j) is 2 (j W + i); vertical
  // (i, j)-(i, j+1) is 2 (j W + i) + 1
  const pos = new Map<number, Pt>();
  const adj = new Map<number, number[]>();
  const pt = (e: number): Pt => {
    let p = pos.get(e);
    if (p) return p;
    const q = e >> 1,
      i = q % W,
      j = (q - i) / W;
    const a = V[q],
      b = e & 1 ? V[q + W] : V[q + 1];
    const t = a / (a - b);
    p = e & 1 ? [x0 + i * h, y0 + (j + t) * h] : [x0 + (i + t) * h, y0 + j * h];
    pos.set(e, p);
    return p;
  };
  const link = (e: number, f: number) => {
    pt(e);
    pt(f);
    (adj.get(e) ?? adj.set(e, []).get(e)!).push(f);
    (adj.get(f) ?? adj.set(f, []).get(f)!).push(e);
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const q = j * W + i;
      const a = V[q] > 0,
        b = V[q + 1] > 0,
        c = V[q + W + 1] > 0,
        d = V[q + W] > 0;
      const code = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const top = 2 * q,
        bottom = 2 * (q + W),
        left = 2 * q + 1,
        right = 2 * (q + 1) + 1;
      switch (code) {
        case 1:
        case 14:
          link(top, left);
          break;
        case 2:
        case 13:
          link(top, right);
          break;
        case 4:
        case 11:
          link(right, bottom);
          break;
        case 8:
        case 7:
          link(bottom, left);
          break;
        case 3:
        case 12:
          link(left, right);
          break;
        case 6:
        case 9:
          link(top, bottom);
          break;
        case 5:
        case 10: {
          const mid = (V[q] + V[q + 1] + V[q + W + 1] + V[q + W]) / 4 > 0;
          // a and c in (5): joined through the middle when it is in
          if ((code === 5) === mid) {
            link(top, right);
            link(bottom, left);
          } else {
            link(top, left);
            link(right, bottom);
          }
          break;
        }
      }
    }
  const seen = new Set<number>();
  const loops: Pt[][] = [];
  const ids: number[][] = [];
  for (const e0 of adj.keys()) {
    if (seen.has(e0)) continue;
    const loop: Pt[] = [];
    const id: number[] = [];
    let prev = -1,
      e = e0;
    for (let guard = 0; guard < 1e7; guard++) {
      seen.add(e);
      loop.push(pos.get(e)!);
      id.push(e);
      const nb = adj.get(e)!;
      const nxt = nb[0] !== prev ? nb[0] : nb[1];
      prev = e;
      e = nxt;
      if (e === e0 || e === undefined || seen.has(e)) break;
    }
    if (loop.length >= 3) {
      loops.push(loop);
      ids.push(id);
    }
  }
  return { loops, ids };
}

// ── cutting the rings by the field ─────────────────────────────────────────

/**
 * The rings less what the field forbids: the zero level of max(sd_R, Ψ),
 * sd_R the signed distance to the rings (negative inside, nonzero
 * winding), traced by marching squares on the field's grid, outer loops
 * winding positive and holes the other way. One field, so the result has
 * no crossings whatever the rings and the forbidden ground do (a keep-out
 * wholly inside becomes a hole, parts of the outline fenced off by
 * keep-outs stay parts), and it is monotone in the rings: a larger outline
 * cuts to a larger one. Each point is marked where Ψ binds (it lies on a
 * clipped side or a keep-out) for roundCut. Where the outline is not cut it
 * is its own distance field's zero level, off it by marching squares'
 * error (≲ 0.03 px on the smoothed outlines; up to ~h/2 at a sharp corner).
 */
export function cutRings(
  F: CutField,
  rings: Pt[][]
): { rings: Pt[][]; cut: boolean[][] } {
  const { x0, y0, nx, ny, W, h, PSI, psi } = F;
  const N = W * (ny + 1);
  const S = segsOf(rings);
  const rg = new SegGrid(S, 4),
    rin = new Inside(S);
  const SD = new Float64Array(N).fill(NaN);
  const V = new Float64Array(N).fill(NaN);
  const at = (q: number) => {
    if (!Number.isNaN(V[q])) return V[q];
    const x = x0 + (q % W) * h,
      y = y0 + Math.floor(q / W) * h;
    const d = capped(rg, x, y, SURE);
    const sd = rin.has(x, y) ? -d : d;
    SD[q] = sd;
    return (V[q] = sd >= SURE ? sd : Math.max(sd, psi(q)));
  };
  quad(at, V, W, nx, ny, h, 0, (sg) => sg * 1e9);
  // marching squares traces {−V > 0}; the border is outside, so every
  // loop closes
  const U = new Float64Array(N);
  for (let q = 0; q < N; q++) U[q] = -V[q];
  for (let i = 0; i <= nx; i++) {
    U[i] = -1;
    U[ny * W + i] = -1;
  }
  for (let j = 0; j <= ny; j++) {
    U[j * W] = -1;
    U[j * W + nx] = -1;
  }
  const { loops, ids } = march(U, nx, ny, x0, y0, h);
  // where Ψ binds: at each point (on a grid edge), Ψ against sd_R there
  const cut = loops.map((L, k) =>
    ids[k].map((e) => {
      const q0 = e >> 1,
        q1 = e & 1 ? q0 + W : q0 + 1;
      const t = U[q0] / (U[q0] - U[q1]);
      const p0 = PSI[q0],
        p1 = PSI[q1];
      if (Number.isNaN(p0) || Number.isNaN(p1)) return false;
      return (1 - t) * p0 + t * p1 >= (1 - t) * SD[q0] + t * SD[q1] - 1e-9;
    })
  );
  // orient by nesting: a loop inside an even number of others is an outer
  // loop (positive), an odd number a hole
  const boxes = loops.map((L) => boxOf([L]));
  loops.forEach((L, k) => {
    const [px, py] = L[0];
    let depth = 0;
    loops.forEach((M, m) => {
      const b = boxes[m];
      if (m === k || px < b[0] || px > b[2] || py < b[1] || py > b[3]) return;
      if (pointInRing(L[0], M)) depth++;
    });
    if (signedArea2(L) > 0 !== (depth % 2 === 0)) {
      L.reverse();
      cut[k].reverse();
    }
  });
  return { rings: loops, cut };
}
