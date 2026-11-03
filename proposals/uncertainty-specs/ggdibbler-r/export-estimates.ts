// Write the estimates behind the GoFish stories to CSV, so the ggdibbler
// renders use the same means and standard errors. Run from the repo root:
//   tests/node_modules/.bin/tsx proposals/uncertainty-specs/ggdibbler-r/export-estimates.ts
import { writeFileSync, mkdirSync } from "node:fs";
import {
  barEstimates,
  pointEstimates,
  tileEstimates,
} from "../../../packages/gofish-graphics/stories/proposals/uncertainty/noise-data";
import {
  forecastEstimates,
  milestoneDraws,
} from "../../../packages/gofish-graphics/stories/proposals/uncertainty/ggdibbler-data";

const dir = "proposals/uncertainty-specs/ggdibbler-r/data";
mkdirSync(dir, { recursive: true });

const toCsv = (rows: Record<string, unknown>[]) => {
  const cols = Object.keys(rows[0]);
  return (
    [cols.join(","), ...rows.map((r) => cols.map((c) => r[c]).join(","))].join(
      "\n"
    ) + "\n"
  );
};

const tables: Record<string, Record<string, unknown>[]> = {
  bars: barEstimates,
  points: pointEstimates,
  tiles: tileEstimates,
  forecast: forecastEstimates,
  milestones: milestoneDraws,
};
for (const [name, rows] of Object.entries(tables)) {
  writeFileSync(`${dir}/${name}.csv`, toCsv(rows));
}
