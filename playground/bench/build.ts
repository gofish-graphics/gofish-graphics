// SCRATCH: time the filtration's build and its sampling step.   BENCH=build DS=penguins node playground/bench.mjs
import DATA from "../src/datasets.json";
import { nearLinks } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { unionBoundarySamples } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { buildFiltration } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/filtration";
const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "penguins"));
for (const s of d.sets.slice(0, 3)) {
  const pad = d.padding;
  let t = performance.now();
  const links = nearLinks(s.members, pad, Infinity, 1);
  const tl = performance.now() - t;
  const all = [...s.members, ...links];
  for (let i = 0; i < 3; i++) {
    t = performance.now();
    const n = unionBoundarySamples(all, pad, 1).length;
    const ts = performance.now() - t;
    t = performance.now();
    const F = buildFiltration(all, pad, pad, false, 1);
    console.log(
      `links ${tl.toFixed(1)} ms; samples ${n} in ${ts.toFixed(1)} ms; build ${(performance.now() - t).toFixed(1)} ms (${F.knots} knots)`
    );
  }
}
