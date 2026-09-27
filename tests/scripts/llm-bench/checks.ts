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
  /** A mosaic (Marimekko) chart: one full-height column of abutting
   *  rect-like segments per `column` category, left to right in order,
   *  with widths proportional to the column totals and all columns the same
   *  height; within a column, segment heights proportional to each
   *  `segment` category's share of the column (any stack order); each
   *  segment category has one color across columns, distinct from the
   *  others. */
  | {
      check: "mosaic";
      column: string;
      segment: string;
      value: string;
      tol?: number;
    }
  /** A rows x cols regular grid of equal squares (and no more squares of
   *  that size on the grid's lattice) whose colors count out the values: one
   *  color per category, as many squares as its value (within `tol`
   *  squares, default 0). `order: "rows"` also requires the fill order:
   *  reading row by row from the top-left, one run of squares per category,
   *  in the values' order. */
  | ({
      check: "waffle";
      rows: number;
      cols: number;
      order?: "rows" | "any";
      tol?: number;
    } & BarValues)
  /** A ribbon chart: `stackedBars`, plus, for every series and every pair of
   *  neighboring stacks, a filled band whose cross-section at the first
   *  stack's far edge spans the series' segment there and at the next
   *  stack's near edge spans its segment there (within max(2px, tol of the
   *  segment)), in that series' color or a tint of it (its hue, composited
   *  over white, is nearest that series' hue). */
  | ({
      check: "ribbons";
      orientation: Orientation;
      direction?: Direction;
      tol?: number;
    } & SeriesValues)
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
  /** Extent across the category axis (the bar's thickness). */
  width: number;
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
        width: b - a,
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

interface StackSeg {
  mark: Mark;
  /** Series this segment's length is consistent with. */
  fits: Set<number>;
  /** Index of its stack among the matched stacks. */
  stack: number;
}

/** Assign series to segments through their colors: each color cluster means
 *  one series, allowed only when every segment of that color fits it;
 *  distinct clusters mean distinct series, and no stack uses a series twice.
 *  Returns the series index of each segment, or null. */
