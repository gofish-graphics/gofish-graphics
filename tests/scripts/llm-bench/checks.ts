/**
 * Library-neutral checks over a RenderRecord (record.ts).
 *
 * A check states a fact about the PICTURE, never about the program: "there
 * are six bars whose lengths are proportional to these values, left to
 * right". Every check tolerates chrome it does not ask about (axes,
 * gridlines, background panels, legend swatches), because each library draws
 * different chrome. Positions are compared up to an unknown linear scale per
 * axis, so no check depends on margins, padding or tick choices.
 *
 * Shared vocabulary:
 *   ink(mark)      the color a reader sees: the fill, or the stroke when the
 *                  fill is missing, near-white or transparent.
 *   background     a mark with no ink, or one covering >= 40% of the chart
 *                  (panels, plot backgrounds).
 *   same color     RGBA distance <= SAME_COLOR (alpha scaled to 0-255).
 */

import type { Box, Mark, RenderRecord, RGBA } from "./record";
import type { Aspect, Size } from "./tasks";

type Row = Record<string, unknown>;

export interface CheckResult {
  pass: boolean;
  detail: string;
}

export interface CheckContext {
  data: Row[];
  size: Size;
}

type Orientation = "vertical" | "horizontal";
/** Order of categories along the category axis: "forward" is left to right
 *  (vertical bars) or top to bottom (horizontal bars). */
type Direction = "forward" | "reverse" | "either";

/** Values for a bar-like check: either given literally, or summed from the
 *  task data by category (categories in order of first appearance). */
type BarValues =
  | { values: number[]; category?: undefined; value?: undefined }
  | { category: string; value: string; values?: undefined };

/** Values for a stacked/grouped check: summed from the task data by
 *  category x series (both in order of first appearance). */
interface SeriesValues {
  category: string;
  series: string;
  value: string;
}

export type Check =
  /** One rect-like filled mark per value, on a common baseline, lengths
   *  proportional to the values (a zero baseline; negative values extend
   *  the other way). `ordered` (default true) requires the values' order
   *  along the category axis in `direction` (default "forward"). */
  | ({
      check: "bars";
      orientation: Orientation;
      ordered?: boolean;
      direction?: Direction;
      tol?: number;
    } & BarValues)
  /** One stack per category (in category order); within a stack, abutting
   *  segments whose lengths are proportional to the series values (any stack
   *  order); each series has one color across stacks, distinct from the
   *  other series. Positive values only. */
  | ({
      check: "stackedBars";
      orientation: Orientation;
      direction?: Direction;
      tol?: number;
    } & SeriesValues)
  /** Bars on a common baseline, category-major then series order along the
   *  category axis, lengths proportional; each series has one color across
   *  categories, distinct from the other series. */
  | ({
      check: "groupedBars";
      orientation: Orientation;
      direction?: Direction;
      tol?: number;
    } & SeriesValues)
  /** One circle-like mark per row, centered at an affine image of (x, y)
   *  with y pointing up. `colorBy`: rows sharing the field's value share a
   *  color; different values get different colors. */
  | { check: "points"; x: string; y: string; colorBy?: string; tol?: number }
  /** One stroked line per group (or one line), passing through the rows'
   *  (x, y) under one affine map with y up, and running in one x direction
   *  (points joined in x order). With `groupBy`, the lines have distinct
   *  colors. */
  | {
      check: "lineSeries";
      x: string;
      y: string;
      groupBy?: string;
      tol?: number;
    }
  /** Pie/donut slices around one center whose angular shares match the
   *  values' shares (any order); slices have distinct colors. `hole`: true
   *  requires a donut (every slice's inner radius is at least 20% of its
   *  outer radius), false a pie (at most 5%); unset allows either. */
  | ({ check: "wedges"; hole?: boolean; tol?: number } & BarValues)
  /** Each string appears (case-insensitive substring) in some text. */
  | { check: "textIncludes"; strings: string[] }
  /** Data marks use at least `k` distinct colors. */
  | { check: "distinctColors"; k: number }
  /** The largest <svg> is within `tol` (relative, default 0.25: a loose sanity bound) of w x h;
   *  defaults to the task's size. */
  | { check: "sizeAbout"; w?: number; h?: number; tol?: number };

export const SAME_COLOR = 24;

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export function colorDist(a: RGBA, b: RGBA): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], 255 * (a[3] - b[3]));
}

