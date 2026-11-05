// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * The geometry the enclosure outlines read: the members as discs, boxes and
 * segments, and each member grown by a radius as a primitive with an exact
 * signed distance (negative inside). Pure geometry, no GoFish nodes.
 */
import { cross, signedArea2 } from "../../geometry/plane";

/** A point in pixels. */
export type Pt = [number, number];

/** One enclosed member, or one avoided node: a disc (a circle node), a box
 *  (any other node, by its bounding box), or a segment (one straight piece
 *  of a drawn line, `w` its stroke width). An ellipse node that is not a
 *  circle is the disc of its larger radius that also carries its semi-axes
 *  (`axes`): the blob reads the disc, and the oval samples the ellipse. */
export type Member =
  | { kind: "disc"; cx: number; cy: number; r: number; axes?: [number, number] }
  | { kind: "box"; x: number; y: number; w: number; h: number }
  | {
      kind: "segment";
      a: Pt;
      b: Pt;
      w: number;
      /** The width at b, when it differs from w at a: a tapered tube, the
       *  hull of its two end discs (a link between two members). A link's
       *  widths may be below 0: it is then thinner than the padding once
       *  grown by the padding. */
      w2?: number;
    };

/** A disc around c of radius R: a keep-out (an avoided member grown by the
 *  clearance), which the outline stays out of. */
export type Disc = { c: Pt; R: number };

/** A box [x0, y0, x1, y1], px. */
export type Box = [number, number, number, number];

/** The box of rings' points. */
export const boxOf = (rings: Pt[][]): Box => {
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

/** A ring winding positive (screen coordinates): itself, or reversed. */
export const ccw = (r: Pt[]): Pt[] =>
  signedArea2(r) > 0 ? r : r.slice().reverse();

/** Andrew's monotone chain. */
export const convexHull = (pts: Pt[]): Pt[] => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0
    )
      lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0
    )
      upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
};

/** A circle of radius R around c as an n-gon. */
export const discPoly = (c: Pt, R: number, n = 28): Pt[] =>
  Array.from(
    { length: n },
    (_, i) =>
      [
        c[0] + R * Math.cos((2 * Math.PI * i) / n),
        c[1] + R * Math.sin((2 * Math.PI * i) / n),
      ] as Pt
  );

/** A uniform grid over boxes [x0, y0, x1, y1], about one box per cell. `query` lists, in index
 *  order, every box that may meet a rectangle (a superset: callers still test exactly). */
export const boxGrid = (bbs: number[][]) => {
  let X0 = Infinity,
    Y0 = Infinity,
    X1 = -Infinity,
    Y1 = -Infinity,
    size = 0;
  for (const b of bbs) {
    X0 = Math.min(X0, b[0]);
    Y0 = Math.min(Y0, b[1]);
    X1 = Math.max(X1, b[2]);
    Y1 = Math.max(Y1, b[3]);
    size += Math.max(b[2] - b[0], b[3] - b[1]);
  }
  const g = Math.max(
    size / (bbs.length || 1),
    (X1 - X0) / 64,
    (Y1 - Y0) / 64,
    1e-6
  );
  const nx = bbs.length ? Math.floor((X1 - X0) / g) + 1 : 0,
    ny = bbs.length ? Math.floor((Y1 - Y0) / g) + 1 : 0;
  const cx = (x: number) =>
    Math.max(0, Math.min(nx - 1, Math.floor((x - X0) / g)));
  const cy = (y: number) =>
    Math.max(0, Math.min(ny - 1, Math.floor((y - Y0) / g)));
  const cells: number[][] = Array.from({ length: nx * ny }, () => []);
  bbs.forEach((b, k) => {
    for (let j = cy(b[1]); j <= cy(b[3]); j++)
      for (let i = cx(b[0]); i <= cx(b[2]); i++) cells[j * nx + i].push(k);
  });
  const stamp = new Int32Array(bbs.length);
  let gen = 0;
  /** Calls f once on every box that may meet the rectangle, in no set order. */
  const each = (
    xa: number,
    ya: number,
    xb: number,
    yb: number,
    f: (k: number) => void
  ) => {
    if (!bbs.length || xb < X0 || xa > X1 || yb < Y0 || ya > Y1) return;
    gen++;
    for (let j = cy(ya); j <= cy(yb); j++)
      for (let i = cx(xa); i <= cx(xb); i++)
        for (const k of cells[j * nx + i])
          if (stamp[k] !== gen) {
            stamp[k] = gen;
            f(k);
          }
  };
  const query = (xa: number, ya: number, xb: number, yb: number): number[] => {
    const out: number[] = [];
    each(xa, ya, xb, yb, (k) => out.push(k));
    return out.sort((a, b) => a - b);
  };
  return { query, each };
};

// ── a member grown by r, as a primitive ─────────────────────────────────────
// Each is a disc, a capsule (a segment grown by r), a box (a rectangle
// grown by r), or a tapered capsule (the convex hull of two discs), with an
// exact signed distance; `k` names which (PRIM).

