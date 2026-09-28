// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Axes — /internals/frontend/axes
// </gofish-wiki>

/**
 * `labelAngle: "auto"`: pick each axis's label angle from 0°, 45°, and 90°,
 * in that order of preference, taking the first angle at which no two labels
 * of the same row collide.
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
import type { AxesOptions, GoFishRenderOptions } from "../gofish";
import { chooseFirstFit, type Score } from "../choice/choose";

/** Candidate angles, most readable first. */
export const AUTO_LABEL_ANGLES = [0, 45, 90] as const;

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
  tier: number;
  pivot: [number, number];
  rotate: number;
  rel: RelBox;
};

/** Which axes ask for `labelAngle: "auto"`. */
export function autoLabelAngleDims(axes: AxesOptions | undefined): (0 | 1)[] {
  if (!axes || typeof axes !== "object") return [];
  const dims: (0 | 1)[] = [];
  const isAuto = (o: unknown) =>
    typeof o === "object" &&
    o !== null &&
    (o as { labelAngle?: unknown }).labelAngle === "auto";
  if (isAuto(axes.x)) dims.push(0);
  if (isAuto(axes.y)) dims.push(1);
  return dims;
}

/** `axes` with each dim's `labelAngle` replaced by `angles[dim]` wherever that
 *  dim asked for "auto". */
function withAngles(
  axes: AxesOptions | undefined,
  autoDims: (0 | 1)[],
  angles: [number, number]
): AxesOptions {
  const out = { ...(axes as Exclude<AxesOptions, boolean>) };
  for (const d of autoDims) {
    const key = d === 0 ? "x" : "y";
    out[key] = { ...(out[key] as object), labelAngle: angles[d] };
  }
  return out;
}

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

/** Score axis `dim`'s labels across all of its tiers: the per-tier
 *  `[overlap area, colliding pairs]`, summed. */
export function scoreAxisLabels(boxes: LabelBox[], dim: 0 | 1): Score {
  const tiers = new Map<number, LabelBox[]>();
  for (const b of boxes) {
    if (b.dim !== dim) continue;
    let row = tiers.get(b.tier);
    if (!row) tiers.set(b.tier, (row = []));
    row.push(b);
  }
  let area = 0;
  let pairs = 0;
  for (const row of tiers.values()) {
    const [a, p] = scoreRow(row);
    area += a;
    pairs += p;
  }
  return [area, pairs];
}

/** An angle fits when no pair of labels collides (clearance included). */
export const labelsFit = (s: Score): boolean => s[1] === 0;

/**
 * Lay the chart out with each "auto" axis's angle chosen. `layoutOnce` is the
 * unchanged single-layout pipeline; it consumes the tree it is given.
 *
 * Each axis is chosen on its own. Runs apply the same candidate angle to every
 * "auto" axis, and each axis is scored separately. That is sound under an
 * assumption that holds today: labels do not feed σ, so one axis's angle
 * cannot move the other axis's labels. If the per-axis winners differ (say x
 * needs 45° while y fits at 0°), that combination is laid out once more.
 *
 * Throws when the root cannot be rebuilt: a node built by hand and passed to
 * `gofish()` is laid out in place, so it can be laid out only once.
 */
export async function layoutWithAutoLabelAngles<
  D extends { child: GoFishNode },
>(
  options: GoFishRenderOptions,
  child: GoFishNode | Promise<GoFishNode>,
  autoDims: (0 | 1)[],
  layoutOnce: (options: GoFishRenderOptions, child: GoFishNode) => Promise<D>
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

  type Run = { data: D; scores: [Score, Score] };
  const runs = new Map<string, Run>();
  const run = async (chosen: [number, number]): Promise<Run> => {
    const key = autoDims.map((d) => chosen[d]).join(",");
    const memo = runs.get(key);
    if (memo) return memo;
    const data = await layoutOnce(
      { ...options, axes: withAngles(options.axes, autoDims, chosen) },
      await nextTree()
    );
    const boxes = collectLabelBoxes(data.child);
    const result: Run = {
      data,
      scores: [scoreAxisLabels(boxes, 0), scoreAxisLabels(boxes, 1)],
    };
    runs.set(key, result);
    return result;
  };

  const winner: [number, number] = [0, 0];
  for (const d of autoDims) {
    const { candidate } = await chooseFirstFit(
      AUTO_LABEL_ANGLES,
      (a) => run([a, a]),
      (r) => r.scores[d],
      labelsFit
    );
    winner[d] = candidate;
  }
  return (await run(winner)).data;
}
