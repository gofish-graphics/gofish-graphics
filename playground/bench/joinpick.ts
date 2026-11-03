// SCRATCH: per measure, the slider value whose piece count is nearest a target (for the
// screenshots).   BENCH=joinpick node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  joinLinks,
  type ReachMeasure,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
const SL: Record<ReachMeasure, number[]> = {
  px: Array.from({ length: 99 }, (_, k) => +(0.5 * 2 ** (k / 10)).toFixed(2)),
  share: Array.from({ length: 101 }, (_, k) => k / 100),
  typical: Array.from(
    { length: 99 },
    (_, k) => +(0.05 * 2 ** (k / 12)).toFixed(3)
  ),
  local: Array.from(
    { length: 99 },
    (_, k) => +(0.05 * 2 ** (k / 12)).toFixed(3)
  ),
};
for (const [id, target] of [
  ["chartaccent", 6],
  ["penguins", 12],
] as const) {
  const d = (DATA as any[]).find((x) => x.id === id);
  const P = (m: ReachMeasure, j: number) =>
    d.sets.reduce(
      (t: number, s: any) =>
        t +
        joinLinks(s.members, d.padding, j, d.story?.neck ?? 1, m).pieces.length,
      0
    );
  for (const m of Object.keys(SL) as ReachMeasure[]) {
    let best = SL[m][0],
      bp = P(m, best);
    for (const j of SL[m]) {
      const p = P(m, j);
      if (Math.abs(p - target) < Math.abs(bp - target)) [best, bp] = [j, p];
    }
    console.log(id, m, best, bp);
  }
}
