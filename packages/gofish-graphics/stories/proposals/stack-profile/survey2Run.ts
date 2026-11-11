// Builds the widgets of "Spacing by eye, part 2" (proposals/optical-spacing/
// survey2.html): `node_modules/.bin/tsx stories/proposals/stack-profile/survey2Run.ts`
// writes proposals/optical-spacing/survey2_widgets.json, which survey2_build.py
// turns into the page and survey2_design.md's table describes. For each widget
// it records where each candidate strategy (survey2Shapes.ts) puts the moving
// shape, in the widget's own units: v is always the box gap of the pair being
// set, so a mirrored repeat records the same number as its original.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pt, Shape } from "./spacingModels";
import { CANDIDATES, library, mirror as mirrorShape, pairBand, star } from "./survey2Shapes";
import { DEFS } from "./widgetDefs";
import { extX, extY, gapProfile, powerMean, type Band } from "./widgetModels";

type Item = { sh: Shape; x: number; y: number; k?: number };
type Pair = [Shape, number, Shape, number, Band];
type Def = {
  key: string; // the result line's name
  purpose: string; // discriminate, repeat of, scale of, control
  geometry: string;
  text: string;
  aria: string;
  s: number; // shape size
  items: Item[];
  pairs: (v: number) => [Pair, Pair];
  edge: [number, number];
  group: string; // widgets that must not sit next to each other share a group
};
const r2 = (x: number) => +x.toFixed(2);

/**
 * A reference pair above, at a fixed gap g0, and the pair being set below,
 * shifted sideways so no edges line up. B, the right shape of the lower
 * pair, moves; v is the lower pair's box gap.
 */
function refTest(o: { key: string; purpose: string; group: string; geometry: string; moving: string; ref: [Shape, Shape]; test: [Shape, Shape]; g0: number; s: number }): Def {
  const [R1, R2] = o.ref;
  const [A, B] = o.test;
  const s = o.s;
  const ry = Math.max(extY(A)[1], extY(B)[1]) + 0.6 * s; // the reference row sits above
  const shift = 0.6 * s;
  const r2x = extX(R1)[1] + o.g0 - extX(R2)[0];
  const bx = shift + extX(A)[1] - extX(B)[0]; // B's x at v = 0
  const refBand = pairBand(R1, R2);
  const testBand = pairBand(A, B);
  return {
    key: o.key,
    purpose: o.purpose,
    group: o.group,
    geometry: o.geometry,
    text: `Move the ${o.moving} until the two gaps look the same to you.`,
    aria: `${o.geometry}; the ${o.moving} moves left and right`,
    s,
    items: [
      { sh: R1, x: 0, y: ry },
      { sh: R2, x: r2x, y: ry },
      { sh: A, x: shift, y: 0 },
      { sh: B, x: bx, y: 0, k: 1 },
    ],
    pairs: (v) => [
      [R1, 0, R2, r2x, refBand],
      [A, shift, B, bx + v, testBand],
    ],
    edge: [shift + extX(A)[1], 1],
  };
}

/** The same widget mirrored left to right: same v, the moving shape on the other side. */
const mirrors = new WeakMap<Shape, Shape>();
const mir = (sh: Shape) => {
  if (!mirrors.has(sh)) mirrors.set(sh, mirrorShape(sh));
  return mirrors.get(sh)!;
};
function mirrorDef(d: Def, key: string, purpose: string): Def {
  const flipX = (sh: Shape, x: number) => {
    const [x0, x1] = extX(sh);
    return -x - x0 - x1;
  };
  return {
    ...d,
    key,
    purpose,
    geometry: `${d.geometry}, mirrored`,
    items: d.items.map((it) => ({ sh: mir(it.sh), x: flipX(it.sh, it.x), y: it.y, k: it.k ? -it.k : undefined })),
    pairs: (v) =>
      d.pairs(v).map(([A, a, B, b, tv]) => [mir(B), flipX(B, b), mir(A), flipX(A, a), tv] as Pair) as [Pair, Pair],
    edge: [-d.edge[0], -d.edge[1]],
  };
}

// --- the widgets -------------------------------------------------------------
const S = 56;
const L1 = library(S);
const G0 = 30;
const sq = L1.square;
const disc = (key: string, group: string, geometry: string, moving: string, a: Shape, b: Shape) =>
  refTest({ key, purpose: "discriminate", group, geometry, moving, ref: [sq, sq], test: [a, b], g0: G0, s: S });

