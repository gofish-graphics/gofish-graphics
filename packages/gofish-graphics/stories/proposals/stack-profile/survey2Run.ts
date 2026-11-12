// Builds the widgets of "Spacing by eye, part 2" (proposals/optical-spacing/
// survey2.html): `node_modules/.bin/tsx stories/proposals/stack-profile/survey2Run.ts`
// writes proposals/optical-spacing/survey2_widgets.json, which survey2_build.py
// turns into the page and survey2_design.md describes.
//
// Every widget is one row of three or four shapes on a shared baseline, as in
// the first survey. One shape moves; v is the box gap between it and its left
// neighbor (its right neighbor in a mirrored row). Either the shapes after it
// follow it, so a fixed gap earlier in the row is the reference, or the shape
// after it stays put, so the gaps on the moving shape's two sides are
// compared. For each widget the script records where each candidate strategy
// (survey2Shapes.ts) makes the two compared gaps equal, ranks the widgets by
// what they can decide, and splits them into a core tier and an extended tier.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pt, Shape } from "./spacingModels";
import { CANDIDATES, library, mirror as mirrorShape, pairBand, star } from "./survey2Shapes";
import { extX, extY, gapProfile, powerMean, type Band } from "./widgetModels";

type Item = { sh: Shape; x: number; y: number; k?: number; hue?: boolean };
type Pair = [Shape, number, Shape, number, Band];
type Kind = "discriminate" | "control" | "repeat" | "scale" | "mixed" | "invert" | "color";
type Def = {
  key: string; // the result line's name
  kind: Kind;
  of?: string; // the widget this one is matched with
  purpose: string;
  shapes: string; // the row, left to right, for the design table
  color: string; // "none", or which shape is colored
  invert?: boolean;
  text: string;
  aria: string;
  s: number; // the row's main shape size, which sets the expected sd
  items: Item[];
  pairs: (v: number) => [Pair, Pair];
  edge: [number, number];
  vmax: number; // the moving shape may not pass its fixed right neighbor
};
const r2 = (x: number) => +x.toFixed(2);

/** Moves a shape so it sits on the baseline y = 0 and starts at x = 0. */
const seat = (sh: Shape): Shape => {
  const [x0] = extX(sh);
  const [y0] = extY(sh);
  return { contours: sh.contours.map((c) => c.map(([x, y]) => [x - x0, y - y0] as Pt)), holes: sh.holes };
};

type RowOpts = {
  key: string;
  kind: Kind;
  purpose: string;
  names: string[]; // one per shape, for the table and the text
  shapes: Shape[];
  gaps: number[]; // box gaps between neighbors; the moving gap's entry is ignored
  m: number; // index of the moving shape
  mode: "follow" | "between";
  ref?: number; // follow mode: the reference gap is between ref and ref + 1
  s: number;
};
const both = (a: string, b: string) => (a === b ? `the two ${a}s` : `the ${a} and the ${b}`);
function row(o: RowOpts): Def {
  const { shapes: sh, m } = o;
  const xs = [0];
  for (let i = 1; i < sh.length; i++) {
    const g = i === m ? 0 : o.gaps[i - 1];
    xs.push(xs[i - 1] + extX(sh[i - 1])[1] + g - extX(sh[i])[0]);
  }
  const follow = o.mode === "follow";
  const k = (i: number) => (i === m || (follow && i > m) ? 1 : 0);
  const at = (i: number, v: number) => xs[i] + k(i) * v;
  const P = (i: number, j: number, v: number): Pair => [sh[i], at(i, v), sh[j], at(j, v), pairBand(sh[i], sh[j])];
  const ref = o.ref ?? 0;
  const moving = o.names[m];
  const list = o.names.join(", ");
  const after = o.names.slice(m + 1);
  const followers = follow && after.length ? ` The ${after.join(" and the ")} ${after.length > 1 ? "move" : "moves"} with it.` : "";
  const text = follow
    ? `Move the ${moving} until its gap to the ${o.names[m - 1]} looks the same as the gap between ${both(o.names[ref], o.names[ref + 1])}.${followers}`
    : `Move the ${moving} until the gaps on its two sides look the same.`;
  return {
    key: o.key,
    kind: o.kind,
    purpose: o.purpose,
    shapes: list,
    color: "none",
    text,
    aria: `A row of shapes: ${list}. The ${moving} moves left and right.`,
    s: o.s,
    items: sh.map((s, i) => ({ sh: s, x: xs[i], y: 0, k: k(i) || undefined })),
    pairs: (v) => [P(m - 1, m, v), follow ? P(ref, ref + 1, v) : P(m, m + 1, v)],
    edge: [xs[m] + extX(sh[m])[0], 1],
    vmax: follow ? Infinity : o.gaps[m],
  };
}

