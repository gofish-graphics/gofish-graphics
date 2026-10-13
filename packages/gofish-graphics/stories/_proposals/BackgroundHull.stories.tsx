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
  | { kind: "rect"; x: number; y: number; w: number; h: number };

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
const centerOf = (m: Member): Pt => (m.kind === "circle" ? [m.cx, m.cy] : [m.x + m.w / 2, m.y + m.h / 2]);
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
/** Does segment ab pass through the interior of convex polygon `poly`? (Cyrus–Beck clipping) */
const segHitsPoly = (a: Pt, b: Pt, poly: Poly, bb = bboxOf(poly)) => {
  if (Math.max(a[0], b[0]) < bb[0] || Math.min(a[0], b[0]) > bb[2] || Math.max(a[1], b[1]) < bb[1] || Math.min(a[1], b[1]) > bb[3]) return false;
  let area2 = 0;
  for (let i = 0; i < poly.length; i++) area2 += cross([0, 0], poly[i], poly[(i + 1) % poly.length]);
  const sgn = area2 > 0 ? 1 : -1;
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
/** Shortest route from a to b around convex obstacles (visibility graph + Dijkstra),
 *  using only obstacles near the straight segment (a local search, for speed). */
const routeAround = (a: Pt, b: Pt, allObstacles: Poly[]): Pt[] | null => {
  const M = Math.max(40, dist(a, b) * 0.6);
  const near = allObstacles
    .map((o) => ({ o, bb: bboxOf(o) }))
    .filter(({ bb }) => bb[2] > Math.min(a[0], b[0]) - M && bb[0] < Math.max(a[0], b[0]) + M && bb[3] > Math.min(a[1], b[1]) - M && bb[1] < Math.max(a[1], b[1]) + M);
  const blocked = (p: Pt, q: Pt) => near.some(({ o, bb }) => segHitsPoly(p, q, o, bb));
  if (!blocked(a, b)) return [a, b];
  const pts: Pt[] = [a, b, ...near.flatMap(({ o }) => o)];
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
      if (d < D[v] && !blocked(pts[u], pts[v])) { D[v] = d; prev[v] = u; }
    }
  }
  if (D[1] === Infinity) return null;
  const path: Pt[] = [];
  for (let v = 1; v >= 0; v = prev[v]) path.unshift(pts[v]);
  return path;
};
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

const memberRadius = (m: Member) => (m.kind === "circle" ? m.r : Math.min(m.w, m.h) / 2);

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

