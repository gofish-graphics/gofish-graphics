/**
 * THROWAWAY prototype stories for the croissant chart proposal
 * (proposals/croissant-charts/proposal.md). Not gallery stories.
 *
 * GoFish has no vector intersect yet, so every slice polygon here is computed
 * by hand in plain JS: sample the density, find the quantile edges, keep the
 * part of the area inside each cell, and trim the gap off both sides. The
 * slices are then drawn with the existing data-bound `polygon` mark, which
 * maps its vertices through the chart's position scales, so `axes` work.
 * These are target renders of the proposed spelling, not the spelling itself.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, polygon, circle, text, datum } from "../../src/lib";
import { penguins } from "../../src/data/penguins";
import { seattleWeather } from "../../src/data/seatle-weather";

const meta: Meta = { title: "Proposals/Croissant" };
export default meta;

type Pt = [number, number];
type Args = { w: number; h: number };

const FILL = "#D1E4F6";
const STROKE = "#467DA8";

// ---------------------------------------------------------------- math

const normPdf = (x: number, mu = 0, sd = 1) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

/** Inverse normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Type-7 sample quantile (numpy / d3.quantile default). */
const quantile = (sorted: number[], p: number) => {
  const h = (sorted.length - 1) * p;
  const i = Math.floor(h);
  return sorted[i] + (h - i) * ((sorted[Math.min(i + 1, sorted.length - 1)] ?? sorted[i]) - sorted[i]);
};

/** Gaussian KDE with Silverman's bandwidth (times `adjust`). */
function kde(values: number[], adjust = 1) {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const sorted = [...values].sort((a, b) => a - b);
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const bw = adjust * 0.9 * Math.min(sd, iqr / 1.34) * n ** -0.2;
  return (x: number) => values.reduce((s, v) => s + normPdf(x, v, bw), 0) / n;
}

// ---------------------------------------------------------------- geometry

/**
 * The part of the area under `f` (above `base`) inside [a, b], trimmed by
 * `gap` on each side. This is what `intersect([area, cell])` would compute
 * for an area under a curve and a vertical strip; done by hand here.
 */
function slice(f: (x: number) => number, a: number, b: number, gap: number, base = 0, scale = 1, steps = 60): Pt[] {
  const lo = a + gap;
  const hi = b - gap;
  const top: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps;
    top.push([x, base + scale * f(x)]);
  }
  return [[lo, base], ...top, [hi, base]];
}

/** Center of mass of the area under f over [a, b] along x (conditional mean). */
function centroidX(f: (x: number) => number, a: number, b: number, steps = 400) {
  let m = 0;
  let mx = 0;
  for (let i = 0; i < steps; i++) {
    const x = a + ((b - a) * (i + 0.5)) / steps;
    m += f(x);
    mx += x * f(x);
  }
  return mx / m;
}

/** The middle of the horizontal chord of the slice at height y. */
function chordMid(f: (x: number) => number, a: number, b: number, y: number, steps = 800) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const x = a + ((b - a) * i) / steps;
    if (f(x) >= y) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
  }
  return (lo + hi) / 2;
}

