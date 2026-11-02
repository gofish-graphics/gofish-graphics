// SCRATCH: find the (dataset, set, c, holes) where the mesh blend throws.
//   BENCH=meshfail node playground/bench.mjs   (ONLY=penguins HOLES=1)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_PROTOTYPE,
  clearUnifiedCache,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
const ONLY = process.env.ONLY?.split(",");
UNIFIED_PROTOTYPE.blend = "mesh";
for (const holes of [false, true])
  for (const d of DATA as any[]) {
    if (ONLY && !ONLY.includes(d.id)) continue;
    clearUnifiedCache();
    d.sets.forEach((s: any, si: number) => {
      const bad: string[] = [];
      for (let k = 1; k < 100; k++)
        try {
          unifiedOutline(s.members, {
            padding: d.padding,
            convexity: k / 100,
            neck: 1,
            holes,
            means: "blend",
            smooth: null,
          });
        } catch (e) {
          bad.push(`${k / 100}: ${(e as Error).message}`);
        }
      if (bad.length)
        console.log(
          `${d.id}[${si}] holes ${holes}: ${bad.length} fail, e.g. ${bad.slice(0, 3).join("; ")}`
        );
    });
  }
console.log("done");
