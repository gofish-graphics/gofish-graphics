// SCRATCH: a blob's pieces, each cut by the others as keep-outs: SVGs, the least gap between
// two pieces' outlines (negative: the deepest overlap), the overlap area, timings.
//   OUT=… npx tsx scratch-bumps/pieces.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  unifiedOutline,
  UNIFIED_STATS,
  clearUnifiedCache,
} from "../src/ast/graphicalOperators/enclose/unified";
import type { Pt } from "../src/ast/graphicalOperators/enclose/blob";

const DATA = JSON.parse(
  readFileSync(
    new URL("../../../playground/src/datasets.json", import.meta.url),
    "utf8"
  )
);
const OUT = process.env.OUT!;
mkdirSync(OUT, { recursive: true });
const RULES = ["avoid"] as const;
type C = {
  name: string;
  ds: string;
  pad?: number;
  convexity: number;
  connection: number;
  holes?: boolean;
  avoid?: boolean;
};
const CASES: C[] = [
  {
    name: "ca-repro",
    ds: "chartaccent",
    pad: 4.5,
    convexity: 2,
    connection: 0.85,
  },
  {
    name: "ca-c05",
    ds: "chartaccent",
    pad: 4.5,
    convexity: 0.5,
    connection: 0.85,
  },
  {
    name: "ca-c1",
    ds: "chartaccent",
    pad: 4.5,
    convexity: 1,
    connection: 0.85,
  },
  { name: "pen-c2", ds: "penguins", convexity: 2, connection: 0.9 },
  { name: "pen-c05", ds: "penguins", convexity: 0.5, connection: 0.9 },
  // the sweep's worst case for avoid (the only overlap)
  { name: "pen-c2-n05", ds: "penguins", convexity: 2, connection: 0.5 },
  { name: "u-c1", ds: "u", convexity: 1, connection: 0.9 },
  { name: "u-c2", ds: "u", convexity: 2, connection: 0.9 },
  {
    name: "holes-c1",
    ds: "holes",
    convexity: 1,
    connection: 0.9,
    holes: true,
    avoid: true,
  },
  {
    name: "holes-c2",
    ds: "holes",
    convexity: 2,
    connection: 0.9,
    holes: true,
    avoid: true,
  },
];

const run = (d: any, c: Partial<C>, set: any) =>
  unifiedOutline(set.members, {
    padding: c.pad ?? d.padding,
    shape: "blob",
    convexity: c.convexity,
    connection: c.connection,
    neck: 1,
    holes: !!c.holes,
    ...(c.avoid ? { avoiding: set.avoiding, clearance: d.clearance } : {}),
  });

// ── measures ─────────────────────────────────────────────────────────────
const inRing = (p: Pt, r: Pt[]) => {
  let w = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i],
      [xj, yj] = r[j];
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    )
      w = !w;
  }
  return w;
};
const inside = (p: Pt, rings: Pt[][]) =>
  rings.reduce((a, r) => a !== inRing(p, r), false);
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const ex = b[0] - a[0],
    ey = b[1] - a[1],
    L = ex * ex + ey * ey;
  let t = L > 0 ? ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * ex, p[1] - a[1] - t * ey);
};
const distTo = (p: Pt, rings: Pt[][]) => {
  let best = Infinity;
  for (const r of rings)
    for (let i = 0; i < r.length; i++)
      best = Math.min(best, segDist(p, r[i], r[(i + 1) % r.length]));
  return best;
};
const box = (rings: Pt[][]) => {
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const [x, y] of r) {
      a = Math.min(a, x);
      c = Math.max(c, x);
      b = Math.min(b, y);
      d = Math.max(d, y);
    }
  return [a, b, c, d];
};
/** between two pieces: the least gap (negative: minus the deepest point of one inside the
 *  other), and the overlap area (0.25 px raster) */
function pair(A: Pt[][], B: Pt[][]) {
  const [a0, a1, a2, a3] = box(A),
    [b0, b1, b2, b3] = box(B);
  let gap = Infinity,
    depth = 0;
  // skip far pairs fast
  const far = Math.max(b0 - a2, a0 - b2, b1 - a3, a1 - b3);
  if (far > 40) return { gap: far, area: 0 };
  for (const [P, Q] of [
    [A, B],
    [B, A],
  ])
    for (const r of P)
      for (const p of r) {
        const d = distTo(p, Q);
        if (inside(p, Q)) depth = Math.max(depth, d);
        else gap = Math.min(gap, d);
      }
  let area = 0;
  const x0 = Math.max(a0, b0),
    x1 = Math.min(a2, b2),
    y0 = Math.max(a1, b1),
    y1 = Math.min(a3, b3);
  const h = 0.25;
  if (x1 > x0 && y1 > y0)
    for (let x = x0 + h / 2; x < x1; x += h)
      for (let y = y0 + h / 2; y < y1; y += h)
        if (inside([x, y], A) && inside([x, y], B)) area += h * h;
  return { gap: depth > 0 ? -depth : gap, area };
}

// ── SVG ──────────────────────────────────────────────────────────────────
const f2 = (v: number) => v.toFixed(2);
const pathOf = (rings: Pt[][]) =>
  rings
    .filter((l) => l.length > 1)
    .map((l) => "M" + l.map((p) => `${f2(p[0])},${f2(p[1])}`).join("L") + "Z")
    .join("");