function assignSeriesByColor(
  segs: StackSeg[],
  nSeries: number
): number[] | null {
  const reps = colorClusters(segs.map((s) => ink(s.mark)!));
  const clusterOf = (m: Mark) =>
    reps.findIndex((r) => colorDist(r, ink(m)!) <= SAME_COLOR);
  const allowed = reps.map((_, ri) => {
    const mine = segs.filter((s) => clusterOf(s.mark) === ri);
    return Array.from({ length: nSeries }, (_, si) => si).filter((si) =>
      mine.every((s) => s.fits.has(si))
    );
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
  if (!solve(0)) return null;
  const out = segs.map((s) => assign[clusterOf(s.mark)]);
  for (const st of new Set(segs.map((s) => s.stack))) {
    const seen = out.filter((_, i) => segs[i].stack === st);
    if (new Set(seen).size !== seen.length) return null;
  }
  return out;
}

/** Which segment in each stack belongs to which series, from
 *  `assignSeriesByColor`: seriesOf[stack][series] (undefined when that
 *  series has no segment there). */
function segmentsBySeries(
  segs: StackSeg[],
  assigned: number[],
  nStacks: number,
  nSeries: number
): (Mark | undefined)[][] {
  const out = Array.from({ length: nStacks }, () =>
    new Array<Mark | undefined>(nSeries).fill(undefined)
  );
  segs.forEach((s, i) => (out[s.stack][assigned[i]] = s.mark));
  return out;
}

interface StackMatch {
  /** The matched stacks, in category order. */
  stacks: Stack[];
  /** seriesOf[ci][si]: the segment of series si in stack ci (undefined when
   *  that value is zero). */
  seriesOf: (Mark | undefined)[][];
}

/** Find one stack per category, in category order along the category axis,
 *  whose segments hold that category's nonzero values (any stack order) at
 *  one common scale, with each series in one color. */
function matchStacks(
  rec: RenderRecord,
  spec: SeriesValues & { orientation: Orientation; direction?: Direction },
  data: Row[],
  tol: number
): { match: StackMatch | null; found: number; best: number } {
  const { categories, series, values } = seriesValues(spec, data);
  const stacks = stacksOf(barCandidates(rec), spec.orientation);
  const totals = values.map((row) => row.reduce((a, b) => a + b, 0));
  const maxTotal = Math.max(...totals);
  let best = 0;
  for (const dir of directions(spec.direction ?? "forward")) {
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
      best = Math.max(best, matched.length);
      if (matched.length !== categories.length) continue;
      const segs: StackSeg[] = matched.flatMap((st, ci) =>
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
      const assigned = assignSeriesByColor(segs, series.length);
      if (!assigned) continue;
      return {
        match: {
          stacks: matched,
          seriesOf: segmentsBySeries(
            segs,
            assigned,
            matched.length,
            series.length
          ),
        },
        found: stacks.length,
        best,
      };
    }
  }
  return { match: null, found: stacks.length, best };
}

function checkStackedBars(
  c: Extract<Check, { check: "stackedBars" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { categories, series } = seriesValues(c, ctx.data);
  const { match, found, best } = matchStacks(rec, c, ctx.data, c.tol ?? 0.03);
  return match
    ? {
        pass: true,
        detail: `${categories.length} stacks x ${series.length} series match`,
      }
    : {
        pass: false,
        detail: `expected ${categories.length} stacks of ${series.length} series with one color per series; ${found} stacks found, best matched ${best}`,
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

// ---------------------------------------------------------------------------
// Mosaic, waffle, ribbons
// ---------------------------------------------------------------------------

function checkMosaic(
  c: Extract<Check, { check: "mosaic" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const {
    categories: columns,
    series: segments,
    values,
  } = seriesValues(
    { category: c.column, series: c.segment, value: c.value },
    ctx.data
  );
  const tol = c.tol ?? 0.03;
  const totals = values.map((row) => row.reduce((a, b) => a + b, 0));
  const maxTotal = Math.max(...totals);
  const shares = values.map((row, ci) => row.map((v) => v / totals[ci]));
  const stacks = stacksOf(barCandidates(rec), "vertical").sort(
    (a, b) => a.pos - b.pos
  );
  const height = (st: Stack) => st.segs.reduce((a, s) => a + s.len, 0);
  // Does this stack split into category ci's shares (any order)?
  const splits = (st: Stack, ci: number) => {
    const h = height(st);
    const want = shares[ci]
      .filter((x) => x > 0)
      .map((x) => x * h)
      .sort((a, b) => a - b);
    const got = st.segs.map((s) => s.len).sort((a, b) => a - b);
    return (
      want.length === got.length &&
      want.every((w, i) => Math.abs(w - got[i]) <= tol * h + 1)
    );
  };
  let best = 0;
  let why = "";
  const scales = new Set<number>();
  for (const st of stacks)
    for (const t of totals)
      if (t > 0) scales.add(Math.round((st.width / t) * 1e4) / 1e4);
  for (const k of scales) {
    const slack = tol * k * maxTotal + 1;
    const matched: Stack[] = [];
    let ci = 0;
    for (const st of stacks) {
      if (
        ci < columns.length &&
        Math.abs(st.width - k * totals[ci]) <= slack &&
        splits(st, ci)
      ) {
        matched.push(st);
        ci++;
      }
    }
    best = Math.max(best, matched.length);
    if (matched.length !== columns.length) continue;
    const h0 = height(matched[0]);
    if (matched.some((st) => Math.abs(height(st) - h0) > tol * h0 + 1)) {
      why = `; columns match but differ in height (${matched.map((st) => height(st).toFixed(0)).join(", ")} px)`;
      continue;
    }
    const segs: StackSeg[] = matched.flatMap((st, ci) =>
      st.segs.map((s) => ({
        mark: s.mark,
        fits: new Set(
          segments
            .map((_, si) => si)
            .filter(
              (si) =>
                shares[ci][si] > 0 &&
                Math.abs(s.len - shares[ci][si] * h0) <= tol * h0 + 1
            )
        ),
        stack: ci,
      }))
    );
    if (!assignSeriesByColor(segs, segments.length)) {
      why =
        "; columns match but segment colors do not name one segment category each";
      continue;
    }
    return {
      pass: true,
      detail: `${columns.length} columns x ${segments.length} segments match`,
    };
  }
  return {
    pass: false,
    detail: `expected ${columns.length} full-height columns with widths proportional to [${totals.join(", ")}], split by ${c.segment} share; ${stacks.length} stacks found, best matched ${best}${why}`,
  };
}

/** Center of a mark's box. */
const center = (m: Box): [number, number] => [m.x + m.w / 2, m.y + m.h / 2];

/** The rows x cols regular grid of equal squares, as rows of marks (top row
 *  first, each row left to right), or null. The grid must not extend: no
 *  square of the same size sits on the lattice just outside it. */
function findGrid(
  squares: Mark[],
  rows: number,
  cols: number
): Mark[][] | null {
  const near = (m: Mark, x: number, y: number, size: number, tol: number) => {
    const [cx, cy] = center(m);
    return (
      Math.abs(cx - x) <= tol &&
      Math.abs(cy - y) <= tol &&
      Math.abs(m.w - size) <= 1 &&
      Math.abs(m.h - size) <= 1
    );
  };
  for (const s0 of squares) {
    const [x0, y0] = center(s0);
    const size = s0.w;
    const same = squares.filter(
      (m) => m !== s0 && Math.abs(m.w - size) <= 1 && Math.abs(m.h - size) <= 1
    );
    // Pitch: the nearest same-size square to the right in the same row, and
    // below in the same column.
    const right = same
      .filter((m) => Math.abs(center(m)[1] - y0) <= 1 && center(m)[0] > x0 + 1)
      .map((m) => center(m)[0] - x0);
    const down = same
      .filter((m) => Math.abs(center(m)[0] - x0) <= 1 && center(m)[1] > y0 + 1)
      .map((m) => center(m)[1] - y0);
    if (cols > 1 && right.length === 0) continue;
    if (rows > 1 && down.length === 0) continue;
    const px = cols > 1 ? Math.min(...right) : 0;
    const py = rows > 1 ? Math.min(...down) : 0;
    const tol = Math.max(1.5, 0.1 * Math.min(px || size, py || size));
    const at = (r: number, c: number) =>
      squares.find((m) => near(m, x0 + c * px, y0 + r * py, size, tol));
    const grid: Mark[][] = [];
    for (let r = 0; r < rows && grid.length === r; r++) {
      const row: Mark[] = [];
      for (let c = 0; c < cols; c++) {
        const m = at(r, c);
        if (!m) break;
        row.push(m);
      }
      if (row.length === cols) grid.push(row);
    }
    if (grid.length !== rows) continue;
    const outside: [number, number][] = [];
    for (let r = -1; r <= rows; r++) outside.push([r, -1], [r, cols]);
    for (let c = 0; c < cols; c++) outside.push([-1, c], [rows, c]);
    if (outside.some(([r, c]) => at(r, c))) continue;
    return grid;
  }
  return null;
}

function checkWaffle(
  c: Extract<Check, { check: "waffle" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { labels, values: counts } = barValues(c, ctx.data);
  const slack = c.tol ?? 0;
  const squares = rec.marks.filter(
    (m) =>
      m.kind === "rect" &&
      ink(m) &&
      !isBackground(m, rec) &&
      Math.min(m.w, m.h) >= 2 &&
      Math.abs(m.w - m.h) <= Math.max(1, 0.05 * Math.max(m.w, m.h))
  );
  const grid = findGrid(squares, c.rows, c.cols);
  if (!grid)
    return {
      pass: false,
      detail: `no ${c.rows} x ${c.cols} grid of equal squares among ${squares.length} square marks`,
    };
  const cells = grid.flat();
  const reps = colorClusters(cells.map((m) => ink(m)!));
  const clusterOf = (m: Mark) =>
    reps.findIndex((r) => colorDist(r, ink(m)!) <= SAME_COLOR);
  const want = labels.map((l, i) => `${l} ${counts[i]}`).join(", ");
  if (c.order === "rows") {
    // Runs of one color, reading row by row from the top-left.
    const runs: { cluster: number; n: number }[] = [];
    for (const m of cells) {
      const k = clusterOf(m);
      if (runs.length && runs[runs.length - 1].cluster === k)
        runs[runs.length - 1].n++;
      else runs.push({ cluster: k, n: 1 });
    }
    const got = runs.map((r) => r.n).join(", ");
    const ok =
      runs.length === counts.length &&
      new Set(runs.map((r) => r.cluster)).size === runs.length &&
      runs.every((r, i) => Math.abs(r.n - counts[i]) <= slack);
    return ok
      ? {
          pass: true,
          detail: `${c.rows} x ${c.cols} grid filled row by row as ${want}`,
        }
      : {
          pass: false,
          detail: `${c.rows} x ${c.cols} grid found, but reading row by row from the top-left gives color runs [${got}]; expected ${want}, each in its own color`,
        };
  }
  const got = reps
    .map((_, ri) => cells.filter((m) => clusterOf(m) === ri).length)
    .sort((a, b) => a - b);
  const exp = [...counts].sort((a, b) => a - b);
  const ok =
    got.length === exp.length &&
    got.every((n, i) => Math.abs(n - exp[i]) <= slack);
  return ok
    ? { pass: true, detail: `${c.rows} x ${c.cols} grid with counts ${want}` }
    : {
        pass: false,
        detail: `${c.rows} x ${c.cols} grid found, but its color counts are [${got.join(", ")}]; expected [${exp.join(", ")}]`,
      };
}

/** The extent [lo, hi] across the category axis where the outline of `m`
 *  crosses the line at `t` along the category axis (x for vertical bars),
 *  or null if it does not reach it. Rects use their box. */
function crossSection(
  m: Mark,
  t: number,
  vertical: boolean
): [number, number] | null {
  const along = (p: [number, number]) => (vertical ? p[0] : p[1]);
  const across = (p: [number, number]) => (vertical ? p[1] : p[0]);
  if (!m.points) {
    const [a0, a1] = vertical ? [m.x, m.x + m.w] : [m.y, m.y + m.h];
    if (t < a0 || t > a1) return null;
    return vertical ? [m.y, m.y + m.h] : [m.x, m.x + m.w];
  }
  const pts = m.points;
  const hits: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const a = along(p);
    const b = along(q);
    if ((a <= t && b > t) || (b <= t && a > t)) {
      const f = (t - a) / (b - a);
      hits.push(across(p) + f * (across(q) - across(p)));
    }
  }
  return hits.length >= 2 ? [Math.min(...hits), Math.max(...hits)] : null;
}

/** Hue in degrees of a color composited over white, or null when it is
 *  nearly gray. Mixing a color with white (a tint, or a semi-transparent
 *  fill on a white page) keeps its hue, so a lighter band still names its
 *  series. */
function hueOf(c: RGBA): number | null {
  const [r, g, b] = [0, 1, 2].map((i) => c[i] * c[3] + 255 * (1 - c[3]));
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d < 12) return null;
  const h =
    max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueDist(a: number, b: number): number {
  const x = Math.abs(a - b) % 360;
  return Math.min(x, 360 - x);
}

function checkRibbons(
  c: Extract<Check, { check: "ribbons" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { categories, series } = seriesValues(c, ctx.data);
  const tol = c.tol ?? 0.03;
  const { match, found, best } = matchStacks(rec, c, ctx.data, tol);
  if (!match)
    return {
      pass: false,
      detail: `expected ${categories.length} stacks of ${series.length} series with one color per series; ${found} stacks found, best matched ${best}`,
    };
  const v = c.orientation === "vertical";
  // Near and far edges of a segment along the category axis, and its span
  // across it.
  const lo = (m: Mark) => (v ? m.x : m.y);
  const hi = (m: Mark) => (v ? m.x + m.w : m.y + m.h);
  const span = (m: Mark): [number, number] =>
    v ? [m.y, m.y + m.h] : [m.x, m.x + m.w];
  const seriesInk = series.map((_, si) => {
    const m = match.seriesOf.map((row) => row[si]).find((x) => x);
    return m ? ink(m)! : null;
  });
  // A band is colored like series si when it has si's color, or when its
  // hue is nearer to si's than to any other series' (gray matches gray).
  const colorOf = (col: RGBA): number => {
    const same = seriesInk.findIndex(
      (sc) => sc && colorDist(sc, col) <= SAME_COLOR
    );
    if (same >= 0) return same;
    const h = hueOf(col);
    let bestSi = -1;
    let bestD = Infinity;
    seriesInk.forEach((sc, si) => {
      if (!sc) return;
      const hs = hueOf(sc);
      const d =
        h === null || hs === null ? (h === hs ? 0 : Infinity) : hueDist(h, hs);
      if (d < bestD) {
        bestD = d;
        bestSi = si;
      }
    });
    return bestSi;
  };
  const bars = new Set(
    match.stacks.flatMap((st) => st.segs.map((s) => s.mark))
  );
  const bands = rec.marks.filter(
    (m) =>
      m.fill &&
      ink(m) &&
      !bars.has(m) &&
      !isBackground(m, rec) &&
      (m.points || m.kind === "rect")
  );
  // The band's cross-section at an edge, read 3px and 6px inside the gap
  // and extrapolated linearly back to the edge. Reading it right at the
  // edge would hit the corners, which the sampled outline rounds off by
  // about a pixel; extrapolating measures a sloped band where it meets the
  // bar.
  const INSET = 3;
  const sectionAt = (m: Mark, edge: number, inward: 1 | -1) => {
    const s1 = crossSection(m, edge + inward * INSET, v);
    const s2 = crossSection(m, edge + inward * 2 * INSET, v);
    if (!s1 || !s2) return null;
    return [0, 1].map((i) => 2 * s1[i] - s2[i]) as [number, number];
  };
  const missing: string[] = [];
  for (let si = 0; si < series.length; si++)
    for (let ci = 0; ci + 1 < categories.length; ci++) {
      const a = match.seriesOf[ci][si];
      const b = match.seriesOf[ci + 1][si];
      if (!a || !b) continue;
      const e0 = hi(a);
      const e1 = lo(b);
      const [a0, a1] = span(a);
      const [b0, b1] = span(b);
      const slack = Math.max(2, tol * Math.max(a1 - a0, b1 - b0));
      if (e1 - e0 < 4 * INSET) {
        missing.push(
          `${series[si]} ${categories[ci]}-${categories[ci + 1]} (the gap is under ${4 * INSET}px)`
        );
        continue;
      }
      const ok = bands.some((m) => {
        const s = sectionAt(m, e0, 1);
        const t = sectionAt(m, e1, -1);
        return (
          !!s &&
          !!t &&
          Math.abs(s[0] - a0) <= slack &&
          Math.abs(s[1] - a1) <= slack &&
          Math.abs(t[0] - b0) <= slack &&
          Math.abs(t[1] - b1) <= slack &&
          colorOf(ink(m)!) === si
        );
      });
      if (!ok)
        missing.push(`${series[si]} ${categories[ci]}-${categories[ci + 1]}`);
    }
  if (missing.length === 0)
    return {
      pass: true,
      detail: `${categories.length} stacks x ${series.length} series, with a band for every series between every pair of neighboring stacks`,
    };
  return {
    pass: false,
    detail: `stacks match, but ${missing.length} bands are missing or do not span their segments: ${missing.slice(0, 4).join("; ")}${missing.length > 4 ? "; ..." : ""}`,
  };
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
    case "mosaic":
      return checkMosaic(c, rec, ctx);
    case "waffle":
      return checkWaffle(c, rec, ctx);
    case "ribbons":
      return checkRibbons(c, rec, ctx);
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
