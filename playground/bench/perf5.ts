// SCRATCH: the slow sliders on one dataset (default penguins), per step and per set: total,
// and where the time went (links, fill incl. blend mesh, apart, smooth+cut, cached).
//   BENCH=perf5 node playground/bench.mjs   (DS=<id>, WHAT=neck,padding,avoid,clearance,convexity)
import DATA from "../src/datasets.json";
import { UNIFIED_PROTOTYPE } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
if (process.env.DRAFT) UNIFIED_PROTOTYPE.draft = true;
import {
  unifiedOutline,
  clearUnifiedCache,
  UNIFIED_STATS as S,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "penguins"));
const WHAT = (
  process.env.WHAT ?? "neck,padding,avoid,clearance,convexity"
).split(",");
const base = (o: any = {}) => ({
  padding: d.padding,
  convexity: 0.5,
  neck: 1,
  reachMeasure: "typical",
  reachDistance: "mutual",
  means: "blend",
  clearance: d.clearance,
  ...o,
});
const step = (o: any, avoid: boolean) => {
  const t0 = performance.now();
  const parts: string[] = [];
  for (const s of d.sets) {
    const t1 = performance.now();
    unifiedOutline(s.members, {
      ...base(o),
      avoiding: avoid ? s.avoiding : [],
    } as any);
    const mb = (S.meshBlend ?? {}) as any;
    parts.push(
      `${(performance.now() - t1).toFixed(0)} [L${S.msLinks!.toFixed(0)} F${S.msClose!.toFixed(0)} A${S.msSeparate!.toFixed(0)} S${S.msSmooth!.toFixed(0)} C${S.msCached!.toFixed(0)} mesh${(mb.ms ?? 0).toFixed(0)}${process.env.PH ? " " + ["pockets", "boundary", "quadtree", "delaunay", "assemble", "solve", "refine", "area"].map((k) => `${k[0]}${k[1]}${(mb["ms_" + k] ?? 0).toFixed(0)}`).join(" ") + ` v${mb.vertices}` : ""}]`
    );
  }
  return [performance.now() - t0, parts.join(" ")] as const;
};
const seqs: Record<string, [any, boolean][]> = {
  neck: Array.from({ length: 6 }, (_, k) => [
    { neck: 1 - 0.02 * (k + 1) },
    false,
  ]),
  padding: Array.from({ length: 4 }, (_, k) => [
    { padding: d.padding + 0.5 * (k + 1) },
    false,
  ]),
  avoid: [[{}, true]],
  clearance: Array.from({ length: 4 }, (_, k) => [
    { clearance: 4 + 0.5 * (k + 1) },
    true,
  ]),
  convexity: Array.from({ length: 6 }, (_, k) => [
    { convexity: 0.5 + 0.3 * (k + 1) },
    false,
  ]),
};
for (const w of WHAT) {
  clearUnifiedCache();
  step({}, w === "clearance");
  for (const [o, av] of seqs[w]) {
    const [ms, p] = step(o, av);
    console.log(`${w} ${JSON.stringify(o)}: ${ms.toFixed(0)} ms  ${p}`);
  }
}