/** Pole of inaccessibility by grid search, in pixel space (sx, sy px per unit). */
function poleOfInaccessibility(ring: Pt[], sx: number, sy: number): Pt {
  const P = ring.map(([x, y]) => [x * sx, y * sy] as Pt);
  const inside = (px: number, py: number) => {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [xi, yi] = P[i];
      const [xj, yj] = P[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const segDist = (px: number, py: number) => {
    let best = Infinity;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [ax, ay] = P[j];
      const [bx, by] = P[i];
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    return best;
  };
  const xs = P.map((p) => p[0]);
  const ys = P.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best: Pt = [x0, y0];
  let bestD = -1;
  for (let i = 0; i <= 80; i++)
    for (let j = 0; j <= 80; j++) {
      const px = x0 + ((x1 - x0) * i) / 80;
      const py = y0 + ((y1 - y0) * j) / 80;
      if (!inside(px, py)) continue;
      const d = segDist(px, py);
      if (d > bestD) {
        bestD = d;
        best = [px, py];
      }
    }
  return [best[0] / sx, best[1] / sy];
}

/** Sutherland-Hodgman: clip `subject` against the convex polygon `clip`. */
function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
  let out = subject;
  for (let i = 0; i < clip.length; i++) {
    const [a, b] = [clip[i], clip[(i + 1) % clip.length]];
    const side = (p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const cross = (p: Pt, q: Pt): Pt => {
      const t = side(p) / (side(p) - side(q));
      return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
    };
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const cur = input[k];
      const prev = input[(k + input.length - 1) % input.length];
      if (side(cur) >= 0) {
        if (side(prev) < 0) out.push(cross(prev, cur));
        out.push(cur);
      } else if (side(prev) >= 0) out.push(cross(prev, cur));
    }
    if (out.length === 0) break;
  }
  return out;
}

// ---------------------------------------------------------------- croissant

type Strategy = "median" | "bbox" | "centroid" | "chord" | "polylabel";

/** Rows for one croissant: one polygon per cell, plus a dot per cell. */
function croissant(opts: {
  f: (x: number) => number;
  edges: number[]; // cell edges, window ends included
  medians: number[]; // conditional median of each cell
  gap: number;
  dotY: number;
  base?: number;
  scale?: number;
  strategy?: Strategy;
  px?: [number, number]; // px per data unit, for polylabel
}) {
  const { f, edges, medians, gap, dotY, base = 0, scale = 1, strategy = "median" } = opts;
  const rings: Pt[][] = [];
  const dots: Pt[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const [a, b] = [edges[i], edges[i + 1]];
    const ring = slice(f, a, b, gap, base, scale);
    rings.push(ring);
    const g = (x: number) => scale * f(x);
    let x = medians[i];
    let y = base + dotY;
    if (strategy === "bbox") x = (a + gap + b - gap) / 2;
    if (strategy === "centroid") x = centroidX(f, a + gap, b - gap);
    if (strategy === "chord") x = chordMid(g, a + gap, b - gap, dotY);
    if (strategy === "polylabel") [x, y] = poleOfInaccessibility(ring, opts.px![0], opts.px![1]);
    dots.push([x, y]);
  }
  return { rings, dots };
}

const normal10 = (n = 10, lim = 3) => {
  const edges = [-lim, ...Array.from({ length: n - 1 }, (_, k) => normInv((k + 1) / n)), lim];
  const medians = Array.from({ length: n }, (_, k) => normInv((k + 0.5) / n));
  return { edges, medians };
};

function drawCroissant(
  container: HTMLElement,
  { rings, dots }: { rings: Pt[][]; dots: Pt[] },
  args: { w: number; h: number },
  axes: any = { x: true, y: false },
  extra: (b: any) => any = (b) => b,
  r = 3
) {
  let b = chart(
    rings.map((ring) => ({ ring })),
    { w: args.w, h: args.h, axes }
  ).mark(
    polygon({
      points: "ring",
      fill: FILL,
      stroke: STROKE,
      strokeWidth: 2,
    })
  );
  for (const [x, y] of dots)
    b = b.layer(circle({ cx: datum(x), cy: datum(y), r, fill: STROKE }));
  b = extra(b);
  b.render(container);
}

// ---------------------------------------------------------------- stories

/** Example 1: the paper's Croissant-10 of a standard normal. */
export const Normal10: StoryObj<Args> = {
  args: { w: 480, h: 200 },
  render: (args) => {
    const container = initializeContainer();
    const { edges, medians } = normal10();
    drawCroissant(container, croissant({ f: (x) => normPdf(x), edges, medians, gap: 0.05, dotY: 0.03 }), args);
    return container;
  },
};

/** Croissant-20, same pieces with n = 20. */
export const Normal20: StoryObj<Args> = {
  args: { w: 480, h: 200 },
  render: (args) => {
    const container = initializeContainer();
    const { edges, medians } = normal10(20);
    drawCroissant(container, croissant({ f: (x) => normPdf(x), edges, medians, gap: 0.04, dotY: 0.022 }), args, undefined, undefined, 2.2);
    return container;
  },
};

/** Dot placement strategies, one story each, same Croissant-10. */
const dotStory = (strategy: Strategy): StoryObj<Args> => ({
  args: { w: 360, h: 160 },
  render: (args) => {
    const container = initializeContainer();
    const { edges, medians } = normal10();
    // px per data unit, for the pole search (plot is about w x h).
    const px: [number, number] = [args.w / 6, (args.h - 30) / 0.4];
    drawCroissant(
      container,
      croissant({ f: (x) => normPdf(x), edges, medians, gap: 0.05, dotY: 0.04, strategy, px }),
      args
    );
    return container;
  },
});
export const DotMedian = dotStory("median");
export const DotBBox = dotStory("bbox");
export const DotCentroid = dotStory("centroid");
export const DotChord = dotStory("chord");
export const DotPolylabel = dotStory("polylabel");

/** Example 2 (hard): penguin body mass, skewed and lumpy, from samples. */
export const PenguinBodyMass: StoryObj<Args> = {
  args: { w: 520, h: 220 },
  render: (args) => {
    const container = initializeContainer();
    const xs = penguins.map((p) => p["Body Mass (g)"]).filter((v): v is number => v != null);
    const sorted = [...xs].sort((a, b) => a - b);
    const n = 10;
    const f = kde(xs);
    const lo = 2500;
    const hi = 6500;
    const inner = Array.from({ length: n - 1 }, (_, k) => quantile(sorted, (k + 1) / n));
    const edges = [lo, ...inner, hi];
    const medians = edges.slice(0, -1).map((a, i) => {
      const inCell = sorted.filter((v) => v >= a && (i === n - 1 ? v <= edges[i + 1] : v < edges[i + 1]));
      return quantile(inCell, 0.5);
    });
    const peak = Math.max(...Array.from({ length: 200 }, (_, i) => f(lo + ((hi - lo) * i) / 199)));
    drawCroissant(
      container,
      croissant({ f, edges, medians, gap: 25, dotY: peak * 0.055 }),
      args,
      { x: { title: "Body mass (g)" }, y: false }
    );
    return container;
  },
};

/** Example 3 (hard): a ridgeline of croissants, Seattle highs by month. */
export const RidgelineByMonth: StoryObj<Args> = {
  args: { w: 520, h: 600 },
  render: (args) => {
    const container = initializeContainer();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const byMonth = months.map((_, m) =>
      seattleWeather.filter((d) => new Date(d.date).getUTCMonth() === m).map((d) => d.temp_max)
    );
    const n = 10;
    const lo = -5;
    const hi = 38;
    const pitch = 1;
    const allRings: Pt[][] = [];
    const allDots: Pt[] = [];
    // Each month's density scaled so its peak is 0.92 rows tall, so rows do not overlap; drawn top row first.
    byMonth.forEach((xs, m) => {
      const sorted = [...xs].sort((a, b) => a - b);
      const f = kde(xs, 1.2);
      const peak = Math.max(...Array.from({ length: 200 }, (_, i) => f(lo + ((hi - lo) * i) / 199)));
      const base = (months.length - 1 - m) * pitch;
      const inner = Array.from({ length: n - 1 }, (_, k) => quantile(sorted, (k + 1) / n));
      const edges = [Math.max(lo, sorted[0] - 4), ...inner, Math.min(hi, sorted[sorted.length - 1] + 4)];
      const medians = edges.slice(0, -1).map((a, i) =>
        quantile(sorted.filter((v) => v >= a && (i === n - 1 ? v <= edges[i + 1] : v < edges[i + 1])), 0.5)
      );
      const { rings, dots } = croissant({ f, edges, medians, gap: 0.18, dotY: 0.08, base, scale: 0.92 / peak });
      allRings.push(...rings);
      allDots.push(...dots);
    });
    drawCroissant(
      container,
      { rings: allRings, dots: allDots },
      args,
      { x: { title: "Daily high (°C)" }, y: false },
      (b) => {
        let out = b;
        months.forEach((name, m) => {
          out = out.layer(
            text({ x: datum(lo + 0.5), y: datum((months.length - 1 - m) * pitch + 0.35), text: name, fontSize: 11, fill: "#333" })
          );
        });
        return out;
      },
      2
    );
    return container;
  },
};

/** Example 4a (generality): a smoothed daily series divided by month cells. */
export const AreaByMonth: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  render: (args) => {
    const container = initializeContainer();
    const days = seattleWeather.filter((d) => d.date.startsWith("2012"));
    const raw = days.map((d) => d.temp_max);
    const smooth = raw.map((_, i) => {
      const w = raw.slice(Math.max(0, i - 7), i + 8);
      return w.reduce((s, v) => s + v, 0) / w.length;
    });
    const f = (x: number) => {
      const i = Math.max(0, Math.min(smooth.length - 2, Math.floor(x)));
      const t = x - i;
      return smooth[i] * (1 - t) + smooth[i + 1] * t;
    };
    // Month cells on the day-of-year line (true widths: Feb is narrower).
    const starts = Array.from({ length: 12 }, (_, m) =>
      Math.round((Date.UTC(2012, m, 1) - Date.UTC(2012, 0, 1)) / 864e5)
    );
    const edges = [...starts, smooth.length - 1];
    const rings = edges.slice(0, -1).map((a, i) => slice(f, a, edges[i + 1], 1.2, 0, 1, 40));
    const names = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
    let b = chart(rings.map((ring) => ({ ring })), {
      w: args.w,
      h: args.h,
      axes: { x: false, y: { title: "Daily high, 15-day mean (°C)" } },
    }).mark(polygon({ points: "ring", fill: FILL, stroke: STROKE, strokeWidth: 1.5 }));
    edges.slice(0, -1).forEach((a, i) => {
      b = b.layer(text({ x: datum((a + edges[i + 1]) / 2 - 3), y: datum(1.2), text: names[i], fontSize: 11, fill: "#333" }));
    });
    b.render(container);
    return container;
  },
};

