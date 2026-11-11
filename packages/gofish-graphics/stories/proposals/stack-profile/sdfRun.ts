// Writes sdfOffsets.json: `node_modules/.bin/tsx stories/proposals/stack-profile/sdfRun.ts`
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bridgeStrips, meanGaps, RUNS, sdfOffsets } from "./sdfModels";
import { TEST_ROWS } from "./spacingModels";

const F = 3;
const data: Record<string, { xs: number[][]; flags: string[][]; gaps: number[][]; strips?: unknown }> = {};
for (const T of [30, 10]) {
  for (const run of RUNS) {
    const t0 = Date.now();
    const r = run.r(T);
    const rows = TEST_ROWS.map((shapes) => sdfOffsets(shapes, run.model, T, F, r));
    const key = `${run.key}-${T === 30 ? "loose" : "tight"}`;
    data[key] = {
      xs: rows.map((x) => x.out),
      flags: rows.map((x) => x.flag),
      gaps: rows.map((x, i) => meanGaps(TEST_ROWS[i], x.out).map((g) => +g.toFixed(1))),
    };
    // the bridge cells, drawn in one panel
    if (run.key === "filletA")
      data[key].strips = rows.map((x, i) => bridgeStrips(TEST_ROWS[i], x.out, run.model as "fillet", r));
    console.log(key, JSON.stringify(data[key].gaps), JSON.stringify(data[key].flags), `${Date.now() - t0} ms`);
  }
}
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "sdfOffsets.json"), JSON.stringify(data));
