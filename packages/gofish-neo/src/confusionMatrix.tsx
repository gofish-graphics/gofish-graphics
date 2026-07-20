/**
 * The Neo renderer: composes the pure data algebra (buildMatrix/frontier/
 * buildNormalizer/computeMeasure) into a rendered GoFish node — a
 * hierarchical confusion matrix with tree-shaped row/column margins and
 * per-row measure strips.
 *
 * Mirrors gofish-gotree's `tree(spec, data)` shape: `confusionMatrix(spec,
 * data)` returns a Promise of a composed node a caller can `.render(...)` or
 * fold into a larger `layer([...])`.
 *
 * Alignment recipe (see gofish-gotree's `NeoAlignmentSpike` story, issue
 * #639, for the proof-of-concept this generalizes): every structure — the
 * table-body grid, the gotree row/column margins, and the scatter-based
 * measure strips — shares one leaf `pitch` (cellSize + spacing). The grid
 * divides its extent into `N` equal `pitch`-wide tracks; the trees use a
 * UNIFORM `spacing` at every sibling level plus a node size that spans
 * exactly `leafCount * pitch - spacing` (so a leaf, with leafCount 1,
 * measures exactly `pitch - spacing`) — matched pitch falls out of the
 * recursion with no per-node arithmetic. The measure strips use `scatter`'s
 * `yMin`/`yMax` continuous channel, which is y-UP even though the grid's
 * `table` rows are top-down, so row `i`'s band is
 * `[(N-1-i)*pitch, (N-i)*pitch]` (flipped from the grid's own top-down `i`).
 */

import {
  chart,
  table,
  scatter,
  rect,
  text,
  field,
  Layer,
  Constraint,
  layer,
  assignGradientColor,
} from "gofish-graphics";
import { tree, distribute } from "gofish-gotree";

import { frontier, type TreeNode } from "./labelTree";
import { frequency, buildMatrix } from "./matrix";
import { buildNormalizer } from "./normalize";
import { computeMeasure, type Measure } from "./measures";
import { applyDefaults, type NeoSpec } from "./spec";
import type { Confusion } from "./pipeline";

export interface ConfusionMatrixSpec extends NeoSpec {
  /** Side length of a body cell, in pixels. @default 44 */
  cellSize?: number;
  /** Gap between body cells (and, correspondingly, tree/strip leaf gaps). @default 0 */
  spacing?: number;
  /** Sequential gradient endpoints for the color encoding. */
  colors?: [string, string];
  /** Show the raw count inside each cell. @default true */
  showCounts?: boolean;
  /**
   * Exclude the diagonal from the color/size scale's domain (see
   * `buildNormalizer`'s `excludeDiagonal` option) — diagonal cells still
   * render, clamped to the domain max, so a few dominant correct-prediction
   * cells don't wash out the contrast among the confusions.
   */
  excludeDiagonal?: boolean;
}

const DEFAULT_CELL_SIZE = 44;
const DEFAULT_SPACING = 0;
const DEFAULT_COLORS: [string, string] = ["#e6f5f8", "#0b5394"];
const ZERO_FILL = "#f2f2f3";

const PALETTE_DEPTH = ["#1d3557", "#3d6ea5", "#7ba7d1", "#b7d0e8"];

const PC_GAP = 16; // parent<->child-group gap in both tree margins
const NODE_W_ROW = 88; // row-tree node width, uniform across levels
const NODE_H_COL = 22; // col-tree node height, uniform across levels
const MARGIN_GAP = 14; // gap between margin/strip blocks and the grid

// ─── gotree data conversion ─────────────────────────────────────────────────

/** A node in the gotree-consumable label hierarchy (pruned to the frontier). */
interface GoTreeLabelData {
  id: string;
  name: string;
  children?: GoTreeLabelData[];
}

/**
 * Converts a pruned subtree of the shared label tree into gotree's TreeData
 * shape, stopping descent at collapsed node ids (a collapsed node renders as
 * a leaf in the margin, matching its frontier row/column).
 */
function toGoTreeData(
  node: TreeNode,
  collapsedIds: Set<string>
): GoTreeLabelData {
  if (collapsedIds.has(node.id) || node.children.length === 0) {
    return { id: node.id, name: node.name };
  }
  return {
    id: node.id,
    name: node.name,
    children: node.children.map((c) => toGoTreeData(c, collapsedIds)),
  };
}