const tips = disc("tips", "tips", "two spikes, tip to tip", "spike", L1.sharpRight, L1.sharpLeft);
const notch = disc("notch", "notch", "a triangle's tip pointing into the notch of an L", "triangle", L1.lRight, L1.triLeft);
const interlock = disc("interlock", "interlock", "an up triangle and a down triangle, slanted sides parallel", "triangle", L1.triUp, L1.triDown);
const tipCircle = disc("tip-circle", "tip-circle", "a circle and a triangle whose tip points at it", "triangle", L1.circle, L1.triLeft);
const squareCircle = disc("square-circle", "square-circle", "a square and a circle", "circle", sq, L1.circle);

const scaled = (f: number): Def => {
  const L = library(S * f);
  return refTest({
    key: `square-circle-${f === 0.5 ? "half" : "double"}`,
    purpose: `scale of square-circle, ${f}x`,
    group: "square-circle",
    geometry: `a square and a circle at ${f}x size (shapes ${S * f} px, reference gap ${G0 * f} px)`,
    moving: "circle",
    ref: [L.square, L.square],
    test: [L.square, L.circle],
    g0: G0 * f,
    s: S * f,
  });
};
const st = star(S);
const controls = [
  refTest({ key: "far-squares", purpose: "control: a far gap", group: "far", geometry: "two pairs of squares, the reference 90 px apart", moving: "square", ref: [sq, sq], test: [sq, sq], g0: 90, s: S }),
  refTest({ key: "stars", purpose: "control: an odd shape", group: "stars", geometry: "two pairs of thin stars, the reference 30 px apart", moving: "star", ref: [st, st], test: [st, st], g0: G0, s: S }),
];

// v1's widget 1, as it was, and mirrored
const w1v1 = DEFS[0];
const triangles: Def = {
  key: "triangles",
  purpose: "repeat: v1 widget 1",
  group: "triangles",
  geometry: "v1 widget 1: a square, then up, down and up triangles fixed 30 px apart",
  text: "Move the square until the gaps look even to you.",
  aria: w1v1.aria,
  s: S,
  items: w1v1.items.map((it) => ({ sh: it.sh, x: it.x, y: it.y, k: it.k })),
  pairs: (v) => w1v1.pairs(v) as unknown as [Pair, Pair],
  edge: w1v1.edge as [number, number],
};

const DEFS2: Def[] = [
  tips,
  notch,
  interlock,
  tipCircle,
  squareCircle,
  mirrorDef(tipCircle, "tip-circle-mirror", "repeat of tip-circle, mirrored"),
  triangles,
  mirrorDef(triangles, "triangles-mirror", "repeat of triangles, mirrored"),
  scaled(0.5),
  scaled(2),
  ...controls,
];

// --- predictions ---------------------------------------------------------------
/** The page's rule: of several crossings the one where the measures are largest. */
function solve(ps: number[], a: number[], b: number[]) {
  let best: { x: number; level: number } | null = null;
  for (let i = 0; i + 1 < ps.length; i++) {
    const [d0, d1] = [a[i] - b[i], a[i + 1] - b[i + 1]];
    if (!isFinite(d0) || !isFinite(d1)) continue;
    if (d0 === 0 || Math.sign(d0) !== Math.sign(d1)) {
      const t = d0 === 0 ? 0 : d0 / (d0 - d1);
      const level = a[i] + t * (a[i + 1] - a[i]);
      if (!best || level > best.level) best = { x: ps[i] + t * (ps[i + 1] - ps[i]), level };
    }
  }
  return best;
}
// the capped mean with its cap scaled to the shape (40 of 56 px), for the scaled copies
const relCap = (s: number) => ({
  key: "pm3cRel",
  label: "power mean p −3, cap 0.71 of the shape",
  m: (A: Shape, a: number, B: Shape, b: number, tv: Band) => powerMean(gapProfile(A, a, B, b, tv), -3, (40 / 56) * s),
});

const out = DEFS2.map((d) => {
  const grid = Array.from({ length: 641 }, (_, i) => r2(((-40 + i * 0.5) * d.s) / S));
  const cands = d.purpose.startsWith("scale") || d.key === "square-circle" ? [...CANDIDATES, relCap(d.s)] : CANDIDATES;
  const preds: Record<string, number | null> = {};
  const blind: Record<string, boolean> = {};
  for (const c of cands) {
    const a = grid.map((v) => r2(c.m(...d.pairs(v)[0])));
    const b = grid.map((v) => r2(c.m(...d.pairs(v)[1])));
    const sol = solve(grid, a, b);
    preds[c.key] = sol && r2(sol.x);
    // a capped measure that is equal only at its cap sees both gaps as "far": any v past this works
    blind[c.key] = !!sol && c.key.startsWith("pm3c") && sol.level >= (c.key === "pm3c" ? 40 : (40 / 56) * d.s) - 0.01;
  }
  return { d, preds, blind };
});

