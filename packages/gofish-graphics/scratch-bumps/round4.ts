// SCRATCH round 4: verify convexity in (1, 2] (beyond.ts) on dumped calls.
// usage: tsx round4.ts
import { loadDump, measure } from "./round3";
import {
  paddedHull,
  unifiedOutline,
  ringsArea,
  UNIFIED_STATS,
} from "../src/ast/graphicalOperators/enclose/unified";
import { beyondHull, type Beyond } from "../src/ast/graphicalOperators/enclose/beyond";
import { ovalOutline } from "../src/ast/graphicalOperators/enclose/oval";
import { keepIns } from "../src/ast/graphicalOperators/enclose/arcs";
import { pointInRing, segDist, signedArea2 } from "../src/ast/geometry/plane";
import { resample } from "../src/ast/graphicalOperators/enclose/arcsSmooth";
import type { BlobMember, Pt } from "../src/ast/graphicalOperators/enclose/blob";

const distRing = (p: Pt, r: Pt[]) => {
  let d = Infinity;
  for (let i = 0; i < r.length; i++) {
    const [a, b] = [r[i], r[(i + 1) % r.length]];
    d = Math.min(d, segDist(p[0], p[1], a[0], a[1], b[0], b[1]));
  }
  return d;
};
/** Signed distance of p to ring r (< 0 inside). */
const sd = (p: Pt, r: Pt[]) => (pointInRing(p, r) ? -1 : 1) * distRing(p, r);
const hausdorff = (A: Pt[], B: Pt[]) => {
  const a = resample(A, 1),
    b = resample(B, 1);
  let h = 0;
  for (const p of a) h = Math.max(h, distRing(p, B));
  for (const p of b) h = Math.max(h, distRing(p, A));
  return h;
};
/** The most a padded member pokes out of ring S (<= 0: held). */
const poke = (S: Pt[], members: BlobMember[], pad: number) => {
  let w = -Infinity;
  for (const k of keepIns(members, pad)) {
    const L = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
    const n = Math.max(1, Math.ceil(L / 2));
    for (let t = 0; t <= n; t++) {
      const p: Pt = [
        k.a[0] + ((k.b[0] - k.a[0]) * t) / n,
        k.a[1] + ((k.b[1] - k.a[1]) * t) / n,
      ];
      w = Math.max(w, sd(p, S) + k.R);
    }
  }
  return w;
};
/** The most ring A reaches outside ring B (<= ~0: A inside B). */
const outside = (A: Pt[], B: Pt[]) =>
  A.reduce((m, p) => Math.max(m, sd(p, B)), -Infinity);
/** Curvature jump: the largest change of curvature between neighbors 1 px
 *  apart, along the ring resampled at 0.25 px (curvature from ±1 px). */
const kappaJump = (R: Pt[]) => {
  const r = resample(R, 0.25);
  const n = r.length,
    k = 4;
  const kap: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = r[(i - k + n) % n],
      q = r[i],
      s = r[(i + k) % n];
    const cr = (q[0] - p[0]) * (s[1] - q[1]) - (q[1] - p[1]) * (s[0] - q[0]);
    const la = Math.hypot(q[0] - p[0], q[1] - p[1]),
      lb = Math.hypot(s[0] - q[0], s[1] - q[1]),
      lc = Math.hypot(s[0] - p[0], s[1] - p[1]);
    kap.push((2 * cr) / (la * lb * lc || 1e-12));
  }
  let j = 0;
  for (let i = 0; i < n; i++) j = Math.max(j, Math.abs(kap[i] - kap[(i + 4) % n]));
  return j;
};

const CS = [1, 1.01, 1.25, 1.5, 1.75, 2];
const sets: [string, string][] = [
  ["U", "conv-u-dump"],
  ["Penguins", "penguin-blobs-dump"],
  ["ChartAccent", "chart-accent-dump"],
];
const f = (x: number, d = 2) => x.toFixed(d);
for (const [label, dump] of sets) {
  const calls = loadDump(dump.replace(/-dump$/, ""));
  calls.forEach((call, ci) => {
    const pad = call.padding;
    const ms = call.members;
    const H = paddedHull(ms, pad);
    const E = ovalOutline(ms, pad)[0];
    for (const how of ["ellipse", "circle", "corner", "firey"] as Beyond[]) {
      const t0 = performance.now();
      const rings = CS.map((c) => (c === 1 ? H : beyondHull(H, ms, pad, c, how)));
      const ms_ = (performance.now() - t0) / (CS.length - 1);
      const areas = rings.map((r) => Math.abs(signedArea2(r)) / 2);
      const pokes = rings.map((r) => poke(r, ms, pad));
      let nest = -Infinity;
      for (let i = 0; i + 1 < rings.length; i++)
        nest = Math.max(nest, outside(rings[i], rings[i + 1]));
      const holdsH = rings.map((r) => outside(H, r));
      const mono = areas.every((a, i) => i === 0 || a >= areas[i - 1] - 1e-6);
      console.log(
        `${label}[${ci}] ${how.padEnd(7)} pad ${pad} n=${ms.length}` +
          ` | area ${areas.map((a) => f(a / areas[0], 3)).join(" ")} (x hull) mono ${mono}` +
          ` | worst member poke ${f(Math.max(...pokes), 3)} | H outside ${f(Math.max(...holdsH), 3)}` +
          ` | nesting worst ${f(nest, 3)}` +
          ` | d(1.01,H) ${f(hausdorff(rings[1], H), 3)}` +
          (how === "ellipse" ? ` | d(2,oval) ${f(hausdorff(rings.at(-1)!, E), 4)}` : "") +
          ` | ${f(ms_, 1)} ms/eval`
      );
    }
    // curvature jumps, raw and through the full pipeline (smoothing)
    const raw = [1, 1.05, 1.5, 2].map((c) =>
      kappaJump(c === 1 ? H : beyondHull(H, ms, pad, c))
    );
    const piped = [1, 1.05, 1.5, 2].map((c) => {
      const t0 = performance.now();
      const r = unifiedOutline(ms, { padding: pad, convexity: c, connected: true });
      return [kappaJump(r[0]), performance.now() - t0, r] as const;
    });
    console.log(
      `${label}[${ci}] curvature jump raw  c=1,1.05,1.5,2: ${raw.map((x) => f(x, 3)).join(" ")}` +
        ` | 1/pad = ${f(1 / pad, 3)}`
    );
    console.log(
      `${label}[${ci}] curvature jump smoothed: ${piped.map((x) => f(x[0], 3)).join(" ")}` +
        ` | full pipeline ms ${piped.map((x) => f(x[1], 0)).join(" ")}` +
        ` | smoothed c=2 vs oval ${f(hausdorff(piped[3][2][0], E), 3)}` +
        ` | smoothed c=1.05 vs raw ${f(hausdorff(piped[1][2][0], beyondHull(H, ms, pad, 1.05)), 3)}`
    );
  });
}
void UNIFIED_STATS;
void ringsArea;
void measure;
