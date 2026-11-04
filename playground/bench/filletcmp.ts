// SCRATCH: the fillet without nearLinks: the true exact closing, and the closing per piece
// (pieces = the true closing's components, each closed again on its own members, repeated
// until no piece splits). Sharpest convex turn per dataset and radius, and SVGs to OUTDIR.
//   BENCH=filletcmp OUTDIR=… node playground/bench.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import DATA from "../src/datasets.json";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import {
  pointInRing,
  signedArea2,
} from "../../packages/gofish-graphics/src/ast/geometry/plane";
import { sharpest } from "../../packages/gofish-graphics/scratch-bumps/fillet/rastercheck";

type Pt = [number, number];
const inside = (m: any): Pt =>
  m.kind === "disc"
    ? [m.cx, m.cy]
    : m.kind === "segment"
      ? m.a
      : [m.x + m.w / 2, m.y + m.h / 2];
function perPiece(M: any[], pad: number, r: number): Pt[][] {
  let todo: any[][] = [M];
  const out: Pt[][] = [];
  while (todo.length) {
    const X = todo.pop()!;
    const C = closingRings(X, pad, r) as Pt[][];
    const outer = C.filter((g) => signedArea2(g) > 0);
    if (outer.length <= 1) {
      out.push(...C);
      continue;
    }
    const groups = outer.map(() => [] as any[]);
    for (const m of X) {
      const k = outer.findIndex((g) => pointInRing(inside(m), g));
      groups[k < 0 ? 0 : k].push(m);
    }
    const parts = groups.filter((g) => g.length);
    if (parts.length === 1) {
      out.push(...C);
      continue;
    }
    todo.push(...parts);
  }
  return out;
}
const f2 = (v: number) => v.toFixed(2);
const pathOf = (rings: Pt[][]) =>
  rings
    .map((l) => "M" + l.map((p) => `${f2(p[0])},${f2(p[1])}`).join("L") + "Z")
    .join("");
const dir = process.env.OUTDIR!;
mkdirSync(dir, { recursive: true });
for (const [ds, rs] of [
  ["bubble", [4, 8]],
  ["chartaccent", [6, 12]],
  ["penguins", [6, 12]],
] as [string, number[]][]) {
  const d = (DATA as any[]).find((x) => x.id === ds);
  for (const r of rs)
    for (const [name, fn] of [
      ["true", (M: any[]) => closingRings(M, d.padding, r) as Pt[][]],
      ["perpiece", (M: any[]) => perPiece(M, d.padding, r)],
    ] as const) {
      let g = "",
        worst = 0,
        cusps = 0;
      const t0 = performance.now();
      for (const s of d.sets) {
        const rings = fn(s.members);
        for (const ring of rings) {
          const w = sharpest([ring]).deg;
          worst = Math.max(worst, w);
          if (w > 60) cusps++;
        }
        const P = s.paint;
        g += `<path transform="matrix(1 0 0 ${s.T[2]} ${s.T[0]} ${s.T[1]})" d="${pathOf(rings)}" fill="${P.fill}" fill-opacity="${P.fillOpacity}" stroke="${P.stroke}" stroke-width="${Math.max(1, P.strokeWidth)}"/>`;
      }
      const ms = performance.now() - t0;
      console.log(
        `${ds} r${r} ${name}: sharpest ${worst.toFixed(0)}°, rings with a turn > 60°: ${cusps}, ${ms.toFixed(0)} ms`
      );
      const vb = [-10, -10, d.width + 20, d.height + 20];
      writeFileSync(
        `${dir}/${ds}-r${r}-${name}.svg`,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="${vb[2] * 2}" height="${vb[3] * 2}"><rect x="-10" y="-10" width="${vb[2]}" height="${vb[3]}" fill="#fff"/>${g}${d.scenery}</svg>`
      );
    }
}
