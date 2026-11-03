// SCRATCH: where a join drag step spends its time (penguins by default).
//   DS=penguins BENCH=joinprof node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  clearUnifiedCache,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { SEPARATE_STATS } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/separate";

const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "penguins"));
const c = +(process.env.C ?? 0.25);
clearUnifiedCache();
for (const join of [4, 4.3, 4.6, 5, 5.3, 16, 17, 18]) {
  const parts: string[] = [];
  let tot = 0;
  for (const s of d.sets) {
    const t0 = performance.now();
    unifiedOutline(s.members, {
      padding: d.padding,
      convexity: c,
      neck: d.story?.neck ?? 1,
      reach: join,
      means: "blend",
      avoiding: [],
    });
    const ms = performance.now() - t0;
    tot += ms;
    const S = UNIFIED_STATS;
    parts.push(
      `${S.pieces}p ${ms.toFixed(0)}ms (links ${S.msLinks!.toFixed(0)} fill ${S.msClose!.toFixed(0)} [apart ${S.msSeparate!.toFixed(0)}${S.msSeparate ? `, evals ${SEPARATE_STATS.evals}/${SEPARATE_STATS.nodes}` : ""}] smooth ${S.msSmooth!.toFixed(0)} cached ${S.msCached!.toFixed(0)})`
    );
  }
  console.log(`join ${join}: ${tot.toFixed(0)} ms · ${parts.join(" | ")}`);
}
