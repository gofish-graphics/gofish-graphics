// Box-to-box arrows and anchors. One small node-link diagram, drawn three
// ways:
//   1. Today: the `arrow` operator (perfect-arrows' getBoxToBoxArrow).
//   2. Center anchor + boundary clip, EMULATED (arrows.ts).
//   3. Side candidates + data-driven slots, EMULATED (arrows.ts).
//
// Proposed spellings (anchor API). Data: nodes { id, x, y }, edges { from, to }.
//
// 1 and 2: a point anchor at the center; the arrow's end is cut where its
// route crosses the node's outline (`clip`, a connection option, default on).
// perfect-arrows is this with `curve: Curve.perfectArrows({ bow })`.
//
//   layer([
//     chart(nodes)
//       .flow(scatter({ by: "id", x: "x", y: "y" }))
//       .mark(
//         rect({ w: 90, h: 36 })
//           .anchor({ name: "out", position: "center", slots: data(edges, { on: "from" }) })
//           .anchor({ name: "in", position: "center", slots: data(edges, { on: "to" }) })
//           .name("nodes")
//       ),
//     chart(edges).mark(
//       arrow({ from: "nodes.out", to: "nodes.in", curve: Curve.linear() }) // clip: "outline"
//     ),
//   ]);
//
// 3: `position` lists candidate parts. Each row's end goes to the candidate
// facing its far node; then the slot flow runs on each part's rows.
//
//   rect({ w: 90, h: 36 })
//     .anchor({
//       name: "in",
//       position: ["x-min", "x-max", "y-min", "y-max"],
//       slots: data(edges, { on: "to" }).flow(spread()),
//     })
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { layer, rect, ellipse, text, polygon, arrow, circle } from "../../../src/lib";
import {
  type ArrowNode,
  type DrawnArrow,
  clipArrows,
  sideSlotArrows,
  lineRing,
} from "./arrows";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Arrows" };
export default meta;

const nodes: ArrowNode[] = [
  { id: "input", cx: 60, cy: 50, w: 84, h: 40, shape: "ellipse" },
  { id: "lexer", cx: 60, cy: 190, w: 80, h: 36, shape: "rect" },
  { id: "parser", cx: 230, cy: 120, w: 90, h: 40, shape: "rect" },
  { id: "checker", cx: 420, cy: 50, w: 90, h: 36, shape: "rect" },
  { id: "codegen", cx: 420, cy: 190, w: 90, h: 36, shape: "rect" },
  { id: "errors", cx: 240, cy: 285, w: 110, h: 36, shape: "rect" },
];
const edges: [string, string][] = [
  ["input", "parser"],
  ["lexer", "parser"],
  ["parser", "checker"],
  ["parser", "codegen"],
  ["checker", "codegen"],
  ["parser", "errors"],
  ["checker", "errors"],
  ["lexer", "errors"],
  ["codegen", "errors"],
];

const INK = "#333";
const FILL = "#eef2f7";
const STROKE = "#8a9bb0";

const nodeMarks = () =>
  nodes.flatMap((n) => [
    (n.shape === "ellipse" ? ellipse : rect)({
      cx: n.cx,
      cy: n.cy,
      w: n.w,
      h: n.h,
      fill: FILL,
      stroke: STROKE,
      strokeWidth: 1.5,
    }).name(n.id),
    text({ cx: n.cx, cy: n.cy, text: n.id, fontSize: 12, fill: INK, textAnchor: "middle" }),
  ]);

const arrowMarks = (arrows: DrawnArrow[]) =>
  arrows.flatMap((a) => [
    polygon({ points: lineRing(a.body), fill: "none", stroke: INK, strokeWidth: 1.5 }),
    polygon({ points: a.head, fill: INK }),
  ]);

/** 1. Today: `arrow({...}, [ref(a), ref(b)])` per edge. perfect-arrows reads
 *  only the two bounding boxes, so the ellipse's arrow starts at its box. */
export const PerfectArrows: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer(nodeMarks())
      .relate((refs: any) =>
        edges.map(([f, t]) =>
          arrow({ stroke: INK, strokeWidth: 1.5, padEnd: 4, padStart: 2 }, [refs[f], refs[t]])
        )
      )
      .render(container, { w: 500, h: 330 });
    return container;
  },
};

/** 2. Anchor at the center, connection cut at the outline (the ellipse's
 *  real outline, not its box). */
export const CenterClip: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([...nodeMarks(), ...arrowMarks(clipArrows(nodes, edges))]).render(container, {
      w: 500,
      h: 330,
    });
    return container;
  },
};

/** 3. Each end picks the side facing the far node (candidates: the four
 *  sides), then the ends on a side are spread evenly over it, ordered by the
 *  far node's position. The dots are the slots. */
export const SideSlots: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const { arrows, slots } = sideSlotArrows(nodes, edges);
    layer([
      ...nodeMarks(),
      ...arrowMarks(arrows),
      ...slots.map((s) => circle({ cx: s.p[0], cy: s.p[1], r: 2.5, fill: "#d9534f" })),
    ]).render(container, { w: 500, h: 330 });
    return container;
  },
};

/** 3b. The same, with the candidates narrowed to x-min / x-max (a left-to-
 *  right flow, as in a sankey). Ends that face up or down fall back to the
 *  best allowed side. */
export const SideSlotsLeftRight: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const lr = Object.fromEntries(nodes.map((n) => [n.id, ["x-min", "x-max"] as any]));
    const { arrows, slots } = sideSlotArrows(nodes, edges, { sides: lr });
    layer([
      ...nodeMarks(),
      ...arrowMarks(arrows),
      ...slots.map((s) => circle({ cx: s.p[0], cy: s.p[1], r: 2.5, fill: "#d9534f" })),
    ]).render(container, { w: 500, h: 330 });
    return container;
  },
};