// --- order, tracks and starts ------------------------------------------------------
// a seeded shuffle; the seed is the first that keeps each group's widgets apart
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let seed = 1;
let order: number[] = [];
for (; ; seed++) {
  const r = rng(seed);
  order = out.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.every((x, i) => i === 0 || out[x].d.group !== out[order[i - 1]].d.group)) break;
}

const draw = (d: Def, v0: number, v1: number) => {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const it of d.items)
    for (const v of [v0, v1]) {
      const dx = (it.k ?? 0) * v;
      const [[x0, x1], [y0, y1]] = [extX(it.sh), extY(it.sh)];
      box[0] = Math.min(box[0], it.x + dx + x0);
      box[1] = Math.min(box[1], it.y + y0);
      box[2] = Math.max(box[2], it.x + dx + x1);
      box[3] = Math.max(box[3], it.y + y1);
    }
  const top = box[3] + 4;
  const path = (it: Item) => it.sh.contours.map((c: Pt[]) => "M" + c.map(([x, y]) => `${r2(x + it.x)} ${r2(top - y - it.y)}`).join("L") + "Z").join("");
  return {
    view: [r2(box[0] - 4), 0, r2(box[2] - box[0] + 8), r2(top - box[1] + 4)],
    fixed: d.items.filter((it) => !it.k).map((it) => ({ d: path(it) })),
    moving: d.items.filter((it) => it.k).map((it) => ({ d: path(it), k: it.k })),
  };
};

const placed = order.map((i, pos) => {
  const { d, preds, blind } = out[i];
  const xs = Object.values(preds).filter((x) => x != null) as number[];
  const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
  const pad = Math.max(0.45 * (hi - lo), 0.45 * d.s);
  const v0 = Math.floor((lo - pad) * 2) / 2;
  const v1 = Math.ceil((hi + pad) * 2) / 2;
  return { n: pos + 1, d, preds, blind, lo, hi, range: [v0, v1] as [number, number] };
});
// starts: 40% of the track past the predictions, never within 6% of an end;
// alternate sides down the page, and a repeat starts on the side opposite its original
const startAt = (lo: number, hi: number, v0: number, v1: number, far: boolean) => {
  const L = v1 - v0;
  const s = far ? Math.min(hi + 0.4 * L, v1 - 0.08 * L) : Math.max(lo - 0.4 * L, v0 + 0.08 * L);
  return Math.round(s * 2) / 2;
};
const side: Record<string, boolean> = {};
const widgets = placed.map((w, k) => {
  const orig = w.d.purpose.startsWith("repeat of") ? w.d.key.replace(/-mirror$/, "") : null;
  let far = k % 2 === 0;
  if (orig && orig in side) far = !side[orig];
  side[w.d.key] = far;
  return { ...w, far };
});
// a repeat placed before its original: flip the original instead
for (const w of widgets) {
  const m = widgets.find((x) => x.d.key === `${w.d.key}-mirror`);
  if (m && m.n < w.n) w.far = !m.far;
}
const json = widgets.map((w) => {
  const start = startAt(w.lo, w.hi, w.range[0], w.range[1], w.far);
  return {
    n: w.n,
    key: w.d.key,
    purpose: w.d.purpose,
    geometry: w.d.geometry,
    text: w.d.text,
    aria: w.d.aria,
    axis: "x",
    range: w.range,
    start,
    side: w.far ? "far" : "close",
    preds: w.preds,
    blind: w.blind,
    ...draw(w.d, w.range[0], w.range[1]),
    edge: w.d.edge,
  };
});
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../proposals/optical-spacing/");
writeFileSync(OUT + "survey2_widgets.json", JSON.stringify({ seed, candidates: [...CANDIDATES.map(({ key, label }) => ({ key, label })), { key: "pm3cRel", label: relCap(S).label }], widgets: json }, null, 1));
console.log(`seed ${seed}`);
for (const w of json) {
  const ps = Object.entries(w.preds).map(([k, x]) => `${k} ${x == null ? "none" : x}${w.blind[k] ? "+" : ""}`);
  console.log(`w${w.n} ${w.key.padEnd(22)} [${w.range}] start ${w.start} (${w.side}) | ${ps.join(", ")}`);
}
