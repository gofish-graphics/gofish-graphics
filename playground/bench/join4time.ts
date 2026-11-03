// SCRATCH: the time of a join drag and a convexity drag, per dataset, at the page's opening
// settings (convexity 0.5, neck 1, blend, typical × reach, avoid as the page opens). Every step
// computes every set (as the page does). Cold: the cache emptied before the drag starts (the
// first step builds it). First sweep: each step sees only what earlier steps cached; second
// sweep: the same steps again.
//   BENCH=join4time node playground/bench.mjs   (DS=<ids>)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  clearUnifiedCache,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

const IDS = (process.env.DS ?? "chartaccent,u,penguins,hyperedges,holes").split(
  ","
);
// the page's typical slider: 0, 0.05 · 2^((k − 1)/12) for k = 1..99, ∞ (dragged ∞ → 0)
const JOINS = [
  Infinity,
  ...Array.from(
    { length: 99 },
    (_, k) => +(0.05 * 2 ** ((98 - k) / 12)).toFixed(3)
  ),
  0,
];
const CONV = Array.from({ length: 51 }, (_, k) => k / 50);
const step = (d: any, o: any) => {
  const t0 = performance.now();
  for (const s of d.sets)
    unifiedOutline(s.members, {
      padding: d.padding,
      convexity: 0.5,
      neck: 1,
      joinMeasure: "typical",
      joinDistance: "reach",
      means: "blend",
      avoiding: d.avoidDefault ? s.avoiding : [],
      clearance: d.clearance,
      ...o,
    });
  return performance.now() - t0;
};
const stats = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `mean ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)} · p90 ${q(0.9).toFixed(1)} · max ${s.at(-1)!.toFixed(0)}`;
};
console.log(
  "| dataset | drag | cold first step | first sweep (ms/step) | second sweep |\n|---|---|---|---|---|"
);
for (const id of IDS) {
  const d = (DATA as any[]).find((x) => x.id === id);
  for (const [name, seq] of [
    ["join (typical, c 0.5)", JOINS.map((join) => ({ join }))],
    [
      "convexity (join ∞)",
      CONV.map((convexity) => ({ convexity, join: Infinity })),
    ],
    [
      "convexity (join 1.5)",
      CONV.map((convexity) => ({ convexity, join: 1.5 })),
    ],
  ] as [string, any[]][]) {
    clearUnifiedCache();
    const cold = step(d, seq[0]);
    const first = seq.slice(1).map((o) => step(d, o));
    const second = seq.map((o) => step(d, o));
    console.log(
      `| ${d.label} | ${name} | ${cold.toFixed(0)} | ${stats(first)} | ${stats(second)} |`
    );
  }
}
