// SCRATCH: per-bay blend accuracy: the 1 px grid solver and the mesh solver against a fine
// reference (a fine mesh, and with REFGRID=1 also the grid at 0.25 px), before smoothing.
// Per dataset, set and c: the area share each reaches (target c), and the Hausdorff distance
// (and mean distance) of each outline to the reference's.
//   BENCH=blendacc node playground/bench.mjs   (ONLY=u, CS=0.1,0.25, REFGRID=1)
import DATA from "../src/datasets.json";
import {
  nearLinks,
  paddedHull,
  ringsArea,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import {
  closingRings,
  withArcsTolerance,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import {
  buildBlend,
  blendRings,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/localFill";
import {
  buildMeshBlend,
  meshBlendRings,
  MESH_BLEND,
  SegGrid,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/meshBlend";
import type { Pt } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/blob";

const ONLY = (process.env.ONLY ?? "chartaccent,u,hyperedges,penguins").split(
  ","
);
const CS = (process.env.CS ?? "0.1,0.25,0.5,0.75").split(",").map(Number);
const HOLES = process.env.HOLES === "1";
const REF = JSON.parse(
  process.env.REF ??
    '{"delta":0.005,"s0":0.25,"beta":0.5,"alpha":0.12,"hMax":1.5}'
);

/** one-sided: the most and the mean distance from A's points (every 0.1 px) to B */
function oneSided(A: Pt[][], B: Pt[][]): [number, number] {
  const s: number[] = [];
  for (const r of B)
    for (let i = 0; i < r.length; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      s.push(a[0], a[1], b[0], b[1]);
    }
  const G = new SegGrid(Float64Array.from(s), 2);
  let most = 0,
    sum = 0,
    n = 0;
  for (const r of A)
    for (let i = 0; i < r.length; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      const k = Math.max(
        1,
        Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1)
      );
      for (let j = 0; j < k; j++) {
        const t = j / k;
        const [d] = G.nearest(
          a[0] + t * (b[0] - a[0]),
          a[1] + t * (b[1] - a[1])
        );
        most = Math.max(most, d);
        sum += d;
        n++;
      }
    }
  return [most, sum / n];
}
const haus = (A: Pt[][], B: Pt[][]) => {
  const [a, ma] = oneSided(A, B),
    [b, mb] = oneSided(B, A);
  return [Math.max(a, b), (ma + mb) / 2];
};

const rows: string[] = [
  "| dataset | set | c | share grid | share mesh | share ref | Hausdorff grid→ref (mean) | Hausdorff mesh→ref (mean) |" +
    (process.env.REFGRID ? " mesh-ref vs grid-0.25 (mean) |" : ""),
  "|---|---|---|---|---|---|---|---|" + (process.env.REFGRID ? "---|" : ""),
];
for (const d of DATA as any[]) {
  if (!ONLY.includes(d.id)) continue;
  const pad = d.padding;
  d.sets.forEach((s: any, si: number) => {
    const all = [...s.members, ...nearLinks(s.members, pad, Infinity, 1)];
    const coarse = closingRings(all, pad, pad, HOLES);
    const hull = paddedHull(all, pad);
    const A0 = ringsArea(coarse),
      A1 = ringsArea([hull]);
    const share = (r: Pt[][]) => (ringsArea(r) - A0) / (A1 - A0);
    let t = performance.now();
    const G = buildBlend(coarse, hull);
    const msGrid = performance.now() - t;
    t = performance.now();
    const fine = withArcsTolerance(0.05, () =>
      closingRings(all, pad, pad, HOLES)
    );
    const M = buildMeshBlend(fine);
    const msMesh = performance.now() - t;
    const keep = { ...MESH_BLEND };
    Object.assign(MESH_BLEND, REF);
    t = performance.now();
    const R = buildMeshBlend(
      withArcsTolerance(0.01, () => closingRings(all, pad, pad, HOLES))
    );
    const msRef = performance.now() - t;
    Object.assign(MESH_BLEND, keep);
    let RG: ReturnType<typeof buildBlend> | undefined;
    if (process.env.REFGRID) {
      t = performance.now();
      RG = buildBlend(
        withArcsTolerance(0.01, () => closingRings(all, pad, pad, HOLES)),
        hull,
        0.25,
        1e8,
        1e-9,
        60000,
        0.3713 // off the hull's edges: an axis-aligned edge on a node column walls its bay off
      );
      console.error(
        `grid 0.25: ${(performance.now() - t).toFixed(0)} ms, ${RG.iterations} it`
      );
    }
    console.error(
      `${d.id}[${si}] build grid ${msGrid.toFixed(0)} ms, mesh ${msMesh.toFixed(0)} ms (${M.stats.vertices} v), ref ${msRef.toFixed(0)} ms (${R.stats.vertices} v)`
    );
    for (const c of CS) {
      const g = blendRings(G, c, HOLES);
      const m = meshBlendRings(M, c, HOLES);
      const r = meshBlendRings(R, c, HOLES);
      const [hg, mg] = haus(g, r),
        [hm, mm] = haus(m, r);
      let extra = "";
      if (RG) {
        const rg = blendRings(RG, c, HOLES);
        const [hr, mr] = haus(r, rg);
        extra = ` ${hr.toFixed(3)} (${mr.toFixed(4)}) |`;
      }
      rows.push(
        `| ${d.id} | ${si} | ${c} | ${share(g).toFixed(4)} | ${share(m).toFixed(4)} | ${share(r).toFixed(4)} | ${hg.toFixed(3)} (${mg.toFixed(3)}) | ${hm.toFixed(3)} (${mm.toFixed(4)}) |${extra}`
      );
      console.error(rows.at(-1));
    }
  });
}
console.log(rows.join("\n"));