/** The same widget mirrored left to right: same v, the moving shape on the other side. */
const mirrors = new WeakMap<Shape, Shape>();
const mir = (sh: Shape) => {
  if (!mirrors.has(sh)) mirrors.set(sh, mirrorShape(sh));
  return mirrors.get(sh)!;
};
function mirrorDef(d: Def): Def {
  const flipX = (sh: Shape, x: number) => {
    const [x0, x1] = extX(sh);
    return -x - x0 - x1;
  };
  return {
    ...d,
    key: `${d.key}-mirror`,
    kind: "repeat",
    of: d.key,
    purpose: `repeat of ${d.key}, mirrored`,
    shapes: d.shapes.split(", ").reverse().join(", "),
    items: d.items.map((it) => ({ ...it, sh: mir(it.sh), x: flipX(it.sh, it.x), k: it.k ? -it.k : undefined })),
    pairs: (v) =>
      d.pairs(v).map(([A, a, B, b, tv]) => [mir(B), flipX(B, b), mir(A), flipX(A, a), tv] as Pair) as [Pair, Pair],
    edge: [-d.edge[0], -d.edge[1]],
  };
}
/** The same widget with one shape in a saturated color. */
const withHue = (d: Def, i: number): Def => {
  const names = d.shapes.split(", ");
  const moving = !!d.items[i].k;
  return {
    ...d,
    key: `${d.key}-hue`,
    kind: "color",
    of: d.key,
    purpose: `color: ${d.key} with the ${moving ? "moving" : "fixed"} ${names[i]} colored`,
    color: `the ${moving ? "moving" : "fixed"} ${names[i]}`,
    items: d.items.map((it, j) => ({ ...it, hue: j === i || undefined })),
  };
};
/** The same widget with the shape and background colors swapped. */
const inverted = (d: Def): Def => ({ ...d, key: `${d.key}-invert`, kind: "invert", of: d.key, purpose: `inversion: ${d.key} with shape and background swapped`, invert: true });

// --- the pool ----------------------------------------------------------------
const S = 56;
const G = 30;
const lib = (s: number) => {
  const L = library(s);
  const out: Record<string, Shape> = {};
  for (const k in L) out[k] = seat(L[k]);
  out.star = seat(star(s));
  // an L with thinner legs (0.2 of its size): its notch is deeper than the library's
  out.lThin = poly([[0, 0], [s, 0], [s, s * 0.2], [s * 0.2, s * 0.2], [s * 0.2, s], [0, s]]);
  return out;
};
function poly(pts: Pt[]): Shape {
  return { contours: [pts], holes: [false] };
}
const L1 = lib(S);

