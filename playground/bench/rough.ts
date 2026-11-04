// SCRATCH: fillet vertex spacing and chord error. Per dataset and radius: the longest segment,
// the largest chord error (|f| at each segment's midpoint against the raster closing, f of
// rastercheck.ts) and at the vertices.   BENCH=rough node playground/bench.mjs
import DATA from "../src/datasets.json";
import { unifiedOutline } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { rasterClosing } from "../../packages/gofish-graphics/scratch-bumps/fillet/rastercheck";
type Pt = [number, number];
const D = DATA as any[];
const ONLY = process.env.DS?.split(",") ?? [
  "bubble",
  "penguins",
  "chartaccent",
];
const OPT = process.env.OPT ? JSON.parse(process.env.OPT) : {};
for (const d of D.filter((x) => ONLY.includes(x.id))) {
  for (const r of [0, d.padding, 8, 12]) {
    let segMax = 0,
      midErr = 0,
      vErr = 0,
      n = 0,
      at = "";
    d.sets.forEach((s: any, si: number) => {
      const rings = unifiedOutline(s.members, {
        padding: d.padding,
        shape: "fillet",
        radius: r,
        ...OPT,
      } as any) as Pt[][];
      const R = rasterClosing(s.members, d.padding, r, 0.05);
      for (const ring of rings)
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          n++;
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          segMax = Math.max(segMax, L);
          const e = Math.abs(R.f((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
          if (e > midErr)
            [midErr, at] = [
              e,
              `set${si} (${a[0].toFixed(1)},${a[1].toFixed(1)}) len ${L.toFixed(1)}`,
            ];
          vErr = Math.max(vErr, Math.abs(R.f(a[0], a[1])));
        }
    });
    console.log(
      `${d.id} r${r}: ${n} vertices, longest seg ${segMax.toFixed(2)}, max midpoint err ${midErr.toFixed(3)} at ${at}, max vertex err ${vErr.toFixed(3)}`
    );
  }
}
