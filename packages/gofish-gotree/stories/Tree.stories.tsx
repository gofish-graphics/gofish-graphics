import type { Meta, StoryObj } from "@storybook/html";
import { circle, rect, text, Layer, Constraint, polar } from "gofish-graphics";
import { tree, nest, distribute } from "../src";

const meta: Meta = {
  title: "GoTree / Node-Link",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 1200, step: 20 } },
    h: { control: { type: "number", min: 200, max: 1000, step: 20 } },
  },
};
export default meta;

type Args = { w: number; h: number };

const sampleData = {
  name: "root",
  children: [
    {
      name: "A",
      children: [
        { name: "A1" },
        {
          name: "A2",
          children: [{ name: "A2a" }, { name: "A2b" }],
        },
      ],
    },
    {
      name: "B",
      children: [{ name: "B1" }, { name: "B2" }, { name: "B3" }],
    },
    { name: "C" },
  ],
};

const fileTreeData = {
  name: "project",
  children: [
    {
      name: "src",
      children: [
        { name: "index.ts" },
        {
          name: "ast",
          children: [
            { name: "node.ts" },
            { name: "render.tsx" },
            { name: "spread.tsx" },
          ],
        },
        {
          name: "marks",
          children: [{ name: "rect.tsx" }, { name: "circle.tsx" }],
        },
      ],
    },
    {
      name: "tests",
      children: [{ name: "tree.test.ts" }, { name: "layout.test.ts" }],
    },
    { name: "README.md" },
  ],
};

const depthColor = ["#1f3a5f", "#4682b4", "#7baed1", "#c0d8ec"];

const initContainer = () => {
  const container = document.createElement("div");
  container.style.margin = "20px";
  document.body.appendChild(container);
  return container;
};

