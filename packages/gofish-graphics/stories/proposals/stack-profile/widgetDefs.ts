// The eight "Set it yourself" widgets: their shapes, the moving position v,
// and the two compared gaps at each v. widgetRun.ts measures them with every
// model; fitRun.ts fits the power-mean family to the survey responses.
import { GLYPHS } from "./glyphOutlines";
import { TEST_ROWS, type Pt, type Shape } from "./spacingModels";
import { band, extX, extY, MODELS, S, transpose, type Band, type Wall } from "./widgetModels";

const [square, up, down] = TEST_ROWS[0];
const [circle, left] = TEST_ROWS[2];
const poly = (pts: Pt[]): Shape => ({ contours: [pts], holes: [false] });
const glyph = (word: string, i: number): Shape => {
  const g = GLYPHS.serif[word][i];
  // the traced contours repeat points (curve ends, the closing point); drop the repeats
  const same = (p: Pt, q: Pt) => p[0] === q[0] && p[1] === q[1];
  const contours = g.contours.map((c) => c.filter((p, i) => !same(p, c[(i + 1) % c.length]) as boolean) as Pt[]);
  return { contours, holes: g.holes };
};
const adv = (word: string, i: number) => GLYPHS.serif[word][i].adv;
const half = (x: number) => Math.round(x * 2) / 2;
const ints = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

export type Item = { sh: Shape; x: number; y: number; k?: number; cls?: string };
export type Pair = [Shape, number, Shape, number, Band];
export type Def = {
  title: string;
  aria: string;
  slider: string;
  axis: "x" | "y";
  fmt: "gap" | "shift";
  gap0?: number;
  grid: number[];
  start: number;
  items: Item[];
  edge: [number, number]; // chart coordinate of the moving edge at v = 0, and its rate
  pairs: (v: number) => [Pair, Pair];
  g0: number; // the widget's own scale of gap, for the dagger
  georgia?: boolean;
};

// ---------------------------------------------------------------------------
// 1. Square, A, V, A: the triangles 30 px apart on every line.
const xV = S + 30 - S / 2;
export const B0 = band(0, S);
const w1: Def = {
  title: "1. Square to triangles. The triangles are fixed 30 px apart.",
  aria: "A square and three triangles; the square moves",
  slider: "Square gap",
  axis: "x",
  fmt: "gap",
  grid: ints(0, 90),
  start: 60,
  items: [
    { sh: square, x: -S, y: 0, k: -1 },
    { sh: up, x: 0, y: 0 },
    { sh: down, x: xV, y: 0 },
    { sh: up, x: 2 * xV, y: 0 },
  ],
  edge: [0, -1],
  pairs: (v) => [
    [square, -S - v, up, 0, B0],
    [up, 0, down, xV, B0],
  ],
  g0: 30,
};

// 2. Circle, left triangle, square, the outer two 120 px apart.
const w2: Def = {
  title: "2. A triangle between a circle and a square, which are fixed.",
  aria: "A circle, a triangle and a square; the triangle moves",
  slider: "Tip gap",
  axis: "x",
  fmt: "gap",
  grid: ints(0, 64),
  start: 50,
  items: [
    { sh: circle, x: 0, y: 0 },
    { sh: left, x: S, y: 0, k: 1 },
    { sh: square, x: S + 120, y: 0 },
  ],
  edge: [S, 1],
  pairs: (v) => [
    [circle, 0, left, S + v, B0],
    [left, S + v, square, S + 120, B0],
  ],
  g0: 30,
};

// 3. Square, square 30 px apart, then a circle with the same gap on both sides.
const x3 = 2 * S + 30;
const w3: Def = {
  title: "3. A circle between squares. The left pair is fixed 30 px apart; the circle keeps the same gap on both sides.",
  aria: "Two squares, a circle and a square; the circle and the last square move",
  slider: "Circle gap",
  axis: "x",
  fmt: "gap",
  grid: ints(0, 60),
  start: 45,
  items: [
    { sh: square, x: 0, y: 0 },
    { sh: square, x: S + 30, y: 0 },
    { sh: circle, x: x3, y: 0, k: 1 },
    { sh: square, x: x3 + S, y: 0, k: 2 },
  ],
  edge: [x3, 1],
  pairs: (v) => [
    [square, S + 30, circle, x3 + v, B0],
    [square, 0, square, S + 30, B0],
  ],
  g0: 30,
};

