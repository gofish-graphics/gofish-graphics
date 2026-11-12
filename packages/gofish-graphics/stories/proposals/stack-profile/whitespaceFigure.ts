// The "Whitespace as one region" figure on the optical spacing page:
// `node_modules/.bin/tsx stories/proposals/stack-profile/whitespaceFigure.ts`
// writes /tmp/whitespace-regions.svg and prints the numbers; the PNG is made
// from the SVG with a headless browser. It draws survey 2's notch row
// (square, L, triangle) with the triangle at Josh's answer, v = 20.5.
import { writeFileSync } from "node:fs";
import type { Pt, Shape } from "./spacingModels";
import { band, gapProfileK, powerMean } from "./widgetModels";

const S = 56;
const G = 30;
const V = 20.5; // Josh's answer: the box gap from the L to the triangle
const poly = (pts: Pt[]): Shape => ({ contours: [pts], holes: [false] });
const square = poly([[0, 0], [S, 0], [S, S], [0, S]]);
const T = 0.2 * S; // the L's legs
const L = poly([[0, 0], [S, 0], [S, T], [T, T], [T, S], [0, S]]);
const tri = poly([[0, S / 2], [S, 0], [S, S]]); // tip points left

const xSq = 0;
const xL = S + G;
const xTri = (v: number) => xL + S + v;
// facing outlines on line y
const lRight = (y: number) => xL + (y < T ? S : T);
const hullRight = (y: number) => xL + (y < T ? S : S - (y - T)); // the hull's diagonal from (S, T) to (T, S)
const triLeft = (y: number, v = V) => xTri(v) + 2 * Math.abs(y - S / 2);

// the strategies' placements: where each makes the L-to-triangle gap measure 30, like the square-to-L gap
const tv = band(0, S);
const place = (m: (v: number) => number) => {
  let [lo, hi] = [-80, 120];
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (m(mid) < G) lo = mid;
    else hi = mid;
  }
  return +((lo + hi) / 2).toFixed(1);
};
const at = (k: number, p: number) => (v: number) => powerMean(gapProfileK(L, xL, tri, xTri(v), tv, k), p);
const PLACE = {
  box: G,
  contact: place(at(0, -Infinity)),
  hull: place(at(1, -8)),
  mean: place(at(0, 1)),
  partial: place(at(0.5, -8)),
};

// areas at Josh's answer, by summing thin lines
const integrate = (f: (y: number) => number) => {
  let s = 0;
  const n = 5600;
  for (let i = 0; i < n; i++) s += f(((i + 0.5) * S) / n) * (S / n);
  return Math.round(s);
};
const AREA = {
  region: integrate((y) => triLeft(y) - lRight(y)),
  counter: integrate((y) => hullRight(y) - lRight(y)),
  gap: integrate((y) => triLeft(y) - hullRight(y)),
  ref: G * S,
};
// contact: the narrowest line
let narrow = { y: 0, w: Infinity };
for (let i = 0; i <= 5600; i++) {
  const y = (i * S) / 5600;
  const w = triLeft(y) - lRight(y);
  if (w < narrow.w) narrow = { y, w };
}

// --- drawing ---------------------------------------------------------------------
const INK = "#1f2328";
const MUTED = "#6a6f76";
const BLUE = "#4e79a7";
const ORANGE = "#f28e2b";
const r1 = (x: number) => +x.toFixed(1);
const ys = (() => {
  const out: number[] = [];
  for (let i = 0; i <= 112; i++) out.push((i * S) / 112);
  out.push(T, T - 1e-6, S / 2);
  return [...new Set(out)].sort((a, b) => a - b);
})();
/** A drawing of shape space, x from x0, scale k, with y up, placed at (ox, oy) (oy is the baseline). */
function view(ox: number, oy: number, x0: number, k: number) {
  const X = (x: number) => r1(ox + (x - x0) * k);
  const Y = (y: number) => r1(oy - y * k);
  const shape = (sh: Shape, dx: number) => `<path d="${sh.contours.map((c) => "M" + c.map(([x, y]) => `${X(x + dx)} ${Y(y)}`).join("L") + "Z").join("")}" fill="${INK}"/>`;
  // the region between two edges, over lines y0..y1
  const between = (left: (y: number) => number, right: (y: number) => number, fill: string, op: number, y0 = 0, y1 = S) => {
    const yy = ys.filter((y) => y >= y0 && y <= y1);
    const pts = [...yy.map((y) => `${X(left(y))} ${Y(y)}`), ...yy.reverse().map((y) => `${X(right(y))} ${Y(y)}`)];
    return `<path d="M${pts.join("L")}Z" fill="${fill}" fill-opacity="${op}"/>`;
  };
  const dashed = (pts: Pt[]) => `<path d="M${pts.map(([x, y]) => `${X(x)} ${Y(y)}`).join("L")}" fill="none" stroke="${MUTED}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  return { X, Y, shape, between, dashed };
}
const text = (x: number, y: number, s: string, size = 14, o: { fill?: string; anchor?: string; weight?: number } = {}) =>
  `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? "start"}"${o.weight ? ` font-weight="${o.weight}"` : ""}>${s}</text>`;
