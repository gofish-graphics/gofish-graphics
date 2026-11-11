// Where does the hull change the answer at a fixed p? Pairs with an L, hull
// against plain shapes at p -8, -3 and 1 (G0 = 30). Used once to choose
// survey 2's hull widget: `node_modules/.bin/tsx stories/proposals/stack-profile/survey2Hull.ts`.
import { library, place } from "./survey2Shapes";
import type { Shape } from "./spacingModels";
import { gapProfile, gapProfileK, powerMean } from "./widgetModels";
import type { Band } from "./widgetModels";

const lib = library(56);
const pm = (p: number, k: number) => (A: Shape, a: number, B: Shape, b: number, tv: Band) => powerMean(k ? gapProfileK(A, a, B, b, tv, 1) : gapProfile(A, a, B, b, tv), p);
for (const a of Object.keys(lib))
  for (const b of Object.keys(lib)) {
    if (!/^l/.test(a) && !/^l/.test(b)) continue;
    const out = [-8, -3, 1].map((p) => [place(pm(p, 0), lib[a], lib[b], 30), place(pm(p, 1), lib[a], lib[b], 30)]);
    const d = Math.max(...out.map(([s, h]) => Math.abs((h ?? 0) - (s ?? 0))));
    if (d > 4) console.log(`${a}|${b}`.padEnd(20) + out.map(([s, h], i) => `p ${[-8, -3, 1][i]}: shape ${s} hull ${h}`).join("; "));
  }
