import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Layer,
  Constraint,
  Connect,
  createMark,
  createName,
  rect,
  circle,
  text,
  ref,
  polygon,
} from "../../src/lib";

// Ported from Bluefish's example-gallery pulley.tsx. A constraint-based physics
// diagram: a ceiling bar, three pulley wheels (A/B/C), two hanging weights
// (W1/W2), brown rope segments, and single-letter dimension labels.
//
// Structured as nested layer tiers (see notes/nested-layer-tiers.md):
//   tier 1 — an inner layer that fully places the shapes;
//   tier 2 — the ropes, which read those placed shapes;
//   tier 3 — the dimension labels, placed beside the ropes.
// Each tier is laid out after the one it depends on, so nothing is stale.

const meta: Meta = {
  title: "Bluefish/Pulley",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

const r = 25;
const w2jut = 10;
const rope = { stroke: "#774e32", strokeWidth: 3 } as const;

// A pulley wheel: outer wheel + concentric hub dot. The explicit w/h keeps the
// `align center` fallback baseline (size/2) anchored to the wheel's own box
// rather than the much larger inherited layout size.
const PulleyCircle = createMark(({ r = 25 }: { r?: number }) =>
  Layer({ w: 2 * r, h: 2 * r }, [
    circle({ r, stroke: "#828282", strokeWidth: 3, fill: "#C1C1C1" }).name(
      "wheel"
    ),
    circle({ r: 5, fill: "#555555" }).name("hub"),
  ]).constrain(({ wheel, hub }) => [
    Constraint.align({ x: "middle", y: "middle" }, [wheel, hub]),
  ])
);

// A weight: a trapezoid (wider at the bottom) with a centered white label.
const Weight = createMark(
  ({
    width,
    height,
    label,
  }: {
    width: number;
    height: number;
    label: string;
  }) =>
    Layer({ w: width, h: height }, [
      polygon({
        // GoFish y-up: full-width bottom edge at y=0, inset top edge at y=height.
        points: [
          [0, 0],
          [width, 0],
          [width - 10, height],
          [10, height],
        ],
        fill: "#545454",
        stroke: "#545454",
      }).name("body"),
      text({ text: label, fontSize: 10, fill: "white" }).name("label"),
    ]).constrain(({ body, label }) => [
      Constraint.align({ x: "middle", y: "middle" }, [body, label]),
    ])
);

export const Pulley: StoryObj<Args> = {
  args: { w: 360, h: 440 },
  render: (args: Args) => {
    const container = initializeContainer();

    // Cross-tier names: the ropes (outer layer) reference the shapes (inner
    // layer). String names are layer-scoped; `createName` tokens register
    // globally, so `ref(token)` resolves across the layer boundary.
    const rectN = createName("rect");
    const A = createName("A");
    const B = createName("B");
    const C = createName("C");
    const w1 = createName("w1");
    const w2 = createName("w2");

    // x/y shift the resolved bounding box to start at (20, 20) — the constraint
    // layout produces negative coordinates and the root render does not auto-fit.
    Layer({ x: 20, y: 20 }, [
      // ── tier 1: shapes + letter labels — a finished, fully-placed unit ──
      Layer([
        rect({
          h: 20,
          w: 9 * r,
          fill: "#C9C9C9",
          stroke: "#000",
          strokeWidth: 2,
        }).name(rectN),
        PulleyCircle({ r }).name(A),
        PulleyCircle({ r }).name(B),
        PulleyCircle({ r }).name(C),
        Weight({ width: 30, height: 30, label: "W1" }).name(w1),
        Weight({ width: 3 * r + w2jut, height: 30, label: "W2" }).name(w2),
        text({ text: "A", fontSize: 12 }).name("Alabel"),
        text({ text: "B", fontSize: 12 }).name("Blabel"),
        text({ text: "C", fontSize: 12 }).name("Clabel"),
      ]).constrain((c) => [
        // horizontal pulley cluster
        Constraint.distribute({ dir: "x", spacing: -r, mode: "edge" }, [c.A, c.B]),
        Constraint.distribute({ dir: "x", spacing: 0, mode: "edge" }, [c.B, c.C]),

        // vertical placement (GoFish is y-up; pair order flipped vs Bluefish)
        Constraint.distribute({ dir: "y", spacing: 40, mode: "edge" }, [c.B, c.rect]),
        Constraint.distribute({ dir: "y", spacing: 30, mode: "edge" }, [c.A, c.B]),
        Constraint.distribute({ dir: "y", spacing: 50, mode: "edge" }, [c.C, c.B]),

        // ceiling centered over the cluster (substitute for Bluefish <Group>)
        Constraint.align({ x: "middle" }, [c.B, c.rect]),

        // weights (negative spacing offsets each weight so its inset trapezoid
        // top sits under the rope source points)
        Constraint.distribute({ dir: "y", spacing: 50, mode: "edge" }, [c.w2, c.C]),
        Constraint.distribute({ dir: "x", spacing: -20, mode: "edge" }, [c.A, c.w2]),
        Constraint.distribute({ dir: "x", spacing: -15, mode: "edge" }, [c.w1, c.A]),
        Constraint.align({ y: "middle" }, [c.w2, c.w1]),

        // pulley letter labels (just outside the wheel, at a corner)
        Constraint.distribute({ dir: "x", spacing: 1, mode: "edge" }, [c.B, c.Blabel]),
        Constraint.align({ y: "end" }, [c.B, c.Blabel]),
        Constraint.distribute({ dir: "x", spacing: 1, mode: "edge" }, [c.Alabel, c.A]),
        Constraint.align({ y: "end" }, [c.A, c.Alabel]),
        Constraint.distribute({ dir: "x", spacing: 1, mode: "edge" }, [c.C, c.Clabel]),
        Constraint.align({ y: "start" }, [c.C, c.Clabel]),
      ]),

      // ── tier 2: rope segments — read the placed shapes ──────────────────
      // Declared after tier 1 so their ref()s resolve against placed shapes.
      // zOrder(-1): painted behind tier 1, so the wheels draw over rope ends.
      Connect({ ...rope, target: [0.5, 0.5] }, [ref(rectN), ref(B)])
        .name("l0")
        .zOrder(-1),
      Connect({ ...rope, source: [0, 0.5], target: [0.5, 0.5] }, [ref(B), ref(A)])
        .name("l1")
        .zOrder(-1),
      Connect({ ...rope, source: [1, 0.5], target: [0, 0.5] }, [ref(B), ref(C)])
        .name("l2")
        .zOrder(-1),
      Connect({ ...rope, target: [1, 0.5] }, [ref(rectN), ref(C)])
        .name("l3")
        .zOrder(-1),
      Connect({ ...rope, source: [0, 0.5] }, [ref(A), ref(w1)])
        .name("l4")
        .zOrder(-1),
      Connect({ ...rope, source: [1, 0.5] }, [ref(A), ref(w2)])
        .name("l5")
        .zOrder(-1),
      Connect({ ...rope, source: [0.5, 0.5] }, [ref(C), ref(w2)])
        .name("l6")
        .zOrder(-1),

      // ── tier 3: dimension labels ────────────────────────────────────────
      text({ text: "x" }).name("t1"),
      text({ text: "y" }).name("t2"),
      text({ text: "z" }).name("t3"),
      text({ text: "p" }).name("t4"),
      text({ text: "q" }).name("t5"),
      text({ text: "s" }).name("t6"),
    ])
      .constrain((c) => [
        // each dimension label sits ~5px right of its rope on x. On y, the
        // upper trio (x/y/z) shares x's centerY (anchored to rope l1); the
        // lower trio (p/q/s) shares s's centerY (anchored to rope l6) — à la
        // Bluefish's `Align centerY [t1,t2,t3]` / `[t6,t5,t4]`.
        Constraint.distribute({ dir: "x", spacing: 5, mode: "edge" }, [c.l1, c.t1]),
        Constraint.align({ y: "middle" }, [c.l1, c.t1]),
        Constraint.distribute({ dir: "x", spacing: 5, mode: "edge" }, [c.l2, c.t2]),
        Constraint.align({ y: "middle" }, [c.t1, c.t2]),
        Constraint.distribute({ dir: "x", spacing: 5, mode: "edge" }, [c.l3, c.t3]),
        Constraint.align({ y: "middle" }, [c.t1, c.t3]),
        Constraint.distribute({ dir: "x", spacing: 5, mode: "edge" }, [c.l6, c.t6]),
        Constraint.align({ y: "middle" }, [c.l6, c.t6]),
        Constraint.distribute({ dir: "x", spacing: 5, mode: "edge" }, [c.l5, c.t5]),
        Constraint.align({ y: "middle" }, [c.t6, c.t5]),
        Constraint.distribute({ dir: "x", spacing: 5, mode: "edge" }, [c.l4, c.t4]),
        Constraint.align({ y: "middle" }, [c.t6, c.t4]),

        // ── granular paint order: relative z-order constraints ────────────
        // Cross-tier refs (c.A, c.B, c.C) work because collectConstraintRefs
        // descends into the (plain) inner shapes layer. The ropes' default
        // .zOrder(-1) keeps the unmentioned ropes (l2/l3/l4/l5) behind their
        // circles; these constraints carve out the four exceptions.
        Constraint.zAbove(c.l1, c.A), // x over A
        Constraint.zBelow(c.l1, c.B), // x under B
        Constraint.zAbove(c.l0, c.B), // ceiling→B over B
        Constraint.zAbove(c.l6, c.C), // s over C
      ])
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
