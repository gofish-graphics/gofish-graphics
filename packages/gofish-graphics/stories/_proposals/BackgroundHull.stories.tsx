import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  layer,
  ellipse,
  rect,
  text,
  position,
  polygon,
  enclose,
  background,
  spread,
  circle,
} from "../../src/lib";
import {
  Area as BSArea,
  Circle as BSCircle,
  Rectangle as BSRectangle,
  calculatePotentialOutline,
  calculateVirtualEdges,
  createGenericInfluenceArea,
  createRectangleInfluenceArea,
  defaultOptions,
} from "bubblesets-js";
// throwaway: delaunator is in the pnpm store but not a direct dependency
import Delaunator from "../../../../node_modules/.pnpm/delaunator@5.1.0/node_modules/delaunator/index.js";
import { penguins } from "../../src/data/penguins";

// THROWAWAY PROTOTYPE for proposals/background-hull/proposal.md.
//
// None of `Shape.box()`, `Shape.hull()` or `Shape.spine()` exists. Each story
// lays its members out at explicit pixel positions (`position`), computes the
// outline with the story-local helpers below, and draws it as a `polygon`
// painted under the members. The comment above each story gives the proposed
// spelling the picture stands for. The box strategy uses the real `enclose`
// where it can, since box mode is what `enclose` does today.

const meta: Meta = { title: "Proposals/Background Hull" };
export default meta;

// ── geometry helpers (prototype only) ───────────────────────────────────────

type Pt = [number, number];
type Member =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  // A line-segment member (a drawn edge, stroke width w). Only the current
  // construction (`smoothBlob`) understands it; the older helpers never see one.
  | { kind: "segment"; a: Pt; b: Pt; w: number };

/** The member's outline grown by `pad`, sampled as points (the #974 `boundary`). */
const samples = (m: Member, pad: number): Pt[] => {
  const out: Pt[] = [];
  if (m.kind === "circle") {
    const R = m.r + pad;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 2 * Math.PI;
      out.push([m.cx + R * Math.cos(a), m.cy + R * Math.sin(a)]);
    }
    return out;
  }
  const corners: [number, number, number][] = [
    [m.x + m.w, m.y + m.h, 0],
    [m.x, m.y + m.h, Math.PI / 2],
    [m.x, m.y, Math.PI],
    [m.x + m.w, m.y, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      out.push([cx + pad * Math.cos(a), cy + pad * Math.sin(a)]);
    }
  // midpoints along long edges so concave digging has points to dig to
  const steps = 6;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    out.push([m.x + t * m.w, m.y - pad], [m.x + t * m.w, m.y + m.h + pad]);
    out.push([m.x - pad, m.y + t * m.h], [m.x + m.w + pad, m.y + t * m.h]);
  }
  return out;
};

const cross = (o: Pt, a: Pt, b: Pt) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Andrew's monotone chain. */
const convexHull = (pts: Pt[]): Pt[] => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
};

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const segIntersect = (p1: Pt, p2: Pt, p3: Pt, p4: Pt) => {
  const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
};
const inPoly = (p: Pt, poly: Pt[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * Alpha shape of the member centers: keep the Delaunay triangles whose
 * circumradius is at most `alpha` (pixels) and walk the boundary. A larger
 * alpha fills wider openings; alpha = Infinity is the convex hull.
 */
const alphaShape = (pts: Pt[], alpha: number): Pt[] => {
  if (!isFinite(alpha) || pts.length < 3) return convexHull(pts);
  const d = Delaunator.from(pts);
  const count = new Map<string, number>();
  const ek = (i: number, j: number) => (i < j ? i + ',' + j : j + ',' + i);
  const kept: number[][] = [];
  for (let t = 0; t < d.triangles.length / 3; t++) {
    const [i, j, k] = [d.triangles[3 * t], d.triangles[3 * t + 1], d.triangles[3 * t + 2]];
    const A = dist(pts[i], pts[j]), B = dist(pts[j], pts[k]), Cc = dist(pts[k], pts[i]);
    const area = Math.abs(cross(pts[i], pts[j], pts[k])) / 2;
    if (area < 1e-9 || (A * B * Cc) / (4 * area) > alpha) continue;
    kept.push([i, j, k]);
    for (const [u, v] of [[i, j], [j, k], [k, i]]) count.set(ek(u, v), (count.get(ek(u, v)) ?? 0) + 1);
  }
  // directed boundary edges (orientation of their triangle) chained into a loop
  const next = new Map<number, number>();
  for (const [i, j, k] of kept)
    for (const [u, v] of [[i, j], [j, k], [k, i]]) if (count.get(ek(u, v)) === 1) next.set(u, v);
  // several loops when there are holes: keep the one with the largest area (the outside)
  const seen = new Set<number>();
  let bestLoop: Pt[] = [], bestArea = -1;
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: Pt[] = [];
    let cur = start, guard = 0;
    do { seen.add(cur); loop.push(pts[cur]); cur = next.get(cur)!; } while (cur !== undefined && cur !== start && guard++ < 10000);
    let area = 0;
    for (let i = 0; i < loop.length; i++) area += cross([0, 0], loop[i], loop[(i + 1) % loop.length]);
    if (Math.abs(area) > bestArea) { bestArea = Math.abs(area); bestLoop = loop; }
  }
  return bestLoop;
};

/** Grow a simple polygon by R: round arcs at convex corners, mitred points at reflex ones. */
const offsetPolygon = (poly: Pt[], R: number): Pt[] => {
  const n = poly.length;
  const norm = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  let nl = (a: Pt, b: Pt): Pt => norm([b[1] - a[1], -(b[0] - a[0])]);
  if (n >= 3) {
    const [a, b] = [poly[0], poly[1]];
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const nn = nl(a, b);
    if (inPoly([m[0] + nn[0] * 0.01, m[1] + nn[1] * 0.01], poly)) {
      const f = nl; nl = (a: Pt, b: Pt) => { const v = f(a, b); return [-v[0], -v[1]]; };
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = poly[(i - 1 + n) % n], v = poly[i], q = poly[(i + 1) % n];
    const n1 = nl(p, v), n2 = nl(v, q), e1 = norm([v[0] - p[0], v[1] - p[1]]);
    let m: Pt = [n1[0] + n2[0], n1[1] + n2[1]];
    if (Math.hypot(m[0], m[1]) < 1e-6) m = e1;
    m = norm(m);
    if (m[0] * e1[0] + m[1] * e1[1] >= -1e-9) {
      const a1 = Math.atan2(n1[1], n1[0]), am = Math.atan2(m[1], m[0]);
      let half = am - a1;
      while (half > Math.PI) half -= 2 * Math.PI;
      while (half < -Math.PI) half += 2 * Math.PI;
      const steps = Math.max(2, Math.ceil(Math.abs(2 * half) / 0.2));
      for (let s = 0; s <= steps; s++) {
        const ang = a1 + (2 * half * s) / steps;
        out.push([v[0] + R * Math.cos(ang), v[1] + R * Math.sin(ang)]);
      }
    } else {
      const k = R / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
      out.push([v[0] + k * (n1[0] + n2[0]), v[1] + k * (n1[1] + n2[1])]);
    }
  }
  return out;
};

const boxOutline = (members: Member[], pad: number): Pt[] => {
  const s = members.flatMap((m) => samples(m, 0));
  const xs = s.map((p) => p[0]), ys = s.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
};

/** Hull strategy. Convex: hull of the padded member outlines. Concave: alpha shape of
 *  the centers, grown by radius + padding (prototype assumes equal-size circles). */
const hullOutline = (members: Member[], pad: number, alpha = Infinity): Pt[] => {
  if (!isFinite(alpha)) return convexHull(members.flatMap((m) => samples(m, pad)));
  const cs = members as Extract<Member, { kind: "circle" }>[];
  return offsetPolygon(alphaShape(cs.map((m) => [m.cx, m.cy] as Pt), alpha), cs[0].r + pad);
};

const toBS = (m: Member) =>
  m.kind === "circle"
    ? { x: m.cx - m.r, y: m.cy - m.r, width: 2 * m.r, height: 2 * m.r }
    : { x: m.x, y: m.y, width: m.w, height: m.h };

/**
 * Spine strategy, closer to the Bubble Sets paper (Collins et al. 2009) than
 * bubblesets-js's own `compute()`, using the library's exported pieces:
 *  - virtual edges are routed around each non-member's box grown by `clearance`
 *    (tube half-width + gap), so the drawn tube, not just its center line, clears it;
 *  - each routed edge is ONE influence area whose distance is the distance to its
 *    nearest segment (paper, section 3.2: "only the edge segment closest to the pixel
 *    group contributes energy"); bubblesets-js adds every segment, which bulges at bends;
 *  - circles stay circles (round caps), and energy falls off over a short distance,
 *    so neighboring fields do not add up into lumps.
 */
type Spine2Opts = {
  avoiding?: Member[]; via?: [Pt, Pt][]; pad?: number; tube?: number; gap?: number;
  falloff?: number; pixelGroup?: number; debug?: { edges: [Pt, Pt][] }; extra?: Record<string, any>;
};
const spineOutline2 = (members: Member[], o: Spine2Opts = {}): Pt[] => {
  const pad = o.pad ?? 8, tube = o.tube ?? Math.max(4, pad * 0.6), gap = o.gap ?? 4;
  const falloff = o.falloff ?? Math.max(4, pad * 0.5), pg = o.pixelGroup ?? 1;
  const opt = {
    ...defaultOptions,
    nodeR0: pad, nodeR1: pad + falloff, edgeR0: tube, edgeR1: tube + falloff,
    morphBuffer: 2, pixelGroup: pg, ...(o.extra ?? {}),
  };
  const shape = (m: Member, grow = 0): any =>
    m.kind === "circle" ? BSCircle.from({ cx: m.cx, cy: m.cy, radius: m.r + grow })
      : BSRectangle.from({ x: m.x - grow, y: m.y - grow, width: m.w + 2 * grow, height: m.h + 2 * grow });
  const asRect = (m: Member, grow = 0) => {
    const b = toBS(m);
    return BSRectangle.from({ x: b.x - grow, y: b.y - grow, width: b.width + 2 * grow, height: b.height + 2 * grow });
  };
  const memObjs = members.map((m) => shape(m));
  const nonObjs = (o.avoiding ?? []).map((m) => shape(m));
  // 1. virtual edges (or the given real edges), as line segments
  const segs: [Pt, Pt][] = o.via
    ? o.via
    : calculateVirtualEdges(memObjs, (o.avoiding ?? []).map((m) => asRect(m, tube + gap)), 100, opt.morphBuffer).map(
        (l: any) => [[l.x1, l.y1], [l.x2, l.y2]] as [Pt, Pt]
      );
  // 2. group segments into routes: chains joined at bend points (not at member centers)
  const key = (p: Pt) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  const centers = new Set(memObjs.map((m: any) => key([m.cx, m.cy])));
  const parent = segs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byPt = new Map<string, number[]>();
  segs.forEach(([p, q], i) => [p, q].forEach((x) => { const k = key(x); if (!centers.has(k)) byPt.set(k, [...(byPt.get(k) ?? []), i]); }));
  for (const ids of byPt.values()) for (const i of ids.slice(1)) parent[find(i)] = find(ids[0]);
  const routes = new Map<number, [Pt, Pt][]>();
  segs.forEach((s, i) => routes.set(find(i), [...(routes.get(find(i)) ?? []), s]));
  // 3. potential field over the active region
  const all = [...memObjs, ...segs.map(([p, q]) => BSRectangle.from({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), width: Math.abs(q[0] - p[0]), height: Math.abs(q[1] - p[1]) }))];
  const bb = all.slice(1).reduce((r: any, x: any) => (r.add(x), r), BSRectangle.from(all[0]));
  const margin = Math.max(opt.nodeR1, opt.edgeR1) + 4;
  const area = BSArea.fromPixelRegion(BSRectangle.from({ x: bb.x - margin, y: bb.y - margin, width: bb.width + 2 * margin, height: bb.height + 2 * margin }), pg);
  const infl = (m: any, R: number) =>
    m instanceof BSRectangle ? createRectangleInfluenceArea(m, area, R) : createGenericInfluenceArea(m, area, R);
  const memAreas = memObjs.map((m: any) => infl(m, opt.nodeR1));
  const nonAreas = nonObjs.map((m: any) => infl(m, opt.nodeR1));
  const segDist2 = (s: [Pt, Pt], x: number, y: number) => {
    const [[x1, y1], [x2, y2]] = s, dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L));
    return (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2;
  };
  const edgeAreas = [...routes.values()].map((rs) => {
    const xs = rs.flatMap(([p, q]) => [p[0], q[0]]), ys = rs.flatMap(([p, q]) => [p[1], q[1]]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return createGenericInfluenceArea(
      { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, distSquare: (px: number, py: number) => Math.min(...rs.map((s) => segDist2(s, px, py))) },
      area, opt.edgeR1
    );
  });
  const path = calculatePotentialOutline(area, memAreas, edgeAreas, nonAreas, (p: any) => p.containsElements(memObjs), opt);
  if (o.debug) o.debug.edges.push(...segs);
  const smooth = path.sample(Math.max(2, Math.round(8 / pg))).simplify(0).bSplines().simplify(0);
  return smooth.points.map((p: any) => [p.x, p.y] as Pt);
};

// ── drawing helpers ─────────────────────────────────────────────────────────

const dot = (m: Extract<Member, { kind: "circle" }>, fill: string) =>
  position({ x: m.cx - m.r, y: m.cy - m.r }, [ellipse({ w: 2 * m.r, h: 2 * m.r, fill })]);
const bar = (m: Extract<Member, { kind: "rect" }>, fill: string) =>
  position({ x: m.x, y: m.y }, [rect({ w: m.w, h: m.h, fill })]);
const label = (x: number, y: number, s: string, opts: any = {}) =>
  position({ x, y }, [text({ text: s, fontSize: 12, fill: "#333", ...opts })]);
const region = (pts: Pt[], color: string, fillOpacity = 0.22, strokeWidth = 1.5) => [
  polygon({ points: pts, fill: color, stroke: color, strokeWidth: 0, opacity: fillOpacity }),
  polygon({ points: pts, fill: "none", stroke: color, strokeWidth }),
];
const C = (cx: number, cy: number, r = 7): Extract<Member, { kind: "circle" }> => ({ kind: "circle", cx, cy, r });

// ── (a) strategy grid: same members, one panel per strategy ────────────────
// A U of eight members (blue) with two non-members (gray) inside its opening.

// A U-shaped cluster two dots thick (a band of points around a U-shaped path).
const U: Extract<Member, { kind: "circle" }>[] = (() => {
  const path: Pt[] = [[35, 22], [35, 150], [190, 150], [190, 22]];
  const out: Extract<Member, { kind: "circle" }>[] = [];
  for (let s = 0; s < 3; s++) {
    const [a, b] = [path[s], path[s + 1]];
    const L = dist(a, b), nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    const k = Math.round(L / 26);
    for (let i = s === 0 ? 0 : 1; i <= k; i++) {
      const t = i / k, jit = ((i * 7 + s * 3) % 5) - 2;
      for (const side of [-1, 1])
        out.push(C(a[0] + t * (b[0] - a[0]) + side * 11 * nx + jit, a[1] + t * (b[1] - a[1]) + side * 11 * ny - jit, 5));
    }
  }
  return out;
})();
const NON = [C(112, 50, 5), C(112, 100, 5)];
const BLUE = "#3366aa";
const GRAY = "#9aa0a6";
const pointsLayer = () => [...U.map((m) => dot(m, BLUE)), ...NON.map((m) => dot(m, GRAY))];

const renderPanel = (outline: any[]) => {
  const container = initializeContainer();
  layer([...outline, ...pointsLayer()]).render(container, { w: 260, h: 220 });
  return container;
};

// enclose({ padding: 10, shape: Shape.box({ radius: 8 }) }, members)
export const StrategyBox: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // real enclose: today's box mode
    layer([
      ...U.map((m, i) =>
        position({ x: m.cx - m.r, y: m.cy - m.r }, [ellipse({ w: 2 * m.r, h: 2 * m.r, fill: BLUE }).name(`m${i}`)])
      ),
      ...NON.map((m) => dot(m, GRAY)),
    ])
      .relate((names: any) => [
        enclose(
          { padding: 8, rx: 8, ry: 8, fill: "rgba(51,102,170,0.18)", stroke: BLUE, strokeWidth: 1.5 },
          U.map((_, i) => names[`m${i}`])
        ),
      ])
      .render(container, { w: 260, h: 220 });
    return container;
  },
};
// enclose({ padding: 10, shape: Shape.hull() }, members)
export const StrategyHullConvex: StoryObj = { render: () => renderPanel(region(hullOutline(U, 8), BLUE)) };
// enclose({ padding: 10, shape: Shape.hull({ alpha: 40 }) }, members)
export const StrategyHullConcave: StoryObj = { render: () => renderPanel(region(hullOutline(U, 8, 40), BLUE)) };
// enclose({ padding: 10, shape: Shape.spine({ avoiding: others }) }, members)
export const StrategySpine: StoryObj = {
  render: () => renderPanel(region(spineOutline2(U, { avoiding: NON, pad: 8, tube: 6, gap: 4, falloff: 16 }), BLUE)),
};

// ── (b1) penguins: one hull per species ────────────────────────────────────
// chart(penguins)
//   .flow(group({ by: "Species" }), scatter({ x: "Beak Length (mm)", y: "Beak Depth (mm)" }))
//   .mark(circle({ r: 3, fill: "Species" }))
//   .layer(enclose({ shape: Shape.hull(), padding: 6, fill: "Species", opacity: 0.2 }))
// (one hull per species comes from #752's default split: the group tier splits.)

const SPECIES_COLORS: Record<string, string> = { Adelie: "#4c78a8", Chinstrap: "#f58518", Gentoo: "#54a24b" };
const PW = 360, PH = 260, PL = 44, PB = 30;
const xs = (v: number) => PL + ((v - 32) / (60 - 32)) * PW;
const ys = (v: number) => PH - ((v - 13) / (22 - 13)) * PH;
const pen = (penguins as any[]).filter((d) => d["Beak Length (mm)"] != null && d["Beak Depth (mm)"] != null);
const axes = () => [
  position({ x: PL, y: PH }, [rect({ w: PW, h: 1, fill: "#666" })]),
  position({ x: PL - 1, y: 0 }, [rect({ w: 1, h: PH, fill: "#666" })]),
  ...[35, 40, 45, 50, 55].map((v) => label(xs(v) - 7, PH + 6, String(v), { fontSize: 10 })),
  ...[14, 16, 18, 20, 22].map((v) => label(PL - 20, ys(v) - 6, String(v), { fontSize: 10 })),
  label(PL + PW / 2 - 50, PH + 20, "Beak Length (mm)", { fontSize: 11 }),
  label(PL + 6, 4, "Beak Depth (mm)", { fontSize: 11 }),
];
const penguinScene = (outline: (ms: Member[], color: string) => any[]) => {
  const groups = Object.keys(SPECIES_COLORS).map((s) => ({
    s,
    ms: pen.filter((d) => d.Species === s).map((d) => C(xs(d["Beak Length (mm)"]), ys(d["Beak Depth (mm)"]), 2.5)),
  }));
  return layer([
    ...axes(),
    ...groups.flatMap(({ s, ms }) => outline(ms, SPECIES_COLORS[s])),
    ...groups.flatMap(({ s, ms }) => ms.map((m) => dot(m, SPECIES_COLORS[s]))),
    ...groups.map(({ s }, i) => label(PL + 130 + i * 80, -22, s, { fill: SPECIES_COLORS[s], fontWeight: "bold" })),
  ]);
};
export const PenguinHulls: StoryObj = {
  render: () => {
    const container = initializeContainer();
    penguinScene((ms, c) => region(hullOutline(ms, 6), c, 0.18)).render(container, { w: 420, h: 330 });
    return container;
  },
};
// Same, shape: Shape.box(): the boxes overlap so much that they stop saying anything.
export const PenguinBoxes: StoryObj = {
  render: () => {
    const container = initializeContainer();
    penguinScene((ms, c) => region(boxOutline(ms, 6), c, 0.12)).render(container, { w: 420, h: 330 });
    return container;
  },
};

