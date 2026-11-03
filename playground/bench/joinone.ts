// SCRATCH: share 1 = join ∞ check.   BENCH=joinone node playground/bench.mjs
import DATA from "../src/datasets.json";
import { unifiedOutline } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
for (const d of DATA as any[]) {
  const o = (join: number, joinMeasure: any) =>
    JSON.stringify(
      d.sets.map((s: any) =>
        unifiedOutline(s.members, {
          padding: d.padding,
          convexity: 0.25,
          neck: d.story?.neck ?? 1,
          join,
          joinMeasure,
          means: "blend",
          holes: d.story?.holes ?? false,
        })
      )
    );
  console.log(d.id, o(1, "share") === o(Infinity, "px"));
}