function nearWhite(c: RGBA): boolean {
  return (c[0] >= 235 && c[1] >= 235 && c[2] >= 235) || c[3] < 0.05;
}

export function ink(m: Mark): RGBA | null {
  if (m.fill && !nearWhite(m.fill)) return m.fill;
  if (m.stroke && !nearWhite(m.stroke)) return m.stroke;
  return null;
}

function chartArea(rec: RenderRecord): number {
  const s = rec.svgs[0];
  return s ? s.w * s.h : Infinity;
}

function isBackground(m: Mark, rec: RenderRecord): boolean {
  return !ink(m) || m.w * m.h >= 0.4 * chartArea(rec);
}

/** Marks that encode data: filled rects, circles, wedges and filled paths
 *  that are not background, and not hairlines (thinner than 2px, e.g. an
 *  axis or tick drawn as a rect). Lines and text are chrome as far as this
 *  set is concerned. */
export function dataMarks(rec: RenderRecord): Mark[] {
  return rec.marks.filter(
    (m) =>
      (m.kind === "rect" ||
        m.kind === "circle" ||
        m.kind === "wedge" ||
        (m.kind === "path" && m.fill)) &&
      Math.min(m.w, m.h) >= 2 &&
      !isBackground(m, rec)
  );
}

/** Group colors into clusters of "same color"; returns one representative
 *  per cluster, in first-seen order. */
export function colorClusters(colors: RGBA[]): RGBA[] {
  const reps: RGBA[] = [];
  for (const c of colors)
    if (!reps.some((r) => colorDist(r, c) <= SAME_COLOR)) reps.push(c);
  return reps;
}

const rgbaText = (c: RGBA | null) =>
  c ? `rgba(${c[0]},${c[1]},${c[2]},${c[3]})` : "none";

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

function uniqueInOrder(rows: Row[], field: string): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const v = String(r[field]);
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function barValues(
  spec: BarValues,
  data: Row[]
): { labels: string[]; values: number[] } {
  if (spec.values)
    return { labels: spec.values.map(String), values: spec.values };
  const labels = uniqueInOrder(data, spec.category!);
  const values = labels.map((l) =>
    data
      .filter((r) => String(r[spec.category!]) === l)
      .reduce((s, r) => s + num(r[spec.value!]), 0)
  );
  return { labels, values };
}

