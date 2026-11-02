// SCRATCH: exact turning angles of the pieces of the arcs outline, from the
// concave arcs' centers (union corners) and the members' centers.
// usage: tsx exact.ts <html> <radius> [none]
import { load } from "./load";
import { curvature, classify, pieces } from "./analyze";
import {
  arcsOutline,
  ARCS_PROTOTYPE,
  spineLinks,
} from "../src/ast/graphicalOperators/enclose/arcs";
import type { Pt } from "../src/ast/graphicalOperators/enclose/blob";

const { members } = load(process.argv[2]);
const pad = 6,
  radius = +(process.argv[3] ?? 24);
ARCS_PROTOTYPE.spine = process.argv[4] === "none" ? undefined : 0;
const ring = arcsOutline(members, { padding: pad, radius }).sort(
  (a, b) => b.length - a.length
)[0];
const links = spineLinks(members, 0).map(
  (m: any) => [m.a, m.b, m.w] as [Pt, Pt, number]
);
const ms = members as any[];
const cls = classify(ring, ms, pad, radius, links);
const ps = pieces(ring, cls, curvature(ring));
const n = ring.length;
const circ = (a: Pt, b: Pt, c: Pt): Pt => {
  const d =
    2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  const ux =
    ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) +
      (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) +
      (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) /
    d;
  const uy =
    ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) +
      (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) +
      (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) /
    d;
  return [ux, uy];
};
// the center of each C piece (its samples lie on a circle of radius r)
const center = (p: (typeof ps)[number]): Pt | null => {
  const idx: number[] = [];
  for (let i = p.i0; ; i = (i + 1) % n) {
    idx.push(i);
    if (i === p.i1) break;
  }
  if (idx.length < 3) {
    // widen by one sample either side (the joints are on the arc too)
    idx.unshift((p.i0 - 1 + n) % n);
    idx.push((p.i1 + 1) % n);
  }
  return circ(ring[idx[0]], ring[idx[idx.length >> 1]], ring[idx.at(-1)!]);
};
const deg = (x: number) => ((x * 180) / Math.PI).toFixed(1);
const ang = (o: Pt, a: Pt, b: Pt) => {
  const t1 = Math.atan2(a[1] - o[1], a[0] - o[0]),
    t2 = Math.atan2(b[1] - o[1], b[0] - o[0]);
  let d = Math.abs(t2 - t1);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
};
const want = (process.argv[5] ?? "").split(",").filter(Boolean);
for (let k = 0; k < ps.length; k++) {
  const p = ps[k];
  if (!p.kind.startsWith("M")) continue;
  const i = +p.kind.slice(1);
  if (want.length && !want.includes(p.kind)) continue;
  const prev = ps[(k - 1 + ps.length) % ps.length],
    next = ps[(k + 1) % ps.length];
  if (prev.kind !== "C" || next.kind !== "C") continue;
  const v1 = center(prev)!,
    v2 = center(next)!;
  const c: Pt = [ms[i].cx, ms[i].cy];
  const t = ang(c, v1, v2);
  const R = ms[i].r + pad;
  console.log(
    p.kind.padEnd(4),
    `png(${(c[0] + 20).toFixed(0)},${c[1].toFixed(0)})`,
    `member arc R ${R} turn ${deg(t)}° len ${(R * t).toFixed(1)}px height ${(R * (1 - Math.cos(t / 2))).toFixed(2)}px`,
    `| |v-c| ${Math.hypot(v1[0] - c[0], v1[1] - c[1]).toFixed(2)}, ${Math.hypot(v2[0] - c[0], v2[1] - c[1]).toFixed(2)}`
  );
}
