import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  layer,
  Constraint,
  line,
  createMark,
  createName,
  rect,
  text,
  ref,
} from "../../../src/lib";
import { zoomed, afterPaint, readPaths, measure, along, chooseFirstFit, draw } from "./place";

const meta: Meta = { title: "Proposals/Labels" };
export default meta;

// A node: a rounded box with a centered name (as in Low Level/Node-Link).
const Node = createMark(({ label }: { label: string }) =>
  layer({ w: 72, h: 34 }, [
    rect({ w: 72, h: 34, rx: 6, fill: "#e2ebf6", stroke: "#457b9d", strokeWidth: 2 }).name("box"),
    text({ text: label, fontSize: 13, fill: "#1d3557" }).name("label"),
  ]).relate(({ box, label }) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ])
);

const EDGE = "#90a4ae";
const edge = { stroke: EDGE, strokeWidth: 2 } as const;

const nodes = [
  { id: "Idle", x: 0, y: 150 },
  { id: "Loading", x: 170, y: 30 },
  { id: "Ready", x: 400, y: 70 },
  { id: "Error", x: 250, y: 230 },
  { id: "Cached", x: 470, y: 230 },
];
const edges = [
  { from: "Idle", to: "Loading", label: "fetch" },
  { from: "Loading", to: "Ready", label: "200 OK" },
  { from: "Loading", to: "Error", label: "timeout" },
  { from: "Error", to: "Idle", label: "retry" },
  { from: "Ready", to: "Cached", label: "store" },
  { from: "Error", to: "Cached", label: "fallback" },
];

// PROPOSED (edge labels; today they are hand-placed with align + distribute):
//   line({ stroke: "#90a4ae", strokeWidth: 2 }, [ref(Idle), ref(Loading)])
//     .label("fetch", { position: Place.along({ at: 0.5, sloped: true }) })
export const DiagramEdgeLabels: StoryObj = {
  name: "diagram-edge-labels",
  render: () => {
    const container = zoomed(initializeContainer());

    const names = Object.fromEntries(nodes.map((n) => [n.id, createName(n.id)]));
    layer({ x: 10, y: 10 }, [
      ...nodes.map((n) => layer({ x: n.x, y: n.y }, [Node({ label: n.id })]).name(names[n.id])),
      ...edges.map((e) =>
        line({ ...edge }, [ref(names[e.from]), ref(names[e.to])]).zOrder(-1)
      ),
    ]).render(container, { w: 600, h: 300 });
    afterPaint(container, (svg) => {
      const paths = readPaths(svg, (el) => el.getAttribute("stroke") === EDGE);
      const reqs = paths.map((p, i) => {
        const style = { fontSize: 11, fill: "#546e7a", background: "white" };
        const t = edges[i].label;
        return { candidates: along(p.pts, t, measure(svg, t, style), style, 0.5, true) };
      });
      draw(svg, chooseFirstFit(reqs, []));
    });
    return container;
  },
};
