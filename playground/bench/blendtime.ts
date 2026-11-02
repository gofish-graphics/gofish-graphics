// SCRATCH: per-bay blend timings, grid vs mesh, JIT warmed first (a full pass over every
// dataset with both solvers), then per dataset: cold = the first call per set after the cache
// is cleared (best of REP), warm = the median call over a 0.01-step drag of c, without and
// with the default smoothing.   BENCH=blendtime node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_PROTOTYPE,
  clearUnifiedCache,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

const REP = +(process.env.REP ?? 3);
const call = (d: any, s: any, c: number, smooth: boolean) =>
  unifiedOutline(s.members, {
    padding: d.padding,
    convexity: c,
    neck: 1,
    holes: false,
    means: "blend",
    ...(smooth ? {} : { smooth: null }),
  });
const med = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1];
for (const solver of ["grid", "mesh"] as const) {
  UNIFIED_PROTOTYPE.blend = solver;
  clearUnifiedCache();
  for (const d of DATA as any[]) for (const s of d.sets) call(d, s, 0.4, true);
}
const rows = [
  "| dataset | sets | cold ms per set, grid | cold, mesh | warm ms per call, grid | warm, mesh | smoothing ms per call, grid | smoothing, mesh |",
  "|---|---|---|---|---|---|---|---|",
];
for (const d of DATA as any[]) {
  const r: Record<string, number[]> = {};
  for (const solver of ["grid", "mesh"] as const) {
    UNIFIED_PROTOTYPE.blend = solver;
    const colds: number[] = [];
    d.sets.forEach((s: any) => {
      let best = Infinity;
      for (let k = 0; k < REP; k++) {
        clearUnifiedCache();
        const t = performance.now();
        call(d, s, 0.5, false);
        best = Math.min(best, performance.now() - t);
      }
      colds.push(best);
    });
    const raw: number[] = [],
      sm: number[] = [];
    d.sets.forEach((s: any) => {
      call(d, s, 0.5, false);
      for (let k = 1; k < 100; k++) {
        let t = performance.now();
        call(d, s, k / 100, false);
        raw.push(performance.now() - t);
        t = performance.now();
        call(d, s, k / 100, true);
        sm.push(performance.now() - t);
      }
    });
    const mr = med(raw.slice());
    r[solver] = [
      colds.reduce((a, b) => a + b, 0) / colds.length,
      Math.max(...colds),
      mr,
      med(sm.slice()) - mr,
    ];
  }
  const f = (x: number) => x.toFixed(1);
  rows.push(
    `| ${d.id} | ${d.sets.length} | ${f(r.grid[0])} (max ${f(r.grid[1])}) | ${f(r.mesh[0])} (max ${f(r.mesh[1])}) | ${f(r.grid[2])} | ${f(r.mesh[2])} | ${f(r.grid[3])} | ${f(r.mesh[3])} |`
  );
  console.error(rows.at(-1));
}
console.log(rows.join("\n"));