const lines = (x: number, y: number, ss: string[], size = 14, o = {}) => ss.map((s, i) => text(x, y + i * size * 1.3, s, size, o)).join("");
const swatch = (x: number, y: number, fill: string, op: number) => `<rect x="${x}" y="${y - 11}" width="14" height="14" rx="2" fill="${fill}" fill-opacity="${op}"/>`;

const W = 1560;
const parts: string[] = [];
// panel 1: the whole row, the reference region and the region being matched
{
  const k = 1.75;
  const ox = 30;
  const oy = 190;
  const v = view(ox, oy, 0, k);
  parts.push(lines(30, 36, ["The whitespace between the L and the", "triangle, as one region"], 17, { weight: 600 }));
  parts.push(v.between(() => xSq + S, () => xL, MUTED, 0.3));
  parts.push(v.between(lRight, (y) => triLeft(y), BLUE, 0.45));
  parts.push(v.shape(square, xSq), v.shape(L, xL), v.shape(tri, xTri(V)));
  parts.push(swatch(30, 240, MUTED, 0.3), text(52, 240, `Reference, square to L: 30 × 56 = ${AREA.ref} px²`));
  parts.push(swatch(30, 266, BLUE, 0.45), text(52, 266, `L to triangle at Josh's answer: ${AREA.region} px²`));
  parts.push(
    lines(30, 304, [
      "Shaded here: all the white between the facing",
      "outlines, over the band the shapes share. Its",
      `area is ${(AREA.region / AREA.ref).toFixed(1)} times the reference's, so Josh did`,
      "not match this whole region. Where it ends,",
      "inside the notch and above and below the",
      "triangle's tip, is the open question.",
    ], 14, { fill: MUTED })
  );
}
// panel 2: the region split at the L's hull
{
  const k = 2.3;
  const ox = 545;
  const oy = 190;
  const v = view(ox, oy, xL, k);
  parts.push(lines(545, 36, ["The same region, split two ways"], 17, { weight: 600 }));
  parts.push(v.between(lRight, hullRight, ORANGE, 0.55));
  parts.push(v.between(hullRight, (y) => triLeft(y), BLUE, 0.45));
  parts.push(v.shape(L, xL), v.shape(tri, xTri(V)));
  parts.push(v.dashed([[xL + S, 0], [xL + S, T], [xL + T, S], [xL, S]]));
  parts.push(v.dashed([[xTri(V), S / 2], [xTri(V) + S, 0]]));
  parts.push(swatch(545, 240, ORANGE, 0.55), lines(567, 240, [`counter: white that belongs to the L's own`, `outline (inside its convex hull), ${AREA.counter} px²`]));
  parts.push(swatch(545, 290, BLUE, 0.45), lines(567, 290, [`gap: white between the two shapes'`, `outlines (between the hulls), ${AREA.gap} px²`]));
  parts.push(lines(545, 340, ["Dashed: the convex hulls. The triangle is", "convex, so its hull is its own outline."], 14, { fill: MUTED }));
}
// panel 3: what each strategy counts
{
  parts.push(lines(1020, 36, ["What each strategy counts"], 17, { weight: 600 }));
  const k = 1.15;
  const cells: { name: string; draw: (v: ReturnType<typeof view>) => string; counts: string; at: number }[] = [
    { name: "box", counts: "the gap between bounding boxes", at: PLACE.box, draw: (v) => v.between(() => xL + S, () => xTri(V), BLUE, 0.45) },
    {
      name: "contact",
      counts: "only the narrowest line",
      at: PLACE.contact,
      draw: (v) => `<line x1="${v.X(lRight(narrow.y))}" y1="${v.Y(narrow.y)}" x2="${v.X(triLeft(narrow.y))}" y2="${v.Y(narrow.y)}" stroke="${BLUE}" stroke-width="3"/>`,
    },
    { name: "hull", counts: "the gap only", at: PLACE.hull, draw: (v) => v.between(hullRight, (y) => triLeft(y), BLUE, 0.45) },
    { name: "mean (area)", counts: "the whole region", at: PLACE.mean, draw: (v) => v.between(lRight, (y) => triLeft(y), BLUE, 0.45) },
    {
      name: "partial hull",
      counts: "the gap plus half the counter",
      at: PLACE.partial,
      draw: (v) => v.between((y) => (lRight(y) + hullRight(y)) / 2, (y) => triLeft(y), BLUE, 0.45),
    },
  ];
  cells.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 1020 + col * 270;
    const base = 130 + row * 160;
    const v = view(x, base, xL, k);
    parts.push(c.draw(v), v.shape(L, xL), v.shape(tri, xTri(V)));
    parts.push(`<text x="${x}" y="${base + 22}" font-size="13" fill="${INK}"><tspan font-weight="600" font-size="14">${c.name}</tspan>: ${c.counts}</text>`);
    parts.push(text(x, base + 40, `places the triangle at ${String(c.at).replace("-", "−")}`, 13, { fill: MUTED }));
  });
  parts.push(lines(1290, 490, ["Josh set it at 20.5.", "v is the box gap from the L,", "with the square-to-L gap 30."], 13, { fill: MUTED }));
}
const H = 560;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, system-ui, -apple-system, sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>${parts.join("")}</svg>`;
writeFileSync("/tmp/whitespace-regions.svg", svg);
console.log(JSON.stringify({ PLACE, AREA, narrow }));
