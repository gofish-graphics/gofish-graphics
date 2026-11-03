// SCRATCH: find the settings where the blend mesh fails ("boundary edges not recovered"):
// every dataset with its keep-outs on, clearance 0..20 and padding 0..30 swept.
//   BENCH=meshrecover node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_PROTOTYPE,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
if (process.env.DRAFT) UNIFIED_PROTOTYPE.draft = true;

let bad = 0,
  tried = 0;
for (const d of DATA as any[])
  for (const av of [false, true]) {
    if (av && !d.avoidable) continue;
    for (const [what, vals] of [
      ["clearance", Array.from({ length: 41 }, (_, k) => k / 2)],
      ["padding", Array.from({ length: 61 }, (_, k) => k / 2)],
      ["neck", Array.from({ length: 20 }, (_, k) => 0.05 + k * 0.05)],
    ] as [string, number[]][])
      for (const v of vals)
        d.sets.forEach((s: any, si: number) => {
          tried++;
          try {
            unifiedOutline(s.members, {
              padding: d.padding,
              convexity: 0.5,
              neck: 1,
              reachMeasure: "typical",
              reachDistance: "mutual",
              means: "blend",
              clearance: d.clearance,
              avoiding: av ? s.avoiding : [],
              [what]: v,
            } as any);
          } catch (e) {
            bad++;
            console.log(
              `${d.id} set ${si} avoid ${av} ${what} ${v}: ${(e as Error).message}`
            );
          }
        });
  }
console.log(`${bad} of ${tried} failed`);
