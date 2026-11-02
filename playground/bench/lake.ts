// SCRATCH: how fast a sealed bay's lake shrinks. Per dataset and set, each big jump of the
// filled filtration (a bay sealing at r_s), then the holes-open closing's hole area at r_s + δ.
//   BENCH=lake node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  nearLinks,
  ringsArea,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { buildFiltration } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/filtration";
const ids = (process.env.DS ?? "chartaccent,u,holes,hyperedges,penguins").split(
  ","
);
const ds = (process.env.D ?? "0.05,0.1,0.25,0.5,1,2,4,8,16")
  .split(",")
  .map(Number);
for (const id of ids) {
  const d = (DATA as any[]).find((x) => x.id === id);
  d.sets.forEach((s: any, si: number) => {
    const pad = d.padding;
    const all = [...s.members, ...nearLinks(s.members, pad, Infinity, 1)];
    const F = buildFiltration(all, pad, pad, false, 1);
    for (const j of F.jumps) {
      const line: string[] = [];
      for (const dl of ds) {
        const r = j.r + dl;
        const open = closingRings(all, pad, r, true);
        const holes = open.filter((g) => ringsArea([g]) < 0);
        line.push(`+${dl}:${(-ringsArea(holes)).toFixed(0)}`);
      }
      console.log(
        `${id} set ${si} seal r ${j.r.toFixed(2)} jump ${j.dA.toFixed(0)} px² (share ${(j.dA / (F.A1 - F.A0)).toFixed(3)}) lake area ${line.join(" ")}`
      );
    }
  });
}
