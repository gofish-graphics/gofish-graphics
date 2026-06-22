import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  scatter,
  circle,
  line,
  resolve,
  selectAll,
} from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/NodeLink",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Node-link Diagram",
      description:
        "A node-link graph whose edges are drawn by resolving each edge row's source and target ids back into the scattered nodes they name, via .layer() and resolve.",
    },
  },
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// A small node-link diagram. Nodes are scattered on a (grp, id) grid and
// named "nodes"; a second layer drives off the `edges` table, `resolve`s each
// edge's `source`/`target` ids into the drawn node refs, and `line({from,to})`
// draws one segment per edge. Demonstrates `.layer(override)` + `resolve`.
const nodes = [
  { id: "a", grp: 0 },
  { id: "b", grp: 1 },
  { id: "c", grp: 1 },
  { id: "d", grp: 2 },
  { id: "e", grp: 2 },
];

const edges = [
  { source: "a", target: "b" },
  { source: "a", target: "c" },
  { source: "b", target: "d" },
  { source: "c", target: "d" },
  { source: "c", target: "e" },
];

export const Basic: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(nodes)
      .flow(scatter({ by: "id", x: "grp", y: "id" }))
      .mark(circle({ r: 14, fill: "#4e79a7" }).name("nodes"))
      .layer(
        chart(edges)
          .flow(resolve(["source", "target"], { from: selectAll("nodes") }))
          .mark(
            line({ from: "source", to: "target", stroke: "#888", strokeWidth: 1.5 })
          )
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
