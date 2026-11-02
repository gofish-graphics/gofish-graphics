// SCRATCH: evaluate smoothing candidates on the ChartAccent members.
// usage: tsx evalc.ts <html> [json configs]
import { load } from "./load";
import {
  arcsOutline,
  ARCS_PROTOTYPE,
  spineLinks,
} from "../src/ast/graphicalOperators/enclose/arcs";
import { resample } from "../src/ast/graphicalOperators/enclose/arcsSmooth";
import type { Pt } from "../src/ast/graphicalOperators/enclose/blob";
import { pointInRing, segDist, signedArea2 } from "../src/ast/geometry/plane";

const { members } = load(process.argv[2]);
const pad = 6;
const links = spineLinks(members, 0) as any[];

/** Curvature on a 1 px resample, from points k apart, sign + = convex. */
function kappa(ring: Pt[], k = 2): { r: Pt[]; kap: number[] } {
  let r = resample(ring, 1);
  const sgn = signedArea2(r) > 0 ? 1 : -1;
  const n = r.length;
  const kap = r.map((_, i) => {
    const p = r[(i - k + n) % n],
      q = r[i],
      s = r[(i + k) % n];
    const ax = q[0] - p[0],
      ay = q[1] - p[1],
      bx = s[0] - q[0],
      by = s[1] - q[1];
    const cr = ax * by - ay * bx;
    const la = Math.hypot(ax, ay),
      lb = Math.hypot(bx, by),
      lc = Math.hypot(s[0] - p[0], s[1] - p[1]);
    return (sgn * 2 * cr) / (la * lb * lc || 1e-12);
  });
  return { r, kap };
}

function stats(rings: Pt[][]) {
  const big = rings.reduce((a, b) =>
    Math.abs(signedArea2(a)) > Math.abs(signedArea2(b)) ? a : b
  );
  const outerSign = Math.sign(signedArea2(big));
  const holes = rings.filter(
    (r) => Math.sign(signedArea2(r)) !== outerSign
  ).length;
  const pieces = rings.length - holes;
  // coverage: min clearance over members' padded circles (and links)
  const inside = (p: Pt) => {
    let c = 0;
    for (const r of rings) if (pointInRing(p, r)) c++;
    return c % 2 === 1;
  };
  const dist = (p: Pt) => {
    let d = Infinity;
    for (const r of rings)
      for (let i = 0; i < r.length; i++) {
        const [a, b] = [r[i], r[(i + 1) % r.length]];
        d = Math.min(d, segDist(p[0], p[1], a[0], a[1], b[0], b[1]));
      }
    return d;
  };
  let minM = Infinity;
  const cls: number[] = [];
  for (const m of members as any[]) {
    const c: Pt = [m.cx, m.cy];
    const cl = (inside(c) ? 1 : -1) * dist(c) - (m.r + pad);
    minM = Math.min(minM, cl);
    cls.push(cl);
  }
  cls.sort((a, b) => a - b);
  // "touching" members: those within 0.5 px of the outline
  const touch = cls.filter((x) => x < 0.5).length;
  const area = rings.reduce((a, r) => a + signedArea2(r) / 2, 0) * outerSign;
  let minL = Infinity;
  for (const l of links) {
    for (let t = 0; t <= 10; t++) {
      const p: Pt = [
        l.a[0] + ((l.b[0] - l.a[0]) * t) / 10,
        l.a[1] + ((l.b[1] - l.a[1]) * t) / 10,
      ];
      minL = Math.min(minL, (inside(p) ? 1 : -1) * dist(p) - pad);
    }
  }
  // bumps: inflections and short convex runs between concave runs
  let infl = 0,
    shortConvex = 0,
    maxK = 0,
    maxJump = 0,
    len = 0;
  for (const ring of rings) {
    const { r, kap } = kappa(ring);
    len += r.length;
    const n = r.length;
    const H = 0.01;
    const sgns: number[] = [];
    for (const v of kap) if (Math.abs(v) > H) sgns.push(Math.sign(v));
    // runs over the thresholded sign
    const runs: { s: number; l: number; turn: number }[] = [];
    let cur = 0;
    for (let i = 0; i < n; i++) {
      maxK = Math.max(maxK, kap[i]);
      maxJump = Math.max(maxJump, Math.abs(kap[(i + 1) % n] - kap[i]));
      const s = Math.abs(kap[i]) > H ? Math.sign(kap[i]) : cur;
      if (s !== cur || runs.length === 0) {
        runs.push({ s, l: 0, turn: 0 });
        cur = s;
      }
      runs.at(-1)!.l++;
      runs.at(-1)!.turn += kap[i];
    }
    if (runs.length > 1 && runs[0].s === runs.at(-1)!.s) {
      runs[0].l += runs.at(-1)!.l;
      runs[0].turn += runs.at(-1)!.turn;
      runs.pop();
    }
    const R = runs.filter((x) => x.s !== 0);
    for (let i = 0; i < R.length; i++)
      if (R[i].s !== R[(i + 1) % R.length].s) infl++;
    for (let i = 0; i < R.length; i++) {
      const x = R[i];
      if (x.s > 0 && (x.turn * 180) / Math.PI < 60) shortConvex++;
    }
  }
  return {
    pieces,
    holes,
    minM,
    minL,
    infl,
    shortConvex,
    maxK,
    maxJump,
    len,
    touch,
    area,
  };
}

type Cfg = { name: string; radius: number; spine?: number; smooth?: any };
const cfgs: Cfg[] = process.argv[3]
  ? JSON.parse(process.argv[3])
  : [{ name: "base", radius: 24, spine: 0 }];
for (const c of cfgs) {
  ARCS_PROTOTYPE.spine = c.spine;
  ARCS_PROTOTYPE.smooth = c.smooth;
  arcsOutline(members, { padding: pad, radius: c.radius }); // warm
  const t = performance.now();
  const N = 3;
  let rings: Pt[][] = [];
  for (let i = 0; i < N; i++)
    rings = arcsOutline(members, { padding: pad, radius: c.radius });
  const ms = (performance.now() - t) / N;
  const s = stats(rings);
  console.log(
    c.name.padEnd(22),
    `ms ${ms.toFixed(1)}`.padEnd(9),
    `pieces ${s.pieces} holes ${s.holes}`,
    `minClear member ${s.minM.toFixed(2)} link ${s.minL.toFixed(2)}`,
    `touch ${s.touch} area ${s.area.toFixed(0)}`,
    `| infl ${s.infl} shortConvex ${s.shortConvex} maxK ${s.maxK.toFixed(3)} maxJump ${s.maxJump.toFixed(3)} len ${s.len}`
  );
}
