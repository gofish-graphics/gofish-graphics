// SCRATCH: the mesh knobs against accuracy: per knob setting, the mesh size, build time and the
// worst Hausdorff distance (and worst area-share error) to the fine-mesh reference over sets
// and c, before smoothing.   BENCH=meshsweep node playground/bench.mjs
import DATA from "../src/datasets.json";
import { nearLinks } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import {
  closingRings,
  withArcsTolerance,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import {
  buildMeshBlend,
  meshBlendRings,
  MESH_BLEND,
  SegGrid,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/meshBlend";
import {
  buildBlend,
  blendRings,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/localFill";
import { paddedHull } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { keepIns } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { smoothOutline } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcsSmooth";
import type { Pt } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/blob";

const CS = [0.1, 0.25, 0.5, 0.75];
const SETS: [string, number][] = [
  ["chartaccent", 0],
  ["u", 0],
  ["penguins", 0],
  ["hyperedges", 2],
];
let WHERE: Pt = [0, 0];
function oneSided(A: Pt[][], B: Pt[][]): number {
  const s: number[] = [];
  for (const r of B)
    for (let i = 0; i < r.length; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      s.push(a[0], a[1], b[0], b[1]);
    }
  const G = new SegGrid(Float64Array.from(s), 2);
  let most = 0;
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
        const p: Pt = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        const dd = G.nearest(p[0], p[1])[0];
        if (dd > most) [most, WHERE] = [dd, p];
      }
    }
  return most;
}
const haus = (A: Pt[][], B: Pt[][]) => Math.max(oneSided(A, B), oneSided(B, A));
const area = (rs: Pt[][]) =>
  rs.reduce((t, r) => {
    let a = 0;
    for (let i = 0; i < r.length; i++) {
      const p = r[i],
        q = r[(i + 1) % r.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return t + a / 2;
  }, 0);
const base = { ...MESH_BLEND };
const inputs = SETS.map(([id, si]) => {
  const d = (DATA as any[]).find((x) => x.id === id);
  const s = d.sets[si];
  const all = [...s.members, ...nearLinks(s.members, d.padding, Infinity, 1)];
  const fine = withArcsTolerance(+(process.env.SPTOL ?? 0.05), () =>
    closingRings(all, d.padding, d.padding, false)
  );
  Object.assign(MESH_BLEND, {
    delta: 0.005,
    s0: 0.25,
    beta: 0.5,
    alpha: 0.12,
    hMax: 1.5,
  });
  const R = buildMeshBlend(
    withArcsTolerance(0.01, () =>
      closingRings(all, d.padding, d.padding, false)
    )
  );
  Object.assign(MESH_BLEND, base);
  const ref = CS.map((c) => meshBlendRings(R, c, false));
  const keep = keepIns(all, d.padding);
  const sm = (rs: Pt[][]) =>
    smoothOutline(rs, keep, { kind: "blur", sigma: 6 });
  const refS = ref.map(sm);
  const A0 = area(fine);
  const A1 = area([R.hull]);
  const coarse = closingRings(all, d.padding, d.padding, false);
  const G = buildBlend(coarse, paddedHull(all, d.padding));
  const grid = CS.map((c) => blendRings(G, c, false));
  return {
    id,
    fine,
    ref,
    refS,
    sm,
    A0,
    A1,
    grid,
    msGrid: G.ms,
    gA0: area(coarse),
    gA1: area([paddedHull(all, d.padding)]),
  };
});
const KNOBS: Partial<typeof MESH_BLEND>[] = JSON.parse(
  process.env.KNOBS ??
    JSON.stringify([
      {},
      { s0: 2 },
      { s0: 2, alpha: 0.5, hMax: 12 },
      { s0: 3, alpha: 0.5, hMax: 12 },
      { s0: 4, alpha: 0.5, hMax: 16 },
      { s0: 2, alpha: 0.5, hMax: 12, beta: 1 },
      { s0: 3, alpha: 0.7, hMax: 20, beta: 1 },
    ])
);
console.log(
  "| knobs | vertices (per set) | build ms | worst Hausdorff px (per set) | after smoothing | worst share error |"
);
console.log("|---|---|---|---|---|---|");
{
  const hs: string[] = [],
    hss: string[] = [];
  let worstShare = 0;
  for (const inp of inputs) {
    let h = 0,
      hS = 0;
    CS.forEach((c, q) => {
      h = Math.max(h, haus(inp.grid[q], inp.ref[q]));
      hS = Math.max(hS, haus(inp.sm(inp.grid[q]), inp.refS[q]));
      worstShare = Math.max(
        worstShare,
        Math.abs((area(inp.grid[q]) - inp.gA0) / (inp.gA1 - inp.gA0) - c)
      );
    });
    hs.push(h.toFixed(3));
    hss.push(hS.toFixed(3));
  }
  console.log(
    `| grid 1 px | | ${inputs.reduce((t, i) => t + i.msGrid, 0).toFixed(0)} | ${hs.join(", ")} | ${hss.join(", ")} | ${worstShare.toExponential(1)} |`
  );
}
for (const k of KNOBS) {
  Object.assign(MESH_BLEND, base, k);
  const vs: number[] = [],
    hs: string[] = [],
    hss: string[] = [];
  let ms = 0,
    worstShare = 0;
  for (const inp of inputs) {
    // warm once (JIT), then time
    buildMeshBlend(inp.fine);
    const t = performance.now();
    const M = buildMeshBlend(inp.fine);
    ms += performance.now() - t;
    vs.push(M.stats.vertices);
    let h = 0,
      hS = 0;
    CS.forEach((c, q) => {
      const rs = meshBlendRings(M, c, false);
      const hh = haus(rs, inp.ref[q]);
      if (process.env.WHERE && hh > 0.2)
        console.error(
          `${inp.id} c ${c}: ${hh.toFixed(3)} at ${WHERE.map((x) => x.toFixed(1))}`
        );
      h = Math.max(h, hh);
      hS = Math.max(hS, haus(inp.sm(rs), inp.refS[q]));
      worstShare = Math.max(
        worstShare,
        Math.abs((area(rs) - inp.A0) / (area([M.hull]) - inp.A0) - c)
      );
    });
    hs.push(h.toFixed(3));
    hss.push(hS.toFixed(3));
  }
  console.log(
    `| ${JSON.stringify(k)} | ${vs.join(", ")} | ${ms.toFixed(0)} | ${hs.join(", ")} | ${hss.join(", ")} | ${worstShare.toExponential(1)} |`
  );
}
