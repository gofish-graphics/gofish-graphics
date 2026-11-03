// SCRATCH: one dataset with keep-outs on, area and rings along convexity.
//   BENCH=munk node playground/bench.mjs   (DS, SET, JOIN, CS=1.8,1.9, RAW=1)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  ringsArea,
  UNIFIED_STATS,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { signedArea2 } from "../../packages/gofish-graphics/src/ast/geometry/plane";

const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "munkres"));
const s = d.sets[+(process.env.SET ?? 0)];
for (const c of (process.env.CS ?? "1.8,1.85,1.9,1.95,2")
  .split(",")
  .map(Number)) {
  const r = unifiedOutline(s.members, {
    padding: d.padding,
    convexity: c,
    neck: 1,
    reach: +(process.env.JOIN ?? Infinity),
    reachMeasure: "typical",
    reachDistance: "mutual",
    means: "blend",
    clearance: d.clearance,
    avoiding: process.env.NOAVOID ? [] : s.avoiding,
    smooth: process.env.RAW ? null : undefined,
  } as any);
  console.log(
    c,
    ringsArea(r).toFixed(0),
    "fill",
    (UNIFIED_STATS.areaGot ?? 0).toFixed(0),
    "cut",
    (UNIFIED_STATS.areaCut ?? 0).toFixed(0),
    r.map((g) => `${g.length}:${(signedArea2(g) / 2).toFixed(0)}`).join(" ")
  );
}
