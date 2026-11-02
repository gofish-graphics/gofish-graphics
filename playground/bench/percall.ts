// SCRATCH: per-call time and areas across c for one dataset and mode.
//   BENCH=percall DS=u MEANS=radius SEAL=lid node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  ringsArea,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "u"));
const s = d.sets[+(process.env.SET ?? 0)];
const cs = (process.env.C ?? "0.5,0.9,0.95,0.97,0.98,0.99,1")
  .split(",")
  .map(Number);
for (const c of cs) {
  const t0 = performance.now();
  const rings = unifiedOutline(s.members, {
    padding: d.padding,
    convexity: c,
    neck: 1,
    means: (process.env.MEANS ?? "radius") as any,
    seal: (process.env.SEAL ?? "jump") as any,
  });
  console.log(
    `c ${c} ms ${(performance.now() - t0).toFixed(1)} (close ${UNIFIED_STATS.msClose?.toFixed(1)} grid ${UNIFIED_STATS.msGrid?.toFixed(1)} smooth ${UNIFIED_STATS.msSmooth?.toFixed(1)} cached ${UNIFIED_STATS.msCached?.toFixed(1)}) r ${UNIFIED_STATS.radius?.toFixed(2)} pre ${UNIFIED_STATS.areaGot?.toFixed(1)} post ${ringsArea(rings).toFixed(1)} rings ${rings.length}`
  );
}