// ── (b2) Topology: a/c neighborhood avoiding b ─────────────────────────────
// layer([a, b, c]).relate(({ a, b, c }) => [
//   enclose({ shape: Shape.hull(), fill: "#009dff" }, [a, b]),
//   enclose({ shape: Shape.spine({ avoiding: [b] }), fill: "#ff2400" }, [a, c]),
// ])

const TA = C(40, 70, 7), TB = C(130, 70, 7), TC = C(220, 70, 7);
const topo = (ac: Pt[]) => {
  const container = initializeContainer();
  layer([
    ...region(hullOutline([TA, TB], 16), "#009dff", 0.35, 2.5),
    ...region(ac, "#ff2400", 0.35, 2.5),
    ...[TA, TB, TC].map((m) => dot(m, "black")),
    label(35, 80, "a", { fontStyle: "italic", fontSize: 16 }),
    label(125, 80, "b", { fontStyle: "italic", fontSize: 16 }),
    label(215, 80, "c", { fontStyle: "italic", fontSize: 16 }),
  ]).render(container, { w: 280, h: 160 });
  return container;
};
// wrong: a convex hull of {a, c} must also cover b
export const TopologyHull: StoryObj = { render: () => topo(hullOutline([TA, TC], 16)) };
// right: the spine routes around b
export const TopologySpine: StoryObj = {
  render: () => topo(spineOutline2([TA, TC], { avoiding: [TB], pad: 14, tube: 10, gap: 10, falloff: 12 })),
};

// ── (b3) hyperedges over a node-link diagram ───────────────────────────────
// chart(memberships)                              // rows: { set, node }
//   .flow(resolve(["node"], { from: selectAll("nodes") }), group({ by: "set" }))
//   .mark(enclose({ members: "node", shape: Shape.spine({ via: selectAll("edges"), avoiding: selectAll("nodes") }),
//                   fill: "set", opacity: 0.25 }))

const NODES: Record<string, Pt> = {
  n1: [40, 50], n2: [110, 30], n3: [100, 110], n4: [170, 90], n5: [240, 50],
  n6: [250, 130], n7: [180, 170], n8: [60, 180], n9: [310, 190], n10: [320, 80],
};
const EDGES: [string, string][] = [
  ["n1", "n2"], ["n1", "n3"], ["n2", "n4"], ["n3", "n4"], ["n4", "n5"], ["n4", "n6"],
  ["n6", "n7"], ["n3", "n8"], ["n7", "n9"], ["n5", "n10"], ["n6", "n9"], ["n8", "n7"],
];
const SETS: { name: string; nodes: string[]; color: string }[] = [
  { name: "A", nodes: ["n1", "n2", "n3"], color: "#e45756" },
  { name: "B", nodes: ["n4", "n5", "n6", "n10"], color: "#4c78a8" },
  { name: "C", nodes: ["n3", "n8", "n7", "n9"], color: "#54a24b" },
];
export const Hyperedges: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const node = (id: string) => C(NODES[id][0], NODES[id][1], 9);
    const edgeLine = ([p, q]: [string, string]) => {
      const [x1, y1] = NODES[p], [x2, y2] = NODES[q];
      const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1);
      const nx = -Math.sin(ang) * 0.75, ny = Math.cos(ang) * 0.75;
      return polygon({
        points: [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]],
        fill: "#555",
      });
    };
    const outlines = SETS.flatMap((s) => {
      const members = s.nodes.map(node);
      const others = Object.keys(NODES).filter((id) => !s.nodes.includes(id)).map(node);
      const via = EDGES.filter(([p, q]) => s.nodes.includes(p) && s.nodes.includes(q)).map(
        ([p, q]) => [NODES[p], NODES[q]] as [Pt, Pt]
      );
      return region(spineOutline2(members, { avoiding: others, via, pad: 9, tube: 5, gap: 3, falloff: 8 }), s.color, 0.25, 2);
    });
    layer([
      ...outlines,
      ...EDGES.map(edgeLine),
      ...Object.keys(NODES).map((id) => dot(node(id), "white")),
      ...Object.keys(NODES).flatMap((id) => [
        polygon({ points: samples(node(id), 0), fill: "none", stroke: "#333", strokeWidth: 1.5 }),
        label(NODES[id][0] - (id.length > 2 ? 8 : 5), NODES[id][1] - 6, id.slice(1), { fontSize: 10 }),
      ]),
      ...SETS.map((s, i) => label(20 + i * 50, 215, `set ${s.name}`, { fill: s.color, fontWeight: "bold" })),
    ]).render(container, { w: 360, h: 240 });
    return container;
  },
};

// ── (b4) non-adjacent members in a chart: one species across lakes ─────────
// chart(catch)
//   .flow(spread({ by: "lake", dir: "x" }), spread({ by: "species", dir: "x", spacing: 2 }))
//   .mark(rect({ h: "count", fill: "species" }).name("bars"))
//   .layer(chart(selectAll("bars"))
//     .flow(filter((d) => d.species === "trout"))
//     .mark(enclose({ shape: Shape.spine({ avoiding: selectAll("bars") }), stroke: "black" })))

const LAKES = ["Erie", "Huron", "Michigan", "Ontario"];
const SPECIES = ["bass", "trout", "perch"];
const SP_COLORS = ["#9ecae9", "#f58518", "#bab0ac"];
const COUNTS = [[40, 95, 60], [70, 55, 85], [30, 110, 45], [80, 70, 50]];
type Bar = Extract<Member, { kind: "rect" }>;
const BW = 20, GAP = 9, GROUP = 3 * BW + 2 * GAP, GG = 34, BASE = 170, X0 = 20;
const BARS: { m: Bar; sp: number }[] = LAKES.flatMap((_, li) =>
  SPECIES.map((_, si) => {
    const h = COUNTS[li][si] * 1.3;
    return { m: { kind: "rect", x: X0 + li * (GROUP + GG) + si * (BW + GAP), y: BASE - h, w: BW, h } as Bar, sp: si };
  })
);
const TROUT = BARS.filter((b) => b.sp === 1).map((b) => b.m);
const NOT_TROUT = BARS.filter((b) => b.sp !== 1).map((b) => b.m);
// The axis line and its labels: the outline must not cover them either.
const AXIS_BAND: Bar = { kind: "rect", x: X0 - 6, y: BASE, w: 4 * GROUP + 3 * GG + 12, h: 24 };
const barsScene = (withBackgrounds: boolean, outline: any[] = [], legend = true) => {
  const ink: any[] = [];
  if (withBackgrounds)
    LAKES.forEach((_, li) =>
      ink.push(...region(boxOutline(BARS.filter((_, i) => Math.floor(i / 3) === li).map((b) => b.m), 8), "#8892a0", 0.12, 0))
    );
  return layer([
    ...ink,
    ...outline,
    ...BARS.map((b) => bar(b.m, SP_COLORS[b.sp])),
    position({ x: X0 - 6, y: BASE }, [rect({ w: 4 * GROUP + 3 * GG + 12, h: 1, fill: "#666" })]),
    ...LAKES.map((l, li) => label(X0 + li * (GROUP + GG) + GROUP / 2 - l.length * 3.3, BASE + 14, l)),
    ...(legend ? SPECIES.map((s, si) => label(X0 + si * 70, -30, s, { fill: si === 1 ? "#d6580c" : "#666", fontWeight: "bold" })) : []),
  ]);
};
const TROUT_SPINE: Spine2Opts = { pad: 4, tube: 4, gap: 4, falloff: 8 };
// avoiding: the other bars and the axis band. Routed edges go over the bar tops.
export const NonAdjacentSpine: StoryObj = {
  render: () => {
    const container = initializeContainer();
    barsScene(false, region(spineOutline2(TROUT, { ...TROUT_SPINE, avoiding: [...NOT_TROUT, AXIS_BAND] }), "#d6580c", 0.18, 2)).render(container, { w: 400, h: 240 });
    return container;
  },
};
// avoiding: the other bars only. Bubble Sets routes each blocked edge around the side of the
// obstacle that cuts off less of the box, which here is below the baseline.
export const NonAdjacentSpineBarsOnly: StoryObj = {
  render: () => {
    const container = initializeContainer();
    barsScene(false, region(spineOutline2(TROUT, { ...TROUT_SPINE, avoiding: NOT_TROUT }), "#d6580c", 0.18, 2)).render(container, { w: 400, h: 240 });
    return container;
  },
};
// Modifier / per-group reading: spread({ by: "lake", dir: "x" }).background({ padding: 8, fill: "#eef" })
// = one box behind each group the operator makes (like `.label()` on an operator).
export const PerGroupBackgrounds: StoryObj = {
  render: () => {
    const container = initializeContainer();
    barsScene(true).render(container, { w: 400, h: 240 });
    return container;
  },
};

// ── (b5) component case, real code: today's tutorial background ─────────────
// enclose({ padding: 20, fill: "#252150", stroke: "none", shape: Shape.box({ radius: 16 }) }, [spread(...)])
export const PlanetsBox: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const data = [
      { r: 15, fill: "#EBE3CF", stroke: "#DCD0B2" },
      { r: 36, fill: "#DC933C", stroke: "#C47A28" },
      { r: 38, fill: "#179DD7", stroke: "#1280B0" },
      { r: 21, fill: "#F4BC80", stroke: "#E0954C" },
    ];
    background({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
      spread(
        { dir: "x", spacing: 50, alignment: "middle" },
        data.map((d) => circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 }))
      ),
    ]).render(container, { w: 410, h: 116 });
    return container;
  },
};

// ── (c) KelpFusion (Meulemans et al., TVCG 2013), story-local prototype ─────
//
// Follows the paper's three phases for ONE set at a time:
//  1. Reachability graph G: for each pair of member nodes, the shortest route that
//     avoids every other node's allocation area (members and non-members) with
//     clearance w/2. As in the paper's own implementation (section 3.4), pairs are
//     restricted to the Delaunay triangulation of the members.
//     Shortest-path graph SPG(t): edges of G in increasing length; add e unless the
//     SPG already has a path between its ends with weight < |e|^t (Algorithm 2).
//     t = 1 keeps every edge (the triangulation, whose outline is the convex hull);
//     t = Infinity keeps the minimum spanning tree.
//  2. Fill a bounded face f iff area(f) / (1 + |nodes(f)|) < A and f contains no
//     non-member node (the paper's conditions 1 and 2).
//  3. Draw the union of node bubbles (radius r), edges (width w) and filled faces.
// Simplifications, declared: the allocation area is a disc (or the bar grown by
// `pad`), not clipped to the node's Voronoi cell; a filled face is drawn with
// straight sides even where its edges bend around a node; conditions 3 and 4 (which only matter between several
// sets drawn on top of each other) are skipped; no smoothing pass.

type Poly = Pt[];
const centerOf = (m: Member): Pt =>
  m.kind === "circle" ? [m.cx, m.cy] : m.kind === "segment" ? [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2] : [m.x + m.w / 2, m.y + m.h / 2];
const discPoly = (c: Pt, R: number, n = 28): Poly =>
  Array.from({ length: n }, (_, i) => [c[0] + R * Math.cos((2 * Math.PI * i) / n), c[1] + R * Math.sin((2 * Math.PI * i) / n)] as Pt);
/** A node's allocation area grown by `grow`, as a convex polygon. */
const allocPoly = (m: Member, pad: number, grow = 0, n = 28): Poly =>
  m.kind === "circle" ? discPoly([m.cx, m.cy], (m.r + pad + grow) / Math.cos(Math.PI / n), n) : convexHull(samples(m, pad + grow));
const insideConvex = (p: Pt, poly: Poly) => inPoly(p, poly);
const bboxOf = (poly: Poly) => {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
/** A polygon's bounding box and winding sign, computed once per polygon. */
const polyInfoMemo = new WeakMap<Poly, { bb: number[]; sg: number }>();
const polyInfo = (poly: Poly) => {
  let v = polyInfoMemo.get(poly);
  if (!v) {
    let area2 = 0;
    for (let i = 0; i < poly.length; i++) area2 += cross([0, 0], poly[i], poly[(i + 1) % poly.length]);
    polyInfoMemo.set(poly, (v = { bb: bboxOf(poly), sg: area2 > 0 ? 1 : -1 }));
  }
  return v;
};
/** Is p inside polygon `poly`? The same as inPoly, with a bounding-box test first. */
const inPolyFast = (p: Pt, poly: Poly) => {
  const { bb } = polyInfo(poly);
  return p[0] >= bb[0] - 1e-6 && p[0] <= bb[2] + 1e-6 && p[1] >= bb[1] - 1e-6 && p[1] <= bb[3] + 1e-6 && inPoly(p, poly);
};
/** Does segment ab pass through the interior of convex polygon `poly`? (Cyrus–Beck clipping) */
const segHitsPoly = (a: Pt, b: Pt, poly: Poly, { bb, sg: sgn } = polyInfo(poly)) => {
  if (Math.max(a[0], b[0]) < bb[0] || Math.min(a[0], b[0]) > bb[2] || Math.max(a[1], b[1]) < bb[1] || Math.min(a[1], b[1]) > bb[3]) return false;
  let t0 = 0, t1 = 1;
  const d: Pt = [b[0] - a[0], b[1] - a[1]];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    // inside means sgn * cross(p, q, x) > 0
    const num = sgn * cross(p, q, a);
    const den = sgn * ((q[0] - p[0]) * d[1] - (q[1] - p[1]) * d[0]);
    if (Math.abs(den) < 1e-12) { if (num <= 1e-9) return false; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t1 - t0 <= 1e-6) return false;
  }
  return (t1 - t0) * Math.hypot(d[0], d[1]) > 1e-3;
};
type Obstacle = { o: Poly; bb: number[]; sg: number };
/** A uniform grid over convex obstacles' bounding boxes, about one obstacle per cell, so a segment
 *  is tested only against the obstacles in the cells it crosses. `hits(p, q)`: does pq pass through
 *  any obstacle? `buried(v, k)`: is v more than 0.01 px inside an obstacle other than the k-th? */
const obstacleGrid = (obs: Obstacle[]) => {
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity, size = 0;
  for (const { bb } of obs) {
    X0 = Math.min(X0, bb[0]); Y0 = Math.min(Y0, bb[1]); X1 = Math.max(X1, bb[2]); Y1 = Math.max(Y1, bb[3]);
    size += Math.max(bb[2] - bb[0], bb[3] - bb[1]);
  }
  const g = Math.max(size / obs.length, (X1 - X0) / 64, (Y1 - Y0) / 64, 1e-6);
  const nx = Math.floor((X1 - X0) / g) + 1, ny = Math.floor((Y1 - Y0) / g) + 1;
  const cx = (x: number) => Math.max(0, Math.min(nx - 1, Math.floor((x - X0) / g)));
  const cy = (y: number) => Math.max(0, Math.min(ny - 1, Math.floor((y - Y0) / g)));
  const cells: number[][] = Array.from({ length: nx * ny }, () => []);
  obs.forEach(({ bb }, k) => { for (let j = cy(bb[1]); j <= cy(bb[3]); j++) for (let i = cx(bb[0]); i <= cx(bb[2]); i++) cells[j * nx + i].push(k); });
  const stamp = new Int32Array(obs.length);
  let gen = 0;
  const hits = (p: Pt, q: Pt) => {
    const xa = Math.min(p[0], q[0]), xb = Math.max(p[0], q[0]), ya = Math.min(p[1], q[1]), yb = Math.max(p[1], q[1]);
    if (xb < X0 || xa > X1 || yb < Y0 || ya > Y1) return false;
    gen++;
    const dy = q[1] - p[1];
    for (let j = cy(ya); j <= cy(yb); j++) {
      // the segment's x-range within row j, widened by a cell on each side against rounding
      let lo = xa, hi = xb;
      if (dy !== 0) {
        const s0 = (Y0 + j * g - p[1]) / dy, s1 = (Y0 + (j + 1) * g - p[1]) / dy;
        const ta = Math.max(0, Math.min(s0, s1)), tb = Math.min(1, Math.max(s0, s1));
        const xA = p[0] + ta * (q[0] - p[0]), xB = p[0] + tb * (q[0] - p[0]);
        lo = Math.min(xA, xB); hi = Math.max(xA, xB);
      }
      for (let i = Math.max(0, cx(lo) - 1); i <= Math.min(nx - 1, cx(hi) + 1); i++)
        for (const k of cells[j * nx + i]) {
          if (stamp[k] === gen) continue;
          stamp[k] = gen;
          if (segHitsPoly(p, q, obs[k].o, obs[k])) return true;
        }
    }
    return false;
  };
  const deep = (v: Pt, { o, sg }: Obstacle) => {
    for (let i = 0; i < o.length; i++) {
      const p = o[i], q = o[(i + 1) % o.length];
      if ((sg * cross(p, q, v)) / (dist(p, q) || 1) <= 0.01) return false;
    }
    return true;
  };
  const buried = (v: Pt, k: number) =>
    cells[cy(v[1]) * nx + cx(v[0])].some((j) => {
      const n = obs[j];
      return j !== k && v[0] > n.bb[0] && v[0] < n.bb[2] && v[1] > n.bb[1] && v[1] < n.bb[3] && deep(v, n);
    });
  return { hits, buried };
};
/** Shortest route from a to b around convex obstacles (visibility graph + Dijkstra),
 *  using only obstacles near the straight segment (a local search, for speed). */
const routeAround = (a: Pt, b: Pt, allObstacles: Poly[]): Pt[] | null => {
  const M = Math.max(40, dist(a, b) * 0.6);
  const near = allObstacles
    .map((o) => ({ o, ...polyInfo(o) }))
    .filter(({ bb }) => bb[2] > Math.min(a[0], b[0]) - M && bb[0] < Math.max(a[0], b[0]) + M && bb[3] > Math.min(a[1], b[1]) - M && bb[1] < Math.max(a[1], b[1]) + M);
  if (!near.some((n) => segHitsPoly(a, b, n.o, n))) return [a, b];
  const grid = obstacleGrid(near);
  // A vertex more than 0.01 px inside another obstacle can never be on a route: every segment
  // from it runs that far through the obstacle, which counts as blocked. So it is left out.
  const pts: Pt[] = [a, b, ...near.flatMap(({ o }, k) => o.filter((v) => !grid.buried(v, k)))];
  const n = pts.length, D = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  D[0] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || D[i] < D[u])) u = i;
    if (u < 0 || D[u] === Infinity || u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const d = D[u] + dist(pts[u], pts[v]);
      if (d < D[v] && !grid.hits(pts[u], pts[v])) { D[v] = d; prev[v] = u; }
    }
  }
  if (D[1] === Infinity) return null;
  const path: Pt[] = [];
  for (let v = 1; v >= 0; v = prev[v]) path.unshift(pts[v]);
  return path;
};
/** Is the straight segment ab clear of every obstacle? (exactly when routeAround returns [a, b]) */
const clearOf = (a: Pt, b: Pt, obstacles: Poly[]) => !obstacles.some((o) => segHitsPoly(a, b, o));
const polyLen = (p: Pt[]) => p.slice(1).reduce((s, q, i) => s + dist(p[i], q), 0);