/** The primitives' kinds, `Prim.k`. */
export const PRIM = { disc: 0, capsule: 1, box: 2, taper: 3 } as const;
export type Prim = {
  k: (typeof PRIM)[keyof typeof PRIM];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  r: number;
  bb: number[];
};
const discPrim = (x: number, y: number, r: number): Prim => ({
  k: PRIM.disc,
  x1: x,
  y1: y,
  x2: 0,
  y2: 0,
  x3: 0,
  r,
  bb: [x - r, y - r, x + r, y + r],
});
const capsulePrim = (a: Pt, b: Pt, r: number): Prim => ({
  k: PRIM.capsule,
  x1: a[0],
  y1: a[1],
  x2: b[0],
  y2: b[1],
  x3: 0,
  r,
  bb: [
    Math.min(a[0], b[0]) - r,
    Math.min(a[1], b[1]) - r,
    Math.max(a[0], b[0]) + r,
    Math.max(a[1], b[1]) + r,
  ],
});
/** A tapered capsule: the convex hull of the disc of radius ra around a and the disc of radius rb
 *  around b (x3 holds rb, r holds ra). With equal radii it is exactly the capsule. */
const taperPrim = (a: Pt, b: Pt, ra: number, rb: number): Prim =>
  ra === rb
    ? capsulePrim(a, b, ra)
    : {
        k: PRIM.taper,
        x1: a[0],
        y1: a[1],
        x2: b[0],
        y2: b[1],
        x3: rb,
        r: ra,
        bb: [
          Math.min(a[0] - ra, b[0] - rb),
          Math.min(a[1] - ra, b[1] - rb),
          Math.max(a[0] + ra, b[0] + rb),
          Math.max(a[1] + ra, b[1] + rb),
        ],
      };
/** Signed distance to a tapered capsule from a (radius ra) to b (radius rb): the convex hull of
 *  the two discs, in closed form (Quilez's uneven capsule). */
const taperD = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ra: number,
  rb: number,
  x: number,
  y: number
) => {
  const ex = bx - ax,
    ey = by - ay,
    h = ex * ex + ey * ey,
    b = ra - rb;
  if (h <= b * b) {
    // one disc holds the other: the hull is the larger disc
    const [cx, cy, r] = ra >= rb ? [ax, ay, ra] : [bx, by, rb];
    return Math.hypot(x - cx, y - cy) - r;
  }
  const px = x - ax,
    py = y - ay;
  const qx = Math.abs((px * ey - py * ex) / h),
    qy = (px * ex + py * ey) / h;
  const cx = Math.sqrt(h - b * b);
  const k = cx * qy - b * qx,
    m = cx * qx + b * qy,
    n = qx * qx + qy * qy;
  if (k < 0) return Math.sqrt(h * n) - ra;
  if (k > cx) return Math.sqrt(h * (n + 1 - 2 * qy)) - rb;
  return m - ra;
};
const boxPrim = (
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): Prim => ({
  k: PRIM.box,
  x1: x,
  y1: y,
  x2: x + w,
  y2: y + h,
  x3: 0,
  r,
  bb: [x - r, y - r, x + w + r, y + h + r],
});
/** A member, or an avoided node, grown by r, as a primitive. */
export const grownPrim = (m: Member, r: number): Prim =>
  m.kind === "disc"
    ? discPrim(m.cx, m.cy, m.r + r)
    : m.kind === "segment"
      ? m.w2 !== undefined && m.w2 !== m.w
        ? taperPrim(m.a, m.b, m.w / 2 + r, m.w2 / 2 + r)
        : capsulePrim(m.a, m.b, m.w / 2 + r)
      : boxPrim(m.x, m.y, m.w, m.h, r);
/** Signed distance from (x, y) to a primitive. */
export const primD = (p: Prim, x: number, y: number): number => {
  if (p.k === PRIM.disc) {
    const dx = x - p.x1,
      dy = y - p.y1;
    return Math.sqrt(dx * dx + dy * dy) - p.r;
  }
  if (p.k === PRIM.capsule) {
    const ex = p.x2 - p.x1,
      ey = p.y2 - p.y1,
      L = ex * ex + ey * ey;
    const t = L > 0 ? ((x - p.x1) * ex + (y - p.y1) * ey) / L : 0,
      u = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (p.x1 + u * ex),
      dy = y - (p.y1 + u * ey);
    return Math.sqrt(dx * dx + dy * dy) - p.r;
  }
  if (p.k === PRIM.box) {
    const qx = x < p.x1 ? p.x1 : x > p.x2 ? p.x2 : x,
      qy = y < p.y1 ? p.y1 : y > p.y2 ? p.y2 : y;
    if (qx === x && qy === y)
      return -Math.min(x - p.x1, p.x2 - x, y - p.y1, p.y2 - y) - p.r;
    const dx = x - qx,
      dy = y - qy;
    return Math.sqrt(dx * dx + dy * dy) - p.r;
  }
  return taperD(p.x1, p.y1, p.x2, p.y2, p.r, p.x3, x, y);
};
