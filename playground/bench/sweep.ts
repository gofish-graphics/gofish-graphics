// SCRATCH: r and the exact closed-area share over a range of c for one set, bisection beside
// filtration (unsmoothed).   BENCH=sweep DS=u SET=0 FROM=0 TO=1 STEP=0.05 node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  UNIFIED_PROTOTYPE,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "u"));
const s = d.sets[+(process.env.SET ?? 0)];
const pad = d.padding;
const from = +(process.env.FROM ?? 0),
  to = +(process.env.TO ?? 1),
  step = +(process.env.STEP ?? 0.05);
UNIFIED_PROTOTYPE.search = "bisection";
unifiedOutline(s.members, { padding: pad, convexity: 0.5, neck: 1 });
const A0 = UNIFIED_STATS.areaUnion!,
  A1 = UNIFIED_STATS.areaHull!;
UNIFIED_PROTOTYPE.h = process.env.H ? +process.env.H : undefined;
const R = process.env.R;
if (R) {
  // exact share at given radii
  for (const r of R.split(",").map(Number)) {
    unifiedOutline(s.members, {
      padding: pad,
      radius: r,
      neck: 1,
      smooth: null,
    });
    console.log(
      `r ${r} exact share ${((UNIFIED_STATS.areaGot! - A0) / (A1 - A0)).toFixed(4)}`
    );
  }
}
for (let c = from; c <= to + 1e-9; c += step) {
  const row: string[] = [`c ${c.toFixed(3)}`];
  for (const m of ["bisection", "filtration"] as const) {
    UNIFIED_PROTOTYPE.search = m;
    unifiedOutline(s.members, {
      padding: pad,
      convexity: c,
      neck: 1,
      smooth: null,
    });
    const S = UNIFIED_STATS;
    row.push(
      `${m} r ${S.radius!.toFixed(3)} share ${((S.areaGot! - A0) / (A1 - A0)).toFixed(3)}`
    );
  }
  console.log(row.join(" | "));
}