type KelpOpts = { avoiding?: Member[]; t: number; pad: number; w: number; A?: number };
type Kelp = { bubbles: Poly[]; edges: Pt[][]; faces: Poly[] };
const kelpFusion = (members: Member[], o: KelpOpts): Kelp => {
  const P = members.map(centerOf), n = P.length, A = o.A ?? Infinity;
  const others = o.avoiding ?? [];
  // Phase 1a: candidate pairs = Delaunay edges of the members (all pairs if fewer than 3)
  const tri: [number, number, number][] = [];
  const pairs = new Map<string, [number, number]>();
  const ek = (i: number, j: number) => (i < j ? `${i},${j}` : `${j},${i}`);
  if (n >= 3) {
    const d = Delaunator.from(P);
    for (let k = 0; k < d.triangles.length; k += 3) {
      const [i, j, l] = [d.triangles[k], d.triangles[k + 1], d.triangles[k + 2]];
      tri.push([i, j, l]);
      for (const [u, v] of [[i, j], [j, l], [l, i]]) pairs.set(ek(u, v), [Math.min(u, v), Math.max(u, v)]);
    }
  }
  if (tri.length === 0) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.set(ek(i, j), [i, j]);
  // Phase 1b: reachability routes avoiding every other allocation area (clearance w/2)
  const memObs = members.map((m) => allocPoly(m, o.pad, o.w / 2, 10));
  const nonObs = others.map((m) => allocPoly(m, o.pad, o.w / 2, 10));
  const G: { i: number; j: number; route: Pt[]; len: number; routed: boolean }[] = [];
  for (const [i, j] of pairs.values()) {
    // skip obstacles that contain an endpoint (the paper's Voronoi clipping would shrink them)
    const obs = [...memObs.filter((_, k) => k !== i && k !== j), ...nonObs].filter(
      (poly) => !insideConvex(P[i], poly) && !insideConvex(P[j], poly)
    );
    const route = routeAround(P[i], P[j], obs);
    if (route) G.push({ i, j, route, len: polyLen(route), routed: route.length > 2 });
  }
  // Phase 1c: shortest-path graph for parameter t (Algorithm 2)
  G.sort((a, b) => a.len - b.len);
  const adj: { to: number; w: number }[][] = P.map(() => []);
  const weight = (len: number) => (isFinite(o.t) ? Math.pow(len, o.t) : len);
  const spDist = (s: number, goal: number, bound: number) => {
    const D = new Array(n).fill(Infinity), done = new Array(n).fill(false);
    D[s] = 0;
    for (;;) {
      let u = -1;
      for (let k = 0; k < n; k++) if (!done[k] && D[k] < Infinity && (u < 0 || D[k] < D[u])) u = k;
      if (u < 0 || D[u] >= bound) return Infinity;
      if (u === goal) return D[u];
      done[u] = true;
      for (const { to, w } of adj[u]) if (D[u] + w < D[to]) D[to] = D[u] + w;
    }
  };
  const spg = new Map<string, (typeof G)[number]>();
  // t = Infinity: the minimum spanning tree (Kruskal), the limit of Algorithm 2
  const root = P.map((_, k) => k);
  const find = (k: number): number => (root[k] === k ? k : (root[k] = find(root[k])));
  for (const e of G) {
    if (!isFinite(o.t)) {
      if (find(e.i) !== find(e.j)) { root[find(e.i)] = find(e.j); spg.set(ek(e.i, e.j), e); }
      continue;
    }
    const we = weight(e.len);
    if (spDist(e.i, e.j, we) >= we) {
      spg.set(ek(e.i, e.j), e);
      adj[e.i].push({ to: e.j, w: we });
      adj[e.j].push({ to: e.i, w: we });
    }
  }
  // Phase 2: bounded faces = groups of Delaunay triangles joined across non-SPG edges
  const triOf = new Map<string, number[]>();
  tri.forEach(([i, j, l], k) => [[i, j], [j, l], [l, i]].forEach(([u, v]) => triOf.set(ek(u, v), [...(triOf.get(ek(u, v)) ?? []), k])));
  const tr = tri.map((_, k) => k);
  const tfind = (k: number): number => (tr[k] === k ? k : (tr[k] = tfind(tr[k])));
  for (const [key, ks] of triOf) if (ks.length === 2 && !spg.has(key)) tr[tfind(ks[0])] = tfind(ks[1]);
  const bad = new Set<number>();
  for (const [key, ks] of triOf) {
    if (ks.length === 1 && !spg.has(key)) bad.add(tfind(ks[0])); // open to the outside
  }
  const groups = new Map<number, number[]>();
  tri.forEach((_, k) => groups.set(tfind(k), [...(groups.get(tfind(k)) ?? []), k]));
  const faces: Poly[] = [];
  for (const [g, ks] of groups) {
    if (bad.has(g)) continue;
    const polys = ks.map((k) => tri[k].map((v) => P[v]) as Poly);
    const area = polys.reduce((s, q) => s + Math.abs(cross(q[0], q[1], q[2])) / 2, 0);
    const boundary = new Set<number>();
    for (const k of ks) for (const [u, v] of [[tri[k][0], tri[k][1]], [tri[k][1], tri[k][2]], [tri[k][2], tri[k][0]]])
      if ((triOf.get(ek(u, v)) ?? []).filter((x) => tfind(x) === g).length === 1) { boundary.add(u); boundary.add(v); }
    if (area / (1 + boundary.size) >= A) continue; // condition 1
    if (others.some((m) => polys.some((q) => inPoly(centerOf(m), q)))) continue; // condition 2
    faces.push(...polys);
  }
  // Phase 3 (pieces; drawn as one union by kelpInk)
  const bubbles = members.map((m) => allocPoly(m, o.pad));
  return { bubbles, edges: [...spg.values()].map((e) => e.route), faces };
};

const mixWhite = (hex: string, k: number) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return "#" + c.map((v) => Math.round(255 - (255 - v) * k).toString(16).padStart(2, "0")).join("");
};
/** Draw the union of the kelp pieces: every piece stroked first, then every piece filled on top. */
const kelpInk = (k: Kelp, color: string, w: number, tint = 0.3) => {
  const light = mixWhite(color, tint);
  const segPolys = k.edges.flatMap((route) => [
    ...route.slice(1).map((q, i) => {
      const p = route[i], L = dist(p, q) || 1, nx = (-(q[1] - p[1]) / L) * (w / 2), ny = ((q[0] - p[0]) / L) * (w / 2);
      return [[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]] as Poly;
    }),
    ...route.slice(1, -1).map((p) => discPoly(p, w / 2, 12)),
  ]);
  const pieces = [...k.faces, ...k.bubbles, ...segPolys];
  return [
    ...pieces.map((q) => polygon({ points: q, fill: "none", stroke: color, strokeWidth: 3 })),
    ...pieces.map((q) => polygon({ points: q, fill: light, stroke: light, strokeWidth: 0.8 })),
  ];
};

// One comparison row: convex hull | KelpFusion at several t | bubble set.
const KELP_TS = [Infinity, 2, 1.5, 1];
const colTitle = (t: number) => (t === Infinity ? "KelpFusion, t = ∞" : `KelpFusion, t = ${t}`);
const compareRow = (o: {
  w: number; h: number; panel: (outline: any[]) => any; members: Member[]; avoiding: Member[];
  color: string; pad: number; kelpW: number; spine: Spine2Opts; cols?: number;
}) => {
  const container = initializeContainer();
  const cols: [string, any[]][] = [
    ...KELP_TS.map((t) => [colTitle(t), kelpInk(kelpFusion(o.members, { avoiding: o.avoiding, t, pad: o.pad, w: o.kelpW }), o.color, o.kelpW)] as [string, any[]]),
    ["convex hull", region(hullOutline(o.members, o.pad), o.color, 0.25, 1.5)],
    ["bubble set", region(spineOutline2(o.members, { avoiding: o.avoiding, ...o.spine }), o.color, 0.25, 1.5)],
  ];
  const top = 22, nc = o.cols ?? 3;
  layer(
    cols.map(([title, ink], i) =>
      position({ x: (i % nc) * o.w, y: Math.floor(i / nc) * (o.h + top) }, [
        layer([
          position({ x: 8, y: 0 }, [text({ text: title, fontSize: 13, fontWeight: "bold", fill: "#333" })]),
          position({ x: 0, y: top }, [o.panel(ink)]),
        ]),
      ])
    )
  ).render(container, { w: nc * o.w, h: Math.ceil(cols.length / nc) * (o.h + top) });
  return container;
};

// Row 1: the Topology a/c set, avoiding b.
export const KelpRowTopology: StoryObj = {
  render: () =>
    compareRow({
      w: 270, h: 150, members: [TA, TC], avoiding: [TB], color: "#ff2400", pad: 14, kelpW: 10,
      spine: { pad: 14, tube: 10, gap: 10, falloff: 12 },
      panel: (ink) => layer([...ink, ...[TA, TB, TC].map((m) => dot(m, "black")),
        label(35, 80, "a", { fontStyle: "italic", fontSize: 16 }), label(125, 80, "b", { fontStyle: "italic", fontSize: 16 }),
        label(215, 80, "c", { fontStyle: "italic", fontSize: 16 })]),
    }),
};

// Row 2: set C of the hyperedge example over the graph (members 3, 7, 8, 9).
const hyperNode = (id: string) => C(NODES[id][0], NODES[id][1], 9);
const hyperPanel = (ink: any[]) =>
  layer([
    ...ink,
    ...EDGES.map(([p, q]) => {
      const [a, b] = [NODES[p], NODES[q]], L = dist(a, b), nx = (-(b[1] - a[1]) / L) * 0.75, ny = ((b[0] - a[0]) / L) * 0.75;
      return polygon({ points: [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], fill: "#555" });
    }),
    ...Object.keys(NODES).map((id) => dot(hyperNode(id), "white")),
    ...Object.keys(NODES).flatMap((id) => [
      polygon({ points: samples(hyperNode(id), 0), fill: "none", stroke: "#333", strokeWidth: 1.5 }),
      label(NODES[id][0] - (id.length > 2 ? 8 : 5), NODES[id][1] - 6, id.slice(1), { fontSize: 10 }),
    ]),
  ]);
export const KelpRowHyperedges: StoryObj = {
  render: () => {
    const set = SETS[2];
    const members = set.nodes.map(hyperNode);
    const avoiding = Object.keys(NODES).filter((id) => !set.nodes.includes(id)).map(hyperNode);
    return compareRow({
      w: 350, h: 220, members, avoiding, color: set.color, pad: 6, kelpW: 7,
      spine: { pad: 9, tube: 5, gap: 3, falloff: 8 }, panel: hyperPanel,
    });
  },
};

// Row 3: trout across lakes.
export const KelpRowBars: StoryObj = {
  render: () =>
    compareRow({
      w: 460, h: 215, cols: 2, members: TROUT, avoiding: [...NOT_TROUT, AXIS_BAND], color: "#d6580c", pad: 4, kelpW: 6,
      spine: TROUT_SPINE, panel: (ink) => position({ x: 0, y: 10 }, [barsScene(false, ink, false)]),
    }),
};

// Row 4: one penguin species (Gentoo) in the beak scatter; the other species are non-members.
export const KelpRowPenguins: StoryObj = {
  render: () => {
    const pts = (s: string) => pen.filter((d) => d.Species === s).map((d) => C(xs(d["Beak Length (mm)"]), ys(d["Beak Depth (mm)"]), 2.5));
    const members = pts("Gentoo"), avoiding = [...pts("Adelie"), ...pts("Chinstrap")];
    return compareRow({
      w: 430, h: 290, cols: 2, members, avoiding, color: SPECIES_COLORS.Gentoo, pad: 3, kelpW: 3,
      spine: { pad: 5, tube: 3, gap: 2, falloff: 8 },
      panel: (ink) => layer([...axes(), ...ink, ...avoiding.map((m) => dot(m, "#b8bcc2")), ...members.map((m) => dot(m, SPECIES_COLORS.Gentoo))]),
    });
  },
};

// ── (d) Generalized KelpFusion: one construction, hull and spine as presets ──
//
// Proposed spelling (see proposal section 6):
//   Shape.blob({ density, neck, smoothing, avoiding, via })   with `padding` on enclose
//   Shape.hull(opts)  = Shape.blob({ density: 1, ...opts })
//   Shape.spine(opts) = Shape.blob({ density: 0, ...opts })
//
// The construction, for one set:
//  1. Skeleton. Candidate links are the Delaunay edges of the member centers
//     (all pairs below three members), plus any `via` edges, which are always
//     kept. Each link is routed around every non-member's keep-out zone. The
//     links kept are KelpFusion's shortest-path graph SPG(t) with t = 1/density:
//     density 0 is the minimum spanning tree, density 1 keeps every candidate.
//  2. Faces. A face (a region closed off by kept links) is filled when it holds
//     no non-member. (KelpFusion's area limit A is left out: A = Infinity.)
//  3. Pieces. Each member grown by `padding` (the node bulge, radius R), each
//     link drawn as a tube of half-width neck * R, and the filled faces.
//  4. Smoothing. Morphological closing of the union by a disc of radius
//     `smoothing`: grow by s, then shrink by s. It fills concave corners and
//     gaps narrower than about 2s and leaves convex parts alone.
//  5. Cut. Each non-member's keep-out zone (its own size + `clearance`) is cut
//     back out, and a small opening rounds the corners the cut leaves.
// Steps 4 and 5 are computed on a pixel grid (distance transforms), and the
// outline is traced with marching squares. Prototype simplifications: no
// Voronoi clipping of node areas; filled faces have straight sides; holes in
// the result are not drawn (only outer loops).

type BlobOpts = {
  avoiding?: Member[]; via?: [Pt, Pt][];
  pad: number; density: number; neck?: number; smoothing?: number;
  clearance?: number; res?: number; debug?: { links: Pt[][] };
};

const memberRadius = (m: Member) => (m.kind === "circle" ? m.r : m.kind === "segment" ? m.w / 2 : Math.min(m.w, m.h) / 2);

/** Squared Euclidean distance transform (Felzenszwalb & Huttenlocher) of a 1-D array. */
const edt1 = (f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) => {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
};
/** Distance (in grid cells) from each cell to the nearest cell where `target` is set. */
const edtTo = (target: Uint8Array, W: number, H: number): Float64Array => {
  const INF = 1e20, out = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = target[i] ? 0 : INF;
  const N = Math.max(W, H), f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = out[y * W + x];
    edt1(f, H, d, v, z);
    for (let y = 0; y < H; y++) out[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = out[y * W + x];
    edt1(f, W, d, v, z);
    for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(d[x]);
  }
  return out;
};

/** Marching squares: closed loops where the field crosses 0 (inside is >= 0). */
const contours = (F: Float64Array, W: number, H: number, x0: number, y0: number, res: number): Pt[][] => {
  const at = (i: number, j: number) => F[j * W + i];
  const pt = (e: string): Pt => {
    const [kind, si, sj] = e.split(":"), i = +si, j = +sj;
    if (kind === "h") { const a = at(i, j), b = at(i + 1, j), t = a / (a - b); return [x0 + (i + t) * res, y0 + j * res]; }
    const a = at(i, j), b = at(i, j + 1), t = a / (a - b); return [x0 + i * res, y0 + (j + t) * res];
  };
  const SEGS: Record<number, [number, number][]> = {
    1: [[2, 3]], 2: [[1, 2]], 3: [[1, 3]], 4: [[0, 1]], 5: [[0, 3], [2, 1]], 6: [[0, 2]], 7: [[0, 3]],
    8: [[3, 0]], 9: [[2, 0]], 10: [[3, 2], [1, 0]], 11: [[1, 0]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]],
  };
  const next = new Map<string, string>();
  for (let j = 0; j < H - 1; j++)
    for (let i = 0; i < W - 1; i++) {
      const tl = at(i, j) >= 0 ? 1 : 0, tr = at(i + 1, j) >= 0 ? 1 : 0, br = at(i + 1, j + 1) >= 0 ? 1 : 0, bl = at(i, j + 1) >= 0 ? 1 : 0;
      const c = tl * 8 + tr * 4 + br * 2 + bl;
      if (c === 0 || c === 15) continue;
      const E = [`h:${i}:${j}`, `v:${i + 1}:${j}`, `h:${i}:${j + 1}`, `v:${i}:${j}`]; // top, right, bottom, left
      for (const [a, b] of SEGS[c]) next.set(E[a], E[b]);
    }
  const loops: Pt[][] = [], seen = new Set<string>();
  for (const s0 of next.keys()) {
    if (seen.has(s0)) continue;
    const loop: Pt[] = [];
    let cur: string | undefined = s0;
    while (cur !== undefined && !seen.has(cur)) { seen.add(cur); loop.push(pt(cur)); cur = next.get(cur); }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
};
const relax = (loop: Pt[], passes = 2): Pt[] => {
  let p = loop;
  for (let k = 0; k < passes; k++)
    p = p.map((q, i) => {
      const a = p[(i - 1 + p.length) % p.length], b = p[(i + 1) % p.length];
      return [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4] as Pt;
    });
  return p;
};
const loopArea = (l: Pt[]) => Math.abs(l.reduce((s, p, i) => s + cross([0, 0], p, l[(i + 1) % l.length]), 0)) / 2;
const segDist2 = (sg: [Pt, Pt], x: number, y: number) => {
  const [[x1, y1], [x2, y2]] = sg, dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1;
  const tt = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L));
  return (x - x1 - tt * dx) ** 2 + (y - y1 - tt * dy) ** 2;
};

