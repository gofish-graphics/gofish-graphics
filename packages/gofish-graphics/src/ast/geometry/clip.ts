// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * Polygon clipping for the region-compositing operators (`intersect`'s
 * outline, `region({ inset })`). Rings are lists of points with no repeated
 * closing point, in any winding.
 *
 * TODO(#1201): this is a declared shortcut. Exact geometry needs one convex
 * operand, because Sutherland–Hodgman clipping is exact only against a convex
 * clip ring. Two non-convex rings, a result in several pieces (which comes
 * out joined by zero-width seams), and a result with holes need a general
 * polygon boolean and outlines with several loops.
 */
import type { OutlinePoint } from "./outline";
import { cross, signedArea2 } from "./plane";

type Pt = OutlinePoint;

/** A ring with repeated points and straight-through points dropped. */
export function simplifyRing(ring: readonly Pt[], eps = 1e-9): Pt[] {
  let pts: Pt[] = [];
  for (const p of ring) {
    const last = pts[pts.length - 1];
    if (
      last === undefined ||
      Math.abs(last[0] - p[0]) > eps ||
      Math.abs(last[1] - p[1]) > eps
    )
      pts.push([p[0], p[1]]);
  }
  while (
    pts.length > 1 &&
    Math.abs(pts[0][0] - pts[pts.length - 1][0]) <= eps &&
    Math.abs(pts[0][1] - pts[pts.length - 1][1]) <= eps
  )
    pts.pop();
  // Drop a point on the straight line between its neighbors, until none is.
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const scale = Math.max(
        1,
        Math.hypot(next[0] - prev[0], next[1] - prev[1])
      );
      if (Math.abs(cross(prev, pts[i], next)) <= eps * scale) changed = true;
      else out.push(pts[i]);
    }
    pts = out;
  }
  return pts;
}

/** Whether a ring is convex: every turn goes the same way. A ring of fewer
 *  than three points is not. */
export function isConvex(ring: readonly Pt[]): boolean {
  return isConvexSimplified(simplifyRing(ring));
}

/** {@link isConvex} of a ring {@link simplifyRing} has already simplified. */
function isConvexSimplified(pts: readonly Pt[]): boolean {
  if (pts.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const c = cross(
      pts[i],
      pts[(i + 1) % pts.length],
      pts[(i + 2) % pts.length]
    );
    if (c === 0) continue;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/** A clipped ring simplified, or an empty list when it has no area left. */
function nonDegenerate(ring: Pt[]): Pt[] {
  const out = simplifyRing(ring);
  return out.length >= 3 && Math.abs(signedArea2(out)) > 1e-9 ? out : [];
}

/** The part of `subject` on the inside of the line through `a` and `b`,
 *  where inside is the side `side` (the sign of `cross(a, b, p)`). */
function clipByEdge(subject: Pt[], a: Pt, b: Pt, side: number): Pt[] {
  const out: Pt[] = [];
  const inside = (p: Pt) => side * cross(a, b, p) >= 0;
  const meet = (p: Pt, q: Pt): Pt => {
    const dp = cross(a, b, p);
    const dq = cross(a, b, q);
    const t = dp / (dp - dq);
    return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
  };
  for (let i = 0; i < subject.length; i++) {
    const cur = subject[i];
    const prev = subject[(i - 1 + subject.length) % subject.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(meet(prev, cur));
      out.push(cur);
    } else if (prevIn) out.push(meet(prev, cur));
  }
  return out;
}

/**
 * The part of `subject` inside the convex ring `clip` (Sutherland–Hodgman):
 * one ring, or an empty list when they do not overlap. `subject` may be any
 * simple ring; `clip` must be convex ({@link isConvex}).
 */
export function clipToConvex(
  subject: readonly Pt[],
  clip: readonly Pt[]
): Pt[] {
  return clipSimplified(simplifyRing(subject), simplifyRing(clip));
}

/** {@link clipToConvex} of two rings already simplified. */
function clipSimplified(subject: Pt[], clip: readonly Pt[]): Pt[] {
  if (clip.length < 3 || subject.length < 3) return [];
  const side = Math.sign(signedArea2(clip));
  let out = subject;
  for (let i = 0; i < clip.length && out.length > 0; i++)
    out = clipByEdge(out, clip[i], clip[(i + 1) % clip.length], side);
  return nonDegenerate(out);
}

/**
 * The intersection of two rings: the part of one inside the other, when at
 * least one is convex. Undefined when neither is: there is no exact answer
 * yet (#1201). An empty list when they do not overlap.
 */
export function intersectRings(
  a: readonly Pt[],
  b: readonly Pt[]
): Pt[] | undefined {
  const sa = simplifyRing(a);
  const sb = simplifyRing(b);
  if (isConvexSimplified(sb)) return clipSimplified(sa, sb);
  if (isConvexSimplified(sa)) return clipSimplified(sb, sa);
  return undefined;
}

/**
 * A convex ring drawn in by `d` on every side: the ring clipped by each of
 * its edges moved `d` inward. Empty when the ring is too thin for it, and
 * undefined when the ring is not convex: drawing in any ring needs a general
 * polygon offset (#1201).
 */
export function insetConvex(ring: readonly Pt[], d: number): Pt[] | undefined {
  const pts = simplifyRing(ring);
  if (!isConvexSimplified(pts)) return undefined;
  if (d <= 0) return pts;
  const side = Math.sign(signedArea2(pts));
  let out = pts;
  for (let i = 0; i < pts.length && out.length > 0; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // The inward normal: toward the side the ring's inside is on.
    const nx = (-(b[1] - a[1]) / len) * side;
    const ny = ((b[0] - a[0]) / len) * side;
    out = clipByEdge(
      out,
      [a[0] + nx * d, a[1] + ny * d],
      [b[0] + nx * d, b[1] + ny * d],
      side
    );
  }
  return nonDegenerate(out);
}
