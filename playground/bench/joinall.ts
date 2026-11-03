// SCRATCH: which measure × distance differs from px ∞ at "every link".
//   BENCH=joinall node playground/bench.mjs
import DATA from "../src/datasets.json";
import { unifiedOutline } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "u"));
const run = (m: any, dist: any, join: number | undefined) =>
  JSON.stringify(
    d.sets.map((s: any) =>
      unifiedOutline(s.members, {
        padding: d.padding,
        convexity: 0.25,
        neck: d.story?.neck ?? 1,
        join,
        joinMeasure: m,
        joinDistance: dist,
        means: "blend",
        holes: d.story?.holes ?? false,
        avoiding: [],
        clearance: d.clearance,
      })
    )
  );
const base = run("px", "plain", Infinity);
for (const m of ["px", "share", "typical", "local", "pieces"])
  for (const dist of ["plain", "reach"])
    for (const j of [Infinity, 1, undefined])
      console.log(m, dist, j, run(m, dist, j) === base);
