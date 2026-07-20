import type { Meta, StoryObj } from "@storybook/html";
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
} from "gofish-graphics";
import { tree, distribute } from "../src";
import { initializeContainer } from "./helper";

// ─────────────────────────────────────────────────────────────────────────────
// Alignment spike for issue #639 (gofish-neo). This story does NOT need to be
// beautiful — it exists to prove (or disprove) that three INDEPENDENTLY built
// structures can share one per-leaf scale on the y axis:
//
//   (a) a tree-shaped row-label header, built with gofish-gotree's `tree()`
//   (b) a 5×5 confusion-matrix grid body, built with v3 `table()`
//   (c) a marginal "recall" bar strip, built with v3 `scatter()` + `rect()`
//
// Mechanism that worked: MATCHED PITCH + a single anchor offset (not per-leaf
// pinning). All three structures use the same 5-row pitch (80px): the grid
// divides its 400px height into 5 equal 80px bands (spacing: 0), the measure
// strip's rows are given explicit `start`/`end` fields at the same 80px
// bands, and the tree's leaf nodes are fixed at 24px tall with 56px of
// sibling spacing (24 + 56 = 80). Because `tree()`'s default sibling combiner
// (`distribute` with the default "edge" anchor) STACKS BBOXES ADDITIVELY AT
// EVERY LEVEL OF THE RECURSION — not just at the leaf level — an unbalanced
// tree (vehicle: 2 children, animal: 3 children) still produces perfectly
// uniform 80px leaf-to-leaf pitch in traversal order, with NO manual
// per-node spacing arithmetic beyond picking one spacing constant. That
// result generalizes: uniform `spacing` at every sibling level + uniform
// leaf size ⇒ uniform leaf pitch, regardless of subtree shape.
//
// Per-leaf pinning (aligning named grid cells / tree path nodes via
// `Constraint.align`) was NOT needed here and was not attempted — matched
// pitch alone was sufficient and is simpler. See the final report for notes
// on when per-leaf pinning would still be required (e.g. non-uniform row
// heights driven by data, like a value-proportional mosaic row).
// ─────────────────────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "GoTree/Neo Alignment Spike",
};
export default meta;

// 5 leaves, in the exact order they must appear as matrix rows: car, truck,
// cat, dog, bird. The tree groups them 2-and-3 (unbalanced) on purpose — that
// is the case that would break a naive "center each subtree" layout (see
// `helpers.ts`' `distribute({anchor: "middle"})` vs the default "edge").
const treeData = {
  name: "root",
  children: [
    { name: "vehicle", children: [{ name: "car" }, { name: "truck" }] },
    {
      name: "animal",
      children: [{ name: "cat" }, { name: "dog" }, { name: "bird" }],
    },
  ],
};

const leaves = ["car", "truck", "cat", "dog", "bird"];

// ─── Shared row geometry ────────────────────────────────────────────────────
const H = 400;
const N = leaves.length;
const ROW_PITCH = H / N; // 80 — uniform row pitch shared by all three structures

// ─── (a) Tree header ────────────────────────────────────────────────────────
const NODE_H = 24;
const TREE_SPACING = ROW_PITCH - NODE_H; // 56 — leaf pitch = NODE_H + TREE_SPACING = 80

const labeledNode = (w: number, fill: string) => (d: any) =>
  Layer({ w, h: NODE_H }, [
    rect({ w, h: NODE_H, rx: 4, fill, stroke: "#4682b4", strokeWidth: 1 }).name(
      "box"
    ),
    text({
      text: d.data.name,
      fontSize: 12,
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      fill: "#1d3557",
    }).name("label"),
  ]).constrain(({ box, label }: any) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ]);

const treeNode = (d: any) => {
  if (d.height === 0) return labeledNode(70, "#eef3fa")(d);
  if (d.depth === 0) return labeledNode(50, "#4682b4")(d);
  return labeledNode(90, "#c8dcef")(d);
};

// ─── (b) Confusion-matrix grid body ─────────────────────────────────────────
// Row/col order = first-occurrence order in the data array, so the cell
// array is built row-major with `leaves` (the tree's traversal order) as
// BOTH the row and column key sequence.
const cells = leaves.flatMap((actual, ri) =>
  leaves.map((observed, ci) => ({
    actual,
    observed,
    count: actual === observed ? 30 + ri * 6 : 3 + ((ri + ci) % 4) * 2,
  }))
);