/** Number of margin "levels" (root through frontier leaves, inclusive) under `collapsedIds`. */
function levelCount(node: TreeNode, collapsedIds: Set<string>): number {
  if (collapsedIds.has(node.id) || node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map((c) => levelCount(c, collapsedIds)));
}

// ─── tree-margin node factories ─────────────────────────────────────────────
// Both margins use the same "span the leaf count" sizing rule: a node's size
// along the tree's growth axis is `d.width * pitch - spacing` (gotree's
// `HierarchyDatum.width` is the node's own leaf count) — a leaf (width 1)
// measures `pitch - spacing`; an internal node spans exactly its children
// group's rendered extent, so parent and child-group bboxes agree with no
// separate bookkeeping. The cross axis is a fixed per-margin constant.

function marginNodeFactory(opts: {
  pitch: number;
  spacing: number;
  cross: number;
  axis: "w" | "h";
  fontSize: number;
}) {
  const { pitch, spacing, cross, axis, fontSize } = opts;
  return (d: any) => {
    const along = Math.max(4, d.width * pitch - spacing);
    const w = axis === "w" ? along : cross;
    const h = axis === "w" ? cross : along;
    const depth: number = d.depth;
    const fill = PALETTE_DEPTH[Math.min(depth, PALETTE_DEPTH.length - 1)];
    const isLeaf = d.height === 0;
    // A degenerate single-leaf-child chain gets pruned into one node named
    // "parent:child" (see labelTree.ts's pruneDegenerateChains) — render that
    // with a friendlier separator, and shrink the font when the available
    // cross-axis room can't fit it at the base size (avoids text spilling
    // past its own box, e.g. a pruned "reptile:lizard" node).
    // The column margin is much tighter on width (one grid-column pitch per
    // leaf) than the row margin (a fixed, comfortably wide node column), so a
    // pruned compound name that fits fine in the row margin can still
    // overflow there — fall back to just the name's last segment.
    const full = String(d.data.name).replace(/:/g, " / ");
    const last = String(d.data.name).split(":").pop()!;
    const displayName = axis === "w" ? last : full;
    const available = w - 6;
    const estCharW = fontSize * 0.62;
    const shrunk =
      displayName.length * estCharW > available
        ? Math.max(7, Math.floor(available / (displayName.length * 0.62)))
        : fontSize;
    return Layer({ w, h }, [
      rect({
        w,
        h,
        rx: 3,
        fill,
        stroke: isLeaf ? "#ffffff" : "none",
        strokeWidth: 1,
      }).name("box"),
      text({
        text: displayName,
        fontSize: shrunk,
        fill: depth === 0 ? "#ffffff" : "#0f1f30",
      }).name("label"),
    ]).constrain(({ box, label }: any) => [
      Constraint.align({ x: "middle", y: "middle" }, [box, label]),
    ]);
  };
}

// ─── measure strips ─────────────────────────────────────────────────────────

const RATIO_MEASURES: ReadonlySet<Measure> = new Set([
  "precision",
  "recall",
  "accuracy",
]);

async function buildMeasureStrip(opts: {
  values: number[];
  n: number;
  pitch: number;
  stripW: number;
  format: (v: number) => string;
}) {
  const { values, n, pitch, format } = opts;
  // `rect`'s `w` field, under `scatter`, resolves through a continuous
  // 0-anchored domain that fills the chart's own declared width at the max
  // value (gotcha: unlike `table`'s grid — which treats a numeric field as a
  // literal pixel claim — `scatter` maps a size field through a domain/range
  // scale, same as its position channels). `headroom` keeps the longest bar
  // short of the full container so an inset label never crowds the edge.
  const headroom = 1.15;
  const maxVal = Math.max(...values, 1e-9);
  const rows = values.map((v, i) => ({
    barValue: v / (maxVal * headroom),
    labelStr: format(v),
    start: (n - 1 - i) * pitch,
    end: (n - i) * pitch,
  }));
  return chart(rows, { w: opts.stripW, h: n * pitch, axes: false })
    .flow(
      scatter({
        yMin: field("start", "rowPos"),
        yMax: field("end", "rowPos"),
      } as any)
    )
    .mark(
      rect({
        w: "barValue",
        h: Math.max(4, pitch * 0.5),
        fill: "#3d6ea5",
      } as any).label("labelStr", {
        position: "inset-right",
        fontSize: 9,
        color: "white",
      })
    )
    .resolve();
}

