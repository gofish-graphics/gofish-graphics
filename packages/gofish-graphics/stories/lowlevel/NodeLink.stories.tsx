import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Layer,
  Constraint,
  Connect,
  createMark,
  createName,
  rect,
  text,
  ref,
} from "../../src/lib";

// A small node-link diagram built with the nested-tier pattern
// (see notes/nested-layer-tiers.md):
//   tier 1 — nodes, placed by constraints inside an inner layer;
//   tier 2 — connect() edges that read the already-placed nodes;
//   tier 3 — edge labels, placed beside the edges.
// Each tier is laid out after the tier it depends on, so nothing is stale.

const meta: Meta = {
  title: "Low Level Syntax/Node-Link Diagram",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// A node: a rounded box with a centered label.
const Node = createMark(({ label }: { label: string }) =>
  Layer({ w: 76, h: 40 }, [
    rect({
      w: 76,
      h: 40,
      rx: 6,
      fill: "#e2ebf6",
      stroke: "#457b9d",
      strokeWidth: 2,
    }).name("box"),
    text({ text: label, fontSize: 14, fill: "#1d3557" }).name("label"),
  ]).constrain(({ box, label }) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ])
);

const edge = { stroke: "#90a4ae", strokeWidth: 2 } as const;

export const NodeLink: StoryObj<Args> = {
  args: { w: 420, h: 220 },
  render: (args: Args) => {
    const container = initializeContainer();

    // Cross-tier names: the edges (outer layer) reference the nodes (inner
    // layer), so the node names must be globally-scoped `createName` tokens.
    const A = createName("A");
    const B = createName("B");
    const C = createName("C");
    const D = createName("D");

    Layer({ x: 20, y: 20 }, [
      // ── tier 1: nodes — placed by constraints, a finished unit ──────────
      Layer([
        Node({ label: "A" }).name(A),
        Node({ label: "B" }).name(B),
        Node({ label: "C" }).name(C),
        Node({ label: "D" }).name(D),
      ]).constrain((c) => [
        Constraint.distribute({ dir: "x", spacing: 60, mode: "edge" }, [c.A, c.B, c.C]),
        Constraint.align({ y: "middle" }, [c.A, c.B, c.C]),
        Constraint.distribute({ dir: "y", spacing: 60, mode: "edge" }, [c.D, c.B]),
        Constraint.align({ x: "middle" }, [c.B, c.D]),
      ]),

      // ── tier 2: edges — read the placed nodes; painted behind them ──────
      Connect(
        { ...edge, source: ["end", "middle"], target: ["start", "middle"] },
        [ref(A), ref(B)]
      )
        .name("e1")
        .zOrder(-1),
      Connect(
        { ...edge, source: ["end", "middle"], target: ["start", "middle"] },
        [ref(B), ref(C)]
      )
        .name("e2")
        .zOrder(-1),
      Connect(
        { ...edge, source: ["middle", "start"], target: ["middle", "end"] },
        [ref(B), ref(D)]
      )
        .name("e3")
        .zOrder(-1),

      // ── tier 3: edge labels ─────────────────────────────────────────────
      text({ text: "open", fontSize: 11, fill: "#607d8b" }).name("t1"),
      text({ text: "run", fontSize: 11, fill: "#607d8b" }).name("t2"),
      text({ text: "drop", fontSize: 11, fill: "#607d8b" }).name("t3"),
    ])
      .constrain((c) => [
        // horizontal edges: label centered just above the edge
        Constraint.align({ x: "middle" }, [c.e1, c.t1]),
        Constraint.distribute({ dir: "y", spacing: 3, mode: "edge" }, [c.e1, c.t1]),
        Constraint.align({ x: "middle" }, [c.e2, c.t2]),
        Constraint.distribute({ dir: "y", spacing: 3, mode: "edge" }, [c.e2, c.t2]),
        // vertical edge: label centered just to the right
        Constraint.align({ y: "middle" }, [c.e3, c.t3]),
        Constraint.distribute({ dir: "x", spacing: 4, mode: "edge" }, [c.e3, c.t3]),
      ])
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