/** The generalized construction. Returns the outer loops of the region. */
const blob = (members: Member[], o: BlobOpts): Pt[][] => {
  const res = o.res ?? 0.5, pad = o.pad, neck = o.neck ?? 1, s = o.smoothing ?? 0;
  const clearance = o.clearance ?? 4, others = o.avoiding ?? [];
  const P = members.map(centerOf), n = P.length;
  const R = members.map((m) => memberRadius(m) + pad); // node bulge radius
  const ek = (i: number, j: number) => (i < j ? `${i},${j}` : `${j},${i}`);
  // 1a. candidates: Delaunay edges of the centers (all pairs below 3)
  const tri: [number, number, number][] = [];
  const cand = new Map<string, [number, number]>();
  if (n >= 3) {
    const d = Delaunator.from(P);
    for (let k = 0; k < d.triangles.length; k += 3) {
      const [i, j, l] = [d.triangles[k], d.triangles[k + 1], d.triangles[k + 2]];
      if (Math.abs(cross(P[i], P[j], P[l])) < 1e-9) continue;
      tri.push([i, j, l]);
      for (const [u, v] of [[i, j], [j, l], [l, i]]) cand.set(ek(u, v), [Math.min(u, v), Math.max(u, v)]);
    }
  }
  if (tri.length === 0) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) cand.set(ek(i, j), [i, j]);
  // via edges (given in coordinates) matched to member indices; always kept, never routed
  const idxOf = (p: Pt) => P.findIndex((q) => dist(p, q) < 0.5);
  const viaKeys = new Set<string>();
  for (const [a, b] of o.via ?? []) {
    const i = idxOf(a), j = idxOf(b);
    if (i >= 0 && j >= 0) { viaKeys.add(ek(i, j)); cand.set(ek(i, j), [Math.min(i, j), Math.max(i, j)]); }
  }
  // 1b. route each candidate around the non-members' keep-out zones, grown by the tube half-width
  const hw = (i: number, j: number) => neck * Math.min(R[i], R[j]);
  const keep = (m: Member) => memberRadius(m) + clearance;
  const obstacle = (m: Member, grow: number) =>
    // (the 0.01 px upward nudge only breaks exact ties between going above and below, toward below)
    m.kind === "circle" ? discPoly([m.cx, m.cy - 0.01], (keep(m) + grow) / Math.cos(Math.PI / 32), 32) : convexHull(samples(m, clearance + grow));
  const G: { i: number; j: number; route: Pt[]; len: number; via: boolean }[] = [];
  for (const [key, [i, j]] of cand) {
    const via = viaKeys.has(key);
    const obs = others.map((m) => obstacle(m, hw(i, j))).filter((poly) => !inPoly(P[i], poly) && !inPoly(P[j], poly));
    const route = via ? [P[i], P[j]] : routeAround(P[i], P[j], obs);
    if (route) G.push({ i, j, route, len: polyLen(route), via });
  }
  // 1c. SPG(t), t = 1/density; via edges first, always kept
  const t = o.density <= 0 ? Infinity : 1 / o.density;
  G.sort((a, b) => (a.via === b.via ? a.len - b.len : a.via ? -1 : 1));
  const kept = new Map<string, (typeof G)[number]>();
  const root = P.map((_, k) => k);
  const find = (k: number): number => (root[k] === k ? k : (root[k] = find(root[k])));
  const adj: { to: number; w: number }[][] = P.map(() => []);
  const spDist = (src: number, goal: number, bound: number) => {
    const D = new Map<number, number>([[src, 0]]), done = new Set<number>();
    const heap: [number, number][] = [[0, src]];
    while (heap.length) {
      let bi = 0;
      for (let k = 1; k < heap.length; k++) if (heap[k][0] < heap[bi][0]) bi = k;
      const [du, u] = heap.splice(bi, 1)[0];
      if (done.has(u)) continue;
      if (du >= bound) return Infinity;
      if (u === goal) return du;
      done.add(u);
      for (const { to, w } of adj[u]) {
        const nd = du + w;
        if (nd < (D.get(to) ?? Infinity)) { D.set(to, nd); heap.push([nd, to]); }
      }
    }
    return Infinity;
  };
  for (const e of G) {
    if (e.via || !isFinite(t)) {
      if (e.via || find(e.i) !== find(e.j)) {
        root[find(e.i)] = find(e.j); kept.set(ek(e.i, e.j), e);
        if (e.via) { adj[e.i].push({ to: e.j, w: 0 }); adj[e.j].push({ to: e.i, w: 0 }); }
      }
      continue;
    }
    const we = Math.pow(e.len, t);
    if (spDist(e.i, e.j, we) >= we) { kept.set(ek(e.i, e.j), e); adj[e.i].push({ to: e.j, w: we }); adj[e.j].push({ to: e.i, w: we }); }
  }
  if (o.debug) o.debug.links.push(...[...kept.values()].map((e) => e.route));
  // 2. faces: groups of Delaunay triangles joined across links that were not kept
  const triOf = new Map<string, number[]>();
  tri.forEach(([i, j, l], k) => [[i, j], [j, l], [l, i]].forEach(([u, v]) => triOf.set(ek(u, v), [...(triOf.get(ek(u, v)) ?? []), k])));
  const tr = tri.map((_, k) => k);
  const tfind = (k: number): number => (tr[k] === k ? k : (tr[k] = tfind(tr[k])));
  for (const [key, ks] of triOf) if (ks.length === 2 && !kept.has(key)) tr[tfind(ks[0])] = tfind(ks[1]);
  const open = new Set<number>();
  for (const [key, ks] of triOf) if (ks.length === 1 && !kept.has(key)) open.add(tfind(ks[0]));
  const faces: Pt[][] = [];
  const groups = new Map<number, number[]>();
  tri.forEach((_, k) => groups.set(tfind(k), [...(groups.get(tfind(k)) ?? []), k]));
  for (const [g, ks] of groups) {
    if (open.has(g)) continue;
    const polys = ks.map((k) => tri[k].map((v) => P[v]) as Pt[]);
    if (others.some((m) => polys.some((q) => inPoly(centerOf(m), q)))) continue;
    faces.push(...polys);
  }
  // 3. pieces as distance functions, rasterized into f = distance to their union
  type Piece = { bb: number[]; d: (x: number, y: number) => number };
  const pieces: Piece[] = [];
  members.forEach((m, k) => {
    if (m.kind === "circle") pieces.push({ bb: [m.cx - R[k], m.cy - R[k], m.cx + R[k], m.cy + R[k]], d: (x, y) => Math.hypot(x - m.cx, y - m.cy) - R[k] });
    else pieces.push({
      bb: [m.x - pad, m.y - pad, m.x + m.w + pad, m.y + m.h + pad],
      d: (x, y) => Math.hypot(Math.max(m.x - x, 0, x - m.x - m.w), Math.max(m.y - y, 0, y - m.y - m.h)) - pad,
    });
  });
  const segD = (a: Pt, b: Pt, x: number, y: number) => Math.sqrt(segDist2([a, b], x, y));
  for (const e of kept.values()) {
    const h = hw(e.i, e.j);
    for (let k = 1; k < e.route.length; k++) {
      const a = e.route[k - 1], b = e.route[k];
      pieces.push({ bb: [Math.min(a[0], b[0]) - h, Math.min(a[1], b[1]) - h, Math.max(a[0], b[0]) + h, Math.max(a[1], b[1]) + h], d: (x, y) => segD(a, b, x, y) - h });
    }
  }
  for (const q of faces) {
    pieces.push({ bb: bboxOf(q), d: (x, y) => {
      const e = Math.min(segD(q[0], q[1], x, y), segD(q[1], q[2], x, y), segD(q[2], q[0], x, y));
      return inPoly([x, y], q) ? -e : e;
    } });
  }
  const bb = pieces.reduce((r, p) => [Math.min(r[0], p.bb[0]), Math.min(r[1], p.bb[1]), Math.max(r[2], p.bb[2]), Math.max(r[3], p.bb[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const M = s + 6, x0 = bb[0] - M, y0 = bb[1] - M;
  const W = Math.ceil((bb[2] - bb[0] + 2 * M) / res) + 1, H = Math.ceil((bb[3] - bb[1] + 2 * M) / res) + 1;
  const f = new Float64Array(W * H).fill(1e9);
  for (const p of pieces) {
    const i0 = Math.max(0, Math.floor((p.bb[0] - s - 3 - x0) / res)), i1 = Math.min(W - 1, Math.ceil((p.bb[2] + s + 3 - x0) / res));
    const j0 = Math.max(0, Math.floor((p.bb[1] - s - 3 - y0) / res)), j1 = Math.min(H - 1, Math.ceil((p.bb[3] + s + 3 - y0) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const v = p.d(x0 + i * res, y0 + j * res), k = j * W + i;
      if (v < f[k]) f[k] = v;
    }
  }
  // 4. closing by s: grow (f <= s), then shrink by s (distance to the outside >= s)
  const F = new Float64Array(W * H);
  if (s > 0) {
    const outside = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) outside[k] = f[k] > s ? 1 : 0;
    const dOut = edtTo(outside, W, H);
    for (let k = 0; k < W * H; k++) F[k] = outside[k] ? -f[k] : dOut[k] * res - s;
  } else for (let k = 0; k < W * H; k++) F[k] = -f[k];
  // 5. cut each non-member's keep-out zone, then round the cut's corners with a small opening
  if (others.length) {
    for (const m of others) {
      const kr = keep(m), mb = m.kind === "circle" ? [m.cx - kr, m.cy - kr, m.cx + kr, m.cy + kr] : [m.x - clearance, m.y - clearance, m.x + m.w + clearance, m.y + m.h + clearance];
      const i0 = Math.max(0, Math.floor((mb[0] - x0) / res) - 2), i1 = Math.min(W - 1, Math.ceil((mb[2] - x0) / res) + 2);
      const j0 = Math.max(0, Math.floor((mb[1] - y0) / res) - 2), j1 = Math.min(H - 1, Math.ceil((mb[3] - y0) / res) + 2);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = x0 + i * res, y = y0 + j * res;
        const dk = m.kind === "circle" ? Math.hypot(x - m.cx, y - m.cy) - kr
          : Math.hypot(Math.max(m.x - x, 0, x - m.x - m.w), Math.max(m.y - y, 0, y - m.y - m.h)) - clearance;
        const k = j * W + i;
        if (dk < F[k]) F[k] = dk;
      }
    }
    const ro = Math.min(clearance, 0.5 * neck * Math.min(...R), Math.max(s, 2));
    if (ro > res) {
      const out1 = new Uint8Array(W * H);
      for (let k = 0; k < W * H; k++) out1[k] = F[k] < 0 ? 1 : 0;
      const d1 = edtTo(out1, W, H);
      const core = new Uint8Array(W * H);
      for (let k = 0; k < W * H; k++) core[k] = d1[k] * res >= ro ? 1 : 0;
      const d2 = edtTo(core, W, H);
      for (let k = 0; k < W * H; k++) F[k] = ro - d2[k] * res;
    }
  }
  const loops = contours(F, W, H, x0, y0, res).map((l) => relax(l, 3));
  return loops.filter((l) => loopArea(l) > 40 * res * res);
};
const signedArea = (l: Pt[]) => l.reduce((a, p, i) => a + cross([0, 0], p, l[(i + 1) % l.length]), 0) / 2;
/** Outer loops are filled; holes (loops wound the other way) are painted white, then outlined. */
const blobInk = (loops: Pt[][], color: string, fillOpacity = 0.22, strokeWidth = 1.5) => {
  if (!loops.length) return [];
  const big = loops.reduce((a, b) => (loopArea(a) > loopArea(b) ? a : b));
  const outerSign = Math.sign(signedArea(big));
  const outer = loops.filter((l) => Math.sign(signedArea(l)) === outerSign), holes = loops.filter((l) => Math.sign(signedArea(l)) !== outerSign);
  return [
    ...outer.map((l) => polygon({ points: l, fill: color, stroke: color, strokeWidth: 0, opacity: fillOpacity })),
    ...holes.map((l) => polygon({ points: l, fill: "white", stroke: "none" })),
    ...loops.map((l) => polygon({ points: l, fill: "none", stroke: color, strokeWidth })),
  ];
};
const outlineOnlyAll = (loops: Pt[][]) => loops.map((l) => polygon({ points: l, fill: "none", stroke: "#111", strokeWidth: 2.5 }));

// The shortcuts: exactly the general call with `density` fixed.
const hullPreset = (o: Omit<BlobOpts, "density">): BlobOpts => ({ density: 1, ...o });
const spinePreset = (o: Omit<BlobOpts, "density">): BlobOpts => ({ density: 0, ...o });

// A titled grid of panels.
const titledGrid = (cells: [string, any][], o: { w: number; h: number; cols: number }) => {
  const container = initializeContainer();
  const top = 22;
  layer(
    cells.map(([title, panel], i) =>
      position({ x: (i % o.cols) * o.w, y: Math.floor(i / o.cols) * (o.h + top) }, [
        layer([
          position({ x: 6, y: 0 }, [text({ text: title, fontSize: 12, fontWeight: "bold", fill: "#333" })]),
          position({ x: 0, y: top }, [panel]),
        ]),
      ])
    )
  ).render(container, { w: o.cols * o.w, h: Math.ceil(cells.length / o.cols) * (o.h + top) });
  return container;
};
const uPanel = (ink: any[]) => layer([...ink, ...pointsLayer()]);
const uBlob = (o: Partial<BlobOpts>) => blobInk(blob(U, { avoiding: NON, pad: 8, density: 0, ...o }), BLUE);

// Parameter grid on the U data (gray dots are non-members, listed in `avoiding`).
// Row 1: density at padding 8, smoothing 8. Row 2: smoothing at density 0.
// Row 3: padding (the node bulge) at density 0, smoothing 4, neck 0.5.
export const BlobGrid: StoryObj = {
  render: () => titledGrid([
    ["density: 0 (spine)", uPanel(uBlob({ density: 0, smoothing: 8 }))],
    ["density: 0.5", uPanel(uBlob({ density: 0.5, smoothing: 8 }))],
    ["density: 0.75", uPanel(uBlob({ density: 0.75, smoothing: 8 }))],
    ["density: 1, no avoiding (hull)", uPanel(uBlob({ density: 1, smoothing: 8, avoiding: [] }))],
    ["smoothing: 0", uPanel(uBlob({ smoothing: 0 }))],
    ["smoothing: 8", uPanel(uBlob({ smoothing: 8 }))],
    ["smoothing: 20", uPanel(uBlob({ smoothing: 20 }))],
    ["smoothing: 40", uPanel(uBlob({ smoothing: 40 }))],
    ["padding: 3", uPanel(uBlob({ pad: 3, neck: 0.5, smoothing: 4 }))],
    ["padding: 8", uPanel(uBlob({ pad: 8, neck: 0.5, smoothing: 4 }))],
    ["padding: 14", uPanel(uBlob({ pad: 14, neck: 0.5, smoothing: 4 }))],
    ["padding: 20", uPanel(uBlob({ pad: 20, neck: 0.5, smoothing: 4 }))],
  ], { w: 265, h: 225, cols: 4 }),
};

// The convex-hull shortcut against a true padded convex hull (black line), on the U
// and on one penguin species.
export const BlobHullExact: StoryObj = {
  render: () => {
    const gentoo = pen.filter((d) => d.Species === "Gentoo").map((d) => C(xs(d["Beak Length (mm)"]), ys(d["Beak Depth (mm)"]), 2.5));
    const truth = (ms: Member[], pad: number) => polygon({ points: hullOutline(ms, pad), fill: "none", stroke: "#111", strokeWidth: 1 });
    return titledGrid([
      ["Shape.hull() fill, true hull line", uPanel([...uBlob(hullPreset({ pad: 8, avoiding: [] })), truth(U, 8)])],
      ["same, Gentoo penguins", layer([...axes(), ...blobInk(blob(gentoo, hullPreset({ pad: 6, res: 0.5 })), SPECIES_COLORS.Gentoo), truth(gentoo, 6), ...gentoo.map((m) => dot(m, SPECIES_COLORS.Gentoo))])],
    ], { w: 430, h: 300, cols: 2 });
  },
};

// Alpha shape (old prototype, alpha 40) next to the general construction with
// smoothing 40, which plays the part of alpha's rolling disc.
export const BlobVsAlpha: StoryObj = {
  render: () => titledGrid([
    ["alpha shape, alpha 40", uPanel(region(hullOutline(U, 8, 40), BLUE))],
    ["density 0, smoothing 40, no avoiding", uPanel(uBlob({ smoothing: 40, avoiding: [] }))],
    ["density 0, smoothing 40, avoiding gray", uPanel(uBlob({ smoothing: 40 }))],
  ], { w: 265, h: 225, cols: 3 }),
};

// ── Topology, aimed at Munkres' figure (Topology, 2nd ed., §12, Figure 12.1) ──
// Points 100 apart, each singleton set a small ring, as in Munkres' bullseyes.
const MA = C(60, 70, 5), MB = C(160, 70, 5), MC = C(260, 70, 5);
const ring = (m: Extract<Member, { kind: "circle" }>) => C(m.cx, m.cy, 14);
const ringInk = (m: Extract<Member, { kind: "circle" }>) =>
  polygon({ points: discPoly([m.cx, m.cy], 14, 48), fill: "none", stroke: "#111", strokeWidth: 2.5 });
const outlineOnly = (loops: Pt[][]) => loops.map((l) => polygon({ points: l, fill: "none", stroke: "#111", strokeWidth: 2.5 }));
const topoPoints = () => [MA, MB, MC].map((m) => dot(m, "#111"));
// {a, c}: Shape.spine({ avoiding: [b] }) with padding 21 around a and c
const acSpine = (o: Partial<BlobOpts> = {}) =>
  blob([MA, MC], spinePreset({ avoiding: [ring(MB)], pad: 21, neck: 0.7, smoothing: 40, clearance: 10, ...o }));
export const BlobTopology: StoryObj = {
  render: () => titledGrid([
    ["before: bubble-set spine", layer([...region(spineOutline2([MA, MC], { avoiding: [ring(MB)], pad: 14, tube: 10, gap: 10, falloff: 12 }), "#ff2400", 0.3, 2), ringInk(MB), ...topoPoints()])],
    ["neck 0.4, smoothing 0", layer([...blobInk(acSpine({ neck: 0.4, smoothing: 0 }), "#ff2400", 0.3, 2), ringInk(MB), ...topoPoints()])],
    ["neck 1, smoothing 40", layer([...blobInk(acSpine({ neck: 1 }), "#ff2400", 0.3, 2), ringInk(MB), ...topoPoints()])],
    ["neck 0.7, smoothing 40", layer([...blobInk(acSpine(), "#ff2400", 0.3, 2), ringInk(MB), ...topoPoints()])],
  ], { w: 330, h: 170, cols: 2 }),
};
// Munkres' ninth panel: whole set, {a, b}, {b, c}, {a, c}, {a}, {b}, {c}.
export const BlobTopologyMunkres: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // The whole set and the pairs {a, b}, {b, c} are ellipses: the custom-shape escape hatch
    // (a function from the members' box to a path), drawn here with `ellipse`.
    const oval = (cx: number, w: number, h: number) =>
      position({ x: cx - w / 2, y: 70 - h / 2 }, [ellipse({ w, h, fill: "none", stroke: "#111", strokeWidth: 2.5 })]);
    layer([
      oval(160, 372, 184), oval(110, 176, 104), oval(210, 176, 104),
      ...outlineOnly(acSpine()),
      ...[MA, MB, MC].map(ringInk), ...topoPoints(),
    ]).render(container, { w: 380, h: 190 });
    return container;
  },
};

// ── Hyperedges and trout with the spine shortcut on the general construction ──
export const BlobHyperedges: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const outlines = SETS.flatMap((s) => {
      const members = s.nodes.map(hyperNode);
      const others = Object.keys(NODES).filter((id) => !s.nodes.includes(id)).map(hyperNode);
      const via = EDGES.filter(([p, q]) => s.nodes.includes(p) && s.nodes.includes(q)).map(([p, q]) => [NODES[p], NODES[q]] as [Pt, Pt]);
      return blobInk(blob(members, spinePreset({ avoiding: others, via, pad: 6, neck: 0.75, smoothing: 10, clearance: 3 })), s.color, 0.25, 2);
    });
    layer([
      ...outlines,
      hyperPanel([]),
      ...SETS.map((s, i) => label(20 + i * 50, 215, `set ${s.name}`, { fill: s.color, fontWeight: "bold" })),
    ]).render(container, { w: 360, h: 240 });
    return container;
  },
};
export const BlobTroutBars: StoryObj = {
  render: () => {
    const container = initializeContainer();
    barsScene(false, blobInk(blob(TROUT, spinePreset({ avoiding: [...NOT_TROUT, AXIS_BAND], pad: 4, neck: 0.5, smoothing: 8, clearance: 4 })), "#d6580c", 0.18, 2)).render(container, { w: 400, h: 240 });
    return container;
  },
};