// 4. An L whose notch opens up and right, a left triangle, a square.
const L = poly([
  [0, 0],
  [S, 0],
  [S, 20],
  [20, 20],
  [20, S],
  [0, S],
]);
const w4: Def = {
  title: "4. A triangle pointing into the notch of an L. The L and the square are fixed.",
  aria: "An L shape, a triangle and a square; the triangle moves",
  slider: "Tip gap",
  axis: "x",
  fmt: "gap",
  grid: ints(-16, 64),
  start: 50,
  items: [
    { sh: L, x: 0, y: 0 },
    { sh: left, x: S, y: 0, k: 1 },
    { sh: square, x: S + 120, y: 0 },
  ],
  edge: [S, 1],
  pairs: (v) => [
    [L, 0, left, S + v, B0],
    [left, S + v, square, S + 120, B0],
  ],
  g0: 30,
};

// 5. Georgia H H O H: the H pair at Georgia's own spacing, the O with the same gap on both sides.
const [H, O] = [glyph("HOH", 0), glyph("HOH", 1)];
const [aH, aO] = [half(adv("HOH", 0)), half(adv("HOH", 1))];
const bandHO = band(Math.min(extY(H)[0], extY(O)[0]), Math.max(extY(H)[1], extY(O)[1]));
const gapHH = aH + extX(H)[0] - extX(H)[1];
const g5 = ints(-40, 30).filter((v) => MODELS[1].m(H, aH, O, 2 * aH + v, bandHO) >= 0);
const w5: Def = {
  title: "5. Georgia, an O between stems. The first two H keep Georgia's own spacing; the O keeps the same gap on both sides.",
  aria: "The letters H H O H; the O and the last H move",
  slider: "O shift",
  axis: "x",
  fmt: "shift",
  grid: g5,
  start: 14,
  items: [
    { sh: H, x: 0, y: 0 },
    { sh: H, x: aH, y: 0 },
    { sh: O, x: 2 * aH, y: 0, k: 1 },
    { sh: H, x: 2 * aH + aO, y: 0, k: 2 },
  ],
  edge: [2 * aH + extX(O)[0], 1],
  pairs: (v) => [
    [H, aH, O, 2 * aH + v, bandHO],
    [H, 0, H, aH, bandHO],
  ],
  g0: half(gapHH),
  georgia: true,
};

// 6. Georgia L T A: the T's bar overhangs both neighbors.
const [GL, GT, GA] = [0, 1, 2].map((i) => glyph("LTA", i));
const [aL, aT] = [half(adv("LTA", 0)), half(adv("LTA", 1))];
const bandLTA = band(Math.min(...[GL, GT, GA].map((g) => extY(g)[0])), Math.max(...[GL, GT, GA].map((g) => extY(g)[1])));
const contactOk = (A: Shape, a: number, B: Shape, b: number) => MODELS[1].m(A, a, B, b, bandLTA) >= 0;
const g6 = ints(-40, 40).filter((v) => contactOk(GL, 0, GT, aL + v) && contactOk(GT, aL + v, GA, aL + aT));
const w6: Def = {
  title: "6. Georgia, a T between L and A, which are fixed at Georgia's own spacing.",
  aria: "The letters L T A; the T moves",
  slider: "T shift",
  axis: "x",
  fmt: "shift",
  grid: ints(g6[0], g6[g6.length - 1]),
  start: g6[g6.length - 1] - 3,
  items: [
    { sh: GL, x: 0, y: 0 },
    { sh: GT, x: aL, y: 0, k: 1 },
    { sh: GA, x: aL + aT, y: 0 },
  ],
  edge: [aL + extX(GT)[0], 1],
  pairs: (v) => [
    [GL, 0, GT, aL + v, bandLTA],
    [GT, aL + v, GA, aL + aT, bandLTA],
  ],
  g0: half(gapHH),
  georgia: true,
};

