// SCRATCH: the whole blob outline (smoothed, as the playground draws it) at the default mesh and
// at the drag mesh (UNIFIED_PROTOTYPE.draft), each against a fine-mesh reference: the Hausdorff
// distance (and mean) per dataset over sets and convexities. Avoid on where the data has it.
//   BENCH=acc5 node playground/bench.mjs   (ONLY=penguins, CS=0.25,0.5)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  clearUnifiedCache,
  UNIFIED_PROTOTYPE,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import {
  MESH_BLEND,
  SegGrid,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/meshBlend";
import type { Pt } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/blob";

const ONLY = (
  process.env.ONLY ?? "penguins,chartaccent,u,munkres,bubble"
).split(",");
const CS = (process.env.CS ?? "0.1,0.25,0.5,0.75,0.9").split(",").map(Number);
const REF = { delta: 0.005, s0: 0.25, beta: 0.5, alpha: 0.12, hMax: 1.5 };

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

const outline = (d: any, s: any, c: number) =>
  unifiedOutline(s.members, {
    padding: d.padding,
    convexity: c,
    neck: 1,
    reachMeasure: "typical",
    reachDistance: "mutual",
    means: "blend",
    clearance: d.clearance,
    avoiding: d.avoidable ? s.avoiding : [],
  } as any);

console.log(
  "| dataset | default vs ref, worst / mean px | drag vs ref | drag vs default |\n|---|---|---|---|"
);
for (const d of DATA as any[]) {
  if (!ONLY.some((o) => d.id.startsWith(o))) continue;
  const run = (mode: "ref" | "def" | "draft") => {
    clearUnifiedCache();
    const keep = { ...MESH_BLEND };
    if (mode === "ref") Object.assign(MESH_BLEND, REF);
    UNIFIED_PROTOTYPE.draft = mode === "draft";
    const out = d.sets.map((s: any) => CS.map((c) => outline(d, s, c)));
    Object.assign(MESH_BLEND, keep);
    UNIFIED_PROTOTYPE.draft = false;
    return out as Pt[][][][];
  };
  const ref = run("ref"),
    def = run("def"),
    dr = run("draft");
  const agg = (X: Pt[][][][], Y: Pt[][][][]) => {
    let w = 0,
      m = 0,
      n = 0;
    X.forEach((row, si) =>
      row.forEach((A, ci) => {
        const [a, b] = haus(A, Y[si][ci]);
        w = Math.max(w, a);
        m += b;
        n++;
      })
    );
    return `${w.toFixed(2)} / ${(m / n).toFixed(3)}`;
  };
  console.log(
    `| ${d.id} | ${agg(def, ref)} | ${agg(dr, ref)} | ${agg(dr, def)} |`
  );
}
