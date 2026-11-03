// SCRATCH: sweep `join` from 0 to ∞ at convexity 0, 0.25, 0.5 (per-bay blend): pieces, area
// (smoothed and not), whether area grows in join and in convexity, and the time of a join drag
// and of a convexity drag.   BENCH=join node playground/bench.mjs   (DS=<id> for one dataset)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  ringsArea,
  clearUnifiedCache,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { CUT_STATS } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/separate";

const IDS = (
  process.env.DS ?? "chartaccent,u,penguins,hyperedges,bubble,munkres"
).split(",");
const JOINS = [
  0,
  1,
  2,
  4,
  6,
  8,
  12,
  16,
  24,
  32,
  48,
  64,
  96,
  128,
  256,
  Infinity,
];
const CS = (process.env.CS ?? "0,0.25,0.5").split(",").map(Number);
// the playground's slider: 0, then 0.5 · 2^((k − 1)/10) for k = 1..99, then ∞
const SLIDER = [
  0,
  ...Array.from({ length: 99 }, (_, k) => 0.5 * 2 ** (k / 10)),
  Infinity,
];

const run = (d: any, join: number, c: number, smooth: boolean) => {
  let area = 0,
    pieces = 0;
  const t0 = performance.now();
  let cached = 0;
  for (const s of d.sets) {
    const rings = unifiedOutline(s.members, {
      padding: d.padding,
      convexity: c,
      neck: d.story?.neck ?? 1,
      reach: join,
      means: "blend",
      holes: false,
      avoiding: [],
      clearance: d.clearance,
      smooth: smooth ? undefined : null,
    });
    area += ringsArea(rings);
    pieces += UNIFIED_STATS.pieces ?? 1;
    cached += UNIFIED_STATS.msCached ?? 0;
  }
  return { area, pieces, ms: performance.now() - t0, cached };
};
const f = (v: number) => (v === Infinity ? "∞" : String(+v.toFixed(1)));

for (const id of IDS) {
  const d = (DATA as any[]).find((x) => x.id === id);
  console.log(
    `\n## ${d.label} (padding ${d.padding}, neck ${d.story?.neck ?? 1}, ${d.sets.length} set${d.sets.length > 1 ? "s" : ""})`
  );
  const table: Record<string, { area: number; raw: number; pieces: number }> =
    {};
  for (const c of CS) {
    const row: string[] = [];
    let prev = -Infinity,
      prevRaw = -Infinity;
    const drops: string[] = [];
    for (const j of JOINS) {
      const sm = run(d, j, c, true);
      const raw = run(d, j, c, false);
      table[`${c}|${j}`] = { area: sm.area, raw: raw.area, pieces: sm.pieces };
      row.push(`${f(j)}:${sm.pieces}p/${sm.area.toFixed(0)}`);
      if (raw.area < prevRaw - 0.5)
        drops.push(`raw ${f(j)} −${(prevRaw - raw.area).toFixed(1)}`);
      if (sm.area < prev - 0.5)
        drops.push(`smoothed ${f(j)} −${(prev - sm.area).toFixed(1)}`);
      prev = sm.area;
      prevRaw = raw.area;
    }
    console.log(`c ${c}: ${row.join("  ")}`);
    console.log(
      `   monotone in join: ${drops.length ? "NO " + drops.join(", ") : "yes"}`
    );
  }
  // monotone in c at every join
  const cdrops: string[] = [];
  for (const j of JOINS)
    for (let k = 1; k < CS.length; k++) {
      const a = table[`${CS[k - 1]}|${j}`],
        b = table[`${CS[k]}|${j}`];
      if (b.raw < a.raw - 0.5)
        cdrops.push(
          `join ${f(j)} c ${CS[k]} raw −${(a.raw - b.raw).toFixed(1)}`
        );
      if (b.area < a.area - 0.5)
        cdrops.push(
          `join ${f(j)} c ${CS[k]} smoothed −${(a.area - b.area).toFixed(1)}`
        );
    }
  console.log(
    `   monotone in c (0 → 0.25 → 0.5): ${cdrops.length ? "NO " + cdrops.join(", ") : "yes"}`
  );
  // the join drag: the slider's values in order, cache warm from the previous step (cold: cache
  // cleared before each step)
  for (const c of [0.25]) {
    clearUnifiedCache();
    const warm: number[] = [];
    for (const j of SLIDER) warm.push(run(d, j, c, true).ms);
    const cold: number[] = [];
    for (const j of SLIDER.filter((_, k) => k % 10 === 0)) {
      clearUnifiedCache();
      cold.push(run(d, j, c, true).ms);
    }
    const st = (xs: number[]) => {
      const s = xs.slice().sort((a, b) => a - b);
      return `median ${s[s.length >> 1].toFixed(0)} p90 ${s[Math.floor(s.length * 0.9)].toFixed(0)} max ${s.at(-1)!.toFixed(0)} ms`;
    };
    console.log(`   join drag c ${c}: warm ${st(warm)} · cold ${st(cold)}`);
    // the convexity drag at a few joins
    for (const j of [0, 16, Infinity]) {
      clearUnifiedCache();
      const first = run(d, j, 0.01, true).ms;
      const ms: number[] = [];
      for (let k = 2; k <= 99; k += 3) ms.push(run(d, j, k / 100, true).ms);
      console.log(
        `   convexity drag join ${f(j)}: first ${first.toFixed(0)} ms, then ${st(ms)}`
      );
    }
  }
}
// JUMP=1: the step in area as join crosses each spanning-tree edge's gap (g − 0.01 → g + 0.01)
// and a little after (g + 1), at c 0 and 0.25: does a link entering pop?
if (process.env.JUMP)
  for (const id of IDS) {
    const d = (DATA as any[]).find((x) => x.id === id);
    if (d.sets.length !== 1 && id !== "penguins") continue;
    const s = d.sets[0];
    const one = (join: number, c: number) =>
      ringsArea(
        unifiedOutline(s.members, {
          padding: d.padding,
          convexity: c,
          neck: d.story?.neck ?? 1,
          reach: join,
          means: "blend",
          avoiding: [],
          smooth: process.env.RAW ? null : undefined,
        })
      );
    unifiedOutline(s.members, {
      padding: d.padding,
      reach: Infinity,
      neck: d.story?.neck ?? 1,
    });
    const gaps = (UNIFIED_STATS.joinTree ?? [])
      .filter((e) => !e.overlap && e.gap > 0.01 && e.gap < 200)
      .map((e) => e.gap)
      .sort((a, b) => a - b);
    for (const c of [0, 0.25]) {
      let worst = 0,
        worstAt = 0,
        worst1 = 0;
      for (const g of gaps) {
        const a = one(g - 0.01, c),
          b = one(g + 0.01, c),
          b1 = one(g + 1, c);
        if (b - a > worst) [worst, worstAt] = [b - a, g];
        worst1 = Math.max(worst1, b1 - a);
      }
      console.log(
        `${d.label} set 0 ${process.env.RAW ? "raw" : "smoothed"} c ${c}: ${gaps.length} edges; largest step at entry ${worst.toFixed(1)} px² (gap ${worstAt.toFixed(1)}), largest change over g − 0.01 → g + 1: ${worst1.toFixed(1)} px²`
      );
    }
  }
console.log(
  `\ncut runs kept (left the forbidden ground by another loop): ${CUT_STATS.skipped}`
);
