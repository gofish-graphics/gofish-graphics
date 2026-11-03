// SCRATCH: the four measures of `join` (px, share of links, typical gap, nearby gaps):
// pieces across each measure's range, whether the outline at join ∞ is the same in every
// measure, whether the area grows in join, the scale test (member positions × 0.5 and × 2,
// sizes kept, as when a chart is resized), where the pieces change on the 0..1 spelling, and
// the time of a join drag.   BENCH=joinmodes node playground/bench.mjs   (DS=<ids>)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  ringsArea,
  clearUnifiedCache,
  joinLinks,
  type JoinMeasure,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

const IDS = (
  process.env.DS ?? "chartaccent,u,penguins,hyperedges,munkres,bubble,holes"
).split(",");
const MEASURES: JoinMeasure[] = ["px", "share", "typical", "local"];
const RANGE: Record<JoinMeasure, number[]> = {
  px: [0, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, Infinity],
  share: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 1],
  typical: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 10, Infinity],
  local: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 10, Infinity],
};
// the playground's slider per measure (0..100)
const SLIDER: Record<JoinMeasure, number[]> = {
  px: [
    0,
    ...Array.from({ length: 99 }, (_, k) => 0.5 * 2 ** (k / 10)),
    Infinity,
  ],
  share: Array.from({ length: 101 }, (_, k) => k / 100),
  typical: [
    0,
    ...Array.from({ length: 99 }, (_, k) => 0.05 * 2 ** (k / 12)),
    Infinity,
  ],
  local: [
    0,
    ...Array.from({ length: 99 }, (_, k) => 0.05 * 2 ** (k / 12)),
    Infinity,
  ],
};
// the fixed joins of the scale test
const FIXED: Record<JoinMeasure, number[]> = {
  px: [8, 24],
  share: [0.5, 0.9],
  typical: [1, 2],
  local: [1, 1.5],
};
const C = 0.25;
const f = (v: number) => (v === Infinity ? "∞" : String(+v.toFixed(2)));

type Member = any;
const scaled = (ms: Member[], s: number): Member[] =>
  ms.map((m) => {
    if (m.kind === "disc") return { ...m, cx: m.cx * s, cy: m.cy * s };
    if (m.kind === "segment")
      return {
        ...m,
        a: [m.a[0] * s, m.a[1] * s],
        b: [m.b[0] * s, m.b[1] * s],
      };
    // a box: its centre moves, its size is kept
    const cx = (m.x + m.w / 2) * s,
      cy = (m.y + m.h / 2) * s;
    return { ...m, x: cx - m.w / 2, y: cy - m.h / 2 };
  });

const piecesOf = (d: any, measure: JoinMeasure, join: number, s = 1) =>
  d.sets.reduce(
    (t: number, set: any) =>
      t +
      joinLinks(
        scaled(set.members, s),
        d.padding,
        join,
        d.story?.neck ?? 1,
        measure
      ).pieces.length,
    0
  );

const run = (
  d: any,
  measure: JoinMeasure,
  join: number,
  smooth: boolean
): { area: number; ms: number; rings: string } => {
  let area = 0;
  let rings = "";
  const t0 = performance.now();
  for (const s of d.sets) {
    const r = unifiedOutline(s.members, {
      padding: d.padding,
      convexity: C,
      neck: d.story?.neck ?? 1,
      join,
      joinMeasure: measure,
      means: "blend",
      holes: d.story?.holes ?? false,
      avoiding: [],
      clearance: d.clearance,
      smooth: smooth ? undefined : null,
    });
    area += ringsArea(r);
    rings += JSON.stringify(r);
  }
  return { area, ms: performance.now() - t0, rings };
};

