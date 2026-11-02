// SCRATCH: penguins set 0, lake at small r: which hole rings the open closing has, their area
// and whether their interior point is inside the filled spine.   BENCH=lakedbg node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  nearLinks,
  ringsArea,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { pointInRing } from "../../packages/gofish-graphics/src/ast/geometry/plane";
import {
  unifiedOutline,
  UNIFIED_STATS,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
setTimeout(() => {
  for (const c of [0, 0.01, 0.02]) {
    const rings = unifiedOutline(s.members, {
      padding: pad,
      convexity: c,
      neck: 1,
      smooth: null,
      means: "radius",
      seal: "lake",
    });
    console.log(
      `lake c ${c} r ${UNIFIED_STATS.radius?.toFixed(2)} rings ${rings.map((g) => ringsArea([g]).toFixed(0)).join(",")}`
    );
  }
});
const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "penguins"));
const s = d.sets[+(process.env.SET ?? 0)];
const pad = d.padding;
const all = [...s.members, ...nearLinks(s.members, pad, Infinity, 1)];
const fs = closingRings(all, pad, pad, false);
console.log(
  `filled spine rings ${fs.length} areas ${fs.map((r) => ringsArea([r]).toFixed(0))}`
);
for (const r of [pad, pad + 0.05, pad + 0.3, pad + 1]) {
  const open = closingRings(all, pad, r, true);
  console.log(
    `r ${r.toFixed(2)} rings ${open.map((g) => ringsArea([g]).toFixed(0)).join(",")}`
  );
  for (const g of open.filter((g) => ringsArea([g]) < 0)) {
    const p = g[0];
    console.log(
      `  hole ${ringsArea([g]).toFixed(0)} at ${p.map((v) => v.toFixed(1))} in filled spine (vertex) ${fs.some((B) => pointInRing(p, B))}`
    );
  }
}
