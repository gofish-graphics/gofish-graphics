// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * The outline of `Shape.oval()`: the minimum-area ellipse that holds every
 * member grown by `padding`. Pure geometry, no GoFish nodes.
 *
 * 1. Each padded member is a union of discs: a disc grown by `padding`; a
 *    box's four corners, each a disc of radius `padding` (their convex hull is
 *    the padded box); a segment's two ends, each a disc of radius half its
 *    width plus `padding` (their hull is the padded capsule).
 * 2. Each disc is sampled as the 24-gon drawn around it, so the samples'
 *    convex hull holds every padded member.
 * 3. Khachiyan's algorithm finds the minimum-area ellipse around that hull to
 *    a tolerance. Its answer can leave a point outside by up to the
 *    tolerance, so it is then scaled about its center until every point is
 *    inside.
 * 4. The outline is the 128-gon drawn around the ellipse, so it holds the
 *    ellipse too.
 *
 * Degenerate members (every sample on one line, which needs zero radius and
 * zero padding) have no ellipse of positive area; the outline is then their
 * hull: a segment, or nothing for a single point.
 */
import { convexHull, discPoly, type BlobMember, type Pt } from "./blob";

/** The ellipse `{ p : (p - c)ᵀ A (p - c) <= 1 }`, A = [[a, b], [b, d]]. */
export type Ellipse = { c: Pt; a: number; b: number; d: number };

const SIDES = 24;
const LOOP = 128;

/** The discs, `[cx, cy, r]`, whose union's hull is the member grown by `pad`. */
const discsOf = (m: BlobMember, pad: number): [number, number, number][] =>
  m.kind === "disc"
    ? [[m.cx, m.cy, m.r + pad]]
    : m.kind === "box"
      ? [
          [m.x, m.y, pad],
          [m.x + m.w, m.y, pad],
          [m.x, m.y + m.h, pad],
          [m.x + m.w, m.y + m.h, pad],
        ]
      : [
          [m.a[0], m.a[1], m.w / 2 + pad],
          [m.b[0], m.b[1], m.w / 2 + pad],
        ];

/** Each disc's 24-gon drawn around it (a disc of radius 0 is its center). */
const samplesOf = (members: BlobMember[], pad: number): Pt[] =>
  members.flatMap((m) =>
    discsOf(m, pad).flatMap(([cx, cy, r]) =>
      r > 0
        ? discPoly([cx, cy], r / Math.cos(Math.PI / SIDES), SIDES)
        : [[cx, cy] as Pt]
    )
  );

/** (p - c)ᵀ A (p - c): at most 1 inside the ellipse. */
export const ellipseValue = (e: Ellipse, p: Pt): number => {
  const x = p[0] - e.c[0],
    y = p[1] - e.c[1];
  return e.a * x * x + 2 * e.b * x * y + e.d * y * y;
};

/**
 * Khachiyan's algorithm: the minimum-area ellipse around `pts` (at least
 * three, not all on one line), to `tol`, then scaled to hold every point.
 * The points are moved to their mean first, which keeps the 3 × 3 system
 * well conditioned at pixel coordinates.
 */