// ─── main entry ─────────────────────────────────────────────────────────────

export async function confusionMatrix(
  spec: ConfusionMatrixSpec,
  data: Confusion[]
): Promise<any> {
  const resolved = applyDefaults(spec);
  const cellSize = spec.cellSize ?? DEFAULT_CELL_SIZE;
  const spacing = spec.spacing ?? DEFAULT_SPACING;
  const colors = spec.colors ?? DEFAULT_COLORS;
  const showCounts = spec.showCounts ?? true;
  const excludeDiagonal = spec.excludeDiagonal ?? false;

  const { tree: labelTree, matrix } = buildMatrix(data, resolved);
  const collapsedIds = new Set(resolved.collapsed);
  const rows = frontier(labelTree, collapsedIds);
  const cols = rows; // shared tree: same frontier serves both axes
  const n = rows.length;

  const normalizer = buildNormalizer(
    labelTree,
    matrix,
    resolved.normalization,
    collapsedIds,
    {
      excludeDiagonal,
    }
  );

  const pitch = cellSize + spacing;
  const gridExtent = n * cellSize + (n - 1) * spacing;

  // ─── body cells ───────────────────────────────────────────────────────
  const isColor = resolved.encoding === "color";
  const cells = rows.flatMap((rowNode) =>
    cols.map((colNode) => {
      const count = frequency(matrix, rowNode, colNode);
      const norm = normalizer(rowNode, colNode);
      const isZero = count === 0;
      const fillColor = isZero
        ? ZERO_FILL
        : isColor
          ? assignGradientColor({ _tag: "gradient", stops: colors }, norm)
          : "#2b6cb0";
      const side = isZero
        ? 0
        : cellSize * Math.sqrt(Math.max(0, Math.min(1, norm)));
      return {
        actual: rowNode.id,
        observed: colNode.id,
        count,
        fillColor,
        sizeW: side,
        sizeH: side,
        labelText: isZero ? "–" : showCounts ? String(count) : "",
      };
    })
  );

  const labelFontSize = Math.max(9, Math.round(cellSize * 0.24));

  // The size encoding needs each cell's visible box to vary while the grid
  // TRACK stays uniform (cellSize) — table's grid sizes a track to the max
  // claim among its cells (see grid.ts), so a directly claim-bearing `w`/`h`
  // would make rows/columns non-uniform. The usual fix is an invisible
  // full-size reference sibling to dominate the claim, but resolving a
  // per-row size FIELD NAME ("sizeW") on a shape nested inside a `layer([...])`
  // under `table` does not reach the per-cell datum reliably — it's a
  // per-row FUNCTION mark (below), which sidesteps field-name channel
  // inference entirely by building each cell's shapes from already-concrete
  // per-row numbers, so it isn't affected the same way. `table`'s per-cell
  // leaf is a length-1 bucket (`[row]`), not the bare row, so unwrap it.
  const bodyMark = isColor
    ? rect({ w: cellSize, h: cellSize, fill: "fillColor" } as any).label(
        "labelText",
        {
          position: "center",
          fontSize: labelFontSize,
        }
      )
    : (((leaf: any) => {
        const d = Array.isArray(leaf) ? leaf[0] : leaf;
        // The label sits at the fixed cell center on an always-transparent
        // reference shape (so its position doesn't depend on the box's own
        // variable size), so it can't lean on fill-based auto-contrast — pick
        // the color explicitly instead: a light dash for a true zero, a dark
        // count otherwise (dark reads fine both on the page background and
        // on the encoding's fixed medium-blue box).
        return layer([
          rect({ w: cellSize, h: cellSize, fill: "transparent" } as any)
            .name("ref")
            .label(() => d.labelText, {
              position: "center",
              fontSize: labelFontSize,
              color: d.count === 0 ? "#b0b4ba" : "#0f1f30",
            }),
          rect({ w: d.sizeW, h: d.sizeH, fill: d.fillColor } as any).name(
            "box"
          ),
        ]).constrain(({ ref, box }: any) => [
          Constraint.align({ x: "middle", y: "middle" }, [ref, box]),
        ]);
      }) as any);

  const grid = await chart(cells, { w: gridExtent, h: gridExtent, axes: false })
    .flow(table({ by: { x: "observed", y: "actual" }, spacing }))
    .mark(bodyMark as any)
    .resolve();
  grid.name("grid");

  // ─── row + column margins ───────────────────────────────────────────────
  // The tree root is a synthetic wrapper with exactly one child (the
  // primary class dimension, `classes[0]`) — start the margins there so we
  // don't draw a blank, id-less root box.
  const dimRoot = labelTree.children[0] ?? labelTree;
  const goTreeData = toGoTreeData(dimRoot, collapsedIds);
  const levels = levelCount(dimRoot, collapsedIds);

  const rowMargin = tree(
    {
      node: marginNodeFactory({
        pitch,
        spacing,
        cross: NODE_W_ROW,
        axis: "h",
        fontSize: 10,
      }),
      link: "none",
      parentChild: distribute({
        dir: "x",
        spacing: PC_GAP,
        alignment: "middle",
      }),
      sibling: distribute({ dir: "y", spacing, alignment: "start" }),
    },
    goTreeData as any
  ) as any;
  rowMargin.name("rowMargin");
  const rowTreeW = levels * NODE_W_ROW + (levels - 1) * PC_GAP;

  const colMargin = tree(
    {
      node: marginNodeFactory({
        pitch,
        spacing,
        cross: NODE_H_COL,
        axis: "w",
        fontSize: 9,
      }),
      link: "none",
      parentChild: distribute({
        dir: "y",
        spacing: PC_GAP,
        alignment: "middle",
      }),
      sibling: distribute({ dir: "x", spacing, alignment: "start" }),
    },
    goTreeData as any
  ) as any;
  colMargin.name("colMargin");
  const colTreeH = levels * NODE_H_COL + (levels - 1) * PC_GAP;

  // Leaves in both margins are laid out at the SAME uniform pitch as the
  // grid's own rows/columns (a leaf's cross-axis-orthogonal size is exactly
  // `pitch - spacing`, matching a grid cell's `cellSize`), so the margins
  // need no extra per-axis offset to line up with the grid — see the module
  // doc-comment.

  // ─── measure strips ──────────────────────────────────────────────────────
  const STRIP_W = 84;
  const HEADER_H = 14;

  const strips = await Promise.all(
    resolved.measures.map(async (measure) => {
      const values = rows.map((node) => computeMeasure(measure, matrix, node));
      const isRatio = RATIO_MEASURES.has(measure);
      const chartNode = await buildMeasureStrip({
        values,
        n,
        pitch,
        stripW: STRIP_W,
        format: (v) => (isRatio ? v.toFixed(2) : String(Math.round(v))),
      });
      chartNode.name(`strip_${measure}`);
      const header = text({
        text: measure,
        fontSize: 10,
        fontWeight: 600,
        fill: "#0f1f30",
        textAnchor: "middle",
      }).name(`stripHeader_${measure}`) as any;
      return { measure, chartNode, header };
    })
  );

  // ─── compose ─────────────────────────────────────────────────────────────
  const rowMarginX = 0;
  const gridX = rowTreeW + MARGIN_GAP;
  const gridY = colTreeH + MARGIN_GAP;

  const pieces: any[] = [
    rowMargin,
    grid,
    colMargin,
    ...strips.map((s) => s.chartNode),
    ...strips.map((s) => s.header),
  ];

  const composed = layer(pieces).constrain(({ ...refs }: any) => {
    const constraints: any[] = [
      Constraint.position({ x: gridX, y: gridY, anchor: "start" }, [refs.grid]),
      Constraint.position({ x: rowMarginX, y: gridY, anchor: "start" }, [
        refs.rowMargin,
      ]),
      Constraint.position({ x: gridX, y: 0, anchor: "start" }, [
        refs.colMargin,
      ]),
    ];
    let stripX = gridX + gridExtent + MARGIN_GAP;
    for (const s of strips) {
      constraints.push(
        Constraint.position({ x: stripX, y: gridY, anchor: "start" }, [
          refs[`strip_${s.measure}`],
        ])
      );
      constraints.push(
        Constraint.position(
          { x: stripX + STRIP_W / 2, y: gridY - HEADER_H - 4, anchor: "start" },
          [refs[`stripHeader_${s.measure}`]]
        )
      );
      stripX += STRIP_W + MARGIN_GAP;
    }
    return constraints;
  });

  return composed;
}
