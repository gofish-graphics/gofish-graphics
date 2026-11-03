// SCRATCH: the slow steps of a first join drag (typical × reach, c 0.5): per step over SLOW ms,
// each set's pieces and where its time went.   BENCH=join4prof node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  clearUnifiedCache,
  UNIFIED_STATS as S,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "penguins"));
const SLOW = +(process.env.SLOW ?? 40);
const JOINS = [
  Infinity,
  ...Array.from(
    { length: 99 },
    (_, k) => +(0.05 * 2 ** ((98 - k) / 12)).toFixed(3)
  ),
  0,
];
clearUnifiedCache();
for (const join of JOINS) {
  const t0 = performance.now();
  const parts: string[] = [];
  for (const s of d.sets) {
    const t1 = performance.now();
    unifiedOutline(s.members, {
      padding: d.padding,
      convexity: 0.5,
      neck: 1,
      join,
      joinMeasure: "typical",
      joinDistance: "reach",
      means: "blend",
      avoiding: d.avoidDefault ? s.avoiding : [],
      clearance: d.clearance,
    });
    parts.push(
      `${S.pieces}p ${(performance.now() - t1).toFixed(0)}ms [links ${S.msLinks!.toFixed(0)} fill ${S.msClose!.toFixed(0)} (apart ${S.msSeparate!.toFixed(0)}) smooth ${S.msSmooth!.toFixed(0)} cached ${S.msCached!.toFixed(0)}]`
    );
  }
  const ms = performance.now() - t0;
  if (ms > SLOW)
    console.log(`join ${join}: ${ms.toFixed(0)} ms: ${parts.join(" | ")}`);
}
