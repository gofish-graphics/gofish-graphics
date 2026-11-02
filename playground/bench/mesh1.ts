// SCRATCH: per-bay blend, mesh vs grid: one call per dataset/set at a few c, times and stats.
//   BENCH=mesh1 node playground/bench.mjs   (ONLY=chartaccent)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  UNIFIED_PROTOTYPE,
  clearUnifiedCache,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
const ONLY = process.env.ONLY?.split(",");
const SOLVERS = (process.env.SOLVERS ?? "grid,mesh").split(",") as (
  | "grid"
  | "mesh"
)[];
for (const d of DATA as any[]) {
  if (ONLY && !ONLY.includes(d.id)) continue;
  for (const solver of SOLVERS) {
    UNIFIED_PROTOTYPE.blend = solver;
    clearUnifiedCache();
    d.sets.forEach((s: any, si: number) => {
      const out: string[] = [];
      for (const c of [0.25, 0.5, 0.75]) {
        const t0 = performance.now();
        unifiedOutline(s.members, {
          padding: d.padding,
          convexity: c,
          neck: 1,
          holes: process.env.HOLES === "1",
          means: "blend",
          smooth: null,
        });
        const ms = performance.now() - t0;
        out.push(
          `c${c}: ${ms.toFixed(1)}ms (cached ${UNIFIED_STATS.msCached!.toFixed(0)}, call ${UNIFIED_STATS.msGrid!.toFixed(1)}) A ${UNIFIED_STATS.areaGot!.toFixed(0)}`
        );
      }
      console.log(
        `${d.id}[${si}] ${solver}: ${out.join(" | ")}${solver === "mesh" ? " " + JSON.stringify(UNIFIED_STATS.meshBlend, (k, v) => (typeof v === "number" ? +v.toFixed(1) : v)) : ""}`
      );
    });
  }
}
