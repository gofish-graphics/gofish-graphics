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
import { BubbleSets } from "bubblesets-js";
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

/** Spine strategy: bubblesets-js over members, avoiding non-members, along `via` edges. */
const spineOutline = (
  members: Member[],
  opts: { avoiding?: Member[]; via?: [Pt, Pt][]; pad?: number } = {}
): Pt[] => {
  const pad = opts.pad ?? 8;
  const bs = new BubbleSets({
    virtualEdges: !opts.via,
    nodeR0: pad + 2,
    nodeR1: pad + 30,
    edgeR0: pad,
    edgeR1: pad + 12,
    morphBuffer: pad + 2,
    pixelGroup: 2,
  });
  bs.pushMember(...members.map(toBS));
  if (opts.avoiding) bs.pushNonMember(...opts.avoiding.map(toBS));
  if (opts.via) bs.pushEdge(...opts.via.map(([p, q]) => ({ x1: p[0], y1: p[1], x2: q[0], y2: q[1] })));
  const path = bs.compute().sample(8).simplify(0).bSplines().simplify(0);
  return path.points.map((p) => [p.x, p.y] as Pt);
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
  render: () => renderPanel(region(spineOutline(U, { avoiding: NON, pad: 8 }), BLUE)),
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
  render: () => topo(spineOutline([TA, TC], { avoiding: [{ ...TB, r: 22 }], pad: 14 })),
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
      return region(spineOutline(members, { avoiding: others, via, pad: 9 }), s.color, 0.25, 2);
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
const barsScene = (withBackgrounds: boolean, highlight: boolean) => {
  const BW = 20, GAP = 9, GROUP = 3 * BW + 2 * GAP, GG = 34, BASE = 170, X0 = 20;
  const bars: { m: Extract<Member, { kind: "rect" }>; sp: number }[] = [];
  LAKES.forEach((_, li) =>
    SPECIES.forEach((_, si) => {
      const h = COUNTS[li][si] * 1.3;
      bars.push({ m: { kind: "rect", x: X0 + li * (GROUP + GG) + si * (BW + GAP), y: BASE - h, w: BW, h }, sp: si });
    })
  );
  const ink: any[] = [];
  if (withBackgrounds)
    LAKES.forEach((_, li) =>
      ink.push(...region(boxOutline(bars.filter((_, i) => Math.floor(i / 3) === li).map((b) => b.m), 8), "#8892a0", 0.12, 0))
    );
  if (highlight) {
    const mem = bars.filter((b) => b.sp === 1).map((b) => b.m);
    const oth = bars.filter((b) => b.sp !== 1).map((b) => b.m);
    const via = mem.slice(1).map((m, i) => [[mem[i].x + BW / 2, mem[i].y + 6], [m.x + BW / 2, m.y + 6]] as [Pt, Pt]);
    ink.push(...region(spineOutline(mem, { avoiding: oth, via, pad: 4 }), "#d6580c", 0.18, 2));
  }
  return layer([
    ...ink,
    ...bars.map((b) => bar(b.m, SP_COLORS[b.sp])),
    position({ x: X0 - 6, y: BASE }, [rect({ w: 4 * GROUP + 3 * GG + 12, h: 1, fill: "#666" })]),
    ...LAKES.map((l, li) => label(X0 + li * (GROUP + GG) + GROUP / 2 - l.length * 3.3, BASE + 14, l)),
    ...SPECIES.map((s, si) => label(X0 + si * 70, -30, s, { fill: si === 1 ? "#d6580c" : "#666", fontWeight: "bold" })),
  ]);
};
export const NonAdjacentSpine: StoryObj = {
  render: () => {
    const container = initializeContainer();
    barsScene(false, true).render(container, { w: 400, h: 240 });
    return container;
  },
};
// Modifier / per-group reading: spread({ by: "lake", dir: "x" }).background({ padding: 8, fill: "#eef" })
// = one box behind each group the operator makes (like `.label()` on an operator).
export const PerGroupBackgrounds: StoryObj = {
  render: () => {
    const container = initializeContainer();
    barsScene(true, false).render(container, { w: 400, h: 240 });
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