export const NodeLink: StoryObj<Args> = {
  args: { w: 600, h: 400 },
  render: (args: Args) => {
    const container = initContainer();
    tree(
      {
        node: (d) =>
          circle({
            r: 10,
            fill: depthColor[Math.min(d.depth, depthColor.length - 1)],
            stroke: "#1f3a5f",
            strokeWidth: 1,
          }),
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1.5 },
        // distribute on y → parent first goes at low y; ``
        // flips so parent ends up at HIGH y = top of screen (y-up). Aligned
        // middle on the orthogonal x axis (separate align constraint).
        parentChild: distribute({
          dir: "y",
          spacing: 48,
          alignment: "middle",
        }),
        sibling: distribute({ dir: "x", spacing: 24, alignment: "start" }),
      },
      sampleData
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Composed-mark example: each tree node is a rounded rect with a centered text
// label, built from gofish-graphics primitives. The node factory closes over the
// hierarchy datum, so `d.data.name` flows from the user's tree into the label.
const labeledNode = (d: any) =>
  Layer({ w: 96, h: 26 }, [
    rect({
      w: 96,
      h: 26,
      rx: 6,
      fill: d.height > 0 ? "#dbe6f3" : "#f5f7fa",
      stroke: "#4682b4",
      strokeWidth: 1.25,
    }).name("box"),
    text({
      text: d.data.name,
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fill: "#1d3557",
    }).name("label"),
  ]).constrain(({ box, label }: any) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ]);

export const LabeledFileTree: StoryObj<Args> = {
  args: { w: 760, h: 460 },
  render: (args: Args) => {
    const container = initContainer();
    tree(
      {
        node: labeledNode,
        link: { interpolation: "linear", stroke: "#9bb1c4", strokeWidth: 1.5 },
        parentChild: distribute({
          dir: "y",
          spacing: 36,
          alignment: "middle",
        }),
        sibling: distribute({ dir: "x", spacing: 12, alignment: "start" }),
      },
      fileTreeData
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Containment example: each tree node is a plain colored rect; parent rects
// grow via `nest` to wrap their entire subtree. Showcases Constraint.nest
// via the gofish-gotree DSL — the same tree datum gets a totally different
// visualization just by swapping the `parentChild` combiner.
//
// The mark factory branches on `d.height` so leaves get a fixed pixel size
// (intrinsic, doesn't grow) and internal nodes get an unsized rect (grows
// when nest passes an override size = inner.intrinsicDims + 2*padding).
// Depth-based fill — outer is lightest, leaves are darkest — visualizes the
// nesting hierarchy.
const greens = ["#3c7c3c", "#7fb37f", "#a8d9a8", "#c8e6c8"];

const nestedNode = (d: any) =>
  d.height === 0
    ? rect({
        w: 28,
        h: 28,
        fill: greens[0],
      })
    : rect({
        fill: greens[Math.min(d.height, greens.length - 1)],
      });

const balancedTree = {
  name: "root",
  children: [
    { name: "A", children: [{ name: "A1" }, { name: "A2" }] },
    { name: "B", children: [{ name: "B1" }, { name: "B2" }] },
  ],
};

export const NestedBoxes: StoryObj<Args> = {
  args: { w: 480, h: 240 },
  render: (args: Args) => {
    const container = initContainer();
    tree(
      {
        node: nestedNode,
        link: "none",
        parentChild: nest({ x: 12, y: 12 }),
        sibling: distribute({ dir: "x", spacing: 10, alignment: "middle" }),
      },
      balancedTree
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Labeled nested-boxes — shows a custom `parentChild` combiner instead of a
// helper. The user's `node` factory produces a labeled-header (rect + text);
// the custom combiner stacks [header, childGroup] vertically inside an
// auto-generated wrapping rect, with `nest` sizing the wrapper around the
// stack. Demonstrates that `parentChild` accepts any function with the
// `(children) => GoFishAST` shape — helpers are conveniences, not the API.
const labeledHeader = (d: any) =>
  Layer({ w: 96, h: 22 }, [
    rect({
      w: 96,
      h: 22,
      rx: 4,
      fill: d.height > 0 ? "#dbe6f3" : "#f5f7fa",
      stroke: "#5a7da6",
      strokeWidth: 1,
    }).name("box"),
    text({
      text: d.data.name,
      fontSize: 11,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fill: "#1d3557",
    }).name("label"),
  ]).constrain(({ box, label }: any) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ]);

// Custom parentChild combiner. distribute on y places [childGroup, header]
// at low/high y respectively → header ends up at high y / top of screen
// (y-up). Then nest wraps the resulting stack inside an auto outer rect.
const labeledContainCombiner = ([header, childGroup]: any[]) =>
  nest({ x: 10, y: 10 })([
    rect({
      fill: "#fafbfd",
      stroke: "#9bb1c4",
      strokeWidth: 1,
      rx: 6,
    }),
    distribute({ dir: "y", spacing: 6, alignment: "middle" })([
      childGroup,
      header,
    ]),
  ]);

export const LabeledNestedBoxes: StoryObj<Args> = {
  args: { w: 720, h: 600 },
  render: (args: Args) => {
    const container = initContainer();
    tree(
      {
        node: labeledHeader,
        link: "none",
        parentChild: labeledContainCombiner,
        sibling: distribute({ dir: "y", spacing: 6, alignment: "middle" }),
      },
      fileTreeData
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

// M3 — polar wrap producing a classic radial node-link (root at center,
// children radiating outward through full 2π, depth = ring number).
//
// Two things differ from the cartesian NodeLink spec:
//
// 1. `parentChild` uses gofish-graphics' raw `Spread` (not the gofish-gotree
//    helper) so the y-up swap is skipped: parent ends up at LOW y → r=0 →
//    canvas center, children at HIGH y → outer ring. The gotree spread
//    helper's swap is a cartesian convenience that fights polar's
//    "small-y = inner" convention; bypassing it puts root where users
//    expect for a radial tree.
//
// 2. Sibling spacing is large enough to fan out across the full circle.
//    With 3 depth-1 children and `spacing: 2π/3` between centers, root's
//    children span ~4 rad = ~240° (good radial spread; not full 2π because
//    spread uses N-1 gaps for N items — full 2π would require a more
//    sophisticated radial layout algorithm a la d3-hierarchy).
//
// Nodes stay as `circle({r: 8})` — they're points in the polar transform,
// only their center sweeps through. `mode: "center"` on every spread
// ignores bbox widths and uses spacing in domain units (radians for theta,
// r-units for radius).
// Sunburst — root at the center, leaves at the outer ring, each tree level
// rendered as a radial band. Each node is a polar wedge whose theta extent
// matches its leaf count, so siblings pack into their parent's sector
// exactly.
//
// Two structural choices distinguish this from the cartesian NestedBoxes:
//
// 1. `parentChild` and `sibling` both use `distribute` (constraint-based,
//    one axis each) instead of `spread` (operator, couples x and y) or
//    `nest` (inside-out, 2D). The point: under polar, the x (theta) and
//    y (radial) axes have totally different meanings and want to be
//    controlled independently. `distribute({dir: "y"})` for parentChild
//    handles radial placement; `distribute({dir: "x"})` for sibling
//    handles angular placement. Neither touches the other axis.
//
// 2. Each node's width is `d.width * leafTheta` (where d.width is the
//    HierarchyDatum's leaf count, from d3-hierarchy's `.leaves().length`).
//    With leafTheta = 2π / N_leaves, root spans the full disc, depth-1
//    spans half each, leaves span a quadrant each. Wedges line up.
const polarGreens = ["#3c7c3c", "#7fb37f", "#a8d9a8", "#c8e6c8"];

const polarBalancedTree = {
  name: "root",
  children: [
    { name: "A", children: [{ name: "A1" }, { name: "A2" }] },
    { name: "B", children: [{ name: "B1" }, { name: "B2" }] },
  ],
};

// Deeper balanced tree (4 levels deep, 16 leaves) for sunburst & icicle.
// Each internal node has exactly 2 children so wedge widths divide evenly.
const deepBalancedTree = (() => {
  const make = (depth: number, prefix = ""): any =>
    depth === 0
      ? { name: prefix }
      : {
          name: prefix || "root",
          children: [
            make(depth - 1, prefix + "L"),
            make(depth - 1, prefix + "R"),
          ],
        };
  return make(4);
})();

const deepLeafCount = 16; // 2^4
const leafTheta = (2 * Math.PI) / deepLeafCount; // sunburst leaf theta extent
const bandHeight = 38; // radial thickness per tree level

const sunburstNode = (d: any) =>
  rect({
    w: d.width * leafTheta,
    h: bandHeight,
    emX: true,
    emY: true,
    fill: polarGreens[Math.min(d.depth, polarGreens.length - 1)],
    stroke: "white",
    strokeWidth: 2,
  });

export const Sunburst: StoryObj<Args> = {
  args: { w: 540, h: 540 },
  render: (args: Args) => {
    const container = initContainer();
    tree(
      {
        node: sunburstNode,
        link: "none",
        // distribute on y → parent at low y (inner ring), group at high y
        // (outer ring). alignment "middle" emits a paired align constraint
        // on x so parent and group share an x-center (matters when their
        // widths differ; here they match by construction).
        parentChild: distribute({
          dir: "y",
          spacing: 0,
          alignment: "middle",
        }),
        // distribute on x → siblings packed along theta. alignment "middle"
        // shares a y-center so all siblings sit on the same radial band.
        sibling: distribute({
          dir: "x",
          spacing: 0,
          alignment: "middle",
        }),
        coord: polar(),
      },
      deepBalancedTree
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Cartesian counterpart of Sunburst — an icicle plot. Same spec exactly,
// minus `coord: polar()` and with `` on parentChild so root
// ends up at the top of the screen (y-up: parent at HIGH y → top) instead
// of at the bottom. Each tree level is a horizontal band; leaves are at
// the bottom edge.
const icicleLeafWidth = 28; // pixels per leaf in cartesian

const icicleNode = (d: any) =>
  rect({
    w: d.width * icicleLeafWidth,
    h: bandHeight,
    fill: polarGreens[Math.min(d.depth, polarGreens.length - 1)],
    stroke: "white",
    strokeWidth: 2,
  });

export const IciclePlot: StoryObj<Args> = {
  args: { w: 540, h: 320 },
  render: (args: Args) => {
    const container = initContainer();
    tree(
      {
        node: icicleNode,
        link: "none",
        // Same axis decomposition as Sunburst, but  puts
        // root at top of screen (HIGH y in y-up). No coord transform.
        parentChild: distribute({
          dir: "y",
          spacing: 0,
          alignment: "middle",
        }),
        sibling: distribute({
          dir: "x",
          spacing: 0,
          alignment: "middle",
        }),
      },
      deepBalancedTree
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Nested Pietree — true polar version of the cartesian NestedBoxes. Uses
// `nest` (inside-out) just like NestedBoxes — parent's wedge ENCLOSES
// children's wedges with visible padding on all sides, rather than the
// adjacent radial bands of the sunburst. So in this layout the leaves are
// at the smallest radii (innermost) and root spans the full disc.
//
// Leaf width is the deepest level's theta share (here π/2 for 4 leaves);
// internals have no fixed dims so nest grows them to inner.intrinsicDims
// + 2 * padding. White stroke gives visible separation between nested
// wedges.
// Cartesian-x must fit inside polar's [0, 2π] domain — overflow wraps and
// produces visual artifacts. For the balanced 2x2 tree the budget is:
//   4·leafW + 4·sibSpacing + 6·xPad = 2π
// (4 leaves; 4 sibling gaps total — 3 inside each subtree row plus 1
// inter-subtree gap; 2 nest levels × 2 sides per level = 4 inner nest
// edges plus the root nest's 2 outer edges = 6).
//
// The library doesn't auto-fit yet — Constraint.distribute and
// Constraint.nest don't participate in the spread operator's
// sharedScale/Monotonic-inversion fitting path. Sizes are hand-computed.
// Tracked in https://github.com/gofish-graphics/gofish-graphics/issues/475
const NPT_LEAF_W = Math.PI / 2 - 0.27; // ≈ 1.30 rad
const NPT_SIB = 0.08;
const NPT_X_PAD = 0.13;
// Budget check: 4 * 1.30 + 4 * 0.08 + 6 * 0.13 ≈ 6.30 ≈ 2π ✓

const nestedPieNode = (d: any) =>
  d.height === 0
    ? rect({
        w: NPT_LEAF_W,
        h: 36,
        emX: true,
        emY: true,
        fill: polarGreens[polarGreens.length - 1],
        stroke: "white",
        strokeWidth: 4,
      })
    : rect({
        emX: true,
        emY: true,
        fill: polarGreens[
          Math.min(polarGreens.length - 1 - d.height, polarGreens.length - 1)
        ],
        stroke: "white",
        strokeWidth: 4,
      });

export const NestedPietree: StoryObj<Args> = {
  args: { w: 540, h: 540 },
  render: (args: Args) => {
    const container = initContainer();
    tree(
      {
        node: nestedPieNode,
        link: "none",
        parentChild: nest({ x: NPT_X_PAD, y: 32 }),
        sibling: distribute({
          dir: "x",
          spacing: NPT_SIB,
          alignment: "middle",
        }),
        coord: polar(),
      },
      polarBalancedTree
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const RadialNodes: StoryObj<Args> = {
  args: { w: 480, h: 480 },
  render: (args: Args) => {
    const container = initContainer();
    tree(
      {
        node: (d) =>
          circle({
            r: 8,
            fill: depthColor[Math.min(d.depth, depthColor.length - 1)],
            stroke: "#1f3a5f",
            strokeWidth: 1,
          }),
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1.5 },
        // distribute on y forward order: parent at LOW y → r=0 (canvas
        // center), children at HIGH y → outer rings. mode:"center" treats
        // children as points (no bbox accumulation) and reads spacing in
        // domain units — r-units here for the radial direction.
        parentChild: distribute({
          dir: "y",
          spacing: 70,
          mode: "center",
          alignment: "middle",
        }),
        // mode:"center" again for theta — spacing in radians between
        // sibling centers.
        sibling: distribute({
          dir: "x",
          spacing: (2 * Math.PI) / 3,
          mode: "center",
          alignment: "middle",
        }),
        coord: polar(),
      },
      sampleData
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};
