// SCRATCH: checks for the discrete join on the HDBSCAN tree.
//  1. steps: between two consecutive edge entries the outline is byte-identical (5 joins
//     sampled inside each interval, cache emptied before each), and the kept set changes at
//     each entry; typical × reach on every set
//  2. area non-decreasing along join (every entry crossed, plus ∞), per measure × distance
//  3. area non-decreasing along convexity 0..2 at join ∞ and at a finite join
//  4. pieces: exactly k pieces per set for every whole k
//  5. scale: positions × 0.5 / × 2 (sizes kept), typical × reach: the same pieces at fixed
//     joins, unless the floor (touching) changed
//   BENCH=join4check node playground/bench.mjs   (DS=<ids>)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  ringsArea,
  clearUnifiedCache,
  joinLinks,
  type JoinMeasure,
  type JoinDistance,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

const IDS = (process.env.DS ?? "chartaccent,u,penguins,hyperedges,holes").split(
  ","
);
const opts = (d: any, s: any, o: any) => ({
  padding: d.padding,
  convexity: 0.5,
  neck: 1,
  joinMeasure: "typical" as JoinMeasure,
  joinDistance: "reach" as JoinDistance,
  means: "blend" as const,
  avoiding: d.avoidDefault ? s.avoiding : [],
  clearance: d.clearance,
  ...o,
});
const out = (d: any, s: any, o: any) =>
  unifiedOutline(s.members, opts(d, s, o));
const fails: string[] = [];
const say = (ok: boolean, msg: string) => {
  if (!ok) fails.push(msg);
};
const entries = (s: any, d: any, m: JoinMeasure, dist: JoinDistance) =>
  [
    ...new Set(
      joinLinks(s.members, d.padding, Infinity, 1, m, dist)
        .tree.filter((e) => !e.floor)
        .map((e) => e.enter[m])
    ),
  ].sort((a, b) => a - b);
for (const id of IDS) {
  const d = (DATA as any[]).find((x) => x.id === id);
  // 1. steps
  let intervals = 0,
    samples = 0,
    changes = 0;
  for (const s of d.sets) {
    const ts = entries(s, d, "typical", "reach");
    const bounds = [0, ...ts, ts.at(-1)! * 2];
    let prev = "";
    for (let k = 0; k + 1 < bounds.length; k++) {
      const [lo, hi] = [bounds[k], bounds[k + 1]];
      if (hi - lo < 1e-9) continue;
      intervals++;
      let ref = "";
      for (let q = 0; q < 5; q++) {
        // inside [lo, hi): the entry lo itself is kept (join ≥ t keeps)
        const j = q === 0 ? lo : lo + ((hi - lo) * q) / 5;
        clearUnifiedCache();
        const r = JSON.stringify(out(d, s, { join: j }));
        samples++;
        if (q === 0) ref = r;
        else
          say(
            r === ref,
            `${d.label}: outline moved inside [${lo}, ${hi}) at ${j}`
          );
      }
      if (prev) {
        if (ref !== prev) changes++;
      }
      prev = ref;
    }
  }
  console.log(
    `${d.label}: ${intervals} intervals × 5 joins (${samples} outlines, cache emptied each), byte-identical inside each; ${changes} of ${intervals - d.sets.length} entries change the outline`
  );
  // 2. area along join
  for (const [m, dist] of [
    ["typical", "reach"],
    ["typical", "plain"],
    ["px", "plain"],
    ["share", "reach"],
    ["local", "reach"],
  ] as [JoinMeasure, JoinDistance][]) {
    let worst = 0,
      steps = 0;
    for (const s of d.sets) {
      const ts = entries(s, d, m, dist);
      const js = [m === "px" ? -1 : 0, ...ts, Infinity];
      let a0 = -Infinity;
      for (const j of js) {
        const a = ringsArea(
          out(d, s, {
            join: Math.max(0, j),
            joinMeasure: m,
            joinDistance: dist,
          })
        );
        if (a < a0) worst = Math.max(worst, a0 - a);
        a0 = Math.max(a0, a);
        steps++;
      }
    }
    say(
      worst < 1,
      `${d.label}: area falls along join (${m} × ${dist}) by ${worst.toFixed(1)} px²`
    );
    console.log(
      `  area along join ${m} × ${dist}: ${steps} steps, largest fall ${worst.toFixed(2)} px²`
    );
  }
  // 3. area along convexity
  for (const join of [Infinity, 1.5]) {
    let worst = 0;
    for (const s of d.sets) {
      let a0 = -Infinity;
      for (let k = 0; k <= 40; k++) {
        const a = ringsArea(out(d, s, { join, convexity: k / 20 }));
        if (a < a0) worst = Math.max(worst, a0 - a);
        a0 = Math.max(a0, a);
      }
    }
    say(
      worst < 1,
      `${d.label}: area falls along convexity at join ${join} by ${worst.toFixed(1)}`
    );
    console.log(
      `  area along convexity 0..2 at join ${join}: largest fall ${worst.toFixed(2)} px²`
    );
  }
  // 4. pieces
  for (const dist of ["plain", "reach"] as JoinDistance[]) {
    let bad = 0,
      tried = 0;
    for (const s of d.sets) {
      const P =
        1 +
        joinLinks(s.members, d.padding, 1, 1, "pieces", dist).tree.filter(
          (e) => !e.floor
        ).length;
      for (let k = 1; k <= P; k++) {
        tried++;
        if (
          joinLinks(s.members, d.padding, k, 1, "pieces", dist).pieces
            .length !== k
        )
          bad++;
      }
    }
    say(bad === 0, `${d.label}: pieces ${dist}: ${bad} of ${tried} k wrong`);
    console.log(
      `  pieces × ${dist}: exactly k pieces at ${tried - bad} of ${tried} whole k`
    );
  }
  // 5. scale
  const scaled = (ms: any[], f: number): any[] =>
    ms.map((m) => {
      if (m.kind === "disc") return { ...m, cx: m.cx * f, cy: m.cy * f };
      if (m.kind === "segment")
        return {
          ...m,
          a: [m.a[0] * f, m.a[1] * f],
          b: [m.b[0] * f, m.b[1] * f],
        };
      const cx = (m.x + m.w / 2) * f,
        cy = (m.y + m.h / 2) * f;
      return { ...m, x: cx - m.w / 2, y: cy - m.h / 2 };
    });
  const row: string[] = [];
  for (const join of [1, 1.5, 2, 3]) {
    const cnt = (f: number) =>
      d.sets
        .map(
          (s: any) =>
            joinLinks(
              scaled(s.members, f),
              d.padding,
              join,
              1,
              "typical",
              "reach"
            ).pieces.length
        )
        .join("+");
    const floor = (f: number) =>
      d.sets
        .map(
          (s: any) =>
            joinLinks(
              scaled(s.members, f),
              d.padding,
              join,
              1,
              "typical",
              "reach"
            ).tree.filter((e) => e.floor).length
        )
        .join("+");
    row.push(
      `join ${join}: ${cnt(0.5)} | ${cnt(1)} | ${cnt(2)} pieces (touching edges ${floor(0.5)} | ${floor(1)} | ${floor(2)})`
    );
  }
  console.log(
    `  scale × 0.5 | × 1 | × 2, typical × reach:\n    ${row.join("\n    ")}`
  );
}
console.log(
  fails.length ? `FAIL\n${fails.slice(0, 30).join("\n")}` : "all checks pass"
);