// Realism, 1 to 3: 3, a row that appears in real icon rows and diagrams;
// 2, ordinary shapes in a plausible but less common arrangement; 1, a row
// built to make strategies disagree (long spikes, tip to tip).
// Each row is a function of size f so it can be scaled.
type RowFn = { realism: number; make: (f: number) => Def };
const DISC: Record<string, RowFn> = {
  tips: {
    realism: 1,
    make: (f) => {
      const L = lib(S * f);
      return row({ key: "tips", kind: "discriminate", purpose: "pathological: two long spikes, tip to tip", names: ["square", "spike", "spike", "circle"], shapes: [L.square, L.sharpRight, L.sharpLeft, L.circle], gaps: [G * f, 0, G * f], m: 2, mode: "follow", ref: 0, s: S * f });
    },
  },
  "spike-square": {
    realism: 1,
    make: (f) => {
      const L = lib(S * f);
      return row({ key: "spike-square", kind: "discriminate", purpose: "pathological: a long spike's tip at a flat side", names: ["circle", "square", "spike"], shapes: [L.circle, L.square, L.sharpLeft], gaps: [G * f, 0], m: 2, mode: "follow", ref: 0, s: S * f });
    },
  },
  notch: {
    realism: 2,
    make: (f) => {
      const L = lib(S * f);
      return row({ key: "notch", kind: "discriminate", purpose: "a triangle's tip into the notch of an L", names: ["square", "L", "triangle"], shapes: [L.square, L.lThin, L.triLeft], gaps: [G * f, 0], m: 2, mode: "follow", ref: 0, s: S * f });
    },
  },
  "tip-circle": {
    realism: 3,
    make: (f) => {
      const L = lib(S * f);
      return row({ key: "tip-circle", kind: "discriminate", purpose: "a triangle's tip toward a circle", names: ["square", "circle", "triangle"], shapes: [L.square, L.circle, L.triLeft], gaps: [G * f, 0], m: 2, mode: "follow", ref: 0, s: S * f });
    },
  },
  interlock: {
    realism: 2,
    make: (f) => {
      const L = lib(S * f);
      return row({ key: "interlock", kind: "discriminate", purpose: "an up and a down triangle, slanted sides parallel", names: ["square", "square", "triangle", "triangle"], shapes: [L.square, L.square, L.triUp, L.triDown], gaps: [G * f, G * f, 0], m: 3, mode: "follow", ref: 0, s: S * f });
    },
  },
  "interlock-small": {
    realism: 2,
    make: (f) => {
      const [L, l] = [lib(S * f), lib(S * f * 0.7)];
      return row({ key: "interlock-small", kind: "discriminate", purpose: "smaller up and down triangles after two squares", names: ["square", "square", "small triangle", "small triangle"], shapes: [L.square, L.square, l.triUp, l.triDown], gaps: [G * f, G * f, 0], m: 3, mode: "follow", ref: 0, s: S * f });
    },
  },
  "square-circle": {
    realism: 3,
    make: (f) => {
      const L = lib(S * f);
      return row({ key: "square-circle", kind: "discriminate", purpose: "a circle after two squares (the simple row)", names: ["square", "square", "circle"], shapes: [L.square, L.square, L.circle], gaps: [G * f, 0], m: 2, mode: "follow", ref: 0, s: S * f });
    },
  },
  // the diagnostic: two squares, then a triangle. The only change from the
  // reference pair is the wedge the triangle's tip leaves; its depth is the one feature
  wedge: {
    realism: 3,
    make: (f) => {
      const L = lib(S * f);
      return row({ key: "wedge", kind: "discriminate", purpose: "diagnostic: a triangle after two squares; one feature, the wedge", names: ["square", "square", "triangle"], shapes: [L.square, L.square, L.triLeft], gaps: [G * f, 0], m: 2, mode: "follow", ref: 0, s: S * f });
    },
  },
  // mixed sizes inside one row, 2:1, squares only: every shape strategy agrees and only the size strategy differs
  "mixed-small": {
    realism: 3,
    make: (f) => {
      const [L, l] = [lib(S * f), lib(S * f * 0.5)];
      return row({ key: "mixed-small", kind: "mixed", purpose: "mixed sizes: a small square after two big ones", names: ["square", "square", "small square"], shapes: [L.square, L.square, l.square], gaps: [G * f, 0], m: 2, mode: "follow", ref: 0, s: S * f });
    },
  },
  "mixed-big": {
    realism: 3,
    make: (f) => {
      const [L, l] = [lib(S * f), lib(S * f * 0.5)];
      return row({ key: "mixed-big", kind: "mixed", purpose: "mixed sizes: a big square after two small ones", names: ["small square", "small square", "square"], shapes: [l.square, l.square, L.square], gaps: [G * f, 0], m: 2, mode: "follow", ref: 0, s: S * f });
    },
  },
  stars: {
    realism: 3,
    make: (f) => {
      const L = lib(S * f);
      return row({ key: "stars", kind: "control", purpose: "control: three identical stars", names: ["star", "star", "star"], shapes: [L.star, L.star, L.star], gaps: [G * f, 0], m: 2, mode: "follow", ref: 0, s: S * f });
    },
  },
};
const realismOf = (key: string) => DISC[key.replace(/-(mirror|hue|invert|half|double)$/, "")].realism;
const one = (key: string) => DISC[key].make(1);
const scaledDef = (key: string, f: number): Def => ({
  ...DISC[key].make(f),
  key: `${key}-${f === 0.5 ? "half" : "double"}`,
  kind: "scale",
  of: key,
  purpose: `scale: ${key} at ${f}x`,
});

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
// the capped mean with its cap scaled to the shape (40 of 56 px)
const relCap = (s: number) => ({
  key: "pm3cRel",
  label: "power mean p −3, cap 0.71 of the shape",
  m: (A: Shape, a: number, B: Shape, b: number, tv: Band) => powerMean(gapProfile(A, a, B, b, tv), -3, (40 / 56) * s),
});
type Pred = { preds: Record<string, number | null>; blind: Record<string, boolean> };
const predCache = new Map<Def, Pred>();
function predict(d: Def): Pred {
  if (predCache.has(d)) return predCache.get(d)!;
  const grid = Array.from({ length: 721 }, (_, i) => r2(((-40 + i * 0.5) * d.s) / S)).filter((v) => v <= d.vmax);
  const cands = [...CANDIDATES, relCap(d.s)];
  const preds: Record<string, number | null> = {};
  const blind: Record<string, boolean> = {};
  for (const c of cands) {
    const a = grid.map((v) => r2(c.m(...d.pairs(v)[0])));
    const b = grid.map((v) => r2(c.m(...d.pairs(v)[1])));
    const sol = solve(grid, a, b);
    preds[c.key] = sol && r2(sol.x);
    // a capped measure that is equal only at its cap sees both gaps as "far":
    // any v past this works, so the prediction is only a lower bound
    blind[c.key] = !!sol && c.key.startsWith("pm3c") && sol.level >= (c.key === "pm3c" ? 40 : (40 / 56) * d.s) - 0.01;
  }
  predCache.set(d, { preds, blind });
  return predCache.get(d)!;
}

