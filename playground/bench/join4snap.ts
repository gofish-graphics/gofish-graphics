// SCRATCH: snapshot outlines (for before/after comparison of the join rework). Per dataset,
// the page's opening state (convexity 0.5, neck 1, blend, typical × reach, join ∞, avoid as the
// page opens) and the story's settings, plus typical × plain ∞ and px ∞.
//   BENCH=join4snap OUT=<file> node playground/bench.mjs
import { writeFileSync } from "node:fs";
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  REACH_PROTOTYPE,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
if (process.env.LINKS) REACH_PROTOTYPE.links = process.env.LINKS as any;

const out: Record<string, string> = {};
for (const d of DATA as any[]) {
  const variants: [string, any][] = [
    ["open", { convexity: 0.5, neck: 1, holes: false }],
    [
      "story",
      {
        convexity: d.story?.convexity ?? 0.5,
        neck: d.story?.neck ?? 1,
        holes: d.story?.holes ?? false,
      },
    ],
  ];
  for (const [vn, v] of variants)
    for (const [m, dist] of [
      ["typical", "mutual"],
      ["typical", "plain"],
      ["px", "plain"],
    ])
      out[`${d.id}|${vn}|${m}|${dist}`] = JSON.stringify(
        d.sets.map((s: any) =>
          unifiedOutline(s.members, {
            padding: d.padding,
            ...v,
            reach: Infinity,
            reachMeasure: m,
            reachDistance: dist,
            means: "blend",
            avoiding: d.avoidDefault ? s.avoiding : [],
            clearance: d.clearance,
          })
        )
      );
}
writeFileSync(process.env.OUT!, JSON.stringify(out));
console.log(Object.keys(out).length, "snapshots");
