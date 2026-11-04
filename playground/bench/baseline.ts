// SCRATCH: the blob outlines of every dataset at a grid of settings, written to OUT (JSON), so
// two builds of the prototype can be compared byte for byte (BENCH=baseline OUT=… node
// playground/bench.mjs). Only options both builds read: the default join (one piece) and the
// per-bay blend.
import { writeFileSync } from "node:fs";
import DATA from "../src/datasets.json";
import { unifiedOutline } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

const out: Record<string, unknown> = {};
for (const d of DATA as any[])
  d.sets.forEach((s: any, si: number) => {
    const cases: [string, Record<string, unknown>][] = [];
    for (const c of [0, 0.25, 0.5, 0.75, 1, 1.5, 2])
      for (const neck of [1, 0.6])
        cases.push([`c${c} n${neck}`, { convexity: c, neck }]);
    cases.push(["holes c0.5", { convexity: 0.5, holes: true }]);
    if (d.avoidable)
      for (const c of [0.1, 0.5, 1.5])
        cases.push([
          `avoid c${c}`,
          { convexity: c, avoiding: s.avoiding, clearance: d.clearance },
        ]);
    for (const [k, o] of cases)
      out[`${d.id}/${si}/${k}`] = unifiedOutline(s.members, {
        padding: d.padding,
        means: "blend",
        ...o,
      } as never);
  });
writeFileSync(process.env.OUT!, JSON.stringify(out));
console.log(`${Object.keys(out).length} outlines → ${process.env.OUT}`);
