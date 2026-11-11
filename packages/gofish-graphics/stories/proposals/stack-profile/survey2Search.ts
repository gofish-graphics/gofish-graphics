// Searches pairs of simple shapes for survey 2's discriminating widgets:
// `node_modules/.bin/tsx stories/proposals/stack-profile/survey2Search.ts`.
// For each ordered pair (A left, B right) it prints where each candidate
// strategy puts B, with the reference gap G0, and then chooses the set of
// five pairs that best separates every two candidates.
import { CANDIDATES, library, place } from "./survey2Shapes";

const S = 56;
const G0 = 30;
const SD = 1.5; // v1's typical spread between people, px
const lib = library(S);
const names = Object.keys(lib);
type Row = { a: string; b: string; xs: number[] };
const rows: Row[] = [];
for (const a of names)
  for (const b of names) {
    const xs = CANDIDATES.map((c) => place(c.m, lib[a], lib[b], G0));
    if (xs.some((x) => x == null)) continue;
    rows.push({ a, b, xs: xs as number[] });
  }
const K = CANDIDATES.length;
const cpairs: [number, number][] = [];
for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) cpairs.push([i, j]);
const sep = (r: Row, [i, j]: [number, number]) => Math.abs(r.xs[i] - r.xs[j]);
// easy to execute: every prediction between a touch and a wide gap
const easy = (r: Row) => Math.min(...r.xs) >= -2 && Math.max(...r.xs) <= 64;
const TIP_R = ["triRight", "sharpRight", "diamond"];
const TIP_L = ["triLeft", "sharpLeft", "diamond"];
const tip = (r: Row) => TIP_R.includes(r.a) || TIP_L.includes(r.b);
const concave = (r: Row) => /^l/.test(r.a) || /^l/.test(r.b);
const hullDiffers = (r: Row) => Math.abs(r.xs[3] - r.xs[1]) > 0 && concave(r);

console.log(`${rows.length} pairs; candidates ${CANDIDATES.map((c) => c.key).join(", ")}`);
const pool = rows.filter((r) => easy(r) && Math.max(...r.xs) - Math.min(...r.xs) >= 9);
console.log(`${pool.length} easy to execute`);
const score = (set: Row[]) => {
  const best = cpairs.map((cp) => Math.max(...set.map((r) => sep(r, cp))));
  return { min: Math.min(...best), sum: best.reduce((s, x) => s + Math.min(x, 3 * 3 * SD), 0), best };
};
// greedy with lookahead over the first pick: maximize the weakest candidate pair, then the capped sum
let bestSet: Row[] = [];
let bestScore = { min: -1, sum: -1, best: [] as number[] };
for (const first of pool) {
  const set = [first];
  while (set.length < 5) {
    let pick: Row | null = null;
    let ps = { min: -1, sum: -1, best: [] as number[] };
    for (const r of pool) {
      if (set.includes(r)) continue;
      const s = score([...set, r]);
      if (s.min > ps.min || (s.min === ps.min && s.sum > ps.sum)) [pick, ps] = [r, s];
    }
    set.push(pick!);
  }
  const s = score(set);
  const ok = set.some(tip) && set.some(hullDiffers);
  if (ok && (s.min > bestScore.min || (s.min === bestScore.min && s.sum > bestScore.sum))) [bestSet, bestScore] = [set, s];
}
// a candidate whose measure never reaches G0 before the shapes touch puts them touching (0.0)
const fmt = (r: Row) => `${r.a}|${r.b}`.padEnd(22) + r.xs.map((x) => (Math.abs(x) < 0.05 ? "touch" : x.toFixed(1)).padStart(7)).join("") + `  ${cpairs.filter((cp) => sep(r, cp) >= 3 * SD).length}/10`;
console.log("\npair                   " + CANDIDATES.map((c) => c.key.padStart(7)).join(""));
console.log("Chosen:");
bestSet.forEach((r) => console.log("  " + fmt(r)));
console.log("Separation per candidate pair (largest over the chosen widgets, px):");
console.log("  " + cpairs.map((cp, k) => `${CANDIDATES[cp[0]].key}/${CANDIDATES[cp[1]].key} ${bestScore.best[k].toFixed(1)}`).join(", "));
console.log("\nMost separating pairs per candidate pair:");
for (const cp of cpairs) {
  const top = [...pool].sort((x, y) => sep(y, cp) - sep(x, cp)).slice(0, 3);
  console.log(`  ${CANDIDATES[cp[0]].key}/${CANDIDATES[cp[1]].key}: ` + top.map((r) => `${r.a}|${r.b} ${sep(r, cp).toFixed(1)}`).join("; "));
}
console.log("\nAll easy pairs:");
pool.forEach((r) => console.log("  " + fmt(r)));
