// SCRATCH: what changes at join ∞ when typical × reach draws the HDBSCAN tree's edges rather
// than the gap tree's: per dataset and set, the edges that differ, the drawn links' total
// length, and the outline's area and symmetric difference (by a 1 px raster), at the page's
// opening settings (convexity 0.5, neck 1, blend).
//   BENCH=join4inf node playground/bench.mjs
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  ringsArea,
  joinLinks,
  JOIN_PROTOTYPE,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import {
  pointInRing,
  signedArea2,
} from "../../packages/gofish-graphics/src/ast/geometry/plane";

const inside = (rings: any[], p: [number, number]) => {
  let w = 0;
  for (const r of rings)
    if (pointInRing(p, r)) w += signedArea2(r) > 0 ? 1 : -1;
  return w > 0;
};
const run = (d: any, s: any, links: "tree" | "gap") => {
  JOIN_PROTOTYPE.links = links;
  return unifiedOutline(s.members, {
    padding: d.padding,
    convexity: 0.5,
    neck: 1,
    join: Infinity,
    joinMeasure: "typical",
    joinDistance: "reach",
    means: "blend",
    avoiding: d.avoidDefault ? s.avoiding : [],
    clearance: d.clearance,
  });
};
console.log(
  "| dataset | set | n | edges differing | link length gap → reach tree | area | symmetric difference |\n|---|---|---|---|---|---|---|"
);
for (const d of DATA as any[]) {
  d.sets.forEach((s: any, si: number) => {
    const n = s.members.length;
    if (n < 3) return;
    const gt = joinLinks(s.members, d.padding, Infinity, 1, "px", "plain").tree;
    const rt = joinLinks(
      s.members,
      d.padding,
      Infinity,
      1,
      "typical",
      "reach"
    ).tree;
    const ek = (e: any) => `${Math.min(e.i, e.j)}-${Math.max(e.i, e.j)}`;
    const gs = new Set(gt.map(ek));
    const diff = rt.filter((e) => !gs.has(ek(e))).length;
    const len = (t: any[]) =>
      t
        .filter((e) => !e.overlap)
        .reduce((a, e) => a + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 0);
    const A = run(d, s, "gap"),
      B = run(d, s, "tree");
    // symmetric difference on a 1 px raster over the box of both
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of [...A, ...B])
      for (const [x, y] of r) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    let sd = 0;
    if (diff)
      for (let y = Math.floor(y0); y <= y1; y++)
        for (let x = Math.floor(x0); x <= x1; x++)
          if (inside(A, [x + 0.5, y + 0.5]) !== inside(B, [x + 0.5, y + 0.5]))
            sd++;
    console.log(
      `| ${d.label} | ${si + 1} | ${n} | ${diff} of ${rt.length} | ${len(gt).toFixed(0)} → ${len(rt).toFixed(0)} px | ${ringsArea(A).toFixed(0)} → ${ringsArea(B).toFixed(0)} px² | ${sd} px² |`
    );
  });
}
JOIN_PROTOTYPE.links = "tree";
