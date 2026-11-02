// SCRATCH: round 3 measurements (cusps, convexity) on dumped enclose calls.
// usage: tsx round3.ts <cmd> [args]
import { readFileSync } from "node:fs";
import type {
  BlobMember,
  Pt,
} from "../src/ast/graphicalOperators/enclose/blob";
import {
  closingRings,
  keepIns,
  setArcsSampling,
  spineLinks,
} from "../src/ast/graphicalOperators/enclose/arcs";
import {
  smoothOutline,
  resample,
} from "../src/ast/graphicalOperators/enclose/arcsSmooth";
import {
  unifiedOutline,
  UNIFIED_STATS,
  ringsArea,
  paddedHull,
  nearLinks,
  keepOuts,
  intrusion,
} from "../src/ast/graphicalOperators/enclose/unified";
import { signedArea2, segDist, pointInRing } from "../src/ast/geometry/plane";

export type Call = {
  shape: any;
  padding: number;
  members: BlobMember[];
  avoiding: BlobMember[];
};
const DIR =
  "/Users/jmp/gofish-20250316/.claude/worktrees/enclose-shape-unify/tests/tmp/iterate/scratch/";
export function loadDump(name: string): Call[] {
  const s = readFileSync(`${DIR}enclose-round3--${name}-dump.html`, "utf8");
  const m = s.match(/<pre class="enclose-dump">([\s\S]*?)<\/pre>/)!;
  const txt = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return JSON.parse(txt);
}

/** Curvature stats of rings (region on the left: outer positive area). */
export function measure(rings: Pt[][]) {
  let minConvex = Infinity,
    minConcave = Infinity,
    maxTurn = 0,
    at: Pt = [0, 0],
    atTurn: Pt = [0, 0];
  const corners: Pt[] = [];
  for (const ring0 of rings) {
    if (ring0.length < 8) continue;
    const ring = resample(ring0, 0.5);
    const n = ring.length;
    const k = 4; // ±2 px
    for (let i = 0; i < n; i++) {
      const p = ring[(i - k + n) % n],
        q = ring[i],
        r = ring[(i + k) % n];
      const ax = q[0] - p[0],
        ay = q[1] - p[1],
        bx = r[0] - q[0],
        by = r[1] - q[1];
      const cr = ax * by - ay * bx;
      const la = Math.hypot(ax, ay),
        lb = Math.hypot(bx, by),
        lc = Math.hypot(r[0] - p[0], r[1] - p[1]);
      // y-down screen, outer rings positive signedArea2: convex turns have
      // cr > 0 (same sign as the area)
      const kap = (2 * cr) / (la * lb * lc || 1e-12);
      if (kap > 0 && 1 / kap < minConvex) {
        minConvex = 1 / kap;
        at = q;
      }
      if (kap < 0) minConcave = Math.min(minConcave, -1 / kap);
      // turn between the 1 px chords around q
      const p1 = ring[(i - 2 + n) % n],
        r1 = ring[(i + 2) % n];
      const t1 = Math.atan2(q[1] - p1[1], q[0] - p1[0]),
        t2 = Math.atan2(r1[1] - q[1], r1[0] - q[0]);
      let d = Math.abs(t2 - t1);
      if (d > Math.PI) d = 2 * Math.PI - d;
      const deg = (d * 180) / Math.PI;
      if (deg > maxTurn) {
        maxTurn = deg;
        atTurn = q;
      }
      if (deg > 30) corners.push(q);
    }
  }
  // cluster corners
  const cl: Pt[] = [];
  for (const c of corners)
    if (!cl.some((d) => Math.hypot(d[0] - c[0], d[1] - c[1]) < 4)) cl.push(c);
  return { minConvex, minConcave, maxTurn, at, atTurn, corners: cl };
}

/** Least distance from each padded member to the outline (coverage): the
 *  most a padded member pokes out (> 0 bad). */
export function uncovered(rings: Pt[][], members: BlobMember[], pad: number) {
  const ks = keepIns(members, pad);
  let worst = -Infinity;
  for (const k of ks) {
    const L = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
    const n = Math.max(1, Math.ceil(L / 2));
    for (let t = 0; t <= n; t++) {
      const p: Pt = [
        k.a[0] + ((k.b[0] - k.a[0]) * t) / n,
        k.a[1] + ((k.b[1] - k.a[1]) * t) / n,
      ];
      let d = Infinity,
        w = 0;
      for (const r of rings) {
        if (pointInRing(p, r)) w += signedArea2(r) > 0 ? 1 : -1;
        for (let i = 0; i < r.length; i++) {
          const [a, b] = [r[i], r[(i + 1) % r.length]];
          d = Math.min(d, segDist(p[0], p[1], a[0], a[1], b[0], b[1]));
        }
      }
      const sd = w > 0 ? -d : d;
      worst = Math.max(worst, sd + k.R);
    }
  }
  return worst;
}