export const minEllipse = (pts: Pt[], tol = 1e-4): Ellipse => {
  const n = pts.length;
  let mx = 0,
    my = 0;
  for (const [x, y] of pts) {
    mx += x / n;
    my += y / n;
  }
  const X = pts.map(([x]) => x - mx),
    Y = pts.map(([, y]) => y - my);
  const u = new Float64Array(n).fill(1 / n);
  const M = new Float64Array(n);
  for (let iter = 0; iter < 20000; iter++) {
    // V = Σ uᵢ qᵢ qᵢᵀ over qᵢ = (x, y, 1), symmetric
    let sxx = 0,
      sxy = 0,
      sx = 0,
      syy = 0,
      sy = 0,
      s1 = 0;
    for (let i = 0; i < n; i++) {
      const w = u[i];
      sxx += w * X[i] * X[i];
      sxy += w * X[i] * Y[i];
      sx += w * X[i];
      syy += w * Y[i] * Y[i];
      sy += w * Y[i];
      s1 += w;
    }
    // its inverse, by cofactors
    const c00 = syy * s1 - sy * sy,
      c01 = -(sxy * s1 - sy * sx),
      c02 = sxy * sy - syy * sx,
      c11 = sxx * s1 - sx * sx,
      c12 = -(sxx * sy - sxy * sx),
      c22 = sxx * syy - sxy * sxy;
    const det = sxx * c00 + sxy * c01 + sx * c02;
    let j = 0;
    for (let i = 0; i < n; i++) {
      const x = X[i],
        y = Y[i];
      M[i] =
        (c00 * x * x +
          c11 * y * y +
          c22 +
          2 * (c01 * x * y + c02 * x + c12 * y)) /
        det;
      if (M[i] > M[j]) j = i;
    }
    // step toward the point farthest outside (d = 2)
    const step = (M[j] - 3) / (3 * (M[j] - 1));
    let change = 0;
    for (let i = 0; i < n; i++) {
      const next = (1 - step) * u[i] + (i === j ? step : 0);
      change += (next - u[i]) ** 2;
      u[i] = next;
    }
    if (Math.sqrt(change) < tol) break;
  }
  let cx = 0,
    cy = 0;
  for (let i = 0; i < n; i++) {
    cx += u[i] * X[i];
    cy += u[i] * Y[i];
  }
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    const x = X[i] - cx,
      y = Y[i] - cy;
    sxx += u[i] * x * x;
    sxy += u[i] * x * y;
    syy += u[i] * y * y;
  }
  // A = S⁻¹ / d, S the weighted covariance about the center
  const det = 2 * (sxx * syy - sxy * sxy);
  const e: Ellipse = {
    c: [cx + mx, cy + my],
    a: syy / det,
    b: -sxy / det,
    d: sxx / det,
  };
  let worst = 0;
  for (const p of pts) worst = Math.max(worst, ellipseValue(e, p));
  return worst > 1
    ? { ...e, a: e.a / worst, b: e.b / worst, d: e.d / worst }
    : e;
};

/** The `k`-gon drawn around the ellipse (the image of the `k`-gon around
 *  the unit circle), so it holds the ellipse. */
export const ellipseLoop = (e: Ellipse, k = LOOP): Pt[] => {
  // A's eigenvalues, larger first, and the direction of the larger one
  const mid = (e.a + e.d) / 2,
    half = Math.hypot((e.a - e.d) / 2, e.b);
  const angle = 0.5 * Math.atan2(2 * e.b, e.a - e.d);
  const out = 1 / Math.cos(Math.PI / k);
  const r1 = out / Math.sqrt(mid + half),
    r2 = out / Math.sqrt(mid - half);
  const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
  return Array.from({ length: k }, (_, i): Pt => {
    const t = (2 * Math.PI * i) / k;
    const x = r1 * Math.cos(t),
      y = r2 * Math.sin(t);
    return [e.c[0] + ux * x - uy * y, e.c[1] + uy * x + ux * y];
  });
};

/** The minimum-area ellipse around the members grown by `pad`. Undefined
 *  when no ellipse of positive area exists (no members, or every sample on
 *  one line). */
export const enclosingEllipse = (
  members: BlobMember[],
  pad: number
): Ellipse | undefined => {
  const hull = convexHull(samplesOf(members, pad));
  return hull.length >= 3 ? minEllipse(hull) : undefined;
};

/** The outline `Shape.oval()` draws: one loop, the ellipse's, or the
 *  hull of degenerate members (a segment); none for a single point or no members. */
export const ovalOutline = (members: BlobMember[], pad: number): Pt[][] => {
  const e = enclosingEllipse(members, pad);
  if (e) return [ellipseLoop(e)];
  const hull = convexHull(samplesOf(members, pad));
  return hull.length > 0 ? [hull] : [];
};