function seriesValues(spec: SeriesValues, data: Row[]) {
  const categories = uniqueInOrder(data, spec.category);
  const series = uniqueInOrder(data, spec.series);
  const values = categories.map((c) =>
    series.map((s) =>
      data
        .filter(
          (r) => String(r[spec.category]) === c && String(r[spec.series]) === s
        )
        .reduce((acc, r) => acc + num(r[spec.value]), 0)
    )
  );
  return { categories, series, values };
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

interface Bar {
  /** Center along the category axis. */
  pos: number;
  /** Signed length along the value axis from the baseline (up/right = +). */
  len: number;
  mark: Mark;
}

/** Filled, non-background rect marks. */
function barCandidates(rec: RenderRecord): Mark[] {
  return rec.marks.filter(
    (m) =>
      m.kind === "rect" && m.fill && !nearWhite(m.fill) && !isBackground(m, rec)
  );
}

/** For each candidate baseline (an edge shared by rects along the value
 *  axis), the rects standing on it with their signed lengths. */
function barsByBaseline(cands: Mark[], orientation: Orientation): Bar[][] {
  const edges = new Set<number>();
  for (const m of cands) {
    if (orientation === "vertical") {
      edges.add(Math.round(m.y + m.h));
      edges.add(Math.round(m.y));
    } else {
      edges.add(Math.round(m.x));
      edges.add(Math.round(m.x + m.w));
    }
  }
  const groups: Bar[][] = [];
  for (const b of edges) {
    const bars: Bar[] = [];
    for (const m of cands) {
      if (orientation === "vertical") {
        const pos = m.x + m.w / 2;
        if (Math.abs(m.y + m.h - b) <= 1) bars.push({ pos, len: m.h, mark: m });
        else if (Math.abs(m.y - b) <= 1) bars.push({ pos, len: -m.h, mark: m });
      } else {
        const pos = m.y + m.h / 2;
        if (Math.abs(m.x - b) <= 1) bars.push({ pos, len: m.w, mark: m });
        else if (Math.abs(m.x + m.w - b) <= 1)
          bars.push({ pos, len: -m.w, mark: m });
      }
    }
    if (bars.length > 0) groups.push(bars);
  }
  return groups;
}

function directions(d: Direction): ("forward" | "reverse")[] {
  return d === "either" ? ["forward", "reverse"] : [d];
}

/** Find bars (one per value) whose lengths are k * value for one k > 0,
 *  within `tol` of the largest value (plus 1px for rounding). Ordered: the
 *  bars appear in value order along the category axis. */
function matchBars(
  groups: Bar[][],
  values: number[],
  opts: { ordered: boolean; direction: Direction; tol: number }
): { bars: Bar[]; best: number } {
  const maxAbs = Math.max(...values.map(Math.abs));
  let best = 0;
  for (const group of groups) {
    for (const dir of directions(opts.direction)) {
      const sorted = [...group].sort((a, b) =>
        dir === "forward" ? a.pos - b.pos : b.pos - a.pos
      );
      const scales = new Set<number>();
      for (const bar of sorted)
        for (const v of values)
          if (v !== 0 && Math.sign(v) === Math.sign(bar.len))
            scales.add(Math.round((bar.len / v) * 1e4) / 1e4);
      for (const k of scales) {
        const slack = opts.tol * k * maxAbs + 1;
        const fits = (bar: Bar, v: number) =>
          Math.abs(bar.len - k * v) <= slack;
        let matched: Bar[] = [];
        if (opts.ordered) {
          let j = 0;
          for (const bar of sorted) {
            if (j < values.length && fits(bar, values[j])) {
              matched.push(bar);
              j++;
            }
          }
        } else {
          const pool = [...sorted];
          for (const v of values) {
            const i = pool.findIndex((bar) => fits(bar, v));
            if (i < 0) break;
            matched.push(pool.splice(i, 1)[0]);
          }
        }
        best = Math.max(best, matched.length);
        if (matched.length === values.length) return { bars: matched, best };
        matched = [];
      }
    }
  }
  return { bars: [], best };
}

function checkBars(
  c: Extract<Check, { check: "bars" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { values } = barValues(c, ctx.data);
  const cands = barCandidates(rec);
  const { bars, best } = matchBars(
    barsByBaseline(cands, c.orientation),
    values,
    {
      ordered: c.ordered ?? true,
      direction: c.direction ?? "forward",
      tol: c.tol ?? 0.03,
    }
  );
  if (bars.length === values.length)
    return {
      pass: true,
      detail: `${values.length} ${c.orientation} bars match [${values.join(", ")}]`,
    };
  return {
    pass: false,
    detail: `expected ${values.length} ${c.orientation} bars proportional to [${values.join(", ")}]; ${cands.length} filled rects, best baseline matched ${best}`,
  };
}

/** Each series' matched marks share one color, and the series' colors are
 *  pairwise distinct. `bySeries[s]` lists the marks of series s. */
function seriesColorsConsistent(
  bySeries: Mark[][],
  names: string[]
): CheckResult {
  const colors: RGBA[] = [];
  for (let s = 0; s < bySeries.length; s++) {
    const inks = bySeries[s].map((m) => ink(m)!);
    if (inks.length === 0) continue;
    if (inks.some((c) => colorDist(c, inks[0]) > SAME_COLOR))
      return {
        pass: false,
        detail: `series "${names[s]}" is drawn in more than one color`,
      };
    colors.push(inks[0]);
  }
  for (let i = 0; i < colors.length; i++)
    for (let j = i + 1; j < colors.length; j++)
      if (colorDist(colors[i], colors[j]) <= SAME_COLOR)
        return {
          pass: false,
          detail: `series "${names[i]}" and "${names[j]}" share a color`,
        };
  return { pass: true, detail: "" };
}

function checkGroupedBars(
  c: Extract<Check, { check: "groupedBars" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { categories, series, values } = seriesValues(c, ctx.data);
  const flat = values.flat();
  const { bars, best } = matchBars(
    barsByBaseline(barCandidates(rec), c.orientation),
    flat,
    {
      ordered: true,
      direction: c.direction ?? "forward",
      tol: c.tol ?? 0.03,
    }
  );
  if (bars.length !== flat.length)
    return {
      pass: false,
      detail: `expected ${flat.length} grouped bars (${categories.length} categories x ${series.length} series); best baseline matched ${best}`,
    };
  const bySeries = series.map((_, s) =>
    categories.map((_, ci) => bars[ci * series.length + s].mark)
  );
  const colors = seriesColorsConsistent(bySeries, series);
  if (!colors.pass) return colors;
  return {
    pass: true,
    detail: `${categories.length} groups x ${series.length} series match`,
  };
}

interface Stack {
  pos: number;
  segs: { len: number; mark: Mark }[];
}

/** Columns of abutting rects: rects sharing a category-axis interval, chained
 *  where one ends within 1.5px of where the next begins. */
function stacksOf(cands: Mark[], orientation: Orientation): Stack[] {
  const v = orientation === "vertical";
  const cross = (m: Mark): [number, number] =>
    v ? [m.x, m.x + m.w] : [m.y, m.y + m.h];
  const along = (m: Mark): [number, number] =>
    v ? [m.y, m.y + m.h] : [m.x, m.x + m.w];
  const columns: Mark[][] = [];
  for (const m of cands) {
    const [a, b] = cross(m);
    const col = columns.find((cm) => {
      const [c0, c1] = cross(cm[0]);
      return Math.abs(c0 - a) <= 1 && Math.abs(c1 - b) <= 1;
    });
    if (col) col.push(m);
    else columns.push([m]);
  }
  const stacks: Stack[] = [];
  for (const col of columns) {
    col.sort((p, q) => along(p)[0] - along(q)[0]);
    let chain: Mark[] = [col[0]];
    const flush = () => {
      const [a, b] = cross(chain[0]);
      stacks.push({
        pos: (a + b) / 2,
        segs: chain.map((m) => ({ len: v ? m.h : m.w, mark: m })),
      });
    };
    for (let i = 1; i < col.length; i++) {
      const gap = along(col[i])[0] - along(chain[chain.length - 1])[1];
      if (gap >= -1 && gap <= 1.5) chain.push(col[i]);
      else {
        flush();
        chain = [col[i]];
      }
    }
    flush();
  }
  return stacks;
}

function checkStackedBars(
  c: Extract<Check, { check: "stackedBars" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { categories, series, values } = seriesValues(c, ctx.data);
  const tol = c.tol ?? 0.03;
  const stacks = stacksOf(barCandidates(rec), c.orientation);
  const totals = values.map((row) => row.reduce((a, b) => a + b, 0));
  const maxTotal = Math.max(...totals);
  let bestMatched = 0;
  for (const dir of directions(c.direction ?? "forward")) {
    const sorted = [...stacks].sort((a, b) =>
      dir === "forward" ? a.pos - b.pos : b.pos - a.pos
    );
    const scales = new Set<number>();
    for (const st of sorted)
      for (const t of totals)
        if (t > 0)
          scales.add(
            Math.round((st.segs.reduce((a, s) => a + s.len, 0) / t) * 1e4) / 1e4
          );
    for (const k of scales) {
      const slack = tol * k * maxTotal + 1;
      // Does this stack hold exactly category ci's nonzero values (any order)?
      const holds = (st: Stack, ci: number) => {
        const want = values[ci]
          .filter((x) => x > 0)
          .map((x) => k * x)
          .sort((a, b) => a - b);
        const got = st.segs.map((s) => s.len).sort((a, b) => a - b);
        return (
          want.length === got.length &&
          want.every((w, i) => Math.abs(w - got[i]) <= slack)
        );
      };
      const matched: Stack[] = [];
      let ci = 0;
      for (const st of sorted) {
        if (ci < categories.length && holds(st, ci)) {
          matched.push(st);
          ci++;
        }
      }
      bestMatched = Math.max(bestMatched, matched.length);
      if (matched.length !== categories.length) continue;
      // Assign segments to series through their colors: each color must mean
      // one series, consistent with the segment lengths in every stack.
      const segs = matched.flatMap((st, ci) =>
        st.segs.map((s) => ({
          mark: s.mark,
          fits: new Set(
            series
              .map((_, si) => si)
              .filter(
                (si) =>
                  values[ci][si] > 0 &&
                  Math.abs(s.len - k * values[ci][si]) <= slack
              )
          ),
          stack: ci,
        }))
      );
      const reps = colorClusters(segs.map((s) => ink(s.mark)!));
      const clusterOf = (m: Mark) =>
        reps.findIndex((r) => colorDist(r, ink(m)!) <= SAME_COLOR);
      const allowed = reps.map((_, ri) => {
        const mine = segs.filter((s) => clusterOf(s.mark) === ri);
        return series
          .map((_, si) => si)
          .filter((si) => mine.every((s) => s.fits.has(si)));
      });
      const assign = new Array<number>(reps.length).fill(-1);
      const used = new Set<number>();
      const solve = (ri: number): boolean => {
        if (ri === reps.length) return true;
        for (const si of allowed[ri]) {
          if (used.has(si)) continue;
          used.add(si);
          assign[ri] = si;
          if (solve(ri + 1)) return true;
          used.delete(si);
        }
        return false;
      };
      if (!solve(0)) continue;
      const oneEach = matched.every((_, ci) => {
        const seen = segs
          .filter((s) => s.stack === ci)
          .map((s) => assign[clusterOf(s.mark)]);
        return new Set(seen).size === seen.length;
      });
      if (oneEach)
        return {
          pass: true,
          detail: `${categories.length} stacks x ${series.length} series match`,
        };
    }
  }
  return {
    pass: false,
    detail: `expected ${categories.length} stacks of ${series.length} series with one color per series; ${stacks.length} stacks found, best matched ${bestMatched}`,
  };
}

// ---------------------------------------------------------------------------
// Points and lines
// ---------------------------------------------------------------------------

interface Affine {
  a: number;
  b: number;
}

/** Affine maps sending the data range [lo, hi] onto some pair of screen
 *  coordinates, with the sign of `a` fixed (x right, y up). Deduplicated. */
function hypotheses(
  screen: number[],
  lo: number,
  hi: number,
  sign: 1 | -1
): Affine[] {
  const out = new Map<string, Affine>();
  if (hi === lo) return [];
  for (const s0 of screen)
    for (const s1 of screen) {
      const a = (s1 - s0) / (hi - lo);
      if (a * sign <= 0) continue;
      const h = { a, b: s0 - a * lo };
      out.set(`${a.toFixed(3)}|${h.b.toFixed(1)}`, h);
    }
  return [...out.values()];
}

/** Every mapped data value finds its own screen value within tol (sorted
 *  two-pointer match of a multiset into a larger multiset). */
function fits1d(mapped: number[], screen: number[], tol: number): boolean {
  const ms = [...mapped].sort((a, b) => a - b);
  const ss = [...screen].sort((a, b) => a - b);
  let j = 0;
  for (const m of ms) {
    while (j < ss.length && ss[j] < m - tol) j++;
    if (j >= ss.length || ss[j] > m + tol) return false;
    j++;
  }
  return true;
}

function extent(xs: number[]): [number, number] {
  return [Math.min(...xs), Math.max(...xs)];
}

function checkPoints(
  c: Extract<Check, { check: "points" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const rows = ctx.data.filter(
    (r) => Number.isFinite(num(r[c.x])) && Number.isFinite(num(r[c.y]))
  );
  const xs = rows.map((r) => num(r[c.x]));
  const ys = rows.map((r) => num(r[c.y]));
  const circles = rec.marks.filter(
    (m) => m.kind === "circle" && !isBackground(m, rec)
  );
  const cx = circles.map((m) => m.x + m.w / 2);
  const cy = circles.map((m) => m.y + m.h / 2);
  if (circles.length < rows.length)
    return {
      pass: false,
      detail: `expected ${rows.length} circles, found ${circles.length}`,
    };
  const tolFrac = c.tol ?? 0.01;
  const [xlo, xhi] = extent(xs);
  const [ylo, yhi] = extent(ys);
  const tolFor = (h: Affine, lo: number, hi: number) =>
    Math.max(1.5, tolFrac * Math.abs(h.a * (hi - lo)));
  const hx = hypotheses(cx, xlo, xhi, 1).filter((h) =>
    fits1d(
      xs.map((x) => h.a * x + h.b),
      cx,
      tolFor(h, xlo, xhi)
    )
  );
  const hy = hypotheses(cy, ylo, yhi, -1).filter((h) =>
    fits1d(
      ys.map((y) => h.a * y + h.b),
      cy,
      tolFor(h, ylo, yhi)
    )
  );
  for (const X of hx)
    for (const Y of hy) {
      const tx = tolFor(X, xlo, xhi);
      const ty = tolFor(Y, ylo, yhi);
      const used = new Set<number>();
      const match: number[] = [];
      for (let i = 0; i < rows.length; i++) {
        const px = X.a * xs[i] + X.b;
        const py = Y.a * ys[i] + Y.b;
        let bestJ = -1;
        let bestD = Infinity;
        for (let j = 0; j < circles.length; j++) {
          if (used.has(j)) continue;
          const dx = Math.abs(cx[j] - px);
          const dy = Math.abs(cy[j] - py);
          if (dx > tx || dy > ty) continue;
          const d = dx + dy;
          if (d < bestD) {
            bestD = d;
            bestJ = j;
          }
        }
        if (bestJ < 0) break;
        used.add(bestJ);
        match.push(bestJ);
      }
      if (match.length !== rows.length) continue;
      if (c.colorBy) {
        const groups = uniqueInOrder(rows, c.colorBy);
        const bySeries = groups.map((g) =>
          rows
            .map((r, i) =>
              String(r[c.colorBy!]) === g ? circles[match[i]] : null
            )
            .filter((m): m is Mark => !!m)
        );
        const colors = seriesColorsConsistent(bySeries, groups);
        if (!colors.pass) return colors;
      }
      return {
        pass: true,
        detail: `${rows.length} points match${c.colorBy ? `, colored by ${c.colorBy}` : ""}`,
      };
    }
  return {
    pass: false,
    detail: `no affine placement of ${rows.length} points onto ${circles.length} circles (${hx.length} x-fits, ${hy.length} y-fits)`,
  };
}

function distToPolyline(p: [number, number], pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2)
          );
    best = Math.min(
      best,
      Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))
    );
  }
  return best;
}