// --- ranking: which widget can rule out which candidate -----------------------------
const KEYS = CANDIDATES.map((c) => c.key); // box, contact, pm3c, hull, mean, size
const sdOf = (d: Def) => (1.5 * d.s) / S;
/**
 * How far candidate c's prediction is from every other candidate's, in sd:
 * the distance to the nearest one. A blind prediction (the cap's plateau)
 * is the set "this value or more", so the distance to it is how far below
 * it c sits. A blind c is not bold and isolates nothing.
 */
function isolation(d: Def, c: string) {
  const { preds, blind } = predict(d);
  const x = preds[c];
  if (x == null || blind[c]) return 0;
  let m = Infinity;
  for (const b of KEYS) {
    if (b === c || preds[b] == null) continue;
    const y = preds[b]!;
    const dist = blind[b] ? Math.max(0, y - x) : Math.abs(x - y);
    m = Math.min(m, dist / sdOf(d));
  }
  return m;
}
type Cell = "out" | "bold" | "blind" | "none";
/** out: a bold prediction 4 sd from every other; bold: a miss rules it out with whoever shares it; blind: a plateau. */
const cell = (d: Def, c: string): Cell => {
  const { preds, blind } = predict(d);
  if (preds[c] == null) return "none";
  if (blind[c]) return "blind";
  return isolation(d, c) >= 4 ? "out" : "bold";
};
const ISO = 4;
const realistic = Object.keys(DISC).filter((k) => DISC[k].realism >= 2 && k !== "stars");
const coveredBy: Record<string, string | null> = Object.fromEntries(KEYS.map((c) => [c, null]));
const ranking: { key: string; realism: number; score: number; decides: string }[] = [];
{
  const left = new Set(realistic);
  for (;;) {
    let best: { key: string; n: number; tie: number } | null = null;
    for (const k of left) {
      const d = one(k);
      const fresh = KEYS.filter((c) => !coveredBy[c] && isolation(d, c) >= ISO);
      const all = KEYS.filter((c) => isolation(d, c) >= ISO);
      // cover new candidates first, then rule out several at once
      const n = fresh.length * 10 + all.length;
      const tie = KEYS.reduce((s, c) => s + Math.min(isolation(d, c), 8), 0);
      if (!best || n > best.n || (n === best.n && tie > best.tie)) best = { key: k, n, tie };
    }
    if (!best || Math.floor(best.n / 10) === 0) break;
    const d = one(best.key);
    const fresh = KEYS.filter((c) => !coveredBy[c] && isolation(d, c) >= ISO);
    for (const c of fresh) coveredBy[c] = best.key;
    ranking.push({ key: best.key, realism: DISC[best.key].realism, score: r2(best.tie), decides: `rules out ${KEYS.filter((c) => isolation(d, c) >= ISO).join(", ")} (new: ${fresh.join(", ")})` });
    left.delete(best.key);
  }
  // the rest, by how much they isolate in total
  const rest = [...left].sort((a, b) => KEYS.reduce((s, c) => s + Math.min(isolation(one(b), c), 8), 0) - KEYS.reduce((s, c) => s + Math.min(isolation(one(a), c), 8), 0));
  for (const k of rest) {
    const d = one(k);
    const outs = KEYS.filter((c) => isolation(d, c) >= ISO);
    ranking.push({ key: k, realism: DISC[k].realism, score: r2(KEYS.reduce((s, c) => s + Math.min(isolation(d, c), 8), 0)), decides: outs.length ? `rules out ${outs.join(", ")} (all already covered)` : "isolates no candidate" });
  }
  for (const k of ["tips", "spike-square"]) {
    const d = one(k);
    const outs = KEYS.filter((c) => isolation(d, c) >= ISO);
    ranking.push({ key: k, realism: 1, score: r2(KEYS.reduce((s, c) => s + Math.min(isolation(d, c), 8), 0)), decides: `pathological; isolates ${outs.join(", ") || "none"}` });
  }
}
const uncovered = KEYS.filter((c) => !coveredBy[c]);
// the wedge's slope: how far each candidate moves the triangle per px of wedge depth
const wedgeAt = (depth: number) => {
  const l = lib(S);
  const tri = poly([[0, S / 2], [depth, 0], [depth, S]]);
  return row({ key: "wedge", kind: "discriminate", purpose: "", names: ["square", "square", "triangle"], shapes: [l.square, l.square, tri], gaps: [G, 0], m: 2, mode: "follow", ref: 0, s: S });
};
const wedgeSlopes = [14, 28, 42, 56].map((depth) => ({ depth, preds: predict(wedgeAt(depth)).preds, blind: predict(wedgeAt(depth)).blind }));