// 7. The airplane in a pill: its left inset against its top inset (12 px by the box).
const PLANE = poly(
  (
    [
      [48, 24], [45, 27], [28, 27], [18, 46], [13, 46], [17, 27], [7, 27], [3, 35], [0, 35], [2, 27],
      [2, 21], [0, 13], [3, 13], [7, 21], [17, 21], [13, 2], [18, 2], [28, 21], [45, 21],
    ] as Pt[]
  )
);
const [PCY, PR, PW] = [24, 34, 190];
const pillTop = (x: number) => (x < PR ? PCY + Math.sqrt(Math.max(0, PR * PR - (x - PR) ** 2)) : x > PW - PR ? PCY + Math.sqrt(Math.max(0, PR * PR - (x - PW + PR) ** 2)) : PCY + PR);
const steps = (lo: number, hi: number) => ints(0, Math.round((hi - lo) * 2)).map((i) => lo + i / 2);
const pill = poly([
  ...steps(0, PW).map((x) => [x, pillTop(x)] as Pt),
  ...steps(0, PW).reverse().map((x) => [x, 2 * PCY - pillTop(x)] as Pt),
]);
// The walls as the plane's scanlines see them: the outside of the pill across
// the plane's band. The box model measures to the pill's own box instead.
const withBox = (box: [number, number], pts: Pt[]): Wall => ({ ...poly(pts), box });
const [py0, py1] = extY(PLANE);
const leftWall: Wall = withBox([-20, 0], [
  ...steps(py0, py1).map((y) => [PR - Math.sqrt(PR * PR - (y - PCY) ** 2), y] as Pt),
  [-20, py1],
  [-20, py0],
]);
const [px0, px1] = extX(PLANE);
const top = new Map<number, [Shape, Shape]>();
const topPair = (v: number) => {
  if (!top.has(v)) {
    const plane = transpose({ contours: [PLANE.contours[0].map(([x, y]) => [x + v, y] as Pt)], holes: [false] });
    const wall: Wall = {
      ...transpose(poly([...steps(px0 + v, px1 + v).map((x) => [x, pillTop(x)] as Pt), [px1 + v, PCY + PR + 20], [px0 + v, PCY + PR + 20]])),
      box: [PCY + PR, PCY + PR + 20],
    };
    top.set(v, [plane, wall]);
  }
  return top.get(v)!;
};
const w7: Def = {
  title: "7. Padding: the airplane in a pill. Its top and bottom insets are fixed at 12 px; move it until its left inset looks the same.",
  aria: "An airplane icon inside a pill; the plane moves left and right",
  slider: "Left inset",
  axis: "x",
  fmt: "gap",
  grid: ints(2, 40),
  start: 32,
  items: [
    { sh: pill, x: 0, y: 0, cls: "sp-box" },
    { sh: PLANE, x: 0, y: 0, k: 1 },
  ],
  edge: [0, 1],
  pairs: (v) => {
    const [plane, wall] = topPair(v);
    return [
      [leftWall, 0, PLANE, v, band(py0, py1)],
      [plane, 0, wall, 0, band(px0 + v, px1 + v)],
    ];
  },
  g0: 12,
};

// 8. Three ridgeline densities stacked vertically; the middle one moves.
const gauss = (x: number, m: number, s: number) => Math.exp(-(((x - m) / s) ** 2) / 2);
const density = (f: (x: number) => number) => {
  const xs = steps(0, 200).filter((_, i) => i % 4 === 0).filter((x) => f(x) >= 0.3);
  return poly([[xs[0], 0], ...xs.map((x) => [x, f(x)] as Pt), [xs[xs.length - 1], 0]]);
};
const ridges = [
  density((x) => 34 * gauss(x, 58, 20) + 7 * gauss(x, 140, 26)),
  density((x) => 20 * gauss(x, 72, 18) + 26 * gauss(x, 146, 16)),
  density((x) => 28 * gauss(x, 125, 34)),
];
const [rB, rM, rT] = ridges.map(transpose);
const Mb = Math.ceil(extY(ridges[0])[1] * 2) / 2;
const Tb = Mb + Math.ceil(extY(ridges[1])[1] * 2) / 2 + 48;
const bandR = band(Math.min(...ridges.map((r) => extX(r)[0])), Math.max(...ridges.map((r) => extX(r)[1])));
const w8: Def = {
  title: "8. Vertical: three densities stacked like a ridgeline. The bottom and top are fixed; move the middle one up and down.",
  aria: "Three density curves stacked vertically; the middle one moves",
  slider: "Gap below",
  axis: "y",
  fmt: "gap",
  gap0: Mb - extY(ridges[0])[1],
  grid: ints(0, 48),
  start: 40,
  items: [
    { sh: ridges[0], x: 0, y: 0 },
    { sh: ridges[1], x: 0, y: Mb, k: 1 },
    { sh: ridges[2], x: 0, y: Tb },
  ],
  edge: [Mb, 1],
  pairs: (v) => [
    [rB, 0, rM, Mb + v, bandR],
    [rM, Mb + v, rT, Tb, bandR],
  ],
  g0: 24,
};

export const DEFS = [w1, w2, w3, w4, w5, w6, w7, w8];
// Widget 7 (padding against the pill's wall) is dropped from the page, the
// fits and the rankings: Josh judged it too noisy and a different problem.
// Ids stay 1 to 8 so saved survey results, which have a w7 line, still parse.
export const DROPPED = new Set([7]);
export { square };