const PIECE = [
  "#d62728",
  "#1f77b4",
  "#2ca02c",
  "#9467bd",
  "#ff7f0e",
  "#8c564b",
  "#e377c2",
  "#17becf",
];

const report: string[] = [];
for (const c of CASES) {
  const d = DATA.find((x: any) => x.id === c.ds);
  const line: string[] = [c.name];
  for (const rule of RULES) {
    clearUnifiedCache();
    let body = d.scenery;
    let minGap = Infinity,
      area = 0,
      pairs = 0,
      overl = 0,
      pieces = 0,
      ms = 0;
    for (const s of d.sets) {
      const t0 = performance.now();
      const rings = run(d, c, s);
      ms += performance.now() - t0;
      const per = UNIFIED_STATS.pieceRings ?? [rings];
      pieces += per.length;
      const T = `matrix(1 0 0 ${s.T[2]} ${s.T[0]} ${s.T[1]})`;
      body += `<path transform="${T}" d="${pathOf(rings)}" fill="${s.paint.fill}" fill-opacity="0.25" fill-rule="nonzero" stroke="none"/>`;
      per.forEach((R, k) => {
        body += `<path transform="${T}" d="${pathOf(R)}" fill="none" stroke="${PIECE[k % PIECE.length]}" stroke-width="1" stroke-linejoin="round"/>`;
      });
      for (let i = 0; i < per.length; i++)
        for (let j = i + 1; j < per.length; j++) {
          const m = pair(per[i], per[j]);
          if (m.gap > 40) continue;
          pairs++;
          minGap = Math.min(minGap, m.gap);
          area += m.area;
          if (m.area > 0) overl++;
        }
    }
    const [W, H] = [d.width, d.height];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 ${W + 40} ${H + 40}" width="${2 * (W + 40)}" height="${2 * (H + 40)}" style="background:#fff"><rect x="-20" y="-20" width="${W + 40}" height="${H + 40}" fill="#fff"/>${body}</svg>`;
    writeFileSync(`${OUT}/${c.name}-${rule}.svg`, svg);
    line.push(
      `${rule}: pieces ${pieces}, near pairs ${pairs}, min gap ${f2(minGap)} px, overlapping pairs ${overl}, overlap ${f2(area)} px², ${f2(ms)} ms`
    );
  }
  report.push(line.join("\n  "));
  console.log(line.join("\n  "));
}

// ── how often fills overlap: every set at a grid of options (SWEEP=1) ─────
if (process.env.SWEEP)
  for (const rule of RULES) {
    clearUnifiedCache();
    let runs = 0,
      split = 0,
      hit = 0,
      worst = { area: 0, gap: Infinity, at: "" };
    let minGap = Infinity,
      minAt = "";
    for (const d of DATA.filter(
      (x: any) => !["bubble", "munkres"].includes(x.id)
    ))
      for (const cv of [0.5, 1, 1.5, 2])
        for (const cn of [0.95, 0.9, 0.85, 0.8, 0.7, 0.5])
          for (const s of d.sets) {
            run(d, { convexity: cv, connection: cn }, s);
            const per = UNIFIED_STATS.pieceRings ?? [];
            runs++;
            if (per.length < 2) continue;
            split++;
            let any = false;
            for (let i = 0; i < per.length; i++)
              for (let j = i + 1; j < per.length; j++) {
                const m = pair(per[i], per[j]);
                const at = `${d.id} c${cv} n${cn} pieces ${i},${j}`;
                if (m.gap < minGap) {
                  minGap = m.gap;
                  minAt = at;
                }
                if (m.area > 0) {
                  any = true;
                  if (m.area > worst.area) worst = { ...m, at };
                }
              }
            if (any) hit++;
          }
    console.log(
      `${rule} sweep: ${runs} outlines, ${split} split, ${hit} with overlapping pieces; worst ${f2(worst.area)} px² (${worst.at}); least gap ${f2(minGap)} px (${minAt})`
    );
  }
if (process.env.SWEEP) process.exit(0);

// ── timing: penguins sweeps, the cache kept within a sweep as a slider does ──
const pen = DATA.find((x: any) => x.id === "penguins");
const sweep = (steps: Partial<C>[]) => {
  clearUnifiedCache();
  const t: number[] = [];
  for (const st of steps) {
    const t0 = performance.now();
    for (const s of pen.sets) run(pen, st, s);
    t.push(performance.now() - t0);
  }
  return t;
};
const conn = [1, 0.97, 0.94, 0.9, 0.85, 0.8, 0.7, 0.6, 0.5].map((x) => ({
  convexity: 0.5,
  connection: x,
}));
const conv = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((x) => ({
  convexity: x,
  connection: 0.9,
}));
for (const rule of RULES) {
  sweep(conn); // warm the JIT
  for (const [nm, st] of [
    ["connection sweep (c 0.5)", conn],
    ["convexity sweep (conn 0.9)", conv],
  ] as const) {
    const t = sweep(st as Partial<C>[]);
    const msg = `${rule} ${nm}: total ${f2(t.reduce((a, b) => a + b, 0))} ms, max step ${f2(Math.max(...t))} ms, steps ${t.map((x) => x.toFixed(0)).join(" ")}`;
    console.log(msg);
  }
}
