// SCRATCH: how well the grid contour of the signed distance reproduces an exact closing (area).
//   BENCH=gridacc DS=u node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  nearLinks,
  paddedHull,
  ringsArea,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import {
  contour,
  gridFor,
  signedDistance,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/localFill";
const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "u"));
const s = d.sets[0];
const pad = d.padding;
const all = [...s.members, ...nearLinks(s.members, pad, Infinity, 1)];
const G = gridFor([paddedHull(all, pad)]);
for (const r of [8, 30, 53.7, 60]) {
  const rings = closingRings(all, pad, r);
  const sd = signedDistance(rings, G, 3 * G.h);
  const c = contour(sd, G);
  console.log(
    `r ${r} exact ${ringsArea(rings).toFixed(1)} grid ${ringsArea(c).toFixed(1)} rings ${rings.length}/${c.length} h ${G.h} n ${G.nx}x${G.ny}`
  );
}
