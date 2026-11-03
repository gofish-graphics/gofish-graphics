// SCRATCH: how sensitive each join measure × distance is to the number of members. Per dataset,
// the join that gives the "right" grouping on the full sets (every set's largest piece keeps
// ≥ MAIN of its members, and as many other pieces as possible are cut off), then the same join
// on random subsamples (50 % and 75 % of each set, 3 seeds each): clusters (pieces of ≥ 3
// members) and small pieces (< 3), and the largest piece's share. Also the barcode's natural cut
// (the largest gap between consecutive bar lengths) on each sample.
//   BENCH=joinsens node playground/bench.mjs   (DS=<ids>, MAIN=0.85)
import DATA from "../src/datasets.json";
import {
  joinLinks,
  REACH_PROTOTYPE,
  type ReachMeasure,
  type ReachDistance,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

if (process.env.TYPICAL) REACH_PROTOTYPE.typical = process.env.TYPICAL as any;
const IDS = (process.env.DS ?? "penguins,chartaccent").split(",");
const MAIN = +(process.env.MAIN ?? 0.85);
const SL: Record<Exclude<ReachMeasure, "pieces">, number[]> = {
  px: [
    0,
    ...Array.from({ length: 99 }, (_, k) => +(0.5 * 2 ** (k / 10)).toFixed(2)),
    Infinity,
  ],
  share: Array.from({ length: 101 }, (_, k) => k / 100),
  typical: [
    0,
    ...Array.from({ length: 99 }, (_, k) => +(0.05 * 2 ** (k / 12)).toFixed(3)),
    Infinity,
  ],
  local: [
    0,
    ...Array.from({ length: 99 }, (_, k) => +(0.05 * 2 ** (k / 12)).toFixed(3)),
    Infinity,
  ],
};
const COMBOS: [ReachMeasure, ReachDistance][] = [
  ["px", "plain"],
  ...(["share", "typical", "local", "pieces"] as ReachMeasure[]).flatMap((m) =>
    (["plain", "mutual"] as ReachDistance[]).map(
      (d) => [m, d] as [ReachMeasure, ReachDistance]
    )
  ),
];
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const sample = <T>(xs: T[], frac: number, seed: number): T[] => {
  if (frac >= 1) return xs;
  const r = rng(seed);
  const idx = xs
    .map((_, i) => [r(), i] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  return idx
    .slice(0, Math.round(xs.length * frac))
    .map(([, i]) => i)
    .sort((a, b) => a - b)
    .map((i) => xs[i]);
};
type G = { clusters: number; small: number; main: number };
const group = (
  ms: any[],
  pad: number,
  m: ReachMeasure,
  d: ReachDistance,
  j: number
): G => {
  const P = joinLinks(ms, pad, j, 1, m, d, 4).pieces.map((p) => p.length);
  return {
    clusters: P.filter((s) => s >= 3).length,
    small: P.filter((s) => s < 3).length,
    main: Math.max(...P) / ms.length,
  };
};
// the natural cut: bars (non-touching edges) longest first; the largest drop between
// consecutive bars; k = bars above it + 1
const natural = (ms: any[], pad: number, d: ReachDistance): number => {
  const xs = joinLinks(ms, pad, 1, 1, "pieces", d, 4)
    .tree.filter((e) => !e.floor)
    .map((e) => e.w)
    .sort((a, b) => b - a);
  let best = 0,
    k = 1;
  for (let r = 0; r + 1 < xs.length; r++)
    if (xs[r] - xs[r + 1] > best) [best, k] = [xs[r] - xs[r + 1], r + 2];
  return k;
};
const SAMPLES: [number, number][] = [
  [1, 0],
  ...[0.75, 0.5].flatMap((f) =>
    [1, 2, 3].map((s) => [f, s] as [number, number])
  ),
];
const fmtG = (gs: G[]) =>
  `${gs.map((g) => g.clusters).join("+")}c ${gs.map((g) => g.small).join("+")}s main ${gs.map((g) => Math.round(g.main * 100)).join("/")}%`;
for (const id of IDS) {
  const ds = (DATA as any[]).find((x) => x.id === id);
  const pad = ds.padding;
  console.log(
    `\n## ${ds.label}: target = each set one cluster (≥ 3 members) holding ≥ ${MAIN * 100}% of it, most small pieces`
  );
  console.log(
    "| measure | distance | join | full | 75% s1 s2 s3 | 50% s1 s2 s3 |\n|---|---|---|---|---|---|"
  );
  for (const [m, d] of COMBOS) {
    const cands =
      m === "pieces"
        ? Array.from({ length: 40 }, (_, k) => k + 1)
        : SL[m as Exclude<ReachMeasure, "pieces">];
    let best: number | null = null,
      bestSmall = -1;
    for (const j of cands) {
      const gs = ds.sets.map((s: any) => group(s.members, pad, m, d, j));
      if (gs.some((g: G) => g.main < MAIN || g.clusters !== 1)) continue;
      const small = gs.reduce((t: number, g: G) => t + g.small, 0);
      // most pieces; ties: the more joined (later in px..local, earlier in pieces)
      if (small > bestSmall || (small === bestSmall && m !== "pieces"))
        [best, bestSmall] = [j, small];
    }
    if (best === null) continue;
    const row = SAMPLES.map(([f, seed]) =>
      fmtG(
        ds.sets.map((s: any) =>
          group(
            sample(s.members, f, seed * 7919 + s.members.length),
            pad,
            m,
            d,
            best!
          )
        )
      )
    );
    console.log(
      `| ${m} | ${m === "px" ? "—" : d} | ${best} | ${row[0]} | ${row.slice(1, 4).join(" · ")} | ${row.slice(4).join(" · ")} |`
    );
  }
  console.log(
    `\nnatural cut (largest gap between bars) per set, k: full | 75% s1 s2 s3 | 50% s1 s2 s3`
  );
  for (const d of ["plain", "mutual"] as ReachDistance[]) {
    const ks = SAMPLES.map(([f, seed]) =>
      ds.sets
        .map((s: any) =>
          natural(sample(s.members, f, seed * 7919 + s.members.length), pad, d)
        )
        .join("/")
    );
    const gs = SAMPLES.map(([f, seed]) =>
      fmtG(
        ds.sets.map((s: any) => {
          const ms = sample(s.members, f, seed * 7919 + s.members.length);
          return group(ms, pad, "pieces", d, natural(ms, pad, d));
        })
      )
    );
    console.log(
      `${d}: k ${ks[0]} | ${ks.slice(1, 4).join("  ")} | ${ks.slice(4).join("  ")}`
    );
    console.log(
      `   groups: ${gs[0]} | ${gs.slice(1, 4).join(" · ")} | ${gs.slice(4).join(" · ")}`
    );
  }
}
