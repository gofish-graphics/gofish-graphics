// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Axes — /internals/frontend/axes
// </gofish-wiki>

/**
 * `labelAngle: "auto"`: pick each label ROW's angle (one row per axis tier)
 * from 0°, 45°, and 90°, in that order of preference, taking the first angle
 * at which no two labels of that row collide.
 *
 * This module is the POLICY half of the choice (the candidate list and the
 * score). The evaluation strategy is the generic whole-chart
 * {@link chooseFirstFit} in `choice/choose.ts`: the chart is built and laid out
 * once per candidate and the finished label geometry is scored. The whole
 * chart is the unit because an ordinal axis's inner tier is elaborated inside
 * each group (a grouped bar chart's year labels live under each city), so a
 * collision across a group boundary can only be seen from the root.
 *
 * Axis labels resolve to an UNDEFINED underlying space, so a label's angle
 * never changes σ (bar widths). It changes only how far the labels hang into
 * the margin. That is why re-running layout with a different angle moves the
 * labels and nothing else.
 */
import { GoFishNode } from "../_node";
import type { GoFishRenderOptions } from "../gofish";
import {
  labelRowSettingsFromAngles,
  type LabelRow,
  type LabelRowSetting,
} from "./elaborate";
import { chooseFirstFit, type Score } from "../choice/choose";

/**
 * Candidates per row, most readable first. A category (ordinal) row that
 * collides at every angle is hidden rather than drawn overlapping: hidden
 * always fits, so an ordinal row never reaches the least-overlap fallback.
 * A continuous row cannot be hidden, because nothing else (no legend) can
 * carry its tick values; that is inherent to the domain, not a gap. It keeps
 * the least-overlap fallback. The right future answer for a crowded
 * continuous row is tick thinning (drawing fewer ticks), which this does not do.
 */
export const ORDINAL_CANDIDATES: readonly LabelRowSetting[] = [
  0,
  45,
  90,
  "hidden",
];
export const CONTINUOUS_CANDIDATES: readonly LabelRowSetting[] = [0, 45, 90];

/** Clearance (px) two labels of one row need to count as not colliding. */
const AUTO_LABEL_GAP = 2;

/** Extents smaller than this are rounding noise, not overlap. */
const EPS = 1e-6;

/** A label box relative to its own origin, before rotation. */
type RelBox = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * One axis label's final geometry, in the root node's frame: the label's
 * unrotated box `rel` around its origin `pivot`, turned by `rotate` degrees
 * (counterclockwise in the layout frame, as `Text` applies it) about `pivot`.
 */
export type LabelBox = {
  dim: 0 | 1;
  kind: "ordinal" | "continuous";
  tier: number;
  /** The data field a category row labels, when known. */
  field?: string;
  pivot: [number, number];
  rotate: number;
  rel: RelBox;
};

/** Rotate `p` by `deg` degrees counterclockwise about the origin. */
function rotatePoint([x, y]: [number, number], deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [x * c - y * s, x * s + y * c];
}

