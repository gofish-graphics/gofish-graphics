// SCRATCH: the blob's keep-out cut.   BENCH=avoid MODE=base|check OUT=… node playground/bench.mjs
// base: every dataset's blob outlines with avoiding off, at convexity 0..2 × neck 1, 0.6 ×
//   connection 1, 0.8, 0.5, 0.2, 0, and holes, written to OUT (JSON) for a byte comparison.
// check: avoiding on, the least distance from an outline point to a kept-out member, over the
//   points off the padded members (the cut never enters them) and over all points, and the
//   pieces against avoiding off (a cut that severs a piece adds one).
import { writeFileSync } from "node:fs";
import DATA from "../src/datasets.json";
import { unifiedOutline } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { SEPARATE } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/separate";
if (process.env.ROUND) SEPARATE.round = +process.env.ROUND;
if (process.env.FILLET) SEPARATE.fillet = +process.env.FILLET;
// the cut never enters the padded members: a point on them (within ZONE px) inside a keep-out
// is the member's own overlap with it (inherent), so "off the padded members" leaves them out
const ZONE = process.env.ZONE ? +process.env.ZONE : 0.05;
// SHAPES: which shapes check covers (default blob, fillet, box)
const SHAPES = (process.env.SHAPES ?? "blob,fillet,box").split(",");
type Pt = [number, number];
const D = DATA as any[];
const CS = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2];
const CONN = [1, 0.8, 0.5, 0.2, 0];
const segD = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L = dx * dx + dy * dy;
  const t = L
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const memberDist = (p: Pt, m: any) => {
  if (m.kind === "disc") return Math.hypot(p[0] - m.cx, p[1] - m.cy) - m.r;
  if (m.kind === "segment")
    return segD(p, m.a, m.b) - Math.max(m.w, m.w2 ?? m.w) / 2;
  const dx = Math.max(m.x - p[0], 0, p[0] - m.x - m.w),
    dy = Math.max(m.y - p[1], 0, p[1] - m.y - m.h);
  return dx === 0 && dy === 0 ? -1 : Math.hypot(dx, dy);
};
const centre = (m: any): Pt =>
  m.kind === "disc"
    ? [m.cx, m.cy]
    : m.kind === "segment"
      ? [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2]
      : [m.x + m.w / 2, m.y + m.h / 2];
// the keep-out disc's radius (unified.ts, keepOuts; segments approximated by their middle)
const keepR = (m: any, cl: number) =>
  m.kind === "disc"
    ? m.r + cl
    : m.kind === "segment"
      ? m.w / 2 + cl
      : Math.hypot(m.w, m.h) / 2 + cl;
const signed = (r: Pt[]) =>
  r.reduce((s, p, i) => {
    const q = r[(i + 1) % r.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0);
const outer = (rings: Pt[][]) => rings.filter((r) => signed(r) > 0).length;

if (process.env.MODE === "base") {
  const out: Record<string, unknown> = {};
  for (const d of D)
    d.sets.forEach((s: any, si: number) => {
      const cases: [string, Record<string, unknown>][] = [];
      for (const c of [0, 0.25, 0.5, 0.75, 1, 1.5, 2])
        for (const neck of [1, 0.6])
          for (const connection of CONN)
            cases.push([
              `c${c} n${neck} k${connection}`,
              { convexity: c, neck, connection },
            ]);
      for (const connection of [1, 0.5])
        for (const c of [0, 0.5])
          cases.push([
            `holes c${c} k${connection}`,
            { convexity: c, holes: true, connection },
          ]);
      for (const [k, o] of cases)
        out[`${d.id}/${si}/${k}`] = unifiedOutline(s.members, {
          padding: d.padding,
          ...o,
        });
    });
  writeFileSync(process.env.OUT!, JSON.stringify(out));
  console.log(`${Object.keys(out).length} outlines → ${process.env.OUT}`);
} else {
  const ONLY = process.env.DS?.split(",");
  for (const d of D.filter(
    (x) => x.avoidable && (!ONLY || ONLY.includes(x.id))
  )) {
    let worstOff = Infinity,
      worstAll = Infinity,
      at = "",
      atAll = "",
      worstFree = Infinity,
      atFree = "";
    const severed: string[] = [];
    const cases: [string, Record<string, unknown>][] = [];
    if (SHAPES.includes("blob"))
      for (const neck of [1, 0.6])
        for (const connection of CONN)
          for (const c of CS)
            cases.push([
              `c${c} k${connection} n${neck}`,
              { convexity: c, neck, connection },
            ]);
    if (SHAPES.includes("fillet"))
      for (const radius of [d.padding, 12])
        for (const neck of [0, 0.5])
          cases.push([
            `fillet r${radius} n${neck}`,
            { shape: "fillet", radius, neck },
          ]);
    if (SHAPES.includes("box")) cases.push(["box", { shape: "box" }]);
    for (const [name, co] of cases)
      d.sets.forEach((s: any, si: number) => {
        const o = { padding: d.padding, ...co };
        const rings = unifiedOutline(s.members, {
          ...o,
          avoiding: s.avoiding,
          clearance: d.clearance,
        }) as Pt[][];
        const n0 = outer(unifiedOutline(s.members, o) as Pt[][]);
        const n1 = outer(rings);
        if (n1 !== n0) severed.push(`set${si} ${name}: ${n0}→${n1}`);
        for (const ring of rings)
          for (const p of ring) {
            let own = Infinity;
            for (const m of s.members) own = Math.min(own, memberDist(p, m));
            let v = Infinity,
              vm: any = null;
            for (const m of s.avoiding) {
              const x = memberDist(p, m);
              if (x < v) [v, vm] = [x, m];
            }
            // the nearest kept-out member's keep-out overlaps no padded member: no
            // junction there, so nothing inherent lets the outline in
            if (vm && v < worstFree) {
              const kc = centre(vm),
                R = keepR(vm, d.clearance);
              const free = s.members.every(
                (m: any) => memberDist(kc, m) - d.padding >= R
              );
              if (free)
                [worstFree, atFree] = [
                  v,
                  `set${si} ${name} (${(own - d.padding).toFixed(2)} px off padded members)`,
                ];
            }
            const tag = `set${si} ${name} (${(own - d.padding).toFixed(2)} px off padded members)`;
            if (v < worstAll) [worstAll, atAll] = [v, tag];
            if (own > d.padding + ZONE && v < worstOff)
              [worstOff, at] = [v, tag];
          }
      });
    console.log(
      `${d.id} (clearance ${d.clearance}): min more than ${ZONE} px off the padded members ${worstOff.toFixed(2)} at ${at}; min over all points ${worstAll.toFixed(2)} at ${atAll}`
    );
    console.log(
      `  min where the keep-out overlaps no padded member: ${worstFree.toFixed(2)} at ${atFree}`
    );
    console.log(
      `  piece counts changed by the cut: ${severed.length}${severed.length ? " e.g. " + severed.slice(0, 8).join("; ") : ""}`
    );
  }
}
