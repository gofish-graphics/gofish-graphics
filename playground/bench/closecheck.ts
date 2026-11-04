// SCRATCH: the exact closing of a set's members and fillet links (one closing, no pieces)
// against the raster closing.   DS=… R=… NECK=… BENCH=closecheck node playground/bench.mjs
import DATA from "../src/datasets.json";
import { filletLinks } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { closingError } from "../../packages/gofish-graphics/scratch-bumps/fillet/rastercheck";
const d = (DATA as any[]).find((x) => x.id === process.env.DS);
const r = +process.env.R!,
  neck = +process.env.NECK!;
d.sets.forEach((s: any, si: number) => {
  const L = filletLinks(s.members, d.padding, r, neck);
  const all = [...s.members, ...L];
  const E = closingError(
    closingRings(all, d.padding, r, true) as any,
    all,
    d.padding,
    r,
    0.1,
    0.5
  );
  console.log(
    `set${si}: ${L.length} links, out→true ${E.outToTrue.toFixed(3)} at ${E.at1.map((v) => v.toFixed(1))}, true→out ${E.trueToOut.toFixed(3)} at ${E.at2.map((v) => v.toFixed(1))}`
  );
});