/** Where the moving shape first touches its neighbor: the contact gap of the moving pair is 0. */
function touchAt(d: Def) {
  const contact = CANDIDATES.find((c) => c.key === "contact")!.m;
  let [lo, hi] = [-200, 200];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (contact(...d.pairs(mid)[0]) < 0) lo = mid;
    else hi = mid;
  }
  return Math.ceil(hi * 2) / 2;
}
/** The slider's track: past every prediction on both sides, and a little past touching. */
function track(d: Def) {
  const { preds } = predict(d);
  const xs = Object.values(preds).filter((x) => x != null) as number[];
  const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
  const touch = touchAt(d);
  const v1 = Math.min(Math.ceil((hi + Math.max(0.45 * (hi - lo), 0.45 * d.s)) * 2) / 2, d.vmax);
  const base = Math.min(touch, lo);
  const v0 = Math.floor((base - 0.1 * (v1 - base)) * 2) / 2;
  const closeOk = xs.every((x) => Math.abs(x - touch) >= 3 * sdOf(d));
  return { lo, hi, v0, v1, touch, closeOk };
}

// --- the survey ----------------------------------------------------------------
// Core: the falsifying rows the ranking picked (realism 2 or 3), the
// wedge diagnostic, the star control, one scaled copy and, last, a mirrored
// repeat of the first row. Extended: the matched factor pairs and the rest,
// pathological rows labeled as such.
const falsifiers = ranking.filter((r) => r.decides.includes("(new:")).map((r) => r.key);
// the scaled copy: the core row whose 2x copy best separates the absolute cap from the relative one
const scaleSep = (k: string) => {
  const p = predict(scaledDef(k, 2));
  const [a, b] = [p.preds.pm3c, p.preds.pm3cRel];
  if (a == null || b == null || p.blind.pm3cRel) return 0;
  return (p.blind.pm3c ? Math.max(0, a - b) : Math.abs(a - b)) / ((1.5 * 2 * S) / S);
};
const coreRows = [...new Set([...falsifiers, "wedge"])];
const SCALE_OF = [...coreRows].sort((a, b) => scaleSep(b) - scaleSep(a))[0];
// the repeat: the first falsifier whose close start (shapes touching) is clear of every prediction
const REPEAT_OF = falsifiers.find((k) => track(one(k)).closeOk) ?? falsifiers[0];
// core: falsifiers, the diagnostic, the mixed-size pair, the star control, the scaled copy, the repeat last
const CORE: Def[] = [...coreRows.map(one), one("mixed-small"), one("stars"), scaledDef(SCALE_OF, 2), one("mixed-big"), mirrorDef(one(REPEAT_OF))];
const inCore = (k: string) => CORE.some((d) => d.key === k);
// extended: inversion and color pairs (each original before its copy), then the pathological row
const EXT: Def[] = [
  one("square-circle"),
  inverted(one("notch")),
  one("tip-circle"),
  inverted(one("square-circle")),
  withHue(one("notch"), 2), // the moving triangle colored
  withHue(one("tip-circle"), 1), // the fixed circle colored
  one("tips"),
].filter((d) => !inCore(d.key));
// a matched widget needs its original on the page, and ids must be unique
const ALL = [...CORE, ...EXT];
for (const d of ALL) if (d.of && !ALL.some((x) => x.key === d.of)) throw new Error(`${d.key} has no ${d.of}`);
if (new Set(ALL.map((d) => d.key)).size !== ALL.length) throw new Error("duplicate widget keys");

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
    fixed: d.items.filter((it) => !it.k).map((it) => ({ d: path(it), hue: it.hue })),
    moving: d.items.filter((it) => it.k).map((it) => ({ d: path(it), k: it.k, hue: it.hue })),
  };
};
// starts: the far start sits 40% of the track past the predictions, at
// least 8% from the end; the close start has the moving shape just touching
// its neighbor, never overlapping it. Sides alternate down the page, a matched
// widget starts on the side opposite its original, and a widget whose
// touching start would sit within 3 sd of a prediction starts far.
const side: Record<string, boolean> = {};
const widgets = [...CORE.map((d) => ({ d, tier: "core" })), ...EXT.map((d) => ({ d, tier: "extended" }))].map(({ d, tier }, i) => {
  const { preds, blind } = predict(d);
  const { lo, hi, v0, v1, touch, closeOk } = track(d);
  let far = d.of && d.of in side ? !side[d.of] : i % 2 === 0;
  if (!far && !closeOk) far = true;
  side[d.key] = far;
  const L = v1 - v0;
  const start = far ? Math.round(Math.min(hi + 0.4 * L, v1 - 0.08 * L) * 2) / 2 : touch;
  return {
    n: i + 1,
    key: d.key,
    tier,
    kind: d.kind,
    realism: realismOf(d.key),
    of: d.of,
    purpose: d.purpose,
    shapes: d.shapes,
    color: d.color,
    invert: !!d.invert,
    text: d.text,
    aria: d.aria,
    axis: "x",
    range: [v0, v1],
    touch: track(d).touch,
    start,
    side: far ? "far" : "close",
    sd: r2(sdOf(d)),
    preds,
    blind,
    ...draw(d, v0, v1),
    edge: d.edge,
  };
});
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../proposals/optical-spacing/");
const candidates = [...CANDIDATES.map(({ key, label }) => ({ key, label })), { key: "pm3cRel", label: relCap(S).label }];
const matrix = ALL.map((d) => ({ key: d.key, realism: realismOf(d.key), cells: Object.fromEntries(KEYS.map((c) => [c, cell(d, c)])), iso: Object.fromEntries(KEYS.map((c) => [c, r2(Math.min(isolation(d, c), 99))])) }));
const pool = Object.keys(DISC).map((k) => ({ key: k, realism: DISC[k].realism, ...predict(one(k)), sd: sdOf(one(k)) }));
const scales = Object.keys(DISC).map((k) => ({ key: k, sep2x: r2(scaleSep(k)), ...predict(scaledDef(k, 2)) }));
writeFileSync(OUT + "survey2_widgets.json", JSON.stringify({ candidates, ranking, coveredBy, uncovered, scaleOf: SCALE_OF, repeatOf: REPEAT_OF, wedgeSlopes, scales, matrix, pool, widgets }, null, 1));
console.log("covered", JSON.stringify(coveredBy), "uncovered", uncovered.join(","), "scale", SCALE_OF);
for (const r of matrix) console.log(`M ${r.key.padEnd(22)} r${r.realism} ` + KEYS.map((c) => `${c}:${r.cells[c]}(${r.iso[c]})`).join(" "));
for (const w of wedgeSlopes) console.log(`wedge ${w.depth}: ` + KEYS.map((c) => `${c} ${w.preds[c]}${w.blind[c] ? "+" : ""}`).join(", "));
for (const r of ranking) console.log(`rank ${r.key.padEnd(16)} r${r.realism} score ${r.score} | ${r.decides}`);
for (const w of widgets) {
  const ps = Object.entries(w.preds).map(([k, x]) => `${k} ${x == null ? "none" : x}${w.blind[k] ? "+" : ""}`);
  console.log(`w${w.n} ${w.tier.padEnd(8)} ${w.key.padEnd(20)} [${w.range}] start ${w.start} (${w.side}) | ${ps.join(", ")}`);
}