// ── (e) v4: curvature-continuous outlines ───────────────────────────────────
//
// Josh's v3 feedback: no curvature jump where a member's circle meets a link,
// alpha's fuller (more convex) look back, and a less shrink-wrapped Topology.
//
// Construction ("smoothed union"), for one set:
//  1. Skeleton = alpha complex of the member centers + spanning tree.
//     alpha = m * convexity / (1 - convexity), where m is the median link of the
//     members' Euclidean minimum spanning tree (so the rule is unchanged by a
//     resize). A Delaunay triangle is filled when its circumradius <= alpha and no
//     avoided node's keep-out zone touches it. Links: the filled triangles' edges,
//     Delaunay edges with half-length <= alpha that no avoided node blocks, the
//     minimum spanning tree over links routed around avoided nodes (always, so the
//     set stays one piece), and `via` edges. convexity 0 = the tree, 1 = every face.
//  2. Pieces and closing as in v3 (discs of radius R = member radius + padding,
//     tubes of half-width neck * R, filled faces; closing by `smoothing`), then the
//     avoided keep-out zones are cut out.
//  3. Smoothing: the region's indicator is blurred with a Gaussian of width
//     sigma = smoothing / 2 and the outline is the level 1/2 of the result (one step
//     of Merriman-Bence-Osher curvature flow). The blurred field is a finite sum of
//     Gaussians, so it is infinitely differentiable, and its level line has
//     continuous curvature wherever the gradient is not zero.
//     Blurring pulls a convex arc of radius r in by about sigma^2 / (2r); discs,
//     tubes and cut zones are drawn slightly larger so that an isolated member
//     ends exactly at `padding`, a lone tube at its half-width, and the cut at the
//     clearance (exact for isolated pieces, approximate where pieces meet).
//  4. Tracing: marching squares on the grid, then every vertex is moved onto the
//     exact level line by Newton steps on the analytic field (no grid waviness).
//
// Candidate (a), "convolution surface": one weighted Gaussian sum over the same
// skeleton (points, link samples, face samples), with weights set so each
// isolated piece alone ends at its target offset. Pieces add where they meet.
//
// Candidate (b), "curve through the v3 outline": the v3 outline resampled every
// `spacing` px is the control polygon of a closed interpolating curve: centripetal
// Catmull-Rom (C1, the foil), periodic natural cubic spline (C2), or a Yuksel-style
// C2 blend of circles through consecutive point triples.

const erf = (x: number) => {
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
};
const Phi = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
/** e^{-x} I0(x) (Abramowitz and Stegun 9.8.1-2). */
const i0e = (x: number) => {
  const ax = Math.abs(x);
  if (ax < 3.75) {
    const y = (x / 3.75) ** 2;
    return Math.exp(-ax) * (1 + y * (3.5156229 + y * (3.0899424 + y * (1.2067492 + y * (0.2659732 + y * (0.0360768 + y * 0.0045813))))));
  }
  const y = 3.75 / ax;
  return (1 / Math.sqrt(ax)) * (0.39894228 + y * (0.01328592 + y * (0.00225319 + y * (-0.00157565 + y * (0.00916281 + y * (-0.02057706 + y * (0.02635537 + y * (-0.01647633 + y * 0.00392377))))))));
};
/** Gaussian-blurred (width s) indicator of a disc of radius a, at distance r from its center. */
const discBlur = (r: number, a: number, s: number) => {
  const lo = Math.max(0, r - 8 * s), hi = Math.min(a, r + 8 * s);
  if (hi <= lo) return 0;
  const N = 200, h = (hi - lo) / N;
  let sum = 0;
  for (let k = 0; k <= N; k++) {
    const rho = lo + k * h;
    const f = (rho / (s * s)) * Math.exp(-((rho - r) ** 2) / (2 * s * s)) * i0e((r * rho) / (s * s));
    sum += f * (k === 0 || k === N ? 1 : k % 2 ? 4 : 2);
  }
  return (sum * h) / 3;
};
const bisect = (g: (a: number) => number, lo: number, hi: number) => {
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
};
/** Disc radius whose blurred level 1/2 lands at radius R (also a hole's cut radius for clearance R). */
/** Remember a slow pure function of two numbers (the compensations below: a bisection over a
 *  numeric integral, asked again and again for the same few radii). */
const remember = (fn: (a: number, b: number) => number) => {
  const seen = new Map<string, number>();
  return (a: number, b: number) => {
    const key = `${a},${b}`;
    let v = seen.get(key);
    if (v === undefined) { if (seen.size > 4096) seen.clear(); seen.set(key, (v = fn(a, b))); }
    return v;
  };
};
const discComp = remember((R: number, s: number) => (s <= 0 ? R : bisect((a) => discBlur(R, a, s) - 0.5, R, R + 4 * s)));
/** Tube half-width whose blurred level 1/2 lands at half-width h. */
const tubeComp = remember((h: number, s: number) => (s <= 0 ? h : bisect((a) => Phi((a - h) / s) - Phi((-a - h) / s) - 0.5, h, h + 4 * s)));

type Field = { I: Float64Array; W: number; H: number; x0: number; y0: number; res: number; sigma: number; z: number };
/** Where each row of a grid is nonzero: its first and last nonzero column (computed once per grid). */
const rowSpanMemo = new WeakMap<Float64Array, { lo: Int32Array; hi: Int32Array }>();
const rowSpans = (I: Float64Array, W: number, H: number) => {
  let sp = rowSpanMemo.get(I);
  if (!sp) {
    sp = { lo: new Int32Array(H).fill(W), hi: new Int32Array(H).fill(-1) };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (I[j * W + i] !== 0) { if (sp.lo[j] === W) sp.lo[j] = i; sp.hi[j] = i; }
    rowSpanMemo.set(I, sp);
  }
  return sp;
};
/** The blurred field and its derivatives at (x, y): [B, Bx, By, Bxx, Bxy, Byy]. */
const fieldJet = (fd: Field, x: number, y: number): number[] => {
  const { I, W, H, x0, y0, res, sigma: s, z } = fd;
  const rad = Math.ceil((5 * s) / res), fx = (x - x0) / res, fy = (y - y0) / res;
  const i0 = Math.max(0, Math.floor(fx) - rad), i1 = Math.min(W - 1, Math.ceil(fx) + rad);
  const j0 = Math.max(0, Math.floor(fy) - rad), j1 = Math.min(H - 1, Math.ceil(fy) + rad);
  const s2 = s * s, nx = i1 - i0 + 1, span = rowSpans(I, W, H);
  const g = new Float64Array(nx), g1 = new Float64Array(nx), g2 = new Float64Array(nx);
  for (let i = i0; i <= i1; i++) {
    const d = x - (x0 + i * res), e = Math.exp(-(d * d) / (2 * s2));
    g[i - i0] = e; g1[i - i0] = (-d / s2) * e; g2[i - i0] = ((d * d) / (s2 * s2) - 1 / s2) * e;
  }
  let B = 0, Bx = 0, By = 0, Bxx = 0, Bxy = 0, Byy = 0;
  for (let j = j0; j <= j1; j++) {
    const d = y - (y0 + j * res), e = Math.exp(-(d * d) / (2 * s2));
    const h0 = e, h1 = (-d / s2) * e, h2 = ((d * d) / (s2 * s2) - 1 / s2) * e;
    let S0 = 0, S1 = 0, S2 = 0;
    const row = j * W;
    // (zeros add nothing, so each row runs over its nonzero span only)
    for (let i = Math.max(i0, span.lo[j]), last = Math.min(i1, span.hi[j]); i <= last; i++) {
      const v = I[row + i];
      if (v === 0) continue;
      S0 += v * g[i - i0]; S1 += v * g1[i - i0]; S2 += v * g2[i - i0];
    }
    B += h0 * S0; Bx += h0 * S1; By += h1 * S0; Bxx += h0 * S2; Bxy += h1 * S1; Byy += h2 * S0;
  }
  const zz = z * z;
  return [B / zz, Bx / zz, By / zz, Bxx / zz, Bxy / zz, Byy / zz];
};
/** Curvature of the level line through (x, y), positive where the region is convex. */
const levelCurvature = (j: number[]) => {
  const [, Bx, By, Bxx, Bxy, Byy] = j;
  return -(Bxx * By * By - 2 * Bxy * Bx * By + Byy * Bx * Bx) / Math.pow(Bx * Bx + By * By, 1.5);
};
const resampleLoop = (loop: Pt[], ds: number): Pt[] => {
  const n = loop.length, cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + dist(loop[i - 1], loop[i % n]));
  const L = cum[n], m = Math.max(8, Math.round(L / ds)), out: Pt[] = [];
  let k = 0;
  for (let q = 0; q < m; q++) {
    const t = (q / m) * L;
    while (cum[k + 1] < t) k++;
    const u = (t - cum[k]) / (cum[k + 1] - cum[k] || 1), a = loop[k], b = loop[(k + 1) % n];
    out.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]);
  }
  return out;
};
/** Move a point onto the level 1/2 of the field by Newton steps along the gradient. */
const project = (fd: Field, p: Pt, level = 0.5): Pt => {
  let [x, y] = p;
  for (let k = 0; k < 6; k++) {
    const [B, Bx, By] = fieldJet(fd, x, y), g2 = Bx * Bx + By * By;
    if (g2 < 1e-14) break;
    const step = (B - level) / g2;
    x -= step * Bx; y -= step * By;
    if (Math.abs(step) * Math.sqrt(g2) < 1e-4) break;
  }
  return [x, y];
};
/** Separable Gaussian blur of a grid of values in [0, 1], normalized so a constant stays constant.
 *  For speed, a window of zeros gives 0 and a whole window of ones gives 1 without summing, and
 *  a sum skips the zeros at either end of its window. The result is the plain weighted sum, bit
 *  for bit: adding a zero changes nothing, and a window of ones adds up the weights in the same
 *  order as their total z. */
const gaussBlur = (A: Float64Array, W: number, H: number, sigmaCells: number) => {
  const rad = Math.ceil(5 * sigmaCells), k = new Float64Array(2 * rad + 1);
  for (let i = -rad; i <= rad; i++) k[i + rad] = Math.exp(-(i * i) / (2 * sigmaCells * sigmaCells));
  const z = k.reduce((a, b) => a + b, 0);
  const N = Math.max(W, H), nonzero = new Int32Array(N + 1), nonone = new Int32Array(N + 1);
  const nextNZ = new Int32Array(N), prevNZ = new Int32Array(N);
  /** Blur one line of n values from src into dst. */
  const line = (src: Float64Array, dst: Float64Array, n: number) => {
    for (let t = 0; t < n; t++) {
      nonzero[t + 1] = nonzero[t] + (src[t] !== 0 ? 1 : 0);
      nonone[t + 1] = nonone[t] + (src[t] !== 1 ? 1 : 0);
    }
    for (let t = n - 1, nx = n; t >= 0; t--) nextNZ[t] = nx = src[t] !== 0 ? t : nx;
    for (let t = 0, pv = -1; t < n; t++) prevNZ[t] = pv = src[t] !== 0 ? t : pv;
    for (let t = 0; t < n; t++) {
      const lo = Math.max(-rad, -t), hi = Math.min(rad, n - 1 - t), a = t + lo, e = t + hi;
      if (nonzero[e + 1] === nonzero[a]) { dst[t] = 0; continue; }
      if (lo === -rad && hi === rad && nonone[e + 1] === nonone[a]) { dst[t] = 1; continue; }
      let s = 0;
      for (let u = nextNZ[a], last = prevNZ[e]; u <= last; u++) s += src[u] * k[u - t + rad];
      dst[t] = s / z;
    }
  };
  const tmp = new Float64Array(W * H), out = new Float64Array(W * H);
  for (let j = 0; j < H; j++) line(A.subarray(j * W, (j + 1) * W), tmp.subarray(j * W, (j + 1) * W), W);
  const col = new Float64Array(H), colOut = new Float64Array(H);
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) col[j] = tmp[j * W + i];
    line(col, colOut, H);
    for (let j = 0; j < H; j++) out[j * W + i] = colOut[j];
  }
  return { out, z };
};
const triDist = (p: Pt, q: Pt[]) =>
  inPoly(p, q) ? 0 : Math.sqrt(Math.min(segDist2([q[0], q[1]], p[0], p[1]), segDist2([q[1], q[2]], p[0], p[1]), segDist2([q[2], q[0]], p[0], p[1])));
const circumR = (a: Pt, b: Pt, c: Pt) => (dist(a, b) * dist(b, c) * dist(c, a)) / (2 * Math.abs(cross(a, b, c)) || 1e-12);

type SkelOpts = { avoiding?: Member[]; via?: [Pt, Pt][]; pad: number; convexity: number; neck?: number; clearance?: number };
type Skeleton = { P: Pt[]; R: number[]; links: { route: Pt[]; h: number }[]; faces: Pt[][]; alpha: number };
/** A member's sites, the points the alpha complex is built on: a node's center, a segment's two ends. */
const sitesOf = (m: Member): Pt[] => (m.kind === "segment" ? [m.a, m.b] : [centerOf(m)]);
const nearestOnSeg = (p: Pt, a: Pt, b: Pt): Pt => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return [a[0] + t * dx, a[1] + t * dy];
};
/** The closest points of two members' geometries (a node is its center, a segment is the whole segment). */
const closestPair = (m1: Member, m2: Member): [Pt, Pt] => {
  if (m1.kind !== "segment" && m2.kind !== "segment") return [centerOf(m1), centerOf(m2)];
  if (m2.kind === "segment" && m1.kind !== "segment") { const c = centerOf(m1); return [c, nearestOnSeg(c, m2.a, m2.b)]; }
  if (m1.kind === "segment" && m2.kind !== "segment") { const c = centerOf(m2); return [nearestOnSeg(c, m1.a, m1.b), c]; }
  const s1 = m1 as Extract<Member, { kind: "segment" }>, s2 = m2 as Extract<Member, { kind: "segment" }>;
  if (segIntersect(s1.a, s1.b, s2.a, s2.b)) {
    const d = cross(s2.a, s2.b, s1.a) / (cross(s2.a, s2.b, s1.a) - cross(s2.a, s2.b, s1.b));
    const x: Pt = [s1.a[0] + d * (s1.b[0] - s1.a[0]), s1.a[1] + d * (s1.b[1] - s1.a[1])];
    return [x, x];
  }
  const opts: [Pt, Pt][] = [
    [s1.a, nearestOnSeg(s1.a, s2.a, s2.b)], [s1.b, nearestOnSeg(s1.b, s2.a, s2.b)],
    [nearestOnSeg(s2.a, s1.a, s1.b), s2.a], [nearestOnSeg(s2.b, s1.a, s1.b), s2.b],
  ];
  return opts.reduce((x, y) => (dist(x[0], x[1]) <= dist(y[0], y[1]) ? x : y));
};
/** Step 1: the alpha complex of the members' sites plus the routed spanning tree over members.
 *  Each member is its own geometry: a segment member is already a link between its ends, and a
 *  spanning-tree link runs between the closest points of two members' geometries. */
const skeleton = (members: Member[], o: SkelOpts): Skeleton => {
  const neck = o.neck ?? 0.7, clearance = o.clearance ?? 4, others = o.avoiding ?? [];
  const Cm = members.map(centerOf), Rm = members.map((m) => memberRadius(m) + o.pad), nm = members.length;
  // sites, merged where two members share one (an edge's end on its node)
  const P: Pt[] = [], R: number[] = [], owner: number[][] = [];
  members.forEach((mm, k) => sitesOf(mm).forEach((q) => {
    let i = P.findIndex((p) => dist(p, q) < 0.5);
    if (i < 0) { i = P.length; P.push(q); R.push(Rm[k]); owner.push([]); } else R[i] = Math.max(R[i], Rm[k]);
    owner[i].push(k);
  }));
  const n = P.length;
  const ek = (i: number, j: number) => (i < j ? `${i},${j}` : `${j},${i}`);
  const tri: [number, number, number][] = [], cand = new Map<string, [number, number]>();
  if (n >= 3) {
    const d = Delaunator.from(P);
    for (let k = 0; k < d.triangles.length; k += 3) {
      const [i, j, l] = [d.triangles[k], d.triangles[k + 1], d.triangles[k + 2]];
      if (Math.abs(cross(P[i], P[j], P[l])) < 1e-9) continue;
      tri.push([i, j, l]);
      for (const [u, v] of [[i, j], [j, l], [l, i]]) cand.set(ek(u, v), [Math.min(u, v), Math.max(u, v)]);
    }
  }
  if (tri.length === 0) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) cand.set(ek(i, j), [i, j]);
  // the scale: median link of the Euclidean minimum spanning tree of the sites
  const root = P.map((_, k) => k);
  const find = (k: number): number => (root[k] === k ? k : (root[k] = find(root[k])));
  const mst: number[] = [];
  for (const [i, j] of [...cand.values()].sort((a, b) => dist(P[a[0]], P[a[1]]) - dist(P[b[0]], P[b[1]])))
    if (find(i) !== find(j)) { root[find(i)] = find(j); mst.push(dist(P[i], P[j])); }
  mst.sort((a, b) => a - b);
  const m = mst.length ? mst[Math.floor(mst.length / 2)] : 0;
  const c = Math.max(0, Math.min(1, o.convexity));
  const alpha = c >= 1 ? Infinity : (m * c) / (1 - c);
  const keep = (mm: Member) => memberRadius(mm) + clearance;
  const hw = (i: number, j: number) => neck * Math.min(R[i], R[j]);
  const faces: Pt[][] = [], faceEdges = new Set<string>();
  for (const [i, j, l] of tri) {
    const q = [P[i], P[j], P[l]];
    if (circumR(q[0], q[1], q[2]) > alpha) continue;
    const tb = bboxOf(q);
    if (others.some((mm) => {
      const c = centerOf(mm), r = keep(mm) + 1e-6; // (an avoided node beyond the box's reach is skipped)
      return c[0] > tb[0] - r && c[0] < tb[2] + r && c[1] > tb[1] - r && c[1] < tb[3] + r && triDist(c, q) < keep(mm);
    })) continue;
    faces.push(q);
    [ek(i, j), ek(j, l), ek(l, i)].forEach((e) => faceEdges.add(e));
  }
  const obstacle = (mm: Member, grow: number) =>
    mm.kind === "circle" ? discPoly([mm.cx, mm.cy - 0.01], (keep(mm) + grow) / Math.cos(Math.PI / 32), 32) : convexHull(samples(mm, clearance + grow));
  // the keep-out polygons depend only on the tube half-width, so they are built once per width
  const byWidth = new Map<number, Poly[]>();
  const obstaclesFor = (p: Pt, q: Pt, h: number) => {
    let all = byWidth.get(h);
    if (!all) byWidth.set(h, (all = others.map((mm) => obstacle(mm, h))));
    return all.filter((poly) => !inPolyFast(p, poly) && !inPolyFast(q, poly));
  };
  const routeFor = (p: Pt, q: Pt, h: number) => routeAround(p, q, obstaclesFor(p, q, h));
  const links: { route: Pt[]; h: number }[] = [];
  // spanning-tree candidates, between members: a face edge as drawn, else the routed closest-point link
  const mk = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const routed = new Map<string, { a: number; b: number; route: Pt[]; len: number; h?: number }>();
  const hm = (a: number, b: number) => neck * Math.min(Rm[a], Rm[b]);
  // the bulge where a link attaches: the widest member whose geometry holds that point
  const onMember = (mm: Member, p: Pt) => dist(p, mm.kind === "segment" ? nearestOnSeg(p, mm.a, mm.b) : centerOf(mm)) < 0.5;
  const radiusAt = (p: Pt) => Math.max(...members.map((mm, k) => (onMember(mm, p) ? Rm[k] : 0)));
  for (const [key, [i, j]] of cand) {
    if (faceEdges.has(key)) {
      links.push({ route: [P[i], P[j]], h: Math.min(R[i], R[j]) });
      for (const a of owner[i]) for (const b of owner[j]) if (a !== b && !routed.has(mk(a, b))) routed.set(mk(a, b), { a, b, route: [P[i], P[j]], len: dist(P[i], P[j]) });
      continue;
    }
    // a short candidate joins as drawn when nothing blocks it (it is never rerouted)
    if (dist(P[i], P[j]) / 2 <= alpha && clearOf(P[i], P[j], obstaclesFor(P[i], P[j], hw(i, j)))) links.push({ route: [P[i], P[j]], h: hw(i, j) });
  }
  const pairs = new Set<string>();
  for (const [i, j] of cand.values()) for (const a of owner[i]) for (const b of owner[j]) if (a !== b) pairs.add(mk(a, b));
  owner.forEach((ks) => ks.forEach((a) => ks.forEach((b) => { if (a !== b) pairs.add(mk(a, b)); })));
  members.forEach((mm, a) => { if (mm.kind === "segment") for (let b = 0; b < nm; b++) if (b !== a) pairs.add(mk(a, b)); });
  // A pair's link is routed only when the spanning tree reaches it: until then its straight
  // length stands in, a lower bound on the routed length (lazy Kruskal; ties keep their order).
  type Link = { a: number; b: number; len: number; order: number; route?: Pt[]; h?: number; ends?: [Pt, Pt] };
  const queue: Link[] = [...routed.values()].map((e, order) => ({ ...e, order }));
  for (const key of pairs) {
    if (routed.has(key)) continue;
    const [a, b] = key.split(",").map(Number), [p, q] = closestPair(members[a], members[b]), order = queue.length;
    if (dist(p, q) < 0.5) queue.push({ a, b, route: [p, q], len: 0, order });
    else queue.push({ a, b, len: dist(p, q), order, ends: [p, q], h: neck * Math.min(radiusAt(p), radiusAt(q)) });
  }
  const before = (x: Link, y: Link) => x.len < y.len || (x.len === y.len && x.order < y.order);
  queue.sort((x, y) => x.len - y.len || x.order - y.order);
  // the spanning tree over routed links keeps the set in one piece (members that touch join for free)
  const r2 = members.map((_, k) => k);
  const f2 = (k: number): number => (r2[k] === k ? k : (r2[k] = f2(r2[k])));
  while (queue.length) {
    const e = queue.shift()!;
    if (f2(e.a) === f2(e.b)) continue;
    if (e.ends) {
      const route = routeFor(e.ends[0], e.ends[1], e.h!);
      if (!route) continue;
      const done: Link = { a: e.a, b: e.b, route, len: polyLen(route), order: e.order, h: e.h };
      let at = 0;
      while (at < queue.length && before(queue[at], done)) at++;
      queue.splice(at, 0, done);
      continue;
    }
    r2[f2(e.a)] = f2(e.b);
    if (e.len > 0) links.push({ route: e.route!, h: e.h ?? hm(e.a, e.b) });
  }
  for (const [a, b] of o.via ?? []) {
    const i = P.findIndex((q) => dist(a, q) < 0.5), j = P.findIndex((q) => dist(b, q) < 0.5);
    if (i >= 0 && j >= 0) links.push({ route: [P[i], P[j]], h: hw(i, j) });
  }
  return { P: Cm, R: Rm, links, faces, alpha };
};