/** The axis-aligned box around a rotated `rel`, relative to the pivot. */
function rotatedExtent(rel: RelBox, deg: number): RelBox {
  if (!deg) return rel;
  const corners = [
    rotatePoint([rel.minX, rel.minY], deg),
    rotatePoint([rel.maxX, rel.minY], deg),
    rotatePoint([rel.maxX, rel.maxY], deg),
    rotatePoint([rel.minX, rel.maxY], deg),
  ];
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/**
 * Read every tagged axis label's final geometry off a laid-out tree. The
 * label's origin is its placed translate plus every ancestor's translate, so
 * all labels land in one common frame (the root's). This is the layout frame,
 * before any y-up mirror is applied at paint. A mirror reflects positions and
 * angles together, so overlap measured here equals overlap on screen, as long
 * as the labels of one row sit under the same mirror (an axis's labels do).
 */
export function collectLabelBoxes(root: GoFishNode): LabelBox[] {
  const out: LabelBox[] = [];
  const visit = (n: GoFishNode) => {
    if (n.axisLabel) {
      const layout = n.renderData?.layout as
        | {
            bbox: RelBox;
            anchor: { x: number; y: number };
          }
        | undefined;
      if (layout) {
        const pivot: [number, number] = [0, 0];
        for (const dir of [0, 1] as const) {
          let a: GoFishNode | undefined = n;
          while (a) {
            pivot[dir] += a.projectedTranslate(dir) ?? 0;
            a = a.parent as GoFishNode | undefined;
          }
        }
        out.push({
          dim: n.axisLabel.dim,
          kind: n.axisLabel.kind,
          field: n.axisLabel.field,
          tier: n.axisLabel.tier,
          pivot,
          rotate: (n.args?.rotate as number | undefined) ?? 0,
          rel: {
            minX: layout.bbox.minX - layout.anchor.x,
            maxX: layout.bbox.maxX - layout.anchor.x,
            minY: layout.bbox.minY - layout.anchor.y,
            maxY: layout.bbox.maxY - layout.anchor.y,
          },
        });
      }
    }
    for (const c of n.children) if (c instanceof GoFishNode) visit(c);
  };
  visit(root);
  return out;
}

/** Overlap of [a0, a1] and [b0, b1], after widening each by `pad` on both
 *  sides; negative when they are apart. */
const overlap1 = (a0: number, a1: number, b0: number, b1: number, pad = 0) =>
  Math.min(a1, b1) - Math.max(a0, b0) + 2 * pad;

/**
 * Score one row of labels (one axis tier): `[overlap area, colliding pairs]`.
 *
 * The labels of a row share one angle, so their rotated boxes are parallel.
 * Turning every origin back by that angle makes them plain axis-aligned boxes
 * whose overlap is exact (a slanted label's axis-aligned bounding box would
 * report collisions between parallel slanted labels that do not touch). A pair
 * collides when the boxes, each widened by half of `AUTO_LABEL_GAP` on every
 * side, overlap; the area counts only the unwidened overlap. If a row somehow
 * mixes angles, it falls back to axis-aligned bounding boxes.
 */
function scoreRow(row: LabelBox[]): [number, number] {
  const angle = row[0]?.rotate ?? 0;
  const parallel = row.every((b) => b.rotate === angle);
  const turn = parallel ? -angle : 0;
  const boxes = row.map((b) => {
    const [px, py] = rotatePoint(b.pivot, turn);
    const r = parallel ? b.rel : rotatedExtent(b.rel, b.rotate);
    return {
      minX: px + r.minX,
      maxX: px + r.maxX,
      minY: py + r.minY,
      maxY: py + r.maxY,
    };
  });
  // Sweep along local x: once a box starts past the current one's widened
  // end, no later box (sorted by start) can touch it.
  boxes.sort((a, b) => a.minX - b.minX);
  const pad = AUTO_LABEL_GAP / 2;
  let area = 0;
  let pairs = 0;
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (b.minX > a.maxX + 2 * pad) break;
      const ox = overlap1(a.minX, a.maxX, b.minX, b.maxX, pad);
      const oy = overlap1(a.minY, a.maxY, b.minY, b.maxY, pad);
      if (ox <= EPS || oy <= EPS) continue;
      pairs++;
      const ax = overlap1(a.minX, a.maxX, b.minX, b.maxX);
      const ay = overlap1(a.minY, a.maxY, b.minY, b.maxY);
      if (ax > EPS && ay > EPS) area += ax * ay;
    }
  }
  return [area, pairs];
}

const rowKey = (r: LabelRow): string => `${r.dim}:${r.kind}:${r.tier}`;

/** One scored label row, with the field it labels (for a category row). */
export type RowScore = { row: LabelRow; field?: string; score: Score };

/** Score every label row: `[overlap area, colliding pairs]` per
 *  (axis, kind, tier), keyed by `rowKey`. */
export function scoreLabelRows(boxes: LabelBox[]): Map<string, RowScore> {
  const rows = new Map<string, { row: LabelRow; boxes: LabelBox[] }>();
  for (const b of boxes) {
    const row: LabelRow = { dim: b.dim, kind: b.kind, tier: b.tier };
    const key = rowKey(row);
    let entry = rows.get(key);
    if (!entry) rows.set(key, (entry = { row, boxes: [] }));
    entry.boxes.push(b);
  }
  const out = new Map<string, RowScore>();
  for (const [key, { row, boxes: rowBoxes }] of rows)
    out.set(key, {
      row,
      field: rowBoxes[0]?.field,
      score: scoreRow(rowBoxes),
    });
  return out;
}

/** The score of `row` among scored rows. A row with no labels (a hidden row)
 *  has nothing to collide. */
export const rowScore = (rows: Map<string, RowScore>, row: LabelRow): Score =>
  rows.get(rowKey(row))?.score ?? [0, 0];

/** A setting fits a row when no pair of its labels collides (clearance
 *  included). */
export const labelsFit = (s: Score): boolean => s[1] === 0;

/** The candidates a row chooses from (see `ORDINAL_CANDIDATES`). */
export const candidatesFor = (row: LabelRow): readonly LabelRowSetting[] =>
  row.kind === "ordinal" ? ORDINAL_CANDIDATES : CONTINUOUS_CANDIDATES;

type AxisAngle = number | number[] | "auto" | undefined;

/**
 * Lay the chart out with each label row of every "auto" axis at its own chosen
 * setting (an angle, or hidden for a category row). `layoutOnce` is the
 * unchanged single-layout pipeline; it consumes the tree it is given, and
 * `labelRowSettings` tells it how to draw each row.
 *
 * Every row is chosen on its own, from uniform runs: each run applies one
 * candidate to every row of every "auto" axis (a continuous row, which cannot
 * be hidden, stays upright in the "hidden" run and is never scored there),
 * and each row is scored separately. That rests on two assumptions that hold
 * today:
 *  - Axes don't interact: labels do not feed σ, so one axis's labels cannot
 *    move the other axis's labels along their track.
 *  - Rows don't interact for collisions: each tier is its own cross-axis row,
 *    and collisions are counted only within a row. A row's setting pushes the
 *    rows outside it further into (or back out of) the margin, but does not
 *    change their spacing along the track.
 * When the rows' winners differ, that combination is laid out once more.
 *
 * Throws when the root cannot be rebuilt: a node built by hand and passed to
 * `gofish()` is laid out in place, so it can be laid out only once.
 */
