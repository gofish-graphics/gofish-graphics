// SCRATCH: does neck change the outline?  DS=hyperedges BENCH=neck node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  ringsArea,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
const d = (DATA as any[]).find(
  (x) => x.id === (process.env.DS ?? "hyperedges")
);
d.sets.forEach((s: any, i: number) => {
  for (const neck of [1, 0.5, 0.1]) {
    const rings = unifiedOutline(s.members, {
      padding: d.padding,
      convexity: +(process.env.C ?? 0.5),
      neck,
      connected: true,
      holes: false,
      avoiding: [],
      clearance: d.clearance,
    });
    const L = (UNIFIED_STATS.linkMembers ?? []) as any[];
    console.log(
      `set ${i} neck ${neck} area ${ringsArea(rings).toFixed(0)} links ${L.length} ${L.map((l) => (l.kind === "segment" ? Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]).toFixed(1) : l.kind)).join(",")}`
    );
  }
});
