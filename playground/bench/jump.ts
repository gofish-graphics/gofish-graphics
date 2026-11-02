// SCRATCH: the U pocket: the filtration's big jumps and the exact closing's area (holes filled
// and open) at radii around them.   BENCH=jump DS=u node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  nearLinks,
  ringsArea,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { buildFiltration } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/filtration";
const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "u"));
const s = d.sets[+(process.env.SET ?? 0)];
const pad = d.padding;
const all = [...s.members, ...nearLinks(s.members, pad, Infinity, 1)];
const H = process.env.H ? +process.env.H : 1;
const F = buildFiltration(all, pad, pad, false, H);
const rs = (
  process.env.R ?? "53.70,53.75,53.77,53.78,53.80,53.82,53.84,53.86,53.88,53.90"
)
  .split(",")
  .map(Number);
for (const r of rs) {
  const filled = ringsArea(closingRings(all, pad, r, false));
  const open = closingRings(all, pad, r, true);
  const nh = open.filter((g) => ringsArea([g]) < 0).length;
  console.log(
    `r ${r.toFixed(3)} exact ${filled.toFixed(0)} (open holes ${nh}, area ${ringsArea(open).toFixed(0)}) proxy ${F.area(r).toFixed(0)}`
  );
}