// ─── (c) Marginal "recall" strip ───────────────────────────────────────────
// One bar per row, at the SAME `start`/`end` bands as the grid's rows
// (0..400 split into 5 equal 80px slices) so `scatter`'s yMin/yMax placement
// reproduces the grid's row geometry exactly.
const recallByLeaf: Record<string, number> = {
  car: 0.82,
  truck: 0.74,
  cat: 0.9,
  dog: 0.68,
  bird: 0.95,
};
// NOTE: `scatter`'s yMin/yMax is a continuous position channel, which (unlike
// `table`'s ordinal row axis) maps increasing values UPWARD (standard
// Cartesian, y-up) rather than top-down — so row 0 ("car") must get the
// HIGHEST band to land at the top of the canvas, matching the tree/grid's
// top-down traversal order. This is a real gotcha: two v3 operators
// (ordinal `table` vs continuous `scatter`) disagree on which screen edge
// "first" maps to.
const measureRows = leaves.map((leaf, i) => ({
  leaf,
  recall: recallByLeaf[leaf],
  start: (N - 1 - i) * ROW_PITCH,
  end: (N - i) * ROW_PITCH,
}));

const TREE_W = 300;
const GRID_W = 5 * 50; // 250
const STRIP_W = 140;
const GAP = 20;

export const NeoAlignmentSpike: StoryObj = {
  name: "Neo Alignment Spike",
  render: () => {
    const container = initializeContainer({
      w: TREE_W + GAP + GRID_W + GAP + STRIP_W,
      h: H + 20,
    });

    (async () => {
      // (a) tree header — grows left→right (parentChild dir "x"), siblings
      // stacked top→bottom (sibling dir "y") with the shared row pitch.
      const treeHeader = tree(
        {
          node: treeNode,
          link: "none",
          parentChild: distribute({
            dir: "x",
            spacing: 40,
            alignment: "middle",
          }),
          sibling: distribute({
            dir: "y",
            spacing: TREE_SPACING,
            alignment: "start",
          }),
        },
        treeData
      ) as any;
      treeHeader.name("treeHeader");

      // (b) confusion matrix
      const grid = await chart(cells, { w: GRID_W, h: H, axes: false })
        .flow(table({ by: { x: "observed", y: "actual" }, spacing: 0 }))
        .mark(
          rect({ fill: "count" }).label("count", {
            position: "center",
            fontSize: 11,
            color: "white",
          })
        )
        .resolve();
      grid.name("grid");

      // (c) marginal recall strip
      const strip = await chart(measureRows, { w: STRIP_W, h: H })
        .flow(
          scatter({
            yMin: field("start", "rowPos"),
            yMax: field("end", "rowPos"),
          } as any)
        )
        .mark(
          rect({ w: "recall", fill: "#4682b4" } as any).label("recall", {
            position: "right",
            fontSize: 10,
          } as any)
        )
        .resolve();
      strip.name("strip");

      // The tree header's own bbox spans [0, N*NODE_H + (N-1)*TREE_SPACING]
      // = [0, 400] top-to-bottom with the FIRST leaf ("car") centered at
      // NODE_H / 2 = 12 from the top of that span. The grid's first row is
      // centered at ROW_PITCH / 2 = 40. So the tree header needs a constant
      // y offset of (ROW_PITCH - NODE_H) / 2 = 28 to line up row centers —
      // this falls out of the shared-pitch construction, not a per-leaf fit.
      const TREE_Y_OFFSET = (ROW_PITCH - NODE_H) / 2;

      await layer([treeHeader, grid, strip])
        .constrain(({ treeHeader, grid, strip }: any) => [
          Constraint.position({ x: 0, y: TREE_Y_OFFSET, anchor: "start" }, [
            treeHeader,
          ]),
          Constraint.position({ x: TREE_W + GAP, y: 0, anchor: "start" }, [
            grid,
          ]),
          Constraint.position(
            { x: TREE_W + GAP + GRID_W + GAP, y: 0, anchor: "start" },
            [strip]
          ),
        ])
        .render(container, {
          w: TREE_W + GAP + GRID_W + GAP + STRIP_W,
          h: H + 20,
        } as any);
    })();

    return container;
  },
};
