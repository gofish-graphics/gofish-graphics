// SCRATCH: the grid blend's pockets on one set: size, whether each has a mouth, its u range.
//   BENCH=griddbg DS=u node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  nearLinks,
  paddedHull,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { buildBlend } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/localFill";
const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "u"));
const s = d.sets[+(process.env.SET ?? 0)];
const pad = d.padding;
const all = [...s.members, ...nearLinks(s.members, pad, Infinity, 1)];
const coarse = closingRings(all, pad, pad, false);
const hull = paddedHull(all, pad);
const B = buildBlend(
  coarse,
  hull,
  +(process.env.H ?? 1),
  +(process.env.MAXN ?? 250000)
);
const { G, label, u, slope } = B;
const per = new Map<
  number,
  {
    n: number;
    nan: number;
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    slopeMin: number;
  }
>();
for (let v = 0; v < label.length; v++) {
  const l = label[v];
  if (!l) continue;
  const e = per.get(l) ?? {
    n: 0,
    nan: 0,
    x0: 1e9,
    x1: -1e9,
    y0: 1e9,
    y1: -1e9,
    slopeMin: 9,
  };
  e.n++;
  if (Number.isNaN(u[v])) e.nan++;
  const x = G.x0 + G.h * (v % G.nx),
    y = G.y0 + G.h * Math.floor(v / G.nx);
  e.x0 = Math.min(e.x0, x);
  e.x1 = Math.max(e.x1, x);
  e.y0 = Math.min(e.y0, y);
  e.y1 = Math.max(e.y1, y);
  e.slopeMin = Math.min(e.slopeMin, slope[v]);
  per.set(l, e);
}
console.log(`grid h ${G.h} ${G.nx}x${G.ny}, pockets ${B.pockets}`);
for (const [l, e] of per)
  console.log(
    `pocket ${l}: ${e.n} nodes (${e.nan} NaN), box x ${e.x0.toFixed(0)}..${e.x1.toFixed(0)} y ${e.y0.toFixed(0)}..${e.y1.toFixed(0)}, slope min ${e.slopeMin.toFixed(4)}, levels ${B.levels[l].length} [${B.levels[l][0]?.toFixed(3)}..${B.levels[l].at(-1)?.toFixed(3)}]`
  );
import { blendRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/localFill";
import { signedArea2 } from "../../packages/gofish-graphics/src/ast/geometry/plane";
for (const c of [0.1, 0.5]) {
  const rs = blendRings(B, c, false);
  console.log(
    `c ${c}: ${rs.length} rings: ` +
      rs
        .map((r) => {
          const xs = r.map((p) => p[0]);
          return `${r.length} pts area ${(signedArea2(r) / 2).toFixed(1)} x ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)}`;
        })
        .join("; ")
  );
}
