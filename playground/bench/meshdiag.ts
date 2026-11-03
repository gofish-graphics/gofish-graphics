// SCRATCH: one failing mesh: the boundary edges it misses, and the spine's own defects.
//   BENCH=meshdiag node playground/bench.mjs   (DS, SET, CLEAR, PAD, NECK, AV=0)
import DATA from "../src/datasets.json";
import { unifiedOutline } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { MESH_FAIL } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/meshBlend";
import { signedArea2 } from "../../packages/gofish-graphics/src/ast/geometry/plane";

const d = (DATA as any[]).find(
  (x) => x.id === (process.env.DS ?? "chartaccent")
);
const s = d.sets[+(process.env.SET ?? 0)];
try {
  unifiedOutline(s.members, {
    padding: +(process.env.PAD ?? d.padding),
    convexity: 0.5,
    neck: +(process.env.NECK ?? 1),
    reachMeasure: "typical",
    reachDistance: "mutual",
    means: "blend",
    clearance: +(process.env.CLEAR ?? d.clearance),
    avoiding: process.env.AV === "0" ? [] : s.avoiding,
  } as any);
  console.log("no failure");
} catch (e) {
  console.log((e as Error).message);
  const sp = MESH_FAIL.spine!;
  console.log(
    "spine rings",
    sp.map((r) => `${r.length}:${(signedArea2(r) / 2).toFixed(1)}`).join(" ")
  );
  const seen = new Map<string, number[]>();
  let dup = 0;
  sp.forEach((r, ri) =>
    r.forEach((p, i) => {
      const k = `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
      if (seen.has(k)) {
        dup++;
        if (dup < 6) console.log("dup", k, seen.get(k), [ri, i]);
      } else seen.set(k, [ri, i]);
    })
  );
  const segs: number[][] = [];
  sp.forEach((r, ri) =>
    r.forEach((p, i) => {
      const q = r[(i + 1) % r.length];
      segs.push([p[0], p[1], q[0], q[1], ri, i]);
    })
  );
  const o = (
    px: number,
    py: number,
    qx: number,
    qy: number,
    rx: number,
    ry: number
  ) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const X = (a: number[], b: number[]) =>
    o(a[0], a[1], a[2], a[3], b[0], b[1]) *
      o(a[0], a[1], a[2], a[3], b[2], b[3]) <
      0 &&
    o(b[0], b[1], b[2], b[3], a[0], a[1]) *
      o(b[0], b[1], b[2], b[3], a[2], a[3]) <
      0;
  let nx = 0;
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++)
      if (X(segs[i], segs[j])) {
        nx++;
        if (nx < 6)
          console.log(
            "cross",
            segs[i].map((v) => +v.toFixed(3)),
            segs[j].map((v) => +v.toFixed(3))
          );
      }
  console.log({ dup, crossings: nx, missing: MESH_FAIL.miss?.length });
  for (const m of (MESH_FAIL.miss ?? []).slice(0, 6))
    console.log(
      "miss",
      m.map((v) => +v.toFixed(4)),
      "len",
      Math.hypot(m[2] - m[0], m[3] - m[1]).toExponential(2)
    );
}