type SmoothOpts = SkelOpts & { smoothing?: number; res?: number; compensate?: boolean };
type Smooth = { loops: Pt[][]; field: Field | null; skel: Skeleton };
/** Steps 2-4: union, closing, cut, Gaussian smoothing, exact tracing. */
const smoothBlob = (members: Member[], o: SmoothOpts): Smooth => {
  const sk = skeleton(members, o);
  const pad = o.pad, s = o.smoothing ?? pad, clearance = o.clearance ?? 4, others = o.avoiding ?? [];
  // The blur may not be wider than the thinnest piece (a member's radius, a tube's
  // half-width, an avoided node's keep-out radius), or it would erase that piece.
  const thinnest = Math.min(...sk.R, ...sk.links.map((e) => e.h), ...others.map((m) => memberRadius(m) + clearance));
  const sigma = Math.min(s, thinnest) / 2;
  const comp = o.compensate ?? true;
  const res = o.res ?? (sigma > 0 ? Math.min(0.5, Math.max(0.25, sigma / 4)) : 0.5);
  type Piece = { bb: number[]; d: (x: number, y: number) => number };
  const pieces: Piece[] = [];
  members.forEach((m, k) => {
    const Rk = comp ? discComp(sk.R[k], sigma) : sk.R[k];
    if (m.kind === "circle") pieces.push({ bb: [m.cx - Rk, m.cy - Rk, m.cx + Rk, m.cy + Rk], d: (x, y) => Math.hypot(x - m.cx, y - m.cy) - Rk });
    else if (m.kind === "segment") {
      // a segment member: its whole length grown by `pad` (a tube of half-width w/2 + pad)
      const h = comp ? tubeComp(sk.R[k], sigma) : sk.R[k], { a, b } = m;
      pieces.push({ bb: [Math.min(a[0], b[0]) - h, Math.min(a[1], b[1]) - h, Math.max(a[0], b[0]) + h, Math.max(a[1], b[1]) + h], d: (x, y) => Math.sqrt(segDist2([a, b], x, y)) - h });
    } else {
      const pk = comp ? tubeComp(pad, sigma) : pad;
      pieces.push({
        bb: [m.x - pk, m.y - pk, m.x + m.w + pk, m.y + m.h + pk],
        d: (x, y) => Math.hypot(Math.max(m.x - x, 0, x - m.x - m.w), Math.max(m.y - y, 0, y - m.y - m.h)) - pk,
      });
    }
  });
  const segD = (a: Pt, b: Pt, x: number, y: number) => Math.sqrt(segDist2([a, b], x, y));
  for (const e of sk.links) {
    const h = comp ? tubeComp(e.h, sigma) : e.h;
    for (let k = 1; k < e.route.length; k++) {
      const a = e.route[k - 1], b = e.route[k];
      pieces.push({ bb: [Math.min(a[0], b[0]) - h, Math.min(a[1], b[1]) - h, Math.max(a[0], b[0]) + h, Math.max(a[1], b[1]) + h], d: (x, y) => segD(a, b, x, y) - h });
    }
  }
  for (const q of sk.faces) pieces.push({ bb: bboxOf(q), d: (x, y) => { const e = triDist([x, y], q); return e === 0 ? -Math.min(segD(q[0], q[1], x, y), segD(q[1], q[2], x, y), segD(q[2], q[0], x, y)) : e; } });
  const bb = pieces.reduce((r, p) => [Math.min(r[0], p.bb[0]), Math.min(r[1], p.bb[1]), Math.max(r[2], p.bb[2]), Math.max(r[3], p.bb[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const M = s + 5 * sigma + 6, x0 = bb[0] - M, y0 = bb[1] - M;
  const W = Math.ceil((bb[2] - bb[0] + 2 * M) / res) + 1, H = Math.ceil((bb[3] - bb[1] + 2 * M) / res) + 1;
  // Once a cell is "settled", how far inside it is is never read, so the remaining pieces skip it.
  // With a closing (s > 0) that is any cell within s of the union: the closing replaces its value.
  // Without one, it is a cell more than two cells deep. Every piece's value changes by at most one
  // cell per cell, so the outline can pass beside such a cell only where a keep-out zone cuts in,
  // and there the cut's value replaces it.
  const settled = s > 0 ? s : -2 * res;
  const f = new Float64Array(W * H).fill(1e9);
  for (const p of pieces) {
    const i0 = Math.max(0, Math.floor((p.bb[0] - s - 3 - x0) / res)), i1 = Math.min(W - 1, Math.ceil((p.bb[2] + s + 3 - x0) / res));
    const j0 = Math.max(0, Math.floor((p.bb[1] - s - 3 - y0) / res)), j1 = Math.min(H - 1, Math.ceil((p.bb[3] + s + 3 - y0) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * W + i;
      if (f[k] <= settled) continue;
      const v = p.d(x0 + i * res, y0 + j * res);
      if (v < f[k]) f[k] = v;
    }
  }
  // closing by s (exact distance transform), F > 0 inside
  const F = new Float64Array(W * H);
  if (s > 0) {
    const outside = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) outside[k] = f[k] > s ? 1 : 0;
    const dOut = edtTo(outside, W, H);
    for (let k = 0; k < W * H; k++) F[k] = outside[k] ? -f[k] : dOut[k] * res - s;
  } else for (let k = 0; k < W * H; k++) F[k] = -f[k];
  // cut the keep-out zones
  for (const m of others) {
    const kr = m.kind === "circle" ? (comp ? discComp(memberRadius(m) + clearance, sigma) : memberRadius(m) + clearance) : 0;
    const cl = m.kind === "rect" ? (comp ? tubeComp(clearance, sigma) : clearance) : 0;
    const mb = m.kind === "circle" ? [m.cx - kr, m.cy - kr, m.cx + kr, m.cy + kr] : [m.x - cl, m.y - cl, m.x + m.w + cl, m.y + m.h + cl];
    const i0 = Math.max(0, Math.floor((mb[0] - x0) / res) - 2), i1 = Math.min(W - 1, Math.ceil((mb[2] - x0) / res) + 2);
    const j0 = Math.max(0, Math.floor((mb[1] - y0) / res) - 2), j1 = Math.min(H - 1, Math.ceil((mb[3] - y0) / res) + 2);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + i * res, y = y0 + j * res;
      const dk = m.kind === "circle" ? Math.hypot(x - m.cx, y - m.cy) - kr
        : Math.hypot(Math.max(m.x - x, 0, x - m.x - m.w), Math.max(m.y - y, 0, y - m.y - m.h)) - cl;
      const k = j * W + i;
      if (dk < F[k]) F[k] = dk;
    }
  }
  if (sigma <= 0) {
    const loops = contours(F, W, H, x0, y0, res).map((l) => relax(l, 3));
    return { loops: loops.filter((l) => loopArea(l) > 40 * res * res), field: null, skel: sk };
  }
  // smoothing: blur the (anti-aliased) indicator, trace level 1/2 exactly
  const I = new Float64Array(W * H);
  for (let k = 0; k < W * H; k++) I[k] = Math.max(0, Math.min(1, 0.5 + F[k] / res));
  const { out: Bg, z } = gaussBlur(I, W, H, sigma / res);
  const fd: Field = { I, W, H, x0, y0, res, sigma, z };
  const G = new Float64Array(W * H);
  for (let k = 0; k < W * H; k++) G[k] = Bg[k] - 0.5;
  const raw = contours(G, W, H, x0, y0, res).filter((l) => loopArea(l) > 40 * res * res);
  const loops = raw.map((l) => resampleLoop(resampleLoop(l, 1).map((p) => project(fd, p)), 1).map((p) => project(fd, p)));
  return { loops, field: fd, skel: sk };
};

/** Candidate (a): a convolution surface, one Gaussian sum over the skeleton. */
const convolutionBlob = (members: Member[], o: SmoothOpts): Pt[][] => {
  const sk = skeleton(members, o), s = o.smoothing ?? o.pad, sigma = s / 2, s2 = sigma * sigma;
  const G: [number, number, number][] = []; // x, y, log weight
  sk.P.forEach((p, k) => G.push([p[0], p[1], (sk.R[k] ** 2) / (2 * s2)]));
  const dl = sigma / 3;
  for (const e of sk.links)
    for (let k = 1; k < e.route.length; k++) {
      const a = e.route[k - 1], b = e.route[k], L = dist(a, b), nseg = Math.max(1, Math.ceil(L / dl));
      for (let q = 0; q < nseg; q++) {
        const t = (q + 0.5) / nseg;
        G.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), Math.log(L / nseg / (Math.sqrt(2 * Math.PI) * sigma)) + (e.h * e.h) / (2 * s2)]);
      }
    }
  const Rf = Math.min(...sk.R);
  for (const q of sk.faces) {
    const [a, b, c] = q, A = Math.abs(cross(a, b, c)) / 2, nn = Math.max(2, Math.ceil(Math.sqrt(A) / dl));
    const lw = Math.log(A / (nn * nn) / (2 * Math.PI * s2 * Phi(-Rf / sigma)));
    for (let u = 0; u < nn; u++) for (let v = 0; v < nn - u; v++)
      for (const flip of [0, 1]) {
        if (flip && u + v >= nn - 1) continue;
        const uu = flip ? (u + 2 / 3) / nn : (u + 1 / 3) / nn, vv = flip ? (v + 2 / 3) / nn : (v + 1 / 3) / nn;
        G.push([a[0] + uu * (b[0] - a[0]) + vv * (c[0] - a[0]), a[1] + uu * (b[1] - a[1]) + vv * (c[1] - a[1]), lw]);
      }
  }
  const xs = G.map((g) => g[0]), ys = G.map((g) => g[1]), Rm = Math.max(...sk.R) + 4 * sigma;
  const res = 0.5, x0 = Math.min(...xs) - Rm, y0 = Math.min(...ys) - Rm;
  const W = Math.ceil((Math.max(...xs) + Rm - x0) / res), H = Math.ceil((Math.max(...ys) + Rm - y0) / res);
  const Fv = new Float64Array(W * H);
  for (const [gx, gy, lw] of G) {
    const r = Math.sqrt(2 * s2 * Math.max(1, lw + 12));
    const i0 = Math.max(0, Math.floor((gx - r - x0) / res)), i1 = Math.min(W - 1, Math.ceil((gx + r - x0) / res));
    const j0 = Math.max(0, Math.floor((gy - r - y0) / res)), j1 = Math.min(H - 1, Math.ceil((gy + r - y0) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = x0 + i * res - gx, dy = y0 + j * res - gy;
      Fv[j * W + i] += Math.exp(lw - (dx * dx + dy * dy) / (2 * s2));
    }
  }
  for (let k = 0; k < W * H; k++) Fv[k] = Math.log(Fv[k] + 1e-300);
  for (const mm of o.avoiding ?? []) {
    const kr = memberRadius(mm) + (o.clearance ?? 4), [cx, cy] = centerOf(mm);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const d = Math.hypot(x0 + i * res - cx, y0 + j * res - cy) - kr;
      if (d < Fv[j * W + i]) Fv[j * W + i] = d;
    }
  }
  return contours(Fv, W, H, x0, y0, res).map((l) => relax(l, 2)).filter((l) => loopArea(l) > 20);
};

// ── candidate (b): closed interpolating curves through a control polygon ──
type CurveKind = "catmullRom" | "natural" | "yuksel";
type ClosedCurve = { n: number; at: (i: number, u: number) => Pt };
const closedCurve = (ctrl: Pt[], kind: CurveKind): ClosedCurve => {
  const n = ctrl.length, P = (i: number) => ctrl[((i % n) + n) % n];
  if (kind === "catmullRom") {
    // centripetal (Barry-Goldman), C1 at the knots
    return {
      n, at: (i, u) => {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        const t0 = 0, t1 = t0 + (Math.sqrt(dist(p0, p1)) || 1e-6), t2 = t1 + (Math.sqrt(dist(p1, p2)) || 1e-6), t3 = t2 + (Math.sqrt(dist(p2, p3)) || 1e-6);
        const t = t1 + u * (t2 - t1);
        const L = (a: Pt, b: Pt, ta: number, tb: number): Pt => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
        const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
        return L(L(A1, A2, t0, t2), L(A2, A3, t1, t3), t1, t2);
      },
    };
  }
  if (kind === "natural") {
    // periodic cubic spline per coordinate with chord-length knots: C2
    const h = Array.from({ length: n }, (_, i) => dist(P(i), P(i + 1)) || 1e-6);
    const solve = (c: 0 | 1) => {
      const A = Array.from({ length: n }, () => new Float64Array(n)), b = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const hm = h[(i - 1 + n) % n], hi = h[i];
        A[i][(i - 1 + n) % n] += hm; A[i][i] += 2 * (hm + hi); A[i][(i + 1) % n] += hi;
        b[i] = 6 * ((P(i + 1)[c] - P(i)[c]) / hi - (P(i)[c] - P(i - 1)[c]) / hm);
      }
      for (let k = 0; k < n; k++) {
        let piv = k;
        for (let r = k + 1; r < n; r++) if (Math.abs(A[r][k]) > Math.abs(A[piv][k])) piv = r;
        [A[k], A[piv]] = [A[piv], A[k]]; [b[k], b[piv]] = [b[piv], b[k]];
        for (let r = k + 1; r < n; r++) {
          const fct = A[r][k] / A[k][k];
          if (fct === 0) continue;
          for (let q = k; q < n; q++) A[r][q] -= fct * A[k][q];
          b[r] -= fct * b[k];
        }
      }
      const Mv = new Float64Array(n);
      for (let k = n - 1; k >= 0; k--) { let sum = b[k]; for (let q = k + 1; q < n; q++) sum -= A[k][q] * Mv[q]; Mv[k] = sum / A[k][k]; }
      return Mv;
    };
    const Mx = solve(0), My = solve(1);
    const ev = (Mv: Float64Array, c: 0 | 1, i: number, u: number) => {
      const hi = h[i], t = u * hi, a = P(i)[c], b = P(i + 1)[c], m0 = Mv[i], m1 = Mv[(i + 1) % n];
      return (m0 * (hi - t) ** 3) / (6 * hi) + (m1 * t ** 3) / (6 * hi) + (a / hi - (m0 * hi) / 6) * (hi - t) + (b / hi - (m1 * hi) / 6) * t;
    };
    return { n, at: (i, u) => { const ii = ((i % n) + n) % n; return [ev(Mx, 0, ii, u), ev(My, 1, ii, u)]; } };
  }
  // Yuksel-style C2 blend: C(θ) = cos²θ F_i(θ) + sin²θ F_{i+1}(θ - π/2), with F_i the circle
  // through P(i-1), P(i), P(i+1), P(i) at θ = 0 and the neighbors at ∓π/2. The arc angle is
  // one quadratic in θ across P(i) (our choice), so each F_i is smooth and the blend is C2.
  const interp = (i: number) => {
    const a = P(i - 1), b = P(i), c = P(i + 1), cr = cross(a, b, c);
    if (Math.abs(cr) < 1e-6 * dist(a, c) ** 2) {
      return (th: number): Pt => {
        const t = th / (Math.PI / 2);
        return [b[0] + (t * (c[0] - a[0])) / 2 + (t * t * (a[0] + c[0] - 2 * b[0])) / 2, b[1] + (t * (c[1] - a[1])) / 2 + (t * t * (a[1] + c[1] - 2 * b[1])) / 2];
      };
    }
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
    const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
    const r = Math.hypot(b[0] - ux, b[1] - uy), ang = (p: Pt) => Math.atan2(p[1] - uy, p[0] - ux);
    const wrap = (x: number) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
    // angles of a and c measured from b, going the way that passes through b on the arc from a to c
    let phiA = wrap(ang(a) - ang(b)), phiC = wrap(ang(c) - ang(b));
    if (Math.sign(phiA) === Math.sign(phiC)) { if (Math.abs(phiA) > Math.abs(phiC)) phiA -= Math.sign(phiA) * 2 * Math.PI; else phiC -= Math.sign(phiC) * 2 * Math.PI; }
    const q = Math.PI / 2, k1 = (phiC - phiA) / (2 * q), k2 = (phiC + phiA) / (2 * q * q), b0 = ang(b);
    return (th: number): Pt => { const ph = b0 + k1 * th + k2 * th * th; return [ux + r * Math.cos(ph), uy + r * Math.sin(ph)]; };
  };
  const Fs = Array.from({ length: n }, (_, i) => interp(i));
  return {
    n, at: (i, u) => {
      const ii = ((i % n) + n) % n, th = u * (Math.PI / 2), A = Fs[ii](th), B = Fs[(ii + 1) % n](th - Math.PI / 2);
      const c2 = Math.cos(th) ** 2, s2 = Math.sin(th) ** 2;
      return [c2 * A[0] + s2 * B[0], c2 * A[1] + s2 * B[1]];
    },
  };
};
/** Sample a closed curve, with curvature from derivatives in the parameter (inside each segment). */
const sampleCurve = (cv: ClosedCurve, per = 12): { pts: Pt[]; kappa: number[] } => {
  const pts: Pt[] = [], kappa: number[] = [], e = 1e-3;
  for (let i = 0; i < cv.n; i++)
    for (let q = 0; q < per; q++) {
      const u = (q + 0.5) / per, p = cv.at(i, u), a = cv.at(i, u - e), b = cv.at(i, u + e);
      const d1: Pt = [(b[0] - a[0]) / (2 * e), (b[1] - a[1]) / (2 * e)], d2: Pt = [(b[0] - 2 * p[0] + a[0]) / (e * e), (b[1] - 2 * p[1] + a[1]) / (e * e)];
      pts.push(p);
      kappa.push((d1[0] * d2[1] - d1[1] * d2[0]) / Math.pow(d1[0] ** 2 + d1[1] ** 2, 1.5));
    }
  const sg = Math.sign(signedArea(pts));
  return { pts, kappa: kappa.map((k) => k * sg) };
};
/** Numeric curvature of a traced loop: circle through the points k samples before and after. */
const loopCurvature = (loop: Pt[], k: number) => {
  const n = loop.length, sg = Math.sign(signedArea(loop));
  return loop.map((p, i) => {
    const a = loop[(i - k + n) % n], c = loop[(i + k) % n];
    return (sg * 2 * cross(a, p, c)) / (dist(a, p) * dist(p, c) * dist(c, a) || 1);
  });
};
/** Candidate (b): the v3 outline as a control polygon, then a closed curve through it. */
const curveThrough = (loop: Pt[], kind: CurveKind, spacing: number) => sampleCurve(closedCurve(resampleLoop(loop, spacing), kind), 16);
/** The smoothed-union outline with analytic curvature at each traced point. */
const smoothWithCurvature = (sm: Smooth) => {
  const loop = sm.loops.reduce((a, b) => (loopArea(a) > loopArea(b) ? a : b));
  const fine = resampleLoop(loop, 0.5).map((p) => project(sm.field!, p));
  return { pts: fine, kappa: fine.map((p) => levelCurvature(fieldJet(sm.field!, p[0], p[1]))) };
};

