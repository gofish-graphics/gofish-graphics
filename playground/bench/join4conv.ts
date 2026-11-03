// SCRATCH: area along convexity at a finite join, per set and step (where does it fall?).
//   BENCH=join4conv node playground/bench.mjs   (DS=chartaccent JOIN=1.5 M=typical D=reach)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  ringsArea,
  UNIFIED_STATS,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

const d = (DATA as any[]).find(
  (x) => x.id === (process.env.DS ?? "chartaccent")
);
const join = +(process.env.JOIN ?? 1.5);
for (const s of d.sets) {
  let a0 = -Infinity;
  for (let k = 0; k <= 40; k++) {
    const c = k / 20;
    const r = unifiedOutline(s.members, {
      padding: d.padding,
      convexity: c,
      neck: 1,
      reach: join,
      reachMeasure: (process.env.M ?? "typical") as any,
      reachDistance: (process.env.D ?? "mutual") as any,
      means: "blend",
      avoiding: d.avoidDefault ? s.avoiding : [],
      clearance: d.clearance,
    });
    const a = ringsArea(r);
    console.log(
      `c ${c.toFixed(2)} area ${a.toFixed(0)} pieces ${UNIFIED_STATS.pieces} rings ${r.length}${a < a0 - 1 ? "  <-- FALL " + (a0 - a).toFixed(0) : ""}`
    );
    a0 = Math.max(a0, a);
  }
}
