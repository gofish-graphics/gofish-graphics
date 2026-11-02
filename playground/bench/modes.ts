// SCRATCH: the convexity modes and seal treatments, per dataset and set: a sweep of c from 0 to
// 1 in 0.01 steps, checking the area never falls (before smoothing, and after it), the ends
// (c = 0 the spine, c = 1 the hull), and the time per call (warm cache, and the cold build).
//   BENCH=modes node playground/bench.mjs      (ONLY=u, MODES=radius/lid,blend)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  clearUnifiedCache,
  ringsArea,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

const MODES = (
  process.env.MODES ??
  "area/jump,area/lake,area/lid,radius/jump,radius/lake,radius/lid,blend"
).split(",");
const ONLY = process.env.ONLY?.split(",");
const STEP = +(process.env.STEP ?? 0.01);
const HOLES = process.env.HOLES === "1";
const rows: string[] = [
  "| dataset | mode | cold ms | warm ms median (max) | area falls, before smoothing (worst px²) | after smoothing (worst px²) | A(0.01)−A(0) | A(1)−A(0.99) |",
  "|---|---|---|---|---|---|---|---|",
];
for (const d of DATA as any[]) {
  if (ONLY && !ONLY.includes(d.id)) continue;
  for (const mode of MODES) {
    const [means, seal] = mode.split("/");
    clearUnifiedCache();
    const call = (s: any, c: number) =>
      unifiedOutline(s.members, {
        padding: d.padding,
        convexity: c,
        neck: 1,
        holes: HOLES,
        means: means as any,
        seal: (seal ?? "jump") as any,
      });
    let cold = 0;
    const t0 = performance.now();
    for (const s of d.sets) call(s, 0.5);
    cold = performance.now() - t0;
    const times: number[] = [];
    let fallsPre = 0,
      worstPre = 0,
      fallsPost = 0,
      worstPost = 0;
    const ends: string[] = [];
    const ends2: string[] = [];
    d.sets.forEach((s: any) => {
      let lastPre = -Infinity,
        lastPost = -Infinity;
      const pre: number[] = [];
      for (let k = 0; k <= Math.round(1 / STEP); k++) {
        const c = Math.min(1, k * STEP);
        const t1 = performance.now();
        const rings = call(s, c);
        times.push(performance.now() - t1);
        const a = UNIFIED_STATS.areaGot ?? NaN;
        const b = ringsArea(rings);
        pre.push(a);
        if (a < lastPre - 1e-6) {
          fallsPre++;
          worstPre = Math.max(worstPre, lastPre - a);
        }
        if (b < lastPost - 1e-6) {
          fallsPost++;
          worstPost = Math.max(worstPost, lastPost - b);
        }
        lastPre = Math.max(lastPre, a);
        lastPost = Math.max(lastPost, b);
      }
      ends.push((pre[1] - pre[0]).toFixed(0));
      ends2.push((pre.at(-1)! - pre.at(-2)!).toFixed(0));
    });
    times.sort((a, b) => a - b);
    rows.push(
      `| ${d.id} | ${mode} | ${cold.toFixed(0)} | ${times[times.length >> 1].toFixed(1)} (${times.at(-1)!.toFixed(0)}) | ${fallsPre} (${worstPre.toFixed(1)}) | ${fallsPost} (${worstPost.toFixed(1)}) | ${ends.join(", ")} | ${ends2.join(", ")} |`
    );
    console.error(rows.at(-1));
  }
}
console.log(rows.join("\n"));
