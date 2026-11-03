// SCRATCH: the fix-5 checks, every dataset and set, typical × reach, per-bay blend:
//  1. area along convexity 0..2 (step 0.05), smoothed and raw, at join ∞ / 1.5 / 0, keep-outs
//     off and (where the dataset has them) on: the largest fall, and where
//  2. area along join (every entry crossed, then ∞) at convexity 0 / 0.5 / 1 / 2, smoothed and raw
//  3. ends: join ∞, raw, no keep-outs: c 0 = the spine, c 1 = the padded hull, c 2 = the oval
//     (area off by); finite join, raw, c 0: the area against the pieces' own spines' sum
//   BENCH=fix5check node playground/bench.mjs   (DS=<ids>)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  ringsArea,
  joinLinks,
  paddedHull,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { beyondHull } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/beyond";

const IDS = (
  process.env.DS ?? "chartaccent,u,penguins,munkres,hyperedges,holes,bubble"
).split(",");
const fails: string[] = [];
// the reach measure and distance (MEASURE, DIST; default typical × mutual)
const MEASURE = (process.env.MEASURE ?? "typical") as any;
const DIST = (process.env.DIST ?? "mutual") as any;
const run = (d: any, s: any, o: any) =>
  unifiedOutline(s.members, {
    padding: d.padding,
    convexity: 0.5,
    neck: 1,
    reachMeasure: MEASURE,
    reachDistance: DIST,
    means: "blend",
    clearance: d.clearance,
    ...o,
  } as any);
const TOL = 1; // px²
for (const id of IDS) {
  const d = (DATA as any[]).find((x) => x.id === id);
  const avoids = d.avoidable ? [false, true] : [false];
  // 1. convexity
  for (const join of [Infinity, 1.5, 0])
    for (const av of avoids)
      for (const smooth of [true, false]) {
        let worst = 0,
          where = "";
        d.sets.forEach((s: any, si: number) => {
          let a0 = -Infinity;
          for (let k = 0; k <= 40; k++) {
            const c = k / 20;
            const a = ringsArea(
              run(d, s, {
                reach: join,
                convexity: c,
                avoiding: av ? s.avoiding : [],
                smooth: smooth ? undefined : null,
              })
            );
            if (a0 - a > worst) [worst, where] = [a0 - a, `set ${si} c ${c}`];
            a0 = Math.max(a0, a);
          }
        });
        const tag = `${d.label} conv join ${join} avoid ${av} ${smooth ? "smooth" : "raw"}`;
        if (worst > TOL)
          fails.push(`${tag}: falls ${worst.toFixed(1)} at ${where}`);
        console.log(
          `${tag}: largest fall ${worst.toFixed(2)}${worst > 0 ? ` (${where})` : ""}`
        );
      }
  // 2. join
  for (const c of [0, 0.5, 1, 2])
    for (const av of avoids)
      for (const smooth of [true, false]) {
        let worst = 0,
          where = "";
        d.sets.forEach((s: any, si: number) => {
          const ts = [
            ...new Set(
              joinLinks(
                s.members,
                d.padding,
                MEASURE === "pieces" ? 1 : Infinity,
                1,
                MEASURE,
                DIST
              )
                .tree.filter((e) => !e.floor)
                .map((e) => (e.enter as any)[MEASURE])
            ),
          ].sort((a, b) => a - b);
          let a0 = -Infinity;
          for (const j of [0, ...ts, Infinity]) {
            const a = ringsArea(
              run(d, s, {
                reach: j,
                convexity: c,
                avoiding: av ? s.avoiding : [],
                smooth: smooth ? undefined : null,
              })
            );
            if (a0 - a > worst)
              [worst, where] = [a0 - a, `set ${si} join ${j}`];
            a0 = Math.max(a0, a);
          }
        });
        const tag = `${d.label} join c ${c} avoid ${av} ${smooth ? "smooth" : "raw"}`;
        if (worst > TOL)
          fails.push(`${tag}: falls ${worst.toFixed(1)} at ${where}`);
        console.log(
          `${tag}: largest fall ${worst.toFixed(2)}${worst > 0 ? ` (${where})` : ""}`
        );
      }
  // 3. ends
  d.sets.forEach((s: any, si: number) => {
    const J = joinLinks(s.members, d.padding, Infinity, 1, "typical", "mutual");
    const all = [...s.members, ...J.links];
    const A = (r: any) => ringsArea(r);
    const spine = A(closingRings(all, d.padding, d.padding, false));
    const hull = paddedHull(all, d.padding);
    const oval = beyondHull(hull, all, d.padding, 2);
    const got = (c: number) =>
      A(
        run(d, s, { reach: Infinity, convexity: c, avoiding: [], smooth: null })
      );
    const e = [got(0) - spine, got(1) - A([hull]), got(2) - A([oval])];
    // finite join, c 0: the pieces' own spines
    const J2 = joinLinks(s.members, d.padding, 1.5, 1, "typical", "mutual");
    let sum = 0;
    J2.pieces.forEach((idx, p) => {
      const pm = idx.map((i) => s.members[i]);
      const links = J2.links.filter((_, l) => J2.linkPiece[l] === p);
      sum += A(closingRings([...pm, ...links], d.padding, d.padding, false));
    });
    const e2 = got0(d, s) - sum;
    console.log(
      `${d.label} set ${si} ends: c0 ${e[0].toFixed(3)} c1 ${e[1].toFixed(3)} c2 ${e[2].toFixed(3)} px²; join 1.5 c0 vs pieces' spines ${e2.toFixed(2)} px² (${J2.pieces.length} pieces)`
    );
  });
}
function got0(d: any, s: any) {
  return ringsArea(
    run(d, s, { reach: 1.5, convexity: 0, avoiding: [], smooth: null })
  );
}
console.log(fails.length ? `FAIL\n${fails.join("\n")}` : "all checks pass");
