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
  | {
      values: number[];
      category?: undefined;
      value?: undefined;
      sort?: undefined;
    }
  | {
      category: string;
      value: string;
      /** Order categories by their summed value instead of data order. */
      sort?: "asc" | "desc";
      values?: undefined;
    };

/** Which items a highlight picks: every listed field must match, either
 *  equal to the value (compared as strings) or within { min, max }. For
 *  field-based bars the items are the categories, with the category and
 *  value fields; for points, the rows. */
type Where = Record<string, string | number | { min?: number; max?: number }>;

/** A highlight: the picked items' marks are drawn in `color` (RGB, alpha
 *  ignored), and every other item's mark shares one other color. */
interface Highlight {
  where: Where;
  color: string;
}

/** Values for a stacked/grouped check: summed from the task data by
 *  category x series (both in order of first appearance). */
interface SeriesValues {
  category: string;
  series: string;
  value: string;
}

/** One level of a mosaic: split along `dir` by the categories of `by`. */
export interface MosaicLevel {
  by: string;
  dir: "x" | "y";
  from?: "left" | "right" | "top" | "bottom" | "any";
}

export type Check =
  /** One rect-like filled mark per value, on a common baseline, lengths
   *  proportional to the values (a zero baseline; negative values extend
   *  the other way). `ordered` (default true) requires the values' order
   *  along the category axis in `direction` (default "forward").
   *  `valueLabels`: each bar also has a text reading exactly its value
   *  (en-US, thousands separators, `decimals` places, default 0) just
   *  beyond its end and centered across it. `highlight`: the picked bars
   *  have the given color and every other bar shares one other color. */
  | ({
      check: "bars";
      orientation: Orientation;
      ordered?: boolean;
      direction?: Direction;
      tol?: number;
      valueLabels?: { decimals?: number };
      highlight?: Highlight;
    } & BarValues)
  /** `bars` (ordered, within `tol`), plus a straight line across the value
   *  axis at `at` (a number, or "mean" of the bar values) on the bars'
   *  scale (within `lineTol`, default 0.005, of the largest value + 1.5px),
   *  spanning from the first bar's outer edge to the last bar's; `dashed`
   *  requires a dash pattern. A text containing `label` lies within 30px of
   *  the line and alongside it. */
  | ({
      check: "referenceLine";
      orientation: Orientation;
      direction?: Direction;
      at: number | "mean";
      label: string;
      dashed?: boolean;
      tol?: number;
      lineTol?: number;
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
   *  color; different values get different colors. `size`: each circle's
   *  area is proportional to the field (radius^2 = k * value for one k),
   *  within 0.5px + `sizeTol` (0.03) of the largest radius; with
   *  `maxRadius`, the largest radius is within 25% of it. `highlight`:
   *  the picked rows' circles have the given color and every other circle
   *  shares one other color. */
  | {
      check: "points";
      x: string;
      y: string;
      colorBy?: string;
      size?: string;
      maxRadius?: number;
      highlight?: Highlight;
      tol?: number;
      sizeTol?: number;
    }
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
  /** A line through the rows as `lineSeries` finds it, and at the row with
   *  the largest (`at: "max"`) or smallest `y`: a filled circle (radius at
   *  least 2.5px) centered on that point (within 1.5% of the plot, at least
   *  2px), and a text containing `text` within `near` px (30) of it. */
  | {
      check: "annotation";
      x: string;
      y: string;
      at: "max" | "min";
      text: string;
      near?: number;
      tol?: number;
    }
  /** Pie/donut slices around one center whose angular shares match the
   *  values' shares (any order); slices have distinct colors. `hole`: true
   *  requires a donut (every slice's inner radius is at least 20% of its
   *  outer radius), false a pie (at most 5%); unset allows either. */
  | ({ check: "wedges"; hole?: boolean; tol?: number } & BarValues)
  /** Pie glyphs: one complete pie (slices around one center whose sweeps
   *  add up to 360 degrees, within 3, and whose inner radius is at most 5%
   *  of the outer) per `by` category, centered at an
   *  affine image of its (x, y) with y up (as `points`, within `placeTol`
   *  of the plotted extent); its slices' angular shares match the shares
   *  of `value` by `category` (any order, within `tol`, default 0.01); each
   *  `category` has one color across pies, distinct from the others. */
  | {
      check: "pieGlyphs";
      by: string;
      x: string;
      y: string;
      category: string;
      value: string;
      tol?: number;
      placeTol?: number;
    }
  /** A mosaic: one rectangle split recursively, one level per entry of
   *  `levels`. Level i splits every cell of level i-1 along its `dir` into
   *  one piece per category of its `by` field, each piece as long as that
   *  category's share of the cell's summed `value` (within `tol` of the
   *  cell), and spanning the cell's full extent the other way. `from` names
   *  the side the first category (in order of first appearance) starts at;
   *  "any" (the default) allows any order. Small gaps between pieces are
   *  allowed. The categories of the last level each have one color, distinct
   *  from the others. A Marimekko chart is two levels: columns along x, then
   *  segments along y. */
  | {
      check: "mosaic";
      levels: MosaicLevel[];
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
  /** A ridgeline: per `category` (in order of first appearance), a filled
   *  shape whose top edge, measured up from its own baseline (its lowest
   *  edge), passes through the category's (x, y) points (within `tol` of
   *  the tallest peak, at least 2px), under one horizontal map (the shapes
   *  span the same x range) and one height scale (within 5%). Baselines run
   *  top to bottom in category order, evenly spaced (within 5%, at least
   *  2px), and the tallest peak is `overlap` ([1.5, 2.5]) times the spacing,
   *  so ridges overlap the row above. */
  | {
      check: "ridgeline";
      category: string;
      x: string;
      y: string;
      overlap?: [number, number];
      tol?: number;
    }
  /** Bottle fills: one bottle outline per `category`, left to right in
   *  order (stroked, unfilled, closed, not a rectangle, all the same height
   *  within 5%). Inside each, the painted pixels of the filled marks there
   *  (after any clip path or mask) form the liquid: it starts at the
   *  outline's bottom, rises to `value / max` of the outline's height
   *  (within `tol`, default 0.02, plus 1.5px), stays inside the outline (at
   *  most 1% of its pixels more than 1.5px outside), and a quarter of the
   *  way up it spans at least 85% of the outline's width. */
  | {
      check: "bottleFill";
      category: string;
      value: string;
      max?: number;
      tol?: number;
    }
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
): { labels: string[]; values: number[]; items: Row[] } {
  if (spec.values)
    return {
      labels: spec.values.map(String),
      values: spec.values,
      items: spec.values.map((value) => ({ value })),
    };
  const cats = uniqueInOrder(data, spec.category!).map((label) => ({
    label,
    value: data
      .filter((r) => String(r[spec.category!]) === label)
      .reduce((s, r) => s + num(r[spec.value!]), 0),
  }));
  if (spec.sort)
    cats.sort((a, b) =>
      spec.sort === "asc" ? a.value - b.value : b.value - a.value
    );
  return {
    labels: cats.map((c) => c.label),
    values: cats.map((c) => c.value),
    items: cats.map((c) => ({
      [spec.category!]: c.label,
      [spec.value!]: c.value,
    })),
  };
}

function picked(item: Row, where: Where): boolean {
  return Object.entries(where).every(([field, want]) => {
    const got = item[field];
    if (typeof want === "object") {
      const v = num(got);
      return (
        Number.isFinite(v) &&
        (want.min === undefined || v >= want.min) &&
        (want.max === undefined || v <= want.max)
      );
    }
    return String(got) === String(want);
  });
}

/** Parse "#rrggbb" or "#rgb" into RGBA. */
function hexColor(hex: string): RGBA {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4]
    .map((i) => parseInt(full.slice(i, i + 2), 16))
    .concat(1) as RGBA;
}

/** marks[i] draws items[i]. The picked items' marks have the highlight
 *  color (RGB within SAME_COLOR; alpha ignored, since a fill may keep the
 *  chart's opacity), and all other marks share one color that is not it. */
function highlightProblem(
  h: Highlight,
  items: Row[],
  marks: Mark[]
): string | null {
  const want = hexColor(h.color);
  const rgb = (c: RGBA) =>
    Math.hypot(c[0] - want[0], c[1] - want[1], c[2] - want[2]);
  const pick = items.map((it) => picked(it, h.where));
  const n = pick.filter(Boolean).length;
  if (n === 0) return `no item matches ${JSON.stringify(h.where)}`;
  const wrong = marks.filter((m, i) => pick[i] && rgb(ink(m)!) > SAME_COLOR);
  if (wrong.length > 0)
    return `${wrong.length} of ${n} highlighted marks are not ${h.color} (${rgbaText(ink(wrong[0])!)})`;
  const rest = marks.filter((_, i) => !pick[i]).map((m) => ink(m)!);
  const reps = colorClusters(rest);
  if (reps.length > 1)
    return `the other marks use ${reps.length} colors (${reps.slice(0, 4).map(rgbaText).join(" ")}), not one shared color`;
  if (reps.length === 1 && rgb(reps[0]) <= SAME_COLOR)
    return `the other marks are also ${h.color}`;
  return null;
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

/** A number as en-US text with thousands separators and a fixed number of
 *  decimals, e.g. 1240 -> "1,240". */
function formatNumber(v: number, decimals: number): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** For each bar, a text reading exactly its formatted value, just beyond
 *  the bar's end (its outer edge at most 16px past the end, and at most 30%
 *  of the text overlapping the bar) and centered across the bar (within
 *  max(3px, 10% of its thickness)). Returns the problems, or []. */
function valueLabelProblems(
  bars: Bar[],
  values: number[],
  orientation: Orientation,
  decimals: number,
  rec: RenderRecord
): string[] {
  const texts = rec.marks.filter((m) => m.kind === "text");
  const v = orientation === "vertical";
  const problems: string[] = [];
  bars.forEach((bar, i) => {
    const want = formatNumber(values[i], decimals);
    const same = texts.filter((t) => t.text!.trim() === want);
    if (same.length === 0) {
      problems.push(`no text "${want}"`);
      return;
    }
    const m = bar.mark;
    const ok = same.some((t) => {
      const across = v
        ? Math.abs(t.x + t.w / 2 - (m.x + m.w / 2)) <= Math.max(3, 0.1 * m.w)
        : Math.abs(t.y + t.h / 2 - (m.y + m.h / 2)) <= Math.max(3, 0.1 * m.h);
      // Gap from the bar's end to the near side of the text, measured
      // outward (negative when the text overlaps the bar).
      const gap = v
        ? bar.len >= 0
          ? m.y - (t.y + t.h)
          : t.y - (m.y + m.h)
        : bar.len >= 0
          ? t.x - (m.x + m.w)
          : m.x - (t.x + t.w);
      const depth = v ? t.h : t.w;
      return across && gap >= -0.3 * depth && gap <= 16;
    });
    if (!ok)
      problems.push(
        `"${want}" is not just beyond its bar's end, centered on it`
      );
  });
  return problems;
}

function checkBars(
  c: Extract<Check, { check: "bars" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { values, items } = barValues(c, ctx.data);
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
  if (bars.length !== values.length)
    return {
      pass: false,
      detail: `expected ${values.length} ${c.orientation} bars proportional to [${values.join(", ")}]; ${cands.length} filled rects, best baseline matched ${best}`,
    };
  let matched = `${values.length} ${c.orientation} bars match [${values.join(", ")}]`;
  if (c.highlight) {
    const problem = highlightProblem(
      c.highlight,
      items,
      bars.map((b) => b.mark)
    );
    if (problem)
      return { pass: false, detail: `${matched}, but highlight: ${problem}` };
    matched += `, highlighted ${JSON.stringify(c.highlight.where)} in ${c.highlight.color}`;
  }
  if (c.valueLabels) {
    const problems = valueLabelProblems(
      bars,
      values,
      c.orientation,
      c.valueLabels.decimals ?? 0,
      rec
    );
    if (problems.length > 0)
      return {
        pass: false,
        detail: `${matched}, but value labels: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "; ..." : ""}`,
      };
    return { pass: true, detail: `${matched}, each labeled with its value` };
  }
  return { pass: true, detail: matched };
}

function checkReferenceLine(
  c: Extract<Check, { check: "referenceLine" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { values } = barValues(c, ctx.data);
  const tol = c.tol ?? 0.03;
  const { bars } = matchBars(
    barsByBaseline(barCandidates(rec), c.orientation),
    values,
    { ordered: true, direction: c.direction ?? "forward", tol }
  );
  if (bars.length !== values.length)
    return {
      pass: false,
      detail: `no ${c.orientation} bars proportional to [${values.join(", ")}] to measure the line against`,
    };
  const at =
    c.at === "mean" ? values.reduce((a, b) => a + b, 0) / values.length : c.at;
  const v = c.orientation === "vertical";
  // The value axis: screen position = base + k * value, along y (up) for
  // vertical bars and x (right) for horizontal ones.
  const ref = bars.find((b, i) => values[i] !== 0)!;
  const vi = bars.indexOf(ref);
  const k = ref.len / values[vi];
  const m0 = ref.mark;
  const base = v
    ? ref.len >= 0
      ? m0.y + m0.h
      : m0.y
    : ref.len >= 0
      ? m0.x
      : m0.x + m0.w;
  const target = v ? base - k * at : base + k * at;
  // The line sits at one exact value, so it gets a tighter tolerance than
  // the bars: `lineTol` (0.005) of the largest value, plus 1.5px.
  const slack =
    (c.lineTol ?? 0.005) * Math.abs(k) * Math.max(...values.map(Math.abs)) +
    1.5;
  // The span the line must cover: from the first bar's outer edge to the
  // last bar's.
  const lo = Math.min(...bars.map((b) => (v ? b.mark.x : b.mark.y)));
  const hi = Math.max(
    ...bars.map((b) => (v ? b.mark.x + b.mark.w : b.mark.y + b.mark.h))
  );
  const rules = rec.marks.filter((m) => {
    if (!ink(m)) return false;
    const thin = v ? m.h <= 3 : m.w <= 3;
    return (m.kind === "line" || m.kind === "rect") && thin;
  });
  const pos = (m: Mark) => (v ? m.y + m.h / 2 : m.x + m.w / 2);
  const at1 = rules.filter((m) => Math.abs(pos(m) - target) <= slack);
  const spanning = at1.filter((m) =>
    v
      ? m.x <= lo + 2 && m.x + m.w >= hi - 2
      : m.y <= lo + 2 && m.y + m.h >= hi - 2
  );
  const shown = `${at.toFixed(2)} (expected at ${v ? "y" : "x"} = ${target.toFixed(0)}px)`;
  if (spanning.length === 0)
    return {
      pass: false,
      detail:
        at1.length === 0
          ? `no ${v ? "horizontal" : "vertical"} line at ${shown}`
          : `a line at ${shown}, but it does not span the bars (${lo.toFixed(0)}-${hi.toFixed(0)}px)`,
    };
  const dashed = spanning.filter((m) => (m.dash ?? []).some((d) => d > 0));
  if (c.dashed && dashed.length === 0)
    return { pass: false, detail: `a line at ${shown}, but it is not dashed` };
  const line = (c.dashed ? dashed : spanning)[0];
  const lineLo = v ? line.x : line.y;
  const lineHi = v ? line.x + line.w : line.y + line.h;
  const label = rec.marks.find((t) => {
    if (
      t.kind !== "text" ||
      !t.text!.toLowerCase().includes(c.label.toLowerCase())
    )
      return false;
    // Within 30px of the line across it, and alongside it.
    const [a0, a1] = v ? [t.y, t.y + t.h] : [t.x, t.x + t.w];
    const [b0, b1] = v ? [t.x, t.x + t.w] : [t.y, t.y + t.h];
    const off = Math.max(a0 - target, 0, target - a1);
    return off <= 30 && b1 >= lineLo - 30 && b0 <= lineHi + 30;
  });
  if (!label)
    return {
      pass: false,
      detail: `a ${c.dashed ? "dashed " : ""}line at ${shown}, but no text "${c.label}" next to it`,
    };
  return {
    pass: true,
    detail: `a ${c.dashed ? "dashed " : ""}line at ${shown} spans the bars, labeled "${label.text}"`,
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

/** Place data points (xs[i], ys[i]) on screen centers under one affine map
 *  per axis (x right, y up): every point gets its own center within `tolFrac`
 *  of the plotted extent (at least 1.5px). Returns the center index of each
 *  point, or null, plus how many maps fit each axis alone (for details). */
function placePoints(
  xs: number[],
  ys: number[],
  cx: number[],
  cy: number[],
  tolFrac: number
): { match: number[] | null; nx: number; ny: number } {
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
      for (let i = 0; i < xs.length; i++) {
        const px = X.a * xs[i] + X.b;
        const py = Y.a * ys[i] + Y.b;
        let bestJ = -1;
        let bestD = Infinity;
        for (let j = 0; j < cx.length; j++) {
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
      if (match.length === xs.length)
        return { match, nx: hx.length, ny: hy.length };
    }
  return { match: null, nx: hx.length, ny: hy.length };
}

/** Marks colored by a field: rows sharing its value share a color, and
 *  different values get different colors. marks[i] draws rows[i]. */
function colorsBy(field: string, rows: Row[], marks: Mark[]): CheckResult {
  const groups = uniqueInOrder(rows, field);
  return seriesColorsConsistent(
    groups.map((g) => marks.filter((_, i) => String(rows[i][field]) === g)),
    groups
  );
}

function checkPoints(
  c: Extract<Check, { check: "points" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const rows = ctx.data.filter(
    (r) => Number.isFinite(num(r[c.x])) && Number.isFinite(num(r[c.y]))
  );
  const circles = rec.marks.filter(
    (m) => m.kind === "circle" && !isBackground(m, rec)
  );
  if (circles.length < rows.length)
    return {
      pass: false,
      detail: `expected ${rows.length} circles, found ${circles.length}`,
    };
  const { match, nx, ny } = placePoints(
    rows.map((r) => num(r[c.x])),
    rows.map((r) => num(r[c.y])),
    circles.map((m) => m.x + m.w / 2),
    circles.map((m) => m.y + m.h / 2),
    c.tol ?? 0.01
  );
  if (!match)
    return {
      pass: false,
      detail: `no affine placement of ${rows.length} points onto ${circles.length} circles (${nx} x-fits, ${ny} y-fits)`,
    };
  const mine = match.map((j) => circles[j]);
  const notes: string[] = [];
  if (c.size) {
    // Area proportional to the value: r^2 = k * v for one k.
    const vs = rows.map((r) => num(r[c.size!]));
    const rs = mine.map((m) => (m.w + m.h) / 4);
    const ks = vs
      .map((v, i) => (rs[i] * rs[i]) / v)
      .filter((k) => Number.isFinite(k) && k > 0)
      .sort((a, b) => a - b);
    const k = ks[Math.floor(ks.length / 2)] ?? 0;
    const slack = 0.5 + (c.sizeTol ?? 0.03) * Math.max(...rs);
    const off = rs.filter((r, i) => Math.abs(r - Math.sqrt(k * vs[i])) > slack);
    if (off.length > 0) {
      const pairs = rows
        .map((_, i) => `${vs[i]}:${rs[i].toFixed(1)}`)
        .slice(0, 8)
        .join(", ");
      return {
        pass: false,
        detail: `${rows.length} points placed, but ${off.length} radii are not proportional to the square root of ${c.size} (value:radius ${pairs}${rows.length > 8 ? ", ..." : ""})`,
      };
    }
    if (c.maxRadius !== undefined) {
      const rmax = Math.max(...rs);
      if (Math.abs(rmax - c.maxRadius) > 0.25 * c.maxRadius)
        return {
          pass: false,
          detail: `${rows.length} points placed with areas proportional to ${c.size}, but the largest radius is ${rmax.toFixed(1)}px, expected about ${c.maxRadius}px`,
        };
    }
    notes.push(`areas proportional to ${c.size}`);
  }
  if (c.colorBy) {
    const colors = colorsBy(c.colorBy, rows, mine);
    if (!colors.pass) return colors;
    notes.push(`colored by ${c.colorBy}`);
  }
  if (c.highlight) {
    const problem = highlightProblem(c.highlight, rows, mine);
    if (problem)
      return {
        pass: false,
        detail: `${rows.length} points placed, but highlight: ${problem}`,
      };
    notes.push(
      `highlighted ${JSON.stringify(c.highlight.where)} in ${c.highlight.color}`
    );
  }
  return {
    pass: true,
    detail: `${rows.length} points match${notes.length ? `, ${notes.join(", ")}` : ""}`,
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

interface LineFit {
  /** The data-to-screen maps (y up) under which every series has a line. */
  X: Affine;
  Y: Affine;
  /** The line drawn for each series, in series order. */
  chosen: Mark[];
  names: string[];
}

/** Find one stroked line per series (or one line) through the rows' (x, y)
 *  under one affine map with y up; see the `lineSeries` check. */
function fitLineSeries(
  c: { x: string; y: string; groupBy?: string; tol?: number },
  rec: RenderRecord,
  data: Row[]
): LineFit | { fail: string } {
  const rows = data.filter(
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
      if (chosen.length === series.length) return { X, Y, chosen, names };
    }
  }
  return {
    fail: `expected ${series.length} line series; ${lines.length} stroked lines, none fit`,
  };
}

function checkLineSeries(
  c: Extract<Check, { check: "lineSeries" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const fit = fitLineSeries(c, rec, ctx.data);
  if ("fail" in fit) return { pass: false, detail: fit.fail };
  if (c.groupBy) {
    const colors = seriesColorsConsistent(
      fit.chosen.map((m) => [m]),
      fit.names
    );
    if (!colors.pass) return colors;
  }
  return { pass: true, detail: `${fit.names.length} line series match` };
}

/** Distance from a point to a box (0 inside it). */
function distToBox([x, y]: [number, number], b: Box): number {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

function checkAnnotation(
  c: Extract<Check, { check: "annotation" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const fit = fitLineSeries(c, rec, ctx.data);
  if ("fail" in fit)
    return { pass: false, detail: `no line to annotate: ${fit.fail}` };
  const rows = ctx.data.filter(
    (r) => Number.isFinite(num(r[c.x])) && Number.isFinite(num(r[c.y]))
  );
  const pick = rows.reduce((best, r) =>
    (
      c.at === "max"
        ? num(r[c.y]) > num(best[c.y])
        : num(r[c.y]) < num(best[c.y])
    )
      ? r
      : best
  );
  const p: [number, number] = [
    fit.X.a * num(pick[c.x]) + fit.X.b,
    fit.Y.a * num(pick[c.y]) + fit.Y.b,
  ];
  const where = `(${c.x} ${pick[c.x]}, ${c.y} ${pick[c.y]}) at (${p[0].toFixed(0)}, ${p[1].toFixed(0)})`;
  const plot = Math.max(
    Math.abs(fit.X.a) *
      (Math.max(...rows.map((r) => num(r[c.x]))) -
        Math.min(...rows.map((r) => num(r[c.x])))),
    Math.abs(fit.Y.a) *
      (Math.max(...rows.map((r) => num(r[c.y]))) -
        Math.min(...rows.map((r) => num(r[c.y]))))
  );
  const reach = Math.max(2, 0.015 * plot);
  const marker = rec.marks.find(
    (m) =>
      m.kind === "circle" &&
      m.fill &&
      ink(m) &&
      m.w / 2 >= 2.5 &&
      Math.hypot(m.x + m.w / 2 - p[0], m.y + m.h / 2 - p[1]) <= reach
  );
  if (!marker)
    return {
      pass: false,
      detail: `no filled circle (radius at least 2.5px) centered on the ${c.at} point ${where}`,
    };
  const near = c.near ?? 30;
  const texts = rec.marks.filter(
    (m) =>
      m.kind === "text" && m.text!.toLowerCase().includes(c.text.toLowerCase())
  );
  if (texts.length === 0)
    return { pass: false, detail: `marker found, but no text "${c.text}"` };
  const d = Math.min(...texts.map((t) => distToBox(p, t)));
  return d <= near
    ? {
        pass: true,
        detail: `marker and "${c.text}" (${d.toFixed(0)}px away) at the ${c.at} point ${where}`,
      }
    : {
        pass: false,
        detail: `marker found, but "${c.text}" is ${d.toFixed(0)}px from the ${c.at} point ${where} (at most ${near})`,
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
  const centers = wedgesByCenter(rec);
  const wedges = centers.flat();
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

/** Wedges grouped by shared center (within max(2px, 2% of the radius)). */
function wedgesByCenter(rec: RenderRecord): Mark[][] {
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
  return centers;
}

function checkPieGlyphs(
  c: Extract<Check, { check: "pieGlyphs" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const tol = c.tol ?? 0.01;
  const cats = uniqueInOrder(ctx.data, c.category);
  const glyphs = uniqueInOrder(ctx.data, c.by).map((name) => {
    const rows = ctx.data.filter((r) => String(r[c.by]) === name);
    const sums = cats.map((cat) =>
      rows
        .filter((r) => String(r[c.category]) === cat)
        .reduce((s, r) => s + num(r[c.value]), 0)
    );
    const total = sums.reduce((a, b) => a + b, 0);
    return {
      name,
      x: num(rows[0][c.x]),
      y: num(rows[0][c.y]),
      shares: sums.map((s) => s / total),
    };
  });
  // Complete pies only: the slices around a center fill the circle, with
  // no hole.
  const pies = wedgesByCenter(rec).filter(
    (g) =>
      Math.abs(g.reduce((a, w) => a + w.wedge!.sweep, 0) - 360) <= 3 &&
      g.every((w) => w.wedge!.r0 <= 0.05 * w.wedge!.r)
  );
  if (pies.length < glyphs.length)
    return {
      pass: false,
      detail: `expected ${glyphs.length} complete pies (no hole), found ${pies.length}`,
    };
  const { match, nx, ny } = placePoints(
    glyphs.map((g) => g.x),
    glyphs.map((g) => g.y),
    pies.map((g) => g[0].wedge!.cx),
    pies.map((g) => g[0].wedge!.cy),
    c.placeTol ?? 0.01
  );
  if (!match)
    return {
      pass: false,
      detail: `no affine placement of ${glyphs.length} ${c.by} positions onto ${pies.length} pie centers (${nx} x-fits, ${ny} y-fits)`,
    };
  const segs: StackSeg[] = [];
  for (let gi = 0; gi < glyphs.length; gi++) {
    const g = glyphs[gi];
    const pie = pies[match[gi]];
    const want = g.shares.filter((s) => s > 0).sort((a, b) => a - b);
    const got = pie.map((w) => w.wedge!.sweep / 360).sort((a, b) => a - b);
    if (
      want.length !== got.length ||
      !want.every((s, i) => Math.abs(s - got[i]) <= tol)
    )
      return {
        pass: false,
        detail: `the pie at ${g.name} has slice shares [${got.map((s) => s.toFixed(3)).join(", ")}], expected [${want.map((s) => s.toFixed(3)).join(", ")}]`,
      };
    for (const w of pie)
      segs.push({
        mark: w,
        stack: gi,
        fits: new Set(
          g.shares
            .map((s, ci) => [s, ci] as const)
            .filter(([s]) => s > 0 && Math.abs(s - w.wedge!.sweep / 360) <= tol)
            .map(([, ci]) => ci)
        ),
      });
  }
  if (!assignSeriesByColor(segs, cats.length))
    return {
      pass: false,
      detail: `${glyphs.length} pies placed with the right shares, but slice colors do not name one ${c.category} each`,
    };
  return {
    pass: true,
    detail: `${glyphs.length} pies at their ${c.by} positions, slices by ${c.category} share, one color per ${c.category}`,
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

/** Groups of marks whose boxes lie within `gap` px of each other (chained),
 *  largest total area first. */
function clusters(marks: Mark[], gap: number): Mark[][] {
  const parent = marks.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const near = (a: Mark, b: Mark) =>
    a.x <= b.x + b.w + gap &&
    b.x <= a.x + a.w + gap &&
    a.y <= b.y + b.h + gap &&
    b.y <= a.y + a.h + gap;
  for (let i = 0; i < marks.length; i++)
    for (let j = i + 1; j < marks.length; j++)
      if (near(marks[i], marks[j])) parent[find(i)] = find(j);
  const groups = new Map<number, Mark[]>();
  marks.forEach((m, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(m);
  });
  const area = (g: Mark[]) => g.reduce((a, m) => a + m.w * m.h, 0);
  return [...groups.values()].sort((a, b) => area(b) - area(a));
}

/** Every way to cut `n` ordered items into `k` consecutive runs (at most
 *  `limit` ways), as the start index of each run. */
function cutsInto(n: number, k: number, limit = 5000): number[][] {
  const out: number[][] = [];
  const go = (starts: number[]) => {
    if (out.length >= limit) return;
    if (starts.length === k) {
      out.push(starts);
      return;
    }
    const last = starts[starts.length - 1];
    const left = k - starts.length;
    for (let s = last + 1; s <= n - left; s++) go([...starts, s]);
  };
  if (k >= 1 && k <= n) go([0]);
  return out;
}

/** Orders of `n` categories to try against `n` pieces in axis order: the
 *  stated order (identity) when `fixed`, else every permutation whose sizes
 *  fit. order[pi] is the category of piece pi. */
function* orders(
  n: number,
  fixed: boolean,
  fits: (piece: number, cat: number) => boolean
): Generator<number[]> {
  if (fixed) {
    const id = Array.from({ length: n }, (_, i) => i);
    if (id.every((ci, pi) => fits(pi, ci))) yield id;
    return;
  }
  const used = new Set<number>();
  const perm: number[] = [];
  function* go(pi: number): Generator<number[]> {
    if (pi === n) {
      yield [...perm];
      return;
    }
    for (let ci = 0; ci < n; ci++) {
      if (used.has(ci) || !fits(pi, ci)) continue;
      used.add(ci);
      perm.push(ci);
      yield* go(pi + 1);
      perm.pop();
      used.delete(ci);
    }
  }
  yield* go(0);
}

type MosaicSplit =
  | { ok: true; leaves: { cat: string; mark: Mark }[] }
  | { ok: false; why: string; depth: number };

/** Split one mosaic cell (its leaf rects and its data rows) at `level` and
 *  below; see the `mosaic` check. On failure, reports the deepest level any
 *  attempt reached, since that is the most informative reason. */
function splitMosaic(
  leaves: Mark[],
  rows: Row[],
  levels: MosaicLevel[],
  level: number,
  value: string,
  tol: number,
  path: string
): MosaicSplit {
  const where = path || "the chart";
  const fail = (why: string, depth = level): MosaicSplit => ({
    ok: false,
    why: `${where}: ${why}`,
    depth,
  });
  const L = levels[level];
  const xDir = L.dir === "x";
  const a = (m: Mark) => (xDir ? m.x : m.y);
  const b = (m: Mark) => (xDir ? m.x + m.w : m.y + m.h);
  const pa = (m: Mark) => (xDir ? m.y : m.x);
  const pb = (m: Mark) => (xDir ? m.y + m.h : m.x + m.w);
  const cats = uniqueInOrder(rows, L.by)
    .map((name) => {
      const mine = rows.filter((r) => String(r[L.by]) === name);
      return {
        name,
        rows: mine,
        sum: mine.reduce((s, r) => s + num(r[value]), 0),
      };
    })
    .filter((cat) => cat.sum > 0);
  const total = cats.reduce((s, cat) => s + cat.sum, 0);
  // The finest split along the axis: runs of leaves that no leaf crosses.
  const atoms: Mark[][] = [];
  let reach = -Infinity;
  for (const m of [...leaves].sort((p, q) => a(p) - a(q))) {
    if (atoms.length === 0 || a(m) >= reach - 1) atoms.push([m]);
    else atoms[atoms.length - 1].push(m);
    reach = Math.max(reach, b(m));
  }
  if (atoms.length < cats.length)
    return fail(
      `splits into ${atoms.length} pieces along ${L.dir}, expected ${cats.length} (one per ${L.by})`
    );
  const ext = (
    ms: Mark[],
    lo: (m: Mark) => number,
    hi: (m: Mark) => number
  ): [number, number] => [Math.min(...ms.map(lo)), Math.max(...ms.map(hi))];
  const [p0, p1] = ext(leaves, pa, pb);
  const [c0, c1] = ext(leaves, a, b);
  const slack = tol * (c1 - c0) + 1;
  const pslack = tol * (p1 - p0) + 1;
  const from = L.from ?? "any";
  // Screen coordinates grow right and down, so a first category at the
  // right or bottom means reading the pieces backwards.
  const backwards = from === "right" || from === "bottom";
  let deepest: MosaicSplit | null = null;
  const keep = (r: MosaicSplit) => {
    if (!r.ok && (!deepest || (!deepest.ok && r.depth > deepest.depth)))
      deepest = r;
  };
  for (const starts of cutsInto(atoms.length, cats.length)) {
    let pieces = starts.map((s, i) =>
      atoms.slice(s, starts[i + 1] ?? atoms.length).flat()
    );
    if (backwards) pieces = pieces.reverse();
    const sizes = pieces.map((p) => {
      const [lo, hi] = ext(p, a, b);
      return hi - lo;
    });
    const sizeSum = sizes.reduce((s, x) => s + x, 0);
    const full = pieces.every((p) => {
      const [q0, q1] = ext(p, pa, pb);
      return Math.abs(q0 - p0) <= pslack && Math.abs(q1 - p1) <= pslack;
    });
    if (!full) {
      keep(
        fail(
          `the pieces along ${L.dir} do not all span the cell's full ${xDir ? "height" : "width"}`
        )
      );
      continue;
    }
    // Sizes are compared as shares of the pieces' summed length, so gaps
    // between pieces do not count.
    const fits = (pi: number, ci: number) =>
      Math.abs(sizes[pi] - (cats[ci].sum / total) * sizeSum) <= slack;
    let any = false;
    for (const order of orders(cats.length, from !== "any", fits)) {
      any = true;
      const out: { cat: string; mark: Mark }[] = [];
      let bad: MosaicSplit | null = null;
      for (let pi = 0; pi < pieces.length && !bad; pi++) {
        const cat = cats[order[pi]];
        const sub = `${path ? `${path} > ` : ""}${cat.name}`;
        if (level === levels.length - 1) {
          if (pieces[pi].length === 1)
            out.push({ cat: cat.name, mark: pieces[pi][0] });
          else
            bad = {
              ok: false,
              why: `${sub}: ${pieces[pi].length} rects where one was expected`,
              depth: level + 1,
            };
        } else {
          const r = splitMosaic(
            pieces[pi],
            cat.rows,
            levels,
            level + 1,
            value,
            tol,
            sub
          );
          if (r.ok) out.push(...r.leaves);
          else bad = r;
        }
      }
      if (!bad) return { ok: true, leaves: out };
      keep(bad);
    }
    if (!any) {
      const want = cats
        .map((cat) => `${cat.name} ${((100 * cat.sum) / total).toFixed(1)}%`)
        .join(", ");
      const got = sizes
        .map((s) => `${((100 * s) / sizeSum).toFixed(1)}%`)
        .join(", ");
      keep(
        fail(
          `pieces along ${L.dir}${from !== "any" ? ` from the ${from}` : ""} are [${got}], expected ${L.by} shares [${want}]`
        )
      );
    }
  }
  return deepest ?? fail(`no split along ${L.dir} by ${L.by}`);
}

function checkMosaic(
  c: Extract<Check, { check: "mosaic" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const tol = c.tol ?? 0.03;
  const last = c.levels[c.levels.length - 1].by;
  const spec = c.levels.map((l) => `${l.by} (${l.dir})`).join(" > ");
  const rects = barCandidates(rec).filter((m) => m.w >= 0.5 && m.h >= 0.5);
  // The mosaic is one cluster of touching (or nearly touching) rects, and
  // legend swatches sit apart from it. Rects thinner than 1.5px (axis lines
  // and ticks drawn as rects, but also a mosaic's thinnest cells) do not
  // join clusters; they count only when inside a cluster's box. Several gap
  // sizes are tried, since some layouts leave a gap between pieces.
  const solid = rects.filter((m) => Math.min(m.w, m.h) >= 1.5);
  const thin = rects.filter((m) => Math.min(m.w, m.h) < 1.5);
  const groups: Mark[][] = [];
  for (const gap of [3, 12, 30])
    for (const g of clusters(solid, gap).slice(0, 4)) {
      const [x0, x1] = [
        Math.min(...g.map((m) => m.x)),
        Math.max(...g.map((m) => m.x + m.w)),
      ];
      const [y0, y1] = [
        Math.min(...g.map((m) => m.y)),
        Math.max(...g.map((m) => m.y + m.h)),
      ];
      const inside = thin.filter(
        (m) =>
          m.x >= x0 - 0.5 &&
          m.x + m.w <= x1 + 0.5 &&
          m.y >= y0 - 0.5 &&
          m.y + m.h <= y1 + 0.5
      );
      const group = [...g, ...inside];
      if (
        !groups.some(
          (o) => o.length === group.length && o.every((m, i) => m === group[i])
        )
      )
        groups.push(group);
    }
  let best: MosaicSplit | null = null;
  for (const group of groups) {
    const res = splitMosaic(group, ctx.data, c.levels, 0, c.value, tol, "");
    if (res.ok) {
      const names = uniqueInOrder(ctx.data, last);
      const colors = seriesColorsConsistent(
        names.map((n) =>
          res.leaves.filter((l) => l.cat === n).map((l) => l.mark)
        ),
        names
      );
      if (!colors.pass) return colors;
      return {
        pass: true,
        detail: `${res.leaves.length} cells match ${spec}, colored by ${last}`,
      };
    }
    if (!best || (!best.ok && res.depth > best.depth)) best = res;
  }
  return {
    pass: false,
    detail: `no mosaic of ${spec} among ${rects.length} filled rects${best && !best.ok ? `; ${best.why}` : ""}`,
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

function checkRidgeline(
  c: Extract<Check, { check: "ridgeline" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const tol = c.tol ?? 0.02;
  const [omin, omax] = c.overlap ?? [1.5, 2.5];
  const cats = uniqueInOrder(ctx.data, c.category);
  const series = cats.map((cat) =>
    ctx.data
      .filter((r) => String(r[c.category]) === cat)
      .map((r) => [num(r[c.x]), num(r[c.y])] as [number, number])
      .sort((a, b) => a[0] - b[0])
  );
  const [x0, x1] = extent(series.flat().map((p) => p[0]));
  const ymax = Math.max(...series.flat().map((p) => p[1]));
  const areas = rec.marks.filter(
    (m) =>
      m.fill &&
      ink(m) &&
      m.points &&
      m.points.length >= 3 &&
      !isBackground(m, rec)
  );
  // How well area `m` draws series `s` above its own baseline (its lowest
  // edge): the height scale k by least squares, and the worst miss in px.
  const fitArea = (m: Mark, s: [number, number][]) => {
    const xs = m.points!.map((p) => p[0]);
    const [px0, px1] = extent(xs);
    if (px1 - px0 < 10) return null;
    const base = Math.max(...m.points!.map((p) => p[1]));
    const ax = (px1 - px0) / (x1 - x0);
    const hs: number[] = [];
    for (const [x] of s) {
      const t = Math.min(px1 - 0.5, Math.max(px0 + 0.5, px0 + ax * (x - x0)));
      const cs = crossSection(m, t, true);
      if (!cs) return null;
      hs.push(base - cs[0]);
    }
    const syy = s.reduce((a, [, y]) => a + y * y, 0);
    const k = s.reduce((a, [, y], i) => a + y * hs[i], 0) / syy;
    const miss = Math.max(...s.map(([, y], i) => Math.abs(hs[i] - k * y)));
    return { base, k, miss, xs: [px0, px1] as [number, number] };
  };
  type Fit = NonNullable<ReturnType<typeof fitArea>> & { mark: Mark };
  const used = new Set<Mark>();
  const fits: Fit[] = [];
  for (let ci = 0; ci < cats.length; ci++) {
    let best: Fit | null = null;
    for (const m of areas) {
      if (used.has(m)) continue;
      const f = fitArea(m, series[ci]);
      if (!f || f.k <= 0) continue;
      const slack = Math.max(2, tol * f.k * ymax);
      if (f.miss <= slack && (!best || f.miss < best.miss))
        best = { ...f, mark: m };
    }
    if (!best)
      return {
        pass: false,
        detail: `no filled area traces ${cats[ci]}'s ${c.y} above a baseline (${areas.length} filled shapes, ${fits.length} ${c.category} matched before it)`,
      };
    used.add(best.mark);
    fits.push(best);
  }
  const ks = fits.map((f) => f.k);
  const kMid = [...ks].sort((a, b) => a - b)[Math.floor(ks.length / 2)];
  if (ks.some((k) => Math.abs(k - kMid) > 0.05 * kMid))
    return {
      pass: false,
      detail: `every ${c.category} has an area, but their height scales differ (${ks.map((k) => k.toFixed(2)).join(", ")} px per unit)`,
    };
  const [ax0, ax1] = fits[0].xs;
  if (
    fits.some((f) => Math.abs(f.xs[0] - ax0) > 2 || Math.abs(f.xs[1] - ax1) > 2)
  )
    return {
      pass: false,
      detail: `the areas do not share one horizontal scale`,
    };
  const bases = fits.map((f) => f.base);
  const steps = bases.slice(1).map((b, i) => b - bases[i]);
  const pitch = steps.reduce((a, b) => a + b, 0) / Math.max(1, steps.length);
  if (
    pitch <= 0 ||
    steps.some((s) => Math.abs(s - pitch) > Math.max(2, 0.05 * pitch))
  )
    return {
      pass: false,
      detail: `baselines are not evenly spaced top to bottom in ${c.category} order (steps ${steps.map((s) => s.toFixed(1)).join(", ")} px)`,
    };
  const ratio = (kMid * ymax) / pitch;
  if (ratio < omin || ratio > omax)
    return {
      pass: false,
      detail: `ridges match, but the tallest peak is ${ratio.toFixed(2)} times the baseline spacing (expected ${omin}-${omax})`,
    };
  return {
    pass: true,
    detail: `${cats.length} ridges, top to bottom, ${pitch.toFixed(1)}px apart, tallest peak ${ratio.toFixed(2)} times the spacing`,
  };
}

/** Even-odd point-in-polygon. */
function insidePolygon(
  [x, y]: [number, number],
  poly: [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/** The painted points of a filled mark on a 1px grid (pixel centers),
 *  within `within`: inside its shape (its outline, or its box for a plain
 *  rect) and inside every clip region it is drawn through. */
function paintedPixels(m: Mark, within: Box): [number, number][] {
  const x0 = Math.max(m.x, within.x);
  const y0 = Math.max(m.y, within.y);
  const x1 = Math.min(m.x + m.w, within.x + within.w);
  const y1 = Math.min(m.y + m.h, within.y + within.h);
  const out: [number, number][] = [];
  for (let y = Math.floor(y0) + 0.5; y < y1; y++)
    for (let x = Math.floor(x0) + 0.5; x < x1; x++) {
      if (x < x0 || y < y0) continue;
      const p: [number, number] = [x, y];
      if (m.points && !insidePolygon(p, m.points)) continue;
      if (
        m.clip &&
        !m.clip.every((polys) => polys.some((q) => insidePolygon(p, q)))
      )
        continue;
      out.push(p);
    }
  return out;
}

function checkBottleFill(
  c: Extract<Check, { check: "bottleFill" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { labels, values } = barValues(
    { category: c.category, value: c.value },
    ctx.data
  );
  const tol = c.tol ?? 0.02;
  const max = c.max ?? 100;
  // Bottle outlines: stroked, unfilled, closed non-rectangular shapes, all
  // as tall as the tallest one.
  const outlines = rec.marks.filter(
    (m) =>
      m.kind === "path" &&
      m.points &&
      m.stroke &&
      ink(m) &&
      (!m.fill || nearWhite(m.fill)) &&
      m.h >= 20
  );
  const tallest = Math.max(0, ...outlines.map((m) => m.h));
  const bottles = outlines
    .filter((m) => Math.abs(m.h - tallest) <= 0.05 * tallest + 1)
    .sort((a, b) => a.x - b.x);
  if (bottles.length !== labels.length)
    return {
      pass: false,
      detail: `expected ${labels.length} bottle outlines (stroked, unfilled, not rectangles, the same height), found ${bottles.length}`,
    };
  const liquids = rec.marks.filter(
    (m) =>
      m.kind !== "text" &&
      m.kind !== "line" &&
      m.fill &&
      !nearWhite(m.fill) &&
      !isBackground(m, rec)
  );
  const problems: string[] = [];
  bottles.forEach((b, i) => {
    const name = labels[i];
    const bottom = b.y + b.h;
    const area: Box = { x: b.x - 3, y: b.y - 3, w: b.w + 6, h: b.h + 6 };
    const mine = liquids.filter((m) => {
      const [cx, cy] = [m.x + m.w / 2, m.y + m.h / 2];
      return (
        m !== b && cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= bottom
      );
    });
    const px = mine.flatMap((m) => paintedPixels(m, area));
    if (px.length === 0) {
      problems.push(`${name}: no liquid inside the bottle`);
      return;
    }
    const top = Math.min(...px.map((p) => p[1])) - 0.5;
    const low = Math.max(...px.map((p) => p[1])) + 0.5;
    const level = (bottom - top) / b.h;
    const want = values[i] / max;
    const edge = Math.max(2, b.strokeWidth) + 1;
    if (Math.abs(low - bottom) > edge) {
      problems.push(
        `${name}: the liquid does not start at the bottle's bottom`
      );
      return;
    }
    if (Math.abs(level - want) > tol + 1.5 / b.h) {
      problems.push(
        `${name}: filled to ${(100 * level).toFixed(1)}% of the bottle's height, expected ${(100 * want).toFixed(1)}%`
      );
      return;
    }
    const outside = px.filter(
      (p) => !insidePolygon(p, b.points!) && distToPolyline(p, b.points!) > 1.5
    );
    if (outside.length > 0.01 * px.length) {
      problems.push(
        `${name}: ${outside.length} of ${px.length} liquid pixels lie outside the bottle's outline`
      );
      return;
    }
    // Low in the liquid (inside the body), it spans the bottle's width.
    const y = Math.floor(low - 0.25 * (low - top)) + 0.5;
    const row = px.filter((p) => p[1] === y).map((p) => p[0]);
    const span = crossSection(b, y, false);
    if (
      span &&
      (row.length === 0 ||
        Math.max(...row) - Math.min(...row) + 1 < 0.85 * (span[1] - span[0]))
    )
      problems.push(`${name}: the liquid does not fill the bottle's width`);
  });
  if (problems.length > 0)
    return {
      pass: false,
      detail: `${labels.length} bottles found, but ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "; ..." : ""}`,
    };
  return {
    pass: true,
    detail: `${labels.length} bottles, left to right, filled to [${values.map((v) => `${v}%`).join(", ")}] of their height, inside their outlines`,
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
    case "annotation":
      return checkAnnotation(c, rec, ctx);
    case "referenceLine":
      return checkReferenceLine(c, rec, ctx);
    case "wedges":
      return checkWedges(c, rec, ctx);
    case "pieGlyphs":
      return checkPieGlyphs(c, rec, ctx);
    case "ridgeline":
      return checkRidgeline(c, rec, ctx);
    case "bottleFill":
      return checkBottleFill(c, rec, ctx);
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
