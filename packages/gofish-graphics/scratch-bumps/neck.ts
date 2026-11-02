// SCRATCH round 4: measure the neck where a spine link leaves a member.
// usage: tsx neck.ts <dump-name> [neck]
import { loadDump } from "./round3";
import {
  unifiedOutline,
  nearLinks,
  routeAround,
  keepOuts,
} from "../src/ast/graphicalOperators/enclose/unified";
import { segDist } from "../src/ast/geometry/plane";
import type { Pt } from "../src/ast/graphicalOperators/enclose/blob";

const name = process.argv[2];
const neck = process.argv[3] ? +process.argv[3] : undefined;
const distTo = (p: Pt, rings: Pt[][]) => {
  let d = Infinity;
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const [a, b] = [r[i], r[(i + 1) % r.length]];
      d = Math.min(d, segDist(p[0], p[1], a[0], a[1], b[0], b[1]));
    }
  return d;
};
for (const call of loadDump(name)) {
  if (call.shape.kind !== "blob") continue;
  const pad = call.padding;
  const conv = call.shape.convexity ?? 0.5;
  const nk = neck ?? call.shape.neck ?? 1;
  const opts: any = {
    padding: pad,
    convexity: conv,
    avoiding: call.avoiding,
    clearance: call.shape.clearance,
    holes: call.shape.holes,
    connected: true,
    neck: nk,
  };
  const rings = unifiedOutline(call.members, opts);
  const links = routeAround(
    (nearLinks as any)(call.members, pad, Infinity, nk),
    keepOuts(call.avoiding, call.shape.clearance ?? 4),
    pad
  );
  const far = (p: Pt) =>
    call.members.every((m: any) =>
      m.kind === "disc"
        ? Math.hypot(p[0] - m.cx, p[1] - m.cy) > m.r + pad + 3
        : true
    );
  // half-width of the outline at points along each link (only links whose
  // middle is far from any member, so the member's own bulge is not read)
  const rs: number[] = [];
  let worst = Infinity;
  for (const l of links) {
    if (l.kind !== "segment") continue;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const p: Pt = [
        l.a[0] + t * (l.b[0] - l.a[0]),
        l.a[1] + t * (l.b[1] - l.a[1]),
      ];
      if (!far(p)) continue;
      const hw = distTo(p, rings);
      worst = Math.min(worst, hw);
      rs.push(hw);
    }
  }
  const memberHW = call.members.map((m: any) =>
    m.kind === "disc"
      ? m.r + pad
      : m.kind === "segment"
        ? m.w / 2 + pad
        : Math.min(m.w, m.h) / 2 + pad
  );
  const med = rs.slice().sort((a, b) => a - b)[Math.floor(rs.length / 2)];
  console.log(
    `${name} conv ${conv} pad ${pad} neck ${nk} | members ${call.members.length} links ${links.length}` +
      ` | padded member half-width ${Math.min(...memberHW).toFixed(2)}..${Math.max(...memberHW).toFixed(2)}` +
      ` | outline half-width at link middles: min ${worst.toFixed(2)} median ${med?.toFixed(2)}`
  );
}
