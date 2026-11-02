// SCRATCH: overlay SVG of the per-bay blend outlines (grid red, mesh blue, reference black) at
// one c, with the mesh's triangles faint, for looking at where they differ.
//   BENCH=blenddbg DS=u C=0.1 OUT=/tmp/x.svg node playground/bench.mjs
import { writeFileSync } from "node:fs";
import DATA from "../src/datasets.json";
import {
  nearLinks,
  paddedHull,
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
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/meshBlend";
import type { Pt } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/blob";

const d = (DATA as any[]).find((x) => x.id === (process.env.DS ?? "u"));
const s = d.sets[+(process.env.SET ?? 0)];
const c = +(process.env.C ?? 0.1);
const pad = d.padding;
const all = [...s.members, ...nearLinks(s.members, pad, Infinity, 1)];
const coarse = closingRings(all, pad, pad, false);
const hull = paddedHull(all, pad);
const G = buildBlend(coarse, hull);
if (process.env.KNOB) Object.assign(MESH_BLEND, JSON.parse(process.env.KNOB));
const M = buildMeshBlend(
  withArcsTolerance(0.05, () => closingRings(all, pad, pad, false))
);

const S0 = { ...MESH_BLEND };
Object.assign(MESH_BLEND, {
  delta: 0.005,
  s0: 0.25,
  beta: 0.5,
  alpha: 0.12,
  hMax: 1.5,
});
const R = process.env.NOREF
  ? M
  : buildMeshBlend(
      withArcsTolerance(0.01, () => closingRings(all, pad, pad, false))
    );
Object.assign(MESH_BLEND, S0);
const path = (rs: Pt[][]) =>
  rs
    .map(
      (r) =>
        "M" +
        r.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("L") +
        "Z"
    )
    .join("");
const pts = hull;
const xs = pts.map((p) => p[0]),
  ys = pts.map((p) => p[1]);
const [x0, y0] = [Math.min(...xs) - 5, Math.min(...ys) - 5];
const [w, h] = [Math.max(...xs) - x0 + 5, Math.max(...ys) - y0 + 5];
let tris = "";
if (process.env.TRI)
  for (let t = 0; t < M.tri.length / 3; t++) {
    const v = [M.tri[3 * t], M.tri[3 * t + 1], M.tri[3 * t + 2]];
    tris += `M${v.map((q) => `${M.X[q].toFixed(2)},${M.Y[q].toFixed(2)}`).join("L")}Z`;
  }
const vb = process.env.VB ?? `${x0} ${y0} ${w} ${h}`;
const sw = +(process.env.SW ?? 0.6);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${process.env.W ?? 1400}" style="background:white">
<path d="${path(coarse)}" fill="#eee" stroke="none"/>
<path d="${path([hull])}" fill="none" stroke="#bbb" stroke-width="${sw}"/>
<path d="${tris}" fill="none" stroke="#9cf" stroke-width="${sw / 6}"/>
<path d="${path(meshBlendRings(R, c, false))}" fill="none" stroke="black" stroke-width="${sw * 2}"/>
<path d="${path(blendRings(G, c, false))}" fill="none" stroke="red" stroke-width="${sw}"/>
<path d="${path(meshBlendRings(M, c, false))}" fill="none" stroke="#06f" stroke-width="${sw}"/>
</svg>`;
writeFileSync(process.env.OUT ?? "/tmp/blenddbg.svg", svg);
