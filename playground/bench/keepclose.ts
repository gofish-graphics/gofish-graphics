// SCRATCH: the time of the exact closing of every set's keep-out discs by a small disc.
//   BENCH=keepclose node playground/bench.mjs
import DATA from "../src/datasets.json";
import { keepOuts } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
for (const d of (DATA as any[]).filter((x) => x.avoidable))
  d.sets.forEach((s: any, si: number) => {
    const K = keepOuts(s.avoiding, d.clearance);
    for (const rho of [3, 6]) {
      const t0 = performance.now();
      const R = closingRings(
        K.map((k) => ({ kind: "disc", cx: k.c[0], cy: k.c[1], r: k.R })) as any,
        0,
        rho,
        true
      );
      console.log(
        `${d.id} set${si}: ${K.length} discs, rho ${rho}: ${R.length} rings, ${(performance.now() - t0).toFixed(1)} ms`
      );
    }
  });
