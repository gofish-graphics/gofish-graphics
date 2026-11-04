// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * A blob's `convexity` above 1, rounder than the padded convex hull: the
 * Minkowski combination
 *
 *     (2 − c)·H ⊕ (c − 1)·E,   H the padded hull, E the `Shape.oval()` outline,
 *
 * whose support function is h_c = (2 − c)·h_H + (c − 1)·h_E. Every point of H
 * is in E, so p = (2 − c)p + (c − 1)p lies in it: it holds H. It is H at 1
 * and E at 2, and nested in c (h_E ≥ h_H, so h_c grows with c).
 */
import { signedArea2 } from "../../geometry/plane";
import type { Member, Pt } from "./prims";
import { ellipseLoop, minEllipse, paddedHull as ovalHull } from "./oval";

const ccw = (r: Pt[]) => (signedArea2(r) > 0 ? r : r.slice().reverse());

/** Drop repeated and collinear vertices of a convex ring. */
function clean(r: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of r) {
    const q = out.at(-1);
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9) continue;
    out.push(p);
  }
  if (
    out.length > 1 &&
    Math.hypot(out[0][0] - out.at(-1)![0], out[0][1] - out.at(-1)![1]) < 1e-9
  )
    out.pop();
  return out;
}

/** The Minkowski sum a·P ⊕ b·Q of two convex rings (edge merge). */
export function minkowski(P0: Pt[], a: number, Q0: Pt[], b: number): Pt[] {
  if (b <= 0) return P0.map(([x, y]) => [a * x, a * y]);
  if (a <= 0) return Q0.map(([x, y]) => [b * x, b * y]);
  const prep = (R: Pt[], s: number) => {
    const r = clean(ccw(R)).map(([x, y]): Pt => [s * x, s * y]);
    // start at the lowest y, then lowest x
    let k = 0;
    for (let i = 1; i < r.length; i++)
      if (r[i][1] < r[k][1] || (r[i][1] === r[k][1] && r[i][0] < r[k][0]))
        k = i;
    return [...r.slice(k), ...r.slice(0, k)];
  };
  const P = prep(P0, a),
    Q = prep(Q0, b);
  const n = P.length,
    m = Q.length;
  const out: Pt[] = [];
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    out.push([P[i % n][0] + Q[j % m][0], P[i % n][1] + Q[j % m][1]]);
    const ep = [
      P[(i + 1) % n][0] - P[i % n][0],
      P[(i + 1) % n][1] - P[i % n][1],
    ];
    const eq = [
      Q[(j + 1) % m][0] - Q[j % m][0],
      Q[(j + 1) % m][1] - Q[j % m][1],
    ];
    const cr = ep[0] * eq[1] - ep[1] * eq[0];
    if (j >= m || (i < n && cr > 0)) i++;
    else if (i >= n || cr < 0) j++;
    else {
      i++;
      j++;
    }
  }
  return clean(out);
}

/** The `Shape.oval()` ellipse's outline (the same 128-gon `ovalOutline`
 *  draws), or undefined for flat members. */
export function ovalRing(members: Member[], pad: number): Pt[] | undefined {
  const h = ovalHull(members, pad);
  if (h.length < 3 || Math.abs(signedArea2(h)) < 1e-6) return undefined;
  return ccw(ellipseLoop(minEllipse(h)));
}

/** The two ends of the blend: the counterclockwise padded hull H and the
 *  oval E around the padded members (H itself when the members are flat). */
export function beyondEnds(
  H: Pt[],
  members: Member[],
  pad: number
): { Hc: Pt[]; E: Pt[] } {
  const Hc = ccw(H);
  return { Hc, E: ovalRing(members, pad) ?? Hc };
}

/** The outline for convexity c in (1, 2] from the padded hull H. */
export function beyondHull(
  H: Pt[],
  members: Member[],
  pad: number,
  c: number
): Pt[] {
  const { Hc, E } = beyondEnds(H, members, pad);
  const s = Math.max(0, Math.min(1, c - 1));
  return minkowski(Hc, 1 - s, E, s);
}