/** The polyline runs in one x direction: it never steps back by more than
 *  `tol` px from the furthest x reached so far (smoothed curves may
 *  overshoot a little). Either direction counts, since a path may be drawn
 *  right to left. A line that zigzags back and forth in x connects the
 *  points out of x order. */
function monotoneX(pts: [number, number][], tol: number): boolean {
  const runs = (sign: 1 | -1) => {
    let best = -Infinity;
    for (const [x] of pts) {
      if (sign * x < best - tol) return false;
      best = Math.max(best, sign * x);
    }
    return true;
  };
  return runs(1) || runs(-1);
}

function checkLineSeries(
  c: Extract<Check, { check: "lineSeries" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const rows = ctx.data.filter(
    (r) => Number.isFinite(num(r[c.x])) && Number.isFinite(num(r[c.y]))
  );
  const names = c.groupBy ? uniqueInOrder(rows, c.groupBy) : ["(all)"];
  const series = names.map((n) =>
    rows
      .filter((r) => !c.groupBy || String(r[c.groupBy]) === n)
      .map((r) => [num(r[c.x]), num(r[c.y])] as [number, number])
      .sort((a, b) => a[0] - b[0])
  );
  const lines = rec.marks.filter(
    (m) =>
      (m.kind === "path" || m.kind === "line") &&
      m.stroke &&
      ink(m) &&
      m.points &&
      m.points.length >= 2
  );
  const tolFrac = c.tol ?? 0.015;
  for (const P of lines) {
    const [px0, px1] = extent(P.points!.map((p) => p[0]));
    const [py0, py1] = extent(P.points!.map((p) => p[1]));
    for (const S of series) {
      const [sx0, sx1] = extent(S.map((d) => d[0]));
      const [sy0, sy1] = extent(S.map((d) => d[1]));
      if (sx1 === sx0 || sy1 === sy0 || px1 === px0 || py1 === py0) continue;
      const X: Affine = { a: (px1 - px0) / (sx1 - sx0), b: 0 };
      X.b = px0 - X.a * sx0;
      const Y: Affine = { a: (py0 - py1) / (sy1 - sy0), b: 0 };
      Y.b = py1 - Y.a * sy0;
      const tol = Math.max(2, tolFrac * Math.max(px1 - px0, py1 - py0));
      // A line only a few tolerances tall (or wide), such as an axis
      // baseline, squeezes the data into its own extent and cannot show
      // whether the points fit; it is not a candidate for the scale.
      if (Math.min(px1 - px0, py1 - py0) < 5 * tol) continue;
      const used = new Set<Mark>();
      const chosen: Mark[] = [];
      for (const T of series) {
        const mapped = T.map(
          ([x, y]) => [X.a * x + X.b, Y.a * y + Y.b] as [number, number]
        );
        const [mx0, mx1] = extent(mapped.map((p) => p[0]));
        const hit = lines.find((Q) => {
          if (used.has(Q)) return false;
          const [qx0, qx1] = extent(Q.points!.map((p) => p[0]));
          if (qx0 < mx0 - tol || qx1 > mx1 + tol) return false;
          if (!monotoneX(Q.points!, tol)) return false;
          return mapped.every((p) => distToPolyline(p, Q.points!) <= tol);
        });
        if (!hit) break;
        used.add(hit);
        chosen.push(hit);
      }
      if (chosen.length !== series.length) continue;
      if (c.groupBy) {
        const colors = seriesColorsConsistent(
          chosen.map((m) => [m]),
          names
        );
        if (!colors.pass) return colors;
      }
      return { pass: true, detail: `${series.length} line series match` };
    }
  }
  return {
    pass: false,
    detail: `expected ${series.length} line series; ${lines.length} stroked lines, none fit`,
  };
}

// ---------------------------------------------------------------------------
// Wedges, text, colors, size
// ---------------------------------------------------------------------------

function checkWedges(
  c: Extract<Check, { check: "wedges" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { values } = barValues(c, ctx.data);
  const tol = c.tol ?? 0.01;
  const wedges = rec.marks.filter(
    (m) => m.kind === "wedge" && m.wedge && !isBackground(m, rec)
  );
  const centers: Mark[][] = [];
  for (const w of wedges) {
    const g = centers.find(
      (g) =>
        Math.hypot(
          g[0].wedge!.cx - w.wedge!.cx,
          g[0].wedge!.cy - w.wedge!.cy
        ) <= Math.max(2, 0.02 * w.wedge!.r)
    );
    if (g) g.push(w);
    else centers.push([w]);
  }
  const want = values
    .map((v) => v / values.reduce((a, b) => a + b, 0))
    .sort((a, b) => a - b);
  for (const g of centers) {
    if (g.length !== values.length) continue;
    const total = g.reduce((a, w) => a + w.wedge!.sweep, 0);
    const got = g.map((w) => w.wedge!.sweep / total).sort((a, b) => a - b);
    if (!want.every((s, i) => Math.abs(s - got[i]) <= tol)) continue;
    const reps = colorClusters(g.map((w) => ink(w)!));
    if (reps.length !== g.length)
      return { pass: false, detail: "slices share colors" };
    if (c.hole !== undefined) {
      const ratios = g.map((w) => w.wedge!.r0 / w.wedge!.r);
      const shown = ratios.map((q) => q.toFixed(2)).join(", ");
      const ok = c.hole
        ? ratios.every((q) => q >= 0.2)
        : ratios.every((q) => q <= 0.05);
      return ok
        ? {
            pass: true,
            detail: `${values.length} slices match, a ${c.hole ? "donut" : "pie"} (inner/outer radius ${shown})`,
          }
        : {
            pass: false,
            detail: `${values.length} slices match, but inner/outer radius is [${shown}]; expected a ${c.hole ? "donut (at least 0.2)" : "pie (at most 0.05)"}`,
          };
    }
    return { pass: true, detail: `${values.length} slices match` };
  }
  return {
    pass: false,
    detail: `expected ${values.length} slices; found ${wedges.length} wedges around ${centers.length} centers`,
  };
}

function checkTextIncludes(
  c: Extract<Check, { check: "textIncludes" }>,
  rec: RenderRecord
): CheckResult {
  const texts = rec.marks
    .filter((m) => m.kind === "text")
    .map((m) => m.text!.toLowerCase());
  const missing = c.strings.filter(
    (s) => !texts.some((t) => t.includes(s.toLowerCase()))
  );
  return missing.length === 0
    ? { pass: true, detail: `all ${c.strings.length} strings present` }
    : {
        pass: false,
        detail: `missing text: ${missing.map((s) => JSON.stringify(s)).join(", ")}`,
      };
}

function checkDistinctColors(
  c: Extract<Check, { check: "distinctColors" }>,
  rec: RenderRecord
): CheckResult {
  const reps = colorClusters(dataMarks(rec).map((m) => ink(m)!));
  return {
    pass: reps.length >= c.k,
    detail: `${reps.length} distinct data-mark colors (need ${c.k}): ${reps.map(rgbaText).join(" ")}`,
  };
}

function checkSize(
  c: Extract<Check, { check: "sizeAbout" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const w = c.w ?? ctx.size.w;
  const h = c.h ?? ctx.size.h;
  const tol = c.tol ?? 0.25;
  const s: Box | undefined = rec.svgs[0];
  if (!s) return { pass: false, detail: "no svg" };
  const ok = Math.abs(s.w - w) <= tol * w && Math.abs(s.h - h) <= tol * h;
  return { pass: ok, detail: `svg is ${s.w}x${s.h}, asked ${w}x${h}` };
}

export function runCheck(
  c: Check,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  switch (c.check) {
    case "bars":
      return checkBars(c, rec, ctx);
    case "groupedBars":
      return checkGroupedBars(c, rec, ctx);
    case "stackedBars":
      return checkStackedBars(c, rec, ctx);
    case "points":
      return checkPoints(c, rec, ctx);
    case "lineSeries":
      return checkLineSeries(c, rec, ctx);
    case "wedges":
      return checkWedges(c, rec, ctx);
    case "textIncludes":
      return checkTextIncludes(c, rec);
    case "distinctColors":
      return checkDistinctColors(c, rec);
    case "sizeAbout":
      return checkSize(c, rec, ctx);
  }
}

export interface ChecksOutcome {
  pass: boolean;
  results: (CheckResult & { check: string })[];
}

export function runChecks(
  checks: Check[],
  rec: RenderRecord,
  ctx: CheckContext
): ChecksOutcome {
  const results = checks.map((c) => ({
    check: c.check,
    ...runCheck(c, rec, ctx),
  }));
  return { pass: results.every((r) => r.pass), results };
}

// ---------------------------------------------------------------------------
// Preservation (edit tasks)
// ---------------------------------------------------------------------------

const NUMERIC = /^[-−+]?[$€£]?[\d.,\s]+(%|[kKMB])?$/;

function wordSet(rec: RenderRecord): Set<string> {
  return new Set(
    rec.marks
      .filter((m) => m.kind === "text" && !NUMERIC.test(m.text!))
      .map((m) => m.text!)
  );
}

function kindCounts(rec: RenderRecord): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of dataMarks(rec)) out[m.kind] = (out[m.kind] ?? 0) + 1;
  return out;
}

/**
 * Did an edit leave alone what it was not asked to change? Compares the
 * base task's reference render with the edited render on each aspect not in
 * `mayChange` (see `Aspect` in tasks.ts). Deliberately coarse for v0: it
 * compares sets and counts, not geometry, since any requested layout change
 * moves every mark.
 */
export function preserved(
  base: RenderRecord,
  edited: RenderRecord,
  mayChange: Aspect[]
): ChecksOutcome {
  const results: (CheckResult & { check: string })[] = [];
  if (!mayChange.includes("colors")) {
    const a = colorClusters(dataMarks(base).map((m) => ink(m)!));
    const b = colorClusters(dataMarks(edited).map((m) => ink(m)!));
    const lost = a.filter((c) => !b.some((d) => colorDist(c, d) <= SAME_COLOR));
    const added = b.filter(
      (c) => !a.some((d) => colorDist(c, d) <= SAME_COLOR)
    );
    results.push({
      check: "keep colors",
      pass: lost.length === 0 && added.length === 0,
      detail: `lost [${lost.map(rgbaText).join(" ")}] added [${added.map(rgbaText).join(" ")}]`,
    });
  }
  if (!mayChange.includes("text")) {
    const a = wordSet(base);
    const b = wordSet(edited);
    const lost = [...a].filter((t) => !b.has(t));
    const added = [...b].filter((t) => !a.has(t));
    results.push({
      check: "keep text",
      pass: lost.length === 0 && added.length === 0,
      detail: `lost ${JSON.stringify(lost)} added ${JSON.stringify(added)}`,
    });
  }
  if (!mayChange.includes("marks")) {
    const a = kindCounts(base);
    const b = kindCounts(edited);
    const same = [...new Set([...Object.keys(a), ...Object.keys(b)])].every(
      (k) => a[k] === b[k]
    );
    results.push({
      check: "keep marks",
      pass: same,
      detail: `${JSON.stringify(a)} -> ${JSON.stringify(b)}`,
    });
  }
  if (!mayChange.includes("size")) {
    const a = base.svgs[0];
    const b = edited.svgs[0];
    const same =
      !!a &&
      !!b &&
      Math.abs(a.w - b.w) <= 0.03 * a.w &&
      Math.abs(a.h - b.h) <= 0.03 * a.h;
    results.push({
      check: "keep size",
      pass: same,
      detail: `${a?.w}x${a?.h} -> ${b?.w}x${b?.h}`,
    });
  }
  return { pass: results.every((r) => r.pass), results };
}
