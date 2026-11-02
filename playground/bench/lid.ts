// SCRATCH: the lid's seals per set (seal radius, depth, end radius) and the closed area through
// each seal window, exact jump vs lid.   BENCH=lid DS=u node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  nearLinks,
  paddedHull,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { buildFiltration } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/filtration";
import {
  buildSeal,
  gridFor,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/localFill";
const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "u"));
d.sets.forEach((s: any, si: number) => {
  const pad = d.padding;
  const all = [...s.members, ...nearLinks(s.members, pad, Infinity, 1)];
  const F = buildFiltration(all, pad, pad, false, 1);
  const G = gridFor([paddedHull(all, pad)]);
  for (const j of F.jumps) {
    const seal = buildSeal(
      closingRings(all, pad, j.r - 0.1),
      closingRings(all, pad, j.r + 0.1),
      j.r,
      j.dA,
      G
    );
    console.log(
      `set ${si} seal r ${j.r.toFixed(2)} dA ${j.dA.toFixed(0)} depth ${seal?.depth.toFixed(1)} re ${seal?.re.toFixed(1)} nodes ${seal?.depths.length}`
    );
    if (!seal) continue;
    for (const f of [-0.05, 0.001, 0.05, 0.1, 0.25, 0.5, 0.75, 0.95, 1.01]) {
      const r = seal.rs + f * seal.depth;
      const out: string[] = [];
      for (const seal_ of ["jump", "lid"]) {
        unifiedOutline(s.members, {
          padding: pad,
          radius: undefined,
          convexity: 0.5,
          neck: 1,
          smooth: null,
          means: "radius",
          seal: seal_ as any,
        });
      }
      // direct: radius mode at the c that gives r
      const sc = (UNIFIED_STATS.radius! - pad) / 1; // s at c = 0.5
      const c = (r - pad) / (r - pad + sc);
      for (const seal_ of ["jump", "lid"]) {
        unifiedOutline(s.members, {
          padding: pad,
          convexity: c,
          neck: 1,
          smooth: null,
          means: "radius",
          seal: seal_ as any,
        });
        out.push(
          `${seal_} ${UNIFIED_STATS.areaGot?.toFixed(0)} (r ${UNIFIED_STATS.radius?.toFixed(2)}, active ${UNIFIED_STATS.lidActive})`
        );
      }
      console.log(`  +${f} depth: ${out.join("  ")}`);
    }
  }
});