export async function layoutWithAutoLabelAngles<
  D extends { child: GoFishNode; legendFields: ReadonlySet<string> },
>(
  options: GoFishRenderOptions,
  child: GoFishNode | Promise<GoFishNode>,
  angles: [AxisAngle, AxisAngle],
  layoutOnce: (
    options: GoFishRenderOptions,
    child: GoFishNode,
    labelRowSettings: (row: LabelRow) => LabelRowSetting
  ) => Promise<D>
): Promise<D> {
  const root = await child;
  const rebuild = root.rebuild;
  if (!rebuild) {
    throw new Error(
      'labelAngle: "auto" needs a rebuildable chart (a chart builder such as ' +
        "chart(...).render(...), or a component thunk passed to gofish()): " +
        "it lays the chart out once per candidate angle, and a prebuilt node " +
        "can be laid out only once."
    );
  }
  // The first run lays out the tree we were handed; every later run builds a
  // fresh one.
  let unused: GoFishNode | undefined = root;
  const nextTree = async (): Promise<GoFishNode> => {
    const t = unused;
    unused = undefined;
    return t ?? rebuild();
  };

  // Axes without "auto" keep their authored angles in every run.
  const isAuto = (dim: 0 | 1) => angles[dim] === "auto";
  const manual = labelRowSettingsFromAngles([
    isAuto(0) ? undefined : (angles[0] as number | number[] | undefined),
    isAuto(1) ? undefined : (angles[1] as number | number[] | undefined),
  ]);

  type Run = {
    data: D;
    rows: Map<string, RowScore>;
  };
  const runs = new Map<string, Run>();
  const run = async (
    key: string,
    auto: (row: LabelRow) => LabelRowSetting
  ): Promise<Run> => {
    const memo = runs.get(key);
    if (memo) return memo;
    const settings = (row: LabelRow) =>
      isAuto(row.dim) ? auto(row) : manual(row);
    const data = await layoutOnce(options, await nextTree(), settings);
    const result: Run = {
      data,
      rows: scoreLabelRows(collectLabelBoxes(data.child)),
    };
    runs.set(key, result);
    return result;
  };
  const uniform = (c: LabelRowSetting) =>
    run(`all:${c}`, (row) => (candidatesFor(row).includes(c) ? c : 0));

  // The rows to choose for: the "auto" axes' rows, as the first run (every
  // row drawn upright) finds them. Rows are a property of the chart's
  // structure, not of the angle.
  const upright = [...(await uniform(0)).rows.values()].filter((r) =>
    isAuto(r.row.dim)
  );
  const rows = upright.map((r) => r.row);

  const winners = new Map<string, LabelRowSetting>();
  for (const row of rows) {
    const { candidate } = await chooseFirstFit(
      candidatesFor(row),
      uniform,
      (r) => rowScore(r.rows, row),
      labelsFit
    );
    winners.set(rowKey(row), candidate);
  }

  // One uniform run already is the winning combination when every row chose
  // the same setting; otherwise lay the winners out together.
  const chosen = [...new Set(winners.values())];
  const { data } =
    chosen.length <= 1
      ? await uniform(chosen[0] ?? 0)
      : await run(
          JSON.stringify([...winners].sort()),
          (row) => winners.get(rowKey(row)) ?? 0
        );
  warnUnlabeledRows(
    upright.filter((r) => winners.get(rowKey(r.row)) === "hidden"),
    data.legendFields
  );
  return data;
}

/**
 * Warn about each hidden category row whose categories nothing else names: a
 * row is covered when a rendered legend shows the field it labels (the color
 * scale records the fields it maps). A suppressed legend, a legend for another
 * field, or a color from a function accessor (no field) leaves it uncovered.
 * Called once per render, on the chosen layout only.
 */
export function warnUnlabeledRows(
  hidden: { row: LabelRow; field?: string }[],
  legendFields: ReadonlySet<string>
): void {
  for (const { row, field } of hidden) {
    if (field !== undefined && legendFields.has(field)) continue;
    const axis = row.dim === 0 ? "x" : "y";
    console.warn(
      field !== undefined
        ? `labelAngle: "auto": hid the ${axis}-axis "${field}" labels because ` +
            `they overlap at every angle, and no legend shows "${field}"; ` +
            `the categories are not labeled.`
        : `labelAngle: "auto": hid a row of ${axis}-axis labels because they ` +
            `overlap at every angle; the categories are not labeled.`
    );
  }
}
