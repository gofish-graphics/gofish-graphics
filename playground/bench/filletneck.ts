// SCRATCH: Shape.fillet({ radius, neck }) checks. Per dataset, radius and neck: the pieces,
// the links, the sharpest convex turn (rastercheck.ts sharpest: over ±1 px; a horn's tip is
// near 180), the closing error against a raster closing of the padded members and links
// (rastercheck.ts closingError, both ways), and the area, which must not fall as neck grows.
//   BENCH=filletneck [DS=…] [RAST=0] node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  filletLinks,
  ringsArea,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import {
  closingError,
  sharpest,
} from "../../packages/gofish-graphics/scratch-bumps/fillet/rastercheck";
type Pt = [number, number];
const D = DATA as any[];
const ONLY = process.env.DS?.split(",") ?? [
  "chartaccent",
  "penguins",
  "bubble",
  "u",
  "hyperedges",
  "holes",
  "munkres",
];
const NECKS = (process.env.NECKS ?? "0,0.25,0.5,0.75,1").split(",").map(Number);
const RAST = process.env.RAST !== "0";
for (const d of D.filter((x) => ONLY.includes(x.id))) {
  const RS = process.env.RS
    ? process.env.RS.split(",").map(Number)
    : [...new Set([d.padding, 6, 8, 12])];
  for (const r of RS) {
    let prevA: number[] = [];
    let monotone = true;
    for (const neck of NECKS) {
      let pieces = 0,
        links = 0,
        turn = 0,
        turnAt = "",
        e1 = 0,
        e2 = 0,
        ms = 0;
      const areas: number[] = [];
      d.sets.forEach((s: any, si: number) => {
        const o = {
          padding: d.padding,
          shape: "fillet",
          radius: r,
          neck,
          holes: RAST,
        } as any;
        const t0 = performance.now();
        const rings = unifiedOutline(s.members, o) as Pt[][];
        ms += performance.now() - t0;
        const L = filletLinks(s.members, d.padding, r, neck);
        links += L.length;
        pieces += rings.filter((g) => {
          let a = 0;
          for (let i = 0; i < g.length; i++) {
            const p = g[i],
              q = g[(i + 1) % g.length];
            a += p[0] * q[1] - q[0] * p[1];
          }
          return a > 0;
        }).length;
        areas.push(ringsArea(rings));
        const sh = sharpest(rings);
        if (sh.deg > turn)
          [turn, turnAt] = [
            sh.deg,
            `set${si} (${sh.at[0].toFixed(1)},${sh.at[1].toFixed(1)})`,
          ];
        if (RAST) {
          const E = closingError(
            rings,
            [...s.members, ...L],
            d.padding,
            r,
            0.1,
            0.5
          );
          e1 = Math.max(e1, E.outToTrue);
          e2 = Math.max(e2, E.trueToOut);
          if (process.env.AT)
            console.log(
              `  set${si}: out→true ${E.outToTrue.toFixed(2)} at ${E.at1.map((v) => v.toFixed(1))}, true→out ${E.trueToOut.toFixed(2)} at ${E.at2.map((v) => v.toFixed(1))}`
            );
        }
      });
      if (prevA.length && areas.some((a, i) => a < prevA[i] - 1e-6))
        monotone = false;
      prevA = areas;
      console.log(
        `${d.id} r${r} neck ${neck}: ${pieces} pieces, ${links} links, sharpest ${turn.toFixed(1)}° at ${turnAt}` +
          (RAST
            ? `, closing err out→true ${e1.toFixed(3)} true→out ${e2.toFixed(3)}`
            : "") +
          `, area ${areas.reduce((a, b) => a + b, 0).toFixed(0)}, ${ms.toFixed(0)} ms`
      );
    }
    console.log(`${d.id} r${r}: area monotone in neck: ${monotone}`);
  }
}
