// SCRATCH: hyperedges: per set, chosen r and area across convexity.  BENCH=hyper node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  ringsArea,
  nearLinks,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
const d = (DATA as any[]).find((x) => x.id === "hyperedges");
d.sets.forEach((s: any, i: number) => {
  console.log(
    `set ${i} stroke ${s.paint.stroke} members ${s.members.length} kinds ${[...new Set(s.members.map((m: any) => m.kind))]}`
  );
  for (const c of [0.15, 0.18, 0.19, 0.2, 0.205, 0.21, 0.22, 0.25, 0.3]) {
    const rings = unifiedOutline(s.members, {
      padding: d.padding,
      convexity: c,
      neck: 1,
      connected: true,
      holes: false,
      avoiding: [],
      clearance: d.clearance,
    });
    console.log(
      `  c ${c} r ${UNIFIED_STATS.radius?.toFixed(2)} area ${ringsArea(rings).toFixed(0)} rings ${rings.length}`
    );
  }
});
const s = d.sets[+(process.env.SET ?? 1)];
const all = [...s.members, ...nearLinks(s.members, d.padding, Infinity, 1)];
for (const r of (process.env.R ?? "").split(",").filter(Boolean).map(Number)) {
  const open = closingRings(all, d.padding, r, true);
  console.log(
    `r ${r} filled ${ringsArea(closingRings(all, d.padding, r, false)).toFixed(0)} open ${ringsArea(open).toFixed(0)} holes ${open.filter((g) => ringsArea([g]) < 0).length}`
  );
}