// ── v4 figures ──────────────────────────────────────────────────────────────
const RED = "#ff2400";
const loopInk = (loops: Pt[][], color: string, fillOpacity = 0.22, strokeWidth = 1.5) => blobInk(loops, color, fillOpacity, strokeWidth);
/** An open polyline drawn as a polygon that goes out and back along the same points. */
const polyline = (pts: Pt[], stroke: string, strokeWidth = 1.2) =>
  polygon({ points: [...pts, ...pts.slice().reverse()], fill: "none", stroke, strokeWidth });
/** Curvature comb: a tooth along the outward normal at each sample, length k * kappa. */
const comb = (pts: Pt[], kappa: number[], k: number, every: number, color = "#2b7a78") => {
  const n = pts.length, sg = Math.sign(signedArea(pts)), tips: Pt[] = [], teeth: any[] = [];
  for (let i = 0; i < n; i += every) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1;
    // outward normal for a loop of positive signed area (y down) is (ty, -tx) * sg
    const nx = (sg * ty) / L, ny = (-sg * tx) / L, len = k * kappa[i];
    const tip: Pt = [pts[i][0] + nx * len, pts[i][1] + ny * len];
    tips.push(tip);
    teeth.push(polyline([pts[i], tip], color, 0.6));
  }
  return [...teeth, polygon({ points: tips, fill: "none", stroke: color, strokeWidth: 1 })];
};
/** Curvature against arc length, starting at the leftmost point. */
const kappaPlot = (pts: Pt[], kappa: number[], o: { w: number; h: number; kmax: number; color: string; title: string; refs?: [number, string][] }) => {
  const n = pts.length;
  let start = 0;
  for (let i = 1; i < n; i++) if (pts[i][0] < pts[start][0]) start = i;
  const s: number[] = [0];
  for (let q = 1; q < n; q++) s.push(s[q - 1] + dist(pts[(start + q - 1) % n], pts[(start + q) % n]));
  const L = s[n - 1] + dist(pts[(start + n - 1) % n], pts[start]);
  const X = (v: number) => 40 + (v / L) * (o.w - 50), Y = (k: number) => o.h / 2 - (Math.max(-o.kmax, Math.min(o.kmax, k)) / o.kmax) * (o.h / 2 - 12);
  const line: Pt[] = s.map((v, q) => [X(v), Y(kappa[(start + q) % n])]);
  return layer([
    polygon({ points: [[40, 12], [o.w - 10, 12], [o.w - 10, o.h - 12], [40, o.h - 12]], fill: "#fafafa", stroke: "#ddd", strokeWidth: 1 }),
    polyline([[40, Y(0)], [o.w - 10, Y(0)]], "#999", 0.8),
    ...(o.refs ?? []).map(([k]) => polyline([[40, Y(k)], [o.w - 10, Y(k)]], "#bbb", 0.6)),
    ...(o.refs ?? []).map(([k, t]) => label(o.w - 8, Y(k) - 4, t, { fontSize: 9, fill: "#888" })),
    label(2, Y(o.kmax) - 2, `+${o.kmax}`, { fontSize: 9, fill: "#666" }),
    label(6, Y(0) - 4, "0", { fontSize: 9, fill: "#666" }),
    label(2, Y(-o.kmax) - 2, `−${o.kmax}`, { fontSize: 9, fill: "#666" }),
    polyline(line, o.color, 1.3),
    label(44, 0, o.title, { fontSize: 11, fill: "#333" }),
    label(o.w / 2 - 40, o.h - 10, "arc length →", { fontSize: 9, fill: "#888" }),
  ]);
};

// Topology a/c avoiding b (points 100 apart, rings of radius 14 as in Munkres).
const AC_PAD = 21, AC_CLEAR = 10;
const acV3 = () => blob([MA, MC], spinePreset({ avoiding: [ring(MB)], pad: AC_PAD, neck: 0.7, smoothing: 40, clearance: AC_CLEAR, res: 0.25 }));
const acV4 = (o: Partial<SmoothOpts> = {}) =>
  smoothBlob([MA, MC], { avoiding: [ring(MB)], pad: AC_PAD, convexity: 0, neck: 1, smoothing: 40, clearance: AC_CLEAR, ...o });
const topoBase = () => [ringInk(MB), ...topoPoints()];
const targetRing = (m: Extract<Member, { kind: "circle" }>, R: number) =>
  polygon({ points: discPoly([m.cx, m.cy], R, 64), fill: "none", stroke: "#888", strokeWidth: 0.8, strokeDasharray: "3 3" });

type KRow = { title: string; note?: string; pts: Pt[]; kappa: number[]; color: string };
const minDistTo = (pts: Pt[], c: Pt) => Math.min(...pts.map((p) => dist(p, c)));
/** Measured: padding at a's far side, gap to b's ring, and worst distance from the v3 outline. */
const measure = (pts: Pt[], v3?: Pt[]) => {
  const left = pts.reduce((a, b) => (b[0] < a[0] ? b : a));
  const padA = MA.cx - left[0], gapB = minDistTo(pts, [MB.cx, MB.cy]) - 14;
  const dev = v3 ? Math.max(...pts.map((p) => minDistTo(v3, p))) : 0;
  return `R at a ${padA.toFixed(1)} (want ${MA.r + AC_PAD}), gap to b ${gapB.toFixed(1)} (want ${AC_CLEAR})` + (v3 ? `, off v3 ≤ ${dev.toFixed(1)}` : "");
};
const curvatureRows = (): KRow[] => {
  const v3 = resampleLoop(acV3().reduce((a, b) => (loopArea(a) > loopArea(b) ? a : b)), 0.5);
  const v3k = loopCurvature(v3, 10);
  const f = smoothWithCurvature(acV4({ convexity: 0, neck: 0.7, smoothing: 40 }));
  const nat10 = curveThrough(v3, "natural", 10), nat = curveThrough(v3, "natural", 25), yuk = curveThrough(v3, "yuksel", 25), cr = curveThrough(v3, "catmullRom", 25);
  const rows: [string, { pts: Pt[]; kappa: number[] }, string, boolean][] = [
    ["v3: union + closing (measured from the outline)", { pts: v3, kappa: v3k }, "#c0392b", false],
    ["field: smoothed union (exact, from the field)", f, "#1f6f8b", true],
    ["curve: natural cubic spline through v3, knots 10 px apart", nat10, "#7b4ea3", true],
    ["curve: natural cubic spline through v3, knots 25 px apart", nat, "#7b4ea3", true],
    ["curve: Yuksel-style C2 blend of circles, 25 px", yuk, "#3c8d2f", true],
    ["curve: centripetal Catmull-Rom (C1 foil), 25 px", cr, "#b9770e", true],
  ];
  return rows.map(([t, r, color, cmp]) => {
    const m = measure(r.pts, cmp ? v3 : undefined);
    console.error(`[v4 curvature] ${t}: ${m}`);
    return { title: t, note: m, pts: r.pts, kappa: r.kappa, color };
  });
};
export const V4Curvature: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const rows = curvatureRows(), RH = 150, invR = 1 / (MA.r + AC_PAD);
    layer(
      rows.flatMap((r, i) => [
        position({ x: 0, y: i * RH }, [layer([
          polygon({ points: r.pts, fill: r.color, opacity: 0.12, stroke: "none" }),
          ...comb(r.pts, r.kappa, 300, 2, r.color),
          polygon({ points: r.pts, fill: "none", stroke: "#111", strokeWidth: 1.2 }),
          ...topoBase(),
        ])]),
        position({ x: 330, y: i * RH + 8 }, [kappaPlot(r.pts, r.kappa, { w: 520, h: RH - 14, kmax: 0.08, color: r.color, title: r.title, refs: [[invR, "1/R"], [-1 / 40, "−1/40"]] })]),
        label(376, i * RH + 22, r.note ?? "", { fontSize: 9, fill: "#555" }),
      ])
    ).render(container, { w: 860, h: rows.length * RH });
    return container;
  },
};

// Signed distance from p to a closed polygon's boundary (positive outside).
const polySigned = (p: Pt, poly: Pt[]) => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, Math.sqrt(segDist2([poly[i], poly[(i + 1) % poly.length]], p[0], p[1])));
  return inPoly(p, poly) ? -d : d;
};
const biggest = (loops: Pt[][]) => loops.reduce((a, b) => (loopArea(a) > loopArea(b) ? a : b));

// The three candidates for task 1 side by side, on the Topology set and the U.
const U_V4 = { avoiding: NON, pad: 8 };
export const V4Candidates: StoryObj = {
  render: () => {
    const acOpts = { avoiding: [ring(MB)], pad: AC_PAD, convexity: 0, neck: 0.7, smoothing: 40, clearance: AC_CLEAR };
    const v3ac = acV3(), v3u = blob(U, { avoiding: NON, pad: 8, density: 0.5, smoothing: 8 });
    const acPanel = (ink: any[]) => layer([...ink, targetRing(MA, MA.r + AC_PAD), targetRing(MC, MC.r + AC_PAD), ...topoBase()]);
    const cols: [string, any, any][] = [
      ["v3: union + closing (G1)", acPanel(loopInk(v3ac, RED, 0.25, 2)), uPanel(blobInk(v3u, BLUE))],
      ["(a) convolution surface", acPanel(loopInk(convolutionBlob([MA, MC], acOpts), RED, 0.25, 2)), uPanel(blobInk(convolutionBlob(U, { ...U_V4, convexity: 0.5, smoothing: 8 }), BLUE))],
      ["(b) natural spline through v3", acPanel(loopInk([curveThrough(biggest(v3ac), "natural", 25).pts], RED, 0.25, 2)), uPanel(blobInk(v3u.map((l) => curveThrough(l, "natural", 12).pts), BLUE))],
      ["(c) smoothed union (chosen)", acPanel(loopInk(smoothBlob([MA, MC], acOpts).loops, RED, 0.25, 2)), uPanel(blobInk(smoothBlob(U, { ...U_V4, convexity: 0.5, smoothing: 8 }).loops, BLUE))],
    ];
    return titledGrid([...cols.map(([t, a]) => [t, a] as [string, any]), ...cols.map(([t, , u]) => [t, u] as [string, any])], { w: 300, h: 225, cols: 4 });
  },
};

// Topology a/c avoiding b: v3 against the new construction.
// {a, c} for the Munkres panel: the link detours under b.
const MUNK = { avoiding: [ring(MB)], pad: 22, convexity: 0, neck: 0.85, smoothing: 40, clearance: 6 };
export const V4Topology: StoryObj = {
  render: () => titledGrid([
    ["v3: padding 21, neck 0.7, smoothing 40", layer([...loopInk(acV3(), RED, 0.3, 2), ...topoBase()])],
    ["new, same parameters", layer([...loopInk(acV4({ neck: 0.7 }).loops, RED, 0.3, 2), ...topoBase()])],
    ["new: padding 22, neck 0.85", layer([...loopInk(smoothBlob([MA, MC], MUNK).loops, RED, 0.3, 2), ...topoBase()])],
  ], { w: 340, h: 150, cols: 3 }),
};
// Munkres' ninth panel (Topology, 2nd ed., Figure 12.1) with the new construction for {a, c}.
const munkresPanel = (o: SmoothOpts) => {
  const oval = (cx: number, w: number, h: number) =>
    position({ x: cx - w / 2, y: 70 - h / 2 }, [ellipse({ w, h, fill: "none", stroke: "#111", strokeWidth: 2.5 })]);
  return position({ x: 28, y: 24 }, [layer([
    oval(160, 372, 184), oval(110, 176, 104), oval(210, 176, 104),
    ...outlineOnly(smoothBlob([MA, MC], o).loops),
    ...[MA, MB, MC].map(ringInk), ...topoPoints(),
  ])]);
};
export const V4TopologyMunkres: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([munkresPanel(MUNK)]).render(container, { w: 380, h: 190 });
    return container;
  },
};
// Convexity on the U and on one penguin species, against the classic alpha shape and v3.
const convexityCells = (o: {
  members: Extract<Member, { kind: "circle" }>[]; avoiding: Member[]; pad: number; alpha: number; smoothing: number;
  panel: (ink: any[]) => any; color: string;
}): [string, any][] => {
  const sb = (c: number) => o.panel(blobInk(smoothBlob(o.members, { avoiding: o.avoiding, pad: o.pad, convexity: c, smoothing: o.smoothing }).loops, o.color));
  return [
    [`alpha shape (classic), alpha ${o.alpha}`, o.panel(region(hullOutline(o.members, o.pad, o.alpha), o.color))],
    ["v3 blob, density 0.5", o.panel(blobInk(blob(o.members, { avoiding: o.avoiding, pad: o.pad, density: 0.5, smoothing: o.smoothing }), o.color))],
    ["new, convexity 0 (spine)", sb(0)],
    ["new, convexity 0.5", sb(0.5)],
    ["new, convexity 0.8", sb(0.8)],
    ["new, convexity 1 (hull)", sb(1)],
  ];
};
export const V4ConvexityU: StoryObj = {
  render: () => titledGrid(convexityCells({ members: U, avoiding: NON, pad: 8, alpha: 40, smoothing: 8, panel: uPanel, color: BLUE }), { w: 265, h: 225, cols: 3 }),
};
const gentooPts = () => pen.filter((d) => d.Species === "Gentoo").map((d) => C(xs(d["Beak Length (mm)"]), ys(d["Beak Depth (mm)"]), 2.5));
const otherPts = () => pen.filter((d) => d.Species !== "Gentoo").map((d) => C(xs(d["Beak Length (mm)"]), ys(d["Beak Depth (mm)"]), 2.5));
export const V4ConvexityPenguins: StoryObj = {
  render: () => {
    // crop to the Gentoo cluster: shift coordinates so its box sits in the panel, and keep
    // only the other species' points that fall inside the panel (plus a margin)
    const g = gentooPts(), PWc = 300, PHc = 160;
    const ox = Math.min(...g.map((m) => m.cx)) - 25, oy = Math.min(...g.map((m) => m.cy)) - 15;
    const sh = (m: Extract<Member, { kind: "circle" }>) => C(m.cx - ox, m.cy - oy, m.r);
    const members = g.map(sh);
    const avoiding = otherPts().map(sh).filter((m) => m.cx > -10 && m.cx < PWc + 10 && m.cy > -10 && m.cy < PHc + 10);
    const shown = avoiding.filter((m) => m.cx > 3 && m.cx < PWc - 3 && m.cy > 3 && m.cy < PHc - 3);
    const panel = (ink: any[]) => layer([
      polygon({ points: [[0, 0], [PWc, 0], [PWc, PHc], [0, PHc]], fill: "none", stroke: "#e3e3e3", strokeWidth: 1 }),
      ...ink, ...shown.map((m) => dot(m, "#b8bcc2")), ...members.map((m) => dot(m, SPECIES_COLORS.Gentoo)),
    ]);
    return titledGrid(convexityCells({ members, avoiding, pad: 4, alpha: 12, smoothing: 6, panel, color: SPECIES_COLORS.Gentoo }), { w: PWc + 20, h: PHc + 10, cols: 3 });
  },
};

// The hull preset (convexity 1, neck 1) against the true padded convex hull (black line).
export const V4HullExact: StoryObj = {
  render: () => {
    const g = gentooPts(), ox = Math.min(...g.map((m) => m.cx)) - 20, oy = Math.min(...g.map((m) => m.cy)) - 20;
    const gentoo = g.map((m) => C(m.cx - ox, m.cy - oy, m.r));
    const cell = (name: string, ms: Extract<Member, { kind: "circle" }>[], pad: number, smoothing: number): [string, any] => {
      const truth = hullOutline(ms, pad);
      const loops = smoothBlob(ms, { pad, convexity: 1, neck: 1, smoothing }).loops;
      const ds = biggest(loops).map((p) => polySigned(p, truth));
      const note = `${name}, smoothing ${smoothing}: ${Math.max(0, -Math.min(...ds)).toFixed(1)} px in, ${Math.max(...ds).toFixed(1)} px out`;
      console.error(`[v4 hull] ${note}`);
      return [note, layer([...blobInk(loops, BLUE, 0.22, 1.5), polygon({ points: truth, fill: "none", stroke: "#111", strokeWidth: 0.8 }), ...ms.map((m) => dot(m, BLUE))])];
    };
    return titledGrid([cell("U", U, 8, 8), cell("U", U, 8, 20), cell("Gentoo", gentoo, 6, 6)], { w: 300, h: 200, cols: 3 });
  },
};

