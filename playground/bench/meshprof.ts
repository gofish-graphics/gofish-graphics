// SCRATCH: the mesh blend's build phases per dataset/set (warm JIT: built twice, second timed).
//   BENCH=meshprof KNOB='{"s0":2}' node playground/bench.mjs
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
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/meshBlend";
import { Session } from "node:inspector/promises";
const sess = process.env.PROF ? new Session() : undefined;
if (sess) {
  sess.connect();
  await sess.post("Profiler.enable");
  await sess.post("Profiler.start");
}
if (process.env.KNOB) Object.assign(MESH_BLEND, JSON.parse(process.env.KNOB));
const ONLY = process.env.ONLY?.split(",");
for (const d of DATA as any[]) {
  if (ONLY && !ONLY.includes(d.id)) continue;
  d.sets.forEach((s: any, si: number) => {
    const all = [...s.members, ...nearLinks(s.members, d.padding, Infinity, 1)];
    let t = performance.now();
    const fine = withArcsTolerance(0.05, () =>
      closingRings(all, d.padding, d.padding, false)
    );
    const msSpine = performance.now() - t;
    buildMeshBlend(fine);
    let cpu = Infinity;
    let M!: ReturnType<typeof buildMeshBlend>;
    const best: Record<string, number> = {};
    for (let k = 0; k < +(process.env.REP ?? 3); k++) {
      const c0 = process.cpuUsage();
      M = buildMeshBlend(fine);
      const c1 = process.cpuUsage(c0);
      cpu = Math.min(cpu, (c1.user + c1.system) / 1000);
      for (const [k, v] of Object.entries(M.stats))
        if (k.startsWith("ms")) best[k] = Math.min(best[k] ?? Infinity, +v);
    }
    const st = { ...M.stats, ...best };
    t = performance.now();
    for (const c of [0.1, 0.3, 0.5, 0.7, 0.9]) meshBlendRings(M, c, false);
    const msCall = (performance.now() - t) / 5;
    const ph = Object.entries(st)
      .filter(([k]) => k.startsWith("ms_"))
      .map(([k, v]) => `${k.slice(3)} ${(+v).toFixed(1)}`)
      .join(", ");
    console.log(
      `${d.id}[${si}] cpu ${cpu.toFixed(1)} | spine ${msSpine.toFixed(1)} | build ${st.ms.toFixed(1)} (${ph}) | v ${st.vertices} b ${st.boundary} out ${st.outside} unk ${st.unknowns} tri ${st.triangles} cg ${st.cg} rounds ${st.rounds} | call ${msCall.toFixed(2)}`
    );
  });
}
if (sess) {
  const { profile } = (await sess.post("Profiler.stop")) as any;
  const self = new Map<string, number>();
  const dt = profile.timeDeltas as number[];
  const byId = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
  profile.samples.forEach((id: number, i: number) => {
    const n = byId.get(id);
    const k = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`;
    self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
  });
  const lines = new Map<number, number>();
  for (const n of profile.nodes)
    if (n.callFrame.functionName === (process.env.FN ?? "buildMeshBlend"))
      for (const pt of n.positionTicks ?? [])
        lines.set(pt.line, (lines.get(pt.line) ?? 0) + pt.ticks);
  console.log(
    [...lines.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([l, t]) => `${l}:${t}`)
      .join(" ")
  );
  [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .forEach(([k, v]) => console.log(v.toFixed(0).padStart(6), k));
}
