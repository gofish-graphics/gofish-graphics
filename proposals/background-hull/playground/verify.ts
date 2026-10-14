// Node check: every dataset at the defaults and both presets returns non-empty closed loops,
// with holes off and on, and (on a dataset with an avoid checkbox) avoiding nothing and avoiding.
// Run: node build.mjs --verify
import { writeFileSync } from "node:fs";
import { DATASETS } from "./src/datasets";
import { computeDataset, type Params } from "./src/compute";

const settings: [string, (pad: number) => Partial<Params>][] = [
  ["defaults", (pad) => ({ convexity: 0.5, neck: 1, roundness: pad })],
  ["hull", (pad) => ({ convexity: 1, neck: 1, roundness: pad })],
  ["spine", (pad) => ({ convexity: 0, neck: 1, roundness: pad })],
];
let bad = 0;
for (const d of DATASETS)
  for (const avoid of d.avoidToggle ? [false, true] : [true])
    for (const holes of [false, true])
      for (const [name, f] of settings) {
        const p = {
          padding: d.padding,
          clearance: d.clearance,
          holes,
          avoid,
          ...f(d.padding),
        } as Params;
        const t0 = performance.now();
        const out = computeDataset(d, p);
        const t1 = performance.now();
        // a roundness change: the construction reuses its traced region and reruns the rounding only
        computeDataset(d, { ...p, roundness: p.roundness / 2 });
        const t2 = performance.now();
        const ok = out.every(
          (s) =>
            s.loops.length > 0 &&
            s.loops.every(
              (l) =>
                l.length >= 8 &&
                l.every((q) => isFinite(q[0]) && isFinite(q[1]))
            )
        );
        if (!ok) bad++;
        const loops = out.map((s) => s.loops.length).join("+");
        const id = `${d.id}${d.avoidToggle ? (avoid ? " avoid" : " free") : ""}`;
        console.log(
          `${id.padEnd(18)} holes ${holes ? "on " : "off"} ${name.padEnd(9)} ${ok ? "ok " : "BAD"} loops ${loops.padEnd(8)} first ${(t1 - t0).toFixed(1).padStart(6)} ms   roundness change ${(t2 - t1).toFixed(1).padStart(5)} ms`
        );
      }
if (bad) {
  console.error(`${bad} failures`);
  process.exit(1);
}
// DUMP=<file>: write every result, to compare two ports for identical output.
if (process.env.DUMP) {
  const all = DATASETS.flatMap((d) =>
    settings.map(([, f]) =>
      computeDataset(d, {
        padding: d.padding,
        clearance: d.clearance,
        holes: false,
        ...f(d.padding),
      } as Params).map((s) => ({
        loops: s.loops,
        links: s.skel.links,
        faces: s.skel.faces,
      }))
    )
  );
  writeFileSync(process.env.DUMP, JSON.stringify(all));
}