// The spine preset on the hyperedges and on trout across lakes.
export const V4Hyperedges: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const outlines = SETS.flatMap((s) => {
      const members = s.nodes.map(hyperNode);
      const others = Object.keys(NODES).filter((id) => !s.nodes.includes(id)).map(hyperNode);
      const via = EDGES.filter(([p, q]) => s.nodes.includes(p) && s.nodes.includes(q)).map(([p, q]) => [NODES[p], NODES[q]] as [Pt, Pt]);
      return blobInk(smoothBlob(members, { avoiding: others, via, pad: 6, convexity: 0, neck: 0.75, smoothing: 10, clearance: 3 }).loops, s.color, 0.25, 2);
    });
    layer([
      ...outlines,
      hyperPanel([]),
      ...SETS.map((s, i) => label(20 + i * 50, 215, `set ${s.name}`, { fill: s.color, fontWeight: "bold" })),
    ]).render(container, { w: 360, h: 240 });
    return container;
  },
};
export const V4TroutBars: StoryObj = {
  render: () => {
    const container = initializeContainer();
    barsScene(false, blobInk(smoothBlob(TROUT, { avoiding: [...NOT_TROUT, AXIS_BAND], pad: 4, convexity: 0, neck: 0.5, smoothing: 8, clearance: 4 }).loops, "#d6580c", 0.18, 2)).render(container, { w: 400, h: 240 });
    return container;
  },
};

// ── (f) dataset explorer: one two-parameter grid per dataset ────────────────
// Columns: convexity (0, 0.5, 0.8, 1). Rows: smoothing at half, equal to and twice
// the padding. Where convexity does nothing (two members), columns are `neck`.
// Every cell is the v4 construction (`smoothBlob`). The recommended defaults
// cell (convexity 0.5 or neck 1, smoothing = padding) gets a teal frame.
type Axis = { name: string; vals: number[]; fmt?: (v: number) => string; def: number };
const paramGrid = (g: {
  cols: Axis; rows: Axis; w: number; h: number;
  cell: (c: number, r: number) => any[];
}) => {
  const container = initializeContainer();
  const nc = g.cols.vals.length, nr = g.rows.vals.length;
  const W0 = 92 + nc * (g.w + 8), k = Math.min(1, 1120 / W0);
  const GX = 92 / k, GY = 40 / k, gap = 8 / k, fs = 12.5 / k;
  const W = GX + nc * (g.w + gap), H = GY + nr * (g.h + gap);
  const fmtC = g.cols.fmt ?? String, fmtR = g.rows.fmt ?? String;
  const frame = (x: number, y: number, on: boolean) =>
    polygon({ points: [[x, y], [x + g.w, y], [x + g.w, y + g.h], [x, y + g.h]], fill: "none", stroke: on ? "#0f6e74" : "#d5d9de", strokeWidth: (on ? 3 : 1) / k });
  const ink: any[] = [
    label(GX, 2 / k, `${g.cols.name} →`, { fontSize: fs, fontWeight: "bold", fill: "#333" }),
    label(4 / k, 20 / k, `${g.rows.name} ↓`, { fontSize: fs, fontWeight: "bold", fill: "#333" }),
  ];
  g.cols.vals.forEach((v, ci) =>
    ink.push(label(GX + ci * (g.w + gap) + 4 / k, 20 / k, fmtC(v) + (v === g.cols.def ? " (default)" : ""), { fontSize: fs, fill: v === g.cols.def ? "#0f6e74" : "#333", fontWeight: v === g.cols.def ? "bold" : "normal" }))
  );
  g.rows.vals.forEach((v, ri) => {
    const y = GY + ri * (g.h + gap);
    ink.push(label(4 / k, y + g.h / 2 - 16 / k, fmtR(v), { fontSize: fs, fill: v === g.rows.def ? "#0f6e74" : "#333", fontWeight: v === g.rows.def ? "bold" : "normal" }));
    if (v === g.rows.def) ink.push(label(4 / k, y + g.h / 2 + 2 / k, "(default)", { fontSize: fs, fill: "#0f6e74", fontWeight: "bold" }));
    g.cols.vals.forEach((c, ci) => {
      const x = GX + ci * (g.w + gap);
      ink.push(position({ x, y }, [layer(g.cell(c, v))]));
      ink.push(frame(x, y, c === g.cols.def && v === g.rows.def));
    });
  });
  layer([polygon({ points: [[0, 0], [W, 0], [W, H], [0, H]], fill: "white", stroke: "none" }), ...ink]).render(container, { w: W, h: H });
  // shrink wide grids to fit the 1264 px capture root; the drawing stays vector
  if (k < 1) container.style.zoom = String(k);
  return container;
};
const CONVEXITY: Axis = { name: "convexity", vals: [0, 0.5, 0.8, 1], def: 0.5 };
const NECK: Axis = { name: "neck", vals: [0.5, 0.7, 0.85, 1], def: 1 };
const smoothingAxis = (pad: number): Axis => ({ name: "smoothing", vals: [pad / 2, pad, 2 * pad], fmt: (v) => `${v} px`, def: pad });
/** Shift a circle member into a cell's local frame. */
const shiftC = (m: Extract<Member, { kind: "circle" }>, dx: number, dy: number) => C(m.cx + dx, m.cy + dy, m.r);

// (a) Topology: {a, c} avoiding b. Two members, so convexity does nothing: columns are neck.
export const GridTopology: StoryObj = {
  render: () => paramGrid({
    cols: NECK, rows: smoothingAxis(22), w: 330, h: 150,
    cell: (neck, smoothing) => [position({ x: -5, y: -10 }, [layer([
      ...loopInk(smoothBlob([MA, MC], { avoiding: [ring(MB)], pad: 22, convexity: 0, neck, smoothing, clearance: 6 }).loops, RED, 0.3, 2),
      ...topoBase(),
    ])])],
  }),
};
// (b) the U-shaped cloud with two non-members in its opening.
export const GridU: StoryObj = {
  render: () => paramGrid({
    cols: CONVEXITY, rows: smoothingAxis(8), w: 230, h: 180,
    cell: (convexity, smoothing) => [position({ x: 2, y: 2 }, [uPanel(blobInk(smoothBlob(U, { avoiding: NON, pad: 8, convexity, neck: 1, smoothing }).loops, BLUE))])],
  }),
};
// (c) Gentoo among the other species (cropped to the Gentoo cluster).
// All three species in a compact frame (no axes). Nothing is avoided, so the grid's
// defaults cell is the Shape.blob() panel and its convexity-1 column is Shape.hull().
const PCW = 336, PCH = 246;
const penSpecies = () => Object.keys(SPECIES_COLORS).map((sp) => ({
  sp, color: SPECIES_COLORS[sp],
  ms: pen.filter((d) => d.Species === sp).map((d) => C(10 + ((d["Beak Length (mm)"] - 32) / (60 - 32)) * (PCW - 20), 8 + ((22 - d["Beak Depth (mm)"]) / (22 - 13)) * (PCH - 16), 2.5)),
}));
/** Like blobInk, but holes are cut out of the fill (each hole joined to its outer loop by a
 *  zero-width bridge), so overlapping sets show through each other's holes. */
const blobInkCut = (loops: Pt[][], color: string, fillOpacity = 0.15, strokeWidth = 1.5) => {
  if (!loops.length) return [];
  const big = loops.reduce((a, b) => (loopArea(a) > loopArea(b) ? a : b));
  const outerSign = Math.sign(signedArea(big));
  const outer = loops.filter((l) => Math.sign(signedArea(l)) === outerSign), holes = loops.filter((l) => Math.sign(signedArea(l)) !== outerSign);
  const fills = outer.map((o) => {
    let pts = o.slice();
    for (const h of holes.filter((h) => inPoly(h[0], o))) pts = [...pts, pts[0], ...h, h[0], pts[0]];
    return polygon({ points: pts, fill: color, stroke: "none", opacity: fillOpacity });
  });
  return [...fills, ...loops.map((l) => polygon({ points: l, fill: "none", stroke: color, strokeWidth }))];
};
const penCell = (outline: (ms: Member[], others: Member[]) => Pt[][], fillOpacity = 0.15) => {
  const g = penSpecies();
  return [
    ...g.flatMap(({ ms, color }, i) => blobInkCut(outline(ms, g.filter((_, k) => k !== i).flatMap((o) => o.ms)), color, fillOpacity, 1.5)),
    ...g.flatMap(({ ms, color }) => ms.map((m) => dot(m, color))),
  ];
};
// The discrete choice first: box, hull, blob, spine, each with its defaults at padding 6.
// chart(penguins).flow(group({ by: "Species" }), scatter(...)).mark(circle(...)).layer(enclose({ shape, padding: 4, fill: "Species", opacity: 0.15 }))
const PEN_PAD = 6;
export const PenguinShapes: StoryObj = {
  render: () => {
    const sm = (o: Partial<SmoothOpts>) => (ms: Member[], others: Member[]) => smoothBlob(ms, { pad: PEN_PAD, neck: 1, convexity: 0.5, smoothing: PEN_PAD, ...o, avoiding: o.avoiding === undefined ? others : o.avoiding }).loops;
    const panel = (ink: any[]) => position({ x: 0, y: 2 }, [layer([polygon({ points: [[0, 0], [PCW, 0], [PCW, PCH], [0, PCH]], fill: "none", stroke: "#e3e3e3", strokeWidth: 1 }), ...ink])]);
    return titledGrid([
      ["Shape.box()", panel(penCell((ms) => [boxOutline(ms, PEN_PAD)]))],
      ["Shape.hull()", panel(penCell(sm({ convexity: 1, avoiding: [] })))],
      ["Shape.blob()", panel(penCell(sm({ avoiding: [] })))],
      ["Shape.spine()", panel(penCell(sm({ convexity: 0, avoiding: [] })))],
    ], { w: PCW + 14, h: PCH + 6, cols: 2 });
  },
};
// Then the continuous tuning: convexity by smoothing, all three species in every cell.
export const GridPenguins: StoryObj = {
  render: () => paramGrid({
    cols: CONVEXITY, rows: smoothingAxis(PEN_PAD), w: PCW, h: PCH,
    cell: (convexity, smoothing) => penCell((ms) => smoothBlob(ms, { pad: PEN_PAD, convexity, neck: 1, smoothing }).loops),
  }),
};
// (d) hyperedges over the node-link graph: the graph's edges between members are `via`.
export const GridHyperedges: StoryObj = {
  render: () => paramGrid({
    cols: CONVEXITY, rows: smoothingAxis(6), w: 345, h: 205,
    cell: (convexity, smoothing) => [position({ x: -12, y: -8 }, [hyperPanel(SETS.flatMap((s) => {
      const members = s.nodes.map(hyperNode);
      const others = Object.keys(NODES).filter((id) => !s.nodes.includes(id)).map(hyperNode);
      const via = EDGES.filter(([p, q]) => s.nodes.includes(p) && s.nodes.includes(q)).map(([p, q]) => [NODES[p], NODES[q]] as [Pt, Pt]);
      return blobInk(smoothBlob(members, { avoiding: others, via, pad: 6, convexity, neck: 1, smoothing, clearance: 3 }).loops, s.color, 0.25, 2);
    }))])],
  }),
};
// (e) trout across lakes, avoiding the other bars and the axis band.
const troutCell = (o: Partial<SmoothOpts>) => [position({ x: -8, y: -12 }, [barsScene(false,
  blobInk(smoothBlob(TROUT, { avoiding: [...NOT_TROUT, AXIS_BAND], pad: 4, convexity: 0.5, neck: 1, smoothing: 4, clearance: 4, ...o }).loops, "#d6580c", 0.18, 2), false)])];
// Convexity does nothing here (every triangle between trout bars holds another bar,
// and every direct link is blocked), so columns are neck.
export const GridTrout: StoryObj = {
  render: () => paramGrid({ cols: NECK, rows: smoothingAxis(4), w: 440, h: 200, cell: (neck, smoothing) => troutCell({ neck, smoothing }) }),
};
// (f) Munkres' ninth panel; {a, c} as in (a), so columns are neck.
export const GridMunkres: StoryObj = {
  render: () => paramGrid({
    cols: NECK, rows: smoothingAxis(22), w: 384, h: 192,
    cell: (neck, smoothing) => [position({ x: -2, y: -2 }, [munkresPanel({ ...MUNK, neck, smoothing })])],
  }),
};

// The curvature of the current construction alone, on the recommended {a, c} spelling
// (padding 22, neck 0.85, smoothing 40, clearance 6), with its comb and its plot.
export const V4CurvatureCurrent: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const r = smoothWithCurvature(smoothBlob([MA, MC], MUNK));
    const left = r.pts.reduce((a, b) => (b[0] < a[0] ? b : a));
    const note = `measured: padding at a ${(MA.cx - left[0] - MA.r).toFixed(1)} px (asked 22), gap to b's ring ${(minDistTo(r.pts, [MB.cx, MB.cy]) - 14).toFixed(1)} px (asked 6)`;
    console.error(`[v4 curvature current] ${note}`);
    const color = "#1f6f8b", invR = 1 / (MA.r + 22);
    layer([
      position({ x: 0, y: 4 }, [layer([
        polygon({ points: r.pts, fill: color, opacity: 0.12, stroke: "none" }),
        ...comb(r.pts, r.kappa, 300, 2, color),
        polygon({ points: r.pts, fill: "none", stroke: "#111", strokeWidth: 1.2 }),
        ...topoBase(),
      ])]),
      position({ x: 330, y: 0 }, [kappaPlot(r.pts, r.kappa, { w: 520, h: 170, kmax: 0.06, color, title: "curvature along the outline, from the leftmost point", refs: [[invR, "1/R"], [-1 / 40, "−1/40"]] })]),
      label(376, 16, note, { fontSize: 9.5, fill: "#555" }),
    ]).render(container, { w: 860, h: 175 });
    return container;
  },
};

// One hull per species with the hull preset (convexity 1, neck 1) of the current construction.
export const V4PenguinHulls: StoryObj = {
  render: () => {
    const container = initializeContainer();
    penguinScene((ms, c) => blobInk(smoothBlob(ms, { pad: 6, convexity: 1, neck: 1, smoothing: 6 }).loops, c, 0.18, 1.5)).render(container, { w: 420, h: 330 });
    return container;
  },
};

// ── (g) hyperedges with the graph's edges as members (Josh, 10-13) ─────────
// Each set's members are its nodes plus the graph edges whose two ends are both
// in the set. A segment member is its own geometry: its whole length is inside
// the outline at `padding`, and it already links its two ends. Proposed spelling
// in proposal (d): enclose's operands are the set's nodes and its edges.
const EDGE_W = 1.5;
type HSet = { name: string; nodes: string[]; color: string };
const edgeMembers = (nodes: string[], edges = EDGES, at = NODES): Member[] =>
  edges.filter(([p, q]) => nodes.includes(p) && nodes.includes(q)).map(([p, q]) => ({ kind: "segment", a: at[p], b: at[q], w: EDGE_W }) as Member);
const hyperInk = (s: HSet, mode: "members" | "via", o: Partial<SmoothOpts> = {}) => {
  const nodes = s.nodes.map(hyperNode);
  const avoiding = Object.keys(NODES).filter((id) => !s.nodes.includes(id)).map(hyperNode);
  const via = EDGES.filter(([p, q]) => s.nodes.includes(p) && s.nodes.includes(q)).map(([p, q]) => [NODES[p], NODES[q]] as [Pt, Pt]);
  const members = mode === "members" ? [...nodes, ...edgeMembers(s.nodes)] : nodes;
  return blobInk(smoothBlob(members, { avoiding, via: mode === "via" ? via : undefined, pad: 6, convexity: 0.5, neck: 1, smoothing: 6, clearance: 3, ...o }).loops, s.color, 0.25, 2);
};
const hyperCell = (sets: HSet[], mode: "members" | "via", o: Partial<SmoothOpts> = {}) =>
  position({ x: -12, y: -8 }, [hyperPanel(sets.flatMap((s) => hyperInk(s, mode, o)))]);
export const HyperedgesMembersVsVia: StoryObj = {
  render: () => titledGrid([
    ["nodes + edges as members, convexity 0 (spine)", hyperCell(SETS, "members", { convexity: 0 })],
    ["via (current), convexity 0 (spine)", hyperCell(SETS, "via", { convexity: 0 })],
    ["nodes + edges as members, defaults", hyperCell(SETS, "members")],
    ["via (current), defaults", hyperCell(SETS, "via")],
  ], { w: 350, h: 210, cols: 2 }),
};
export const GridHyperedgesMembers: StoryObj = {
  render: () => paramGrid({
    cols: CONVEXITY, rows: smoothingAxis(6), w: 345, h: 205,
    cell: (convexity, smoothing) => [hyperCell(SETS, "members", { convexity, smoothing })],
  }),
};
// Stress cases. Set D = {3, 5, 10}: 3 reaches 5 only through the non-member 4, so
// its member subgraph is two pieces ({3} and the edge 5-10) that the spanning tree
// must join around 4. Below, a two-node set whose edge passes near non-members w, x.
const SET_D: HSet = { name: "D", nodes: ["n3", "n5", "n10"], color: "#9467bd" };
const nearInk = (mode: "members" | "via", wy = 17, o: Partial<SmoothOpts> = {}) => {
  const NEAR: Record<string, Pt> = { u: [30, 50], v: [290, 50], w: [160, 50 + wy], x: [95, 50 - 13] };
  const node = (id: string) => C(NEAR[id][0], NEAR[id][1], 9);
  const nodes = ["u", "v"].map(node), avoiding = ["w", "x"].map(node);
  const members = mode === "members" ? [...nodes, ...edgeMembers(["u", "v"], [["u", "v"]], NEAR)] : nodes;
  const loops = smoothBlob(members, { avoiding, via: mode === "via" ? [[NEAR.u, NEAR.v]] : undefined, pad: 6, convexity: 0.5, neck: 1, smoothing: 6, clearance: 3, ...o }).loops;
  const [a, b] = [NEAR.u, NEAR.v];
  return layer([
    ...blobInk(loops, "#e45756", 0.25, 2),
    polygon({ points: [[a[0], a[1] - 0.75], [b[0], b[1] - 0.75], [b[0], b[1] + 0.75], [a[0], a[1] + 0.75]], fill: "#555" }),
    ...Object.keys(NEAR).flatMap((id) => [
      dot(node(id), "white"),
      polygon({ points: samples(node(id), 0), fill: "none", stroke: "#333", strokeWidth: 1.5 }),
      label(NEAR[id][0] - 4, NEAR[id][1] - 6, id, { fontSize: 10, fontStyle: "italic" }),
    ]),
  ]);
};
export const HyperedgesMembersStress: StoryObj = {
  render: () => titledGrid([
    ["set D = {3, 5, 10} as a spine, edges as members", hyperCell([SET_D], "members", { convexity: 0 })],
    ["set D = {3, 5, 10} as a spine, via (current)", hyperCell([SET_D], "via", { convexity: 0 })],
  ], { w: 350, h: 210, cols: 2 }),
};
export const HyperedgesMembersNearEdge: StoryObj = {
  render: () => titledGrid([
    ["edge u-v, w 17 px below it; edges as members", position({ x: 0, y: 6 }, [nearInk("members")])],
    ["edge u-v, w 17 px below it; via (current)", position({ x: 0, y: 6 }, [nearInk("via")])],
    ["edge u-v, w 11 px below it; edges as members", position({ x: 0, y: 6 }, [nearInk("members", 11)])],
    ["edge u-v, w 11 px below it; via (current)", position({ x: 0, y: 6 }, [nearInk("via", 11)])],
  ], { w: 350, h: 95, cols: 2 }),
};