const f = (x: number, d = 2) =>
  x === Infinity ? "inf" : Number.isFinite(x) ? x.toFixed(d) : String(x);
export function line(label: string, rings: Pt[][], pad: number, extra = "") {
  const m = measure(rings);
  console.log(
    label.padEnd(44),
    `loops ${rings.length}`.padEnd(9),
    `minConvexR ${f(m.minConvex)}`.padEnd(17),
    `minConcaveR ${f(m.minConcave)}`.padEnd(19),
    `maxTurn1px ${f(m.maxTurn, 1)}°`.padEnd(18),
    `corners>30° ${m.corners.length}`,
    m.corners.length
      ? "@" +
          m.corners
            .slice(0, 6)
            .map((c) => `(${c[0].toFixed(0)},${c[1].toFixed(0)})`)
            .join("")
      : "",
    extra
  );
  return m;
}

const cmd = process.argv[2];
if (cmd === "cusps") {
  // the ChartAccent arcs cases, connected: false and true
  setArcsSampling(true);
  const ca = loadDump("chart-accent")[0];
  const M = ca.members;
  for (const [r, pad] of [
    [12, 6],
    [24, 6],
    [40, 6],
    [80, 6],
    [24, 10],
  ]) {
    const tag = `CA r${r} pad${pad}`;
    const before = closingRings(M, pad, r);
    line(`${tag} closing (today's arcs)`, before, pad);
    const sm = smoothOutline(before, keepIns(M, pad), {
      kind: "blur",
      sigma: 6,
    });
    line(`${tag} closing + blur6`, sm, pad);
    const t = performance.now();
    const after = unifiedOutline(M, {
      padding: pad,
      radius: r,
      connected: false,
      smooth: null,
    });
    const ms = performance.now() - t;
    let sep = Infinity;
    for (let i = 0; i < after.length; i++)
      for (let j = i + 1; j < after.length; j++)
        for (const p of after[i])
          for (const q of after[j])
            sep = Math.min(sep, Math.hypot(p[0] - q[0], p[1] - q[1]));
    line(
      `${tag} near-links + closing`,
      after,
      pad,
      `links ${UNIFIED_STATS.links} ${ms.toFixed(0)}ms unc ${f(uncovered(after, M, pad))} piece gap ${f(sep)} (2r ${2 * r})`
    );
    const after2 = unifiedOutline(M, {
      padding: pad,
      radius: r,
      connected: false,
    });
    line(
      `${tag} near-links + closing + blur6`,
      after2,
      pad,
      `unc ${f(uncovered(after2, M, pad))}`
    );
    // (a) opening by pad after the closing = closing_{r+pad}(M) ⊕ pad
    {
      const C = closingRings(M, 0, r + pad);
      const segs: BlobMember[] = C.flatMap((ring) =>
        resample(ring, 1).map((p, i, a) => ({
          kind: "segment" as const,
          a: p,
          b: a[(i + 1) % a.length],
          w: 0,
        }))
      );
      const O = closingRings(segs, pad, 0);
      line(
        `${tag} (a) opening by pad`,
        O,
        pad,
        `unc ${f(uncovered(O, M, pad))}`
      );
      const m = measure(O);
      // the concave notches: turn > 30° at a concave point
      void m;
    }
    const sp = [...M, ...spineLinks(M, 0)];
    const spc = closingRings(sp, pad, r);
    line(`${tag} spine + closing`, spc, pad);
    line(
      `${tag} spine + closing + blur6`,
      smoothOutline(spc, keepIns(sp, pad), { kind: "blur", sigma: 6 }),
      pad
    );
  }
} else if (cmd === "bt") {
  setArcsSampling(true);
  for (const name of process.argv.slice(3)) {
    const calls = loadDump(name);
    let worstB = 0,
      worstA = 0,
      nb = 0,
      na = 0,
      ms = 0,
      msb = 0,
      minCvxA = Infinity,
      minCvxB = Infinity;
    calls.forEach((c, i) => {
      if (c.shape.kind !== "arcs") return;
      const r = c.shape.radius ?? 12;
      let t = performance.now();
      const b = closingRings(c.members, c.padding, r);
      msb += performance.now() - t;
      const mb = measure(b);
      t = performance.now();
      const a = unifiedOutline(c.members, {
        padding: c.padding,
        radius: r,
        connected: false,
        smooth: null,
      });
      ms += performance.now() - t;
      const ma = measure(a);
      nb += mb.corners.length;
      na += ma.corners.length;
      worstB = Math.max(worstB, mb.maxTurn);
      worstA = Math.max(worstA, ma.maxTurn);
      minCvxA = Math.min(minCvxA, ma.minConvex);
      minCvxB = Math.min(minCvxB, mb.minConvex);
      if (mb.corners.length || ma.corners.length)
        console.log(
          `  call ${i} (${c.members.length} members, r ${r}, pad ${c.padding}): before corners ${mb.corners.length} ${mb.corners.map((p) => `(${p[0].toFixed(0)},${p[1].toFixed(0)})`).join("")} maxTurn ${f(mb.maxTurn, 1)} | after corners ${ma.corners.length} maxTurn ${f(ma.maxTurn, 1)} links ${UNIFIED_STATS.links}`
        );
    });
    console.log(
      `${name}: calls ${calls.length}; corners before ${nb} after ${na}; maxTurn before ${f(worstB, 1)}° after ${f(worstA, 1)}°; minConvexR before ${f(minCvxB)} after ${f(minCvxA)}; ms closing ${msb.toFixed(0)} unified ${ms.toFixed(0)}`
    );
  }
} else if (cmd === "stories") {
  setArcsSampling(process.argv[3] === "fine");
  for (const name of process.argv.slice(4)) {
    const calls = loadDump(name);
    calls.forEach((c, i) => {
      const P = c.shape;
      const opts =
        P.kind === "blob"
          ? {
              padding: c.padding,
              convexity: P.convexity ?? 0.5,
              holes: P.holes,
              clearance: P.clearance,
              avoiding: c.avoiding,
              connected: true,
            }
          : { padding: c.padding, radius: P.radius ?? 12, connected: false };
      const t = performance.now();
      const out = unifiedOutline(c.members, opts as any);
      const ms = performance.now() - t;
      line(
        `${name}#${i} ${P.kind} c=${P.convexity ?? "-"}`,
        out,
        c.padding,
        `r=${f(UNIFIED_STATS.radius ?? NaN, 1)} it ${UNIFIED_STATS.iterations} ${ms.toFixed(0)}ms unc ${f(uncovered(out, c.members, c.padding))} intrusion ${c.avoiding.length ? f(intrusion(out, keepOuts(c.avoiding, P.clearance ?? 4))) : "-"}`
      );
    });
  }
} else if (cmd === "conv") {
  // convexity sweep: area monotone, hull match
  const name = process.argv[3];
  const c0 = loadDump(name)[0];
  const pad = c0.padding;
  const hull = paddedHull([...c0.members, ...spineLinks(c0.members, 0)], pad);
  for (const cv of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.95, 0.99, 1]) {
    const t = performance.now();
    const out = unifiedOutline(c0.members, {
      padding: pad,
      convexity: cv,
      connected: true,
    });
    const ms = performance.now() - t;
    const s = { ...UNIFIED_STATS };
    const share = (s.areaGot! - s.areaUnion!) / (s.areaHull! - s.areaUnion!);
    // Hausdorff to the padded hull (for cv = 1)
    let H = 0;
    if (cv === 1) {
      const dist = (p: Pt, ring: Pt[]) => {
        let d = Infinity;
        for (let i = 0; i < ring.length; i++) {
          const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
          d = Math.min(d, segDist(p[0], p[1], a[0], a[1], b[0], b[1]));
        }
        return d;
      };
      for (const p of out[0]) H = Math.max(H, dist(p, hull));
      for (const p of hull) H = Math.max(H, dist(p, out[0]));
    }
    console.log(
      `${name} convexity ${cv.toFixed(2)}: r ${f(s.radius!, 2)} iters ${s.iterations} ${ms.toFixed(0)}ms closed share ${share.toFixed(3)} final area ${ringsArea(out).toFixed(0)} loops ${out.length}` +
        (cv === 1
          ? ` hull Hausdorff ${H.toFixed(2)}px (hull area ${s.areaHull!.toFixed(0)})`
          : "")
    );
  }
} else if (cmd === "area-curve") {
  // closed area against r (connected), to see jumps
  const name = process.argv[3];
  const c0 = loadDump(name)[0];
  const pad = c0.padding;
  const sp = [...c0.members, ...spineLinks(c0.members, 0)];
  const A0 = ringsArea(closingRings(sp, pad, 0));
  const A1 = ringsArea([paddedHull(sp, pad)]);
  let prev = 0;
  for (let r = 0; r <= 400; r += r < 40 ? 2 : r < 120 ? 4 : 20) {
    const a = ringsArea(closingRings(sp, pad, r));
    const sh = (a - A0) / (A1 - A0);
    console.log(
      `r ${r}: share ${sh.toFixed(3)}${sh - prev > 0.05 ? "  <-- jump " + (sh - prev).toFixed(3) : ""}`
    );
    prev = sh;
  }
}