/** Example 4b (generality): hexagon cells clipped to a disc. */
export const HexInDisc: StoryObj<Args> = {
  args: { w: 300, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    const R = 1; // hex radius
    const disc: Pt[] = Array.from({ length: 96 }, (_, k) => {
      const t = (2 * Math.PI * k) / 96;
      return [5.2 * Math.cos(t), 5.2 * Math.sin(t)];
    });
    const rows: { ring: Pt[]; k: number }[] = [];
    const dx = Math.sqrt(3) * R;
    for (let j = -7; j <= 7; j++)
      for (let i = -7; i <= 7; i++) {
        const cx = i * dx + (j % 2 ? dx / 2 : 0);
        const cy = j * 1.5 * R;
        const hex: Pt[] = Array.from({ length: 6 }, (_, k) => {
          const t = Math.PI / 6 + (Math.PI / 3) * k;
          return [cx + 0.9 * R * Math.cos(t), cy + 0.9 * R * Math.sin(t)];
        });
        const piece = clipConvex(hex, disc);
        if (piece.length >= 3) rows.push({ ring: piece, k: Math.hypot(cx, cy) });
      }
    chart(rows, { w: args.w, h: args.h, axes: false })
      .mark(polygon({ points: "ring", fill: FILL, stroke: STROKE, strokeWidth: 1.5 }))
      .render(container);
    return container;
  },
};