const pieceTables: string[] = [];
const scaleRows: string[] = [];
const checks: string[] = [];
const timing: string[] = [];
const unit: string[] = [];
for (const id of IDS) {
  const d = (DATA as any[]).find((x) => x.id === id);
  const label = `${d.label} (${d.sets.length} set${d.sets.length > 1 ? "s" : ""})`;
  // pieces across each measure's range
  pieceTables.push(`\n## ${label}`);
  for (const m of MEASURES)
    pieceTables.push(
      `${m.padEnd(8)} ${RANGE[m].map((j) => `${f(j)}:${piecesOf(d, m, j)}`).join("  ")}`
    );
  // the scale test
  for (const m of MEASURES)
    for (const j of FIXED[m])
      scaleRows.push(
        `| ${d.label} | ${m} ${f(j)} | ${[0.5, 1, 2].map((s) => piecesOf(d, m, j, s)).join(" | ")} |`
      );
  // join ∞: the same outline in every measure
  if (!process.env.NOCHECK) {
    const base = run(d, "px", Infinity, true).rings;
    const same = MEASURES.every(
      (m) => run(d, m, Infinity, true).rings === base
    );
    const shareOne = run(d, "share", 1, true).rings === base;
    checks.push(
      `${d.label}: join ∞ identical in every measure: ${same ? "yes" : "NO"}; share 1 = ∞: ${shareOne ? "yes" : "NO"}`
    );
    // monotone area along each measure's slider, smoothed and not
    for (const m of MEASURES) {
      const drops: string[] = [];
      for (const smooth of [true, false]) {
        let prev = -Infinity;
        for (const j of SLIDER[m]) {
          const a = run(d, m, j, smooth).area;
          if (a < prev - 0.5)
            drops.push(
              `${smooth ? "smoothed" : "raw"} ${f(j)} −${(prev - a).toFixed(1)}`
            );
          prev = Math.max(prev, a);
        }
      }
      checks.push(
        `   ${m}: area monotone along the slider: ${drops.length ? "NO " + drops.join(", ") : "yes"}`
      );
    }
    // the join drag: the slider's values in order, cache warm from the previous step
    for (const m of MEASURES) {
      clearUnifiedCache();
      const ms = SLIDER[m].map((j) => run(d, m, j, true).ms);
      const st = ms.slice().sort((a, b) => a - b);
      timing.push(
        `| ${d.label} | ${m} | ${st[st.length >> 1].toFixed(0)} | ${st[Math.floor(st.length * 0.9)].toFixed(0)} | ${st.at(-1)!.toFixed(0)} |`
      );
    }
  }
  // where the pieces change on 0..∞ (slider position) vs 0..1 (j = r / (1 + r))
  for (const m of ["typical", "local"] as JoinMeasure[]) {
    const ts = d.sets
      .flatMap(
        (set: any) =>
          joinLinks(set.members, d.padding, Infinity, d.story?.neck ?? 1, m)
            .tree
      )
      .filter((e: any) => !e.overlap && e.enter[m] > 0)
      .map((e: any) => e.enter[m])
      .sort((a: number, b: number) => a - b);
    if (!ts.length) continue;
    const q = (p: number) =>
      ts[Math.min(ts.length - 1, Math.floor(p * ts.length))];
    const pos = (t: number) =>
      Math.max(1, Math.min(99, 1 + 12 * Math.log2(t / 0.05)));
    const qs = [0.1, 0.25, 0.5, 0.75, 0.9];
    unit.push(
      `${d.label} ${m}: link entries (deciles 10/25/50/75/90%) ratio ${qs.map((p) => f(q(p))).join(" / ")} · on 0..1 j ${qs.map((p) => (q(p) / (1 + q(p))).toFixed(2)).join(" / ")} · 0..∞ slider position ${qs.map((p) => pos(q(p)).toFixed(0)).join(" / ")}%`
    );
  }
}
console.log("# pieces across each measure's range (all sets summed)");
console.log(pieceTables.join("\n"));
console.log("\n# scale test: member positions × s, sizes kept; pieces");
console.log("| dataset | join | × 0.5 | × 1 | × 2 |\n|---|---|---|---|---|");
console.log(scaleRows.join("\n"));
console.log("\n# checks (c 0.25, per-bay blend)");
console.log(checks.join("\n"));
console.log("\n# join drag, warm cache, ms per step (median, p90, max)");
console.log(
  "| dataset | measure | median | p90 | max |\n|---|---|---|---|---|"
);
console.log(timing.join("\n"));
console.log("\n# where the links enter: 0..∞ vs 0..1");
console.log(unit.join("\n"));
void UNIFIED_STATS;
