import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Constraint, createName, layer, Layer, rect, ref, text } from "../../src/lib";

/**
 * SPIKE (#464): hand-draw axes using the gofish spec.
 *
 * Vertical bar chart built from constraints, no axis machinery. Each bar is
 * middle-aligned in x with a text label, with a vertical gap between them
 * (the ordinal x-axis). OrdinalAxisWithTitle adds an axis title below.
 */

const meta: Meta = {
  title: "Low Level Syntax/Hand-Built Axes",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

export const OrdinalAxis: StoryObj<Args> = {
  args: { w: 400, h: 360 },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      rect({ w: 40, h: 100, fill: "#e63946" }).name("a"),
      rect({ w: 40, h: 250, fill: "#457b9d" }).name("b"),
      rect({ w: 40, h: 150, fill: "#2a9d8f" }).name("c"),
      text({ text: "salmon", fontSize: 12, fill: "#666" }).name("la"),
      text({ text: "bass", fontSize: 12, fill: "#666" }).name("lb"),
      text({ text: "trout", fontSize: 12, fill: "#666" }).name("lc"),
    ])
      .constrain(({ a, b, c, la, lb, lc }) => [
        Constraint.align({ y: "start" }, [a, b, c]),
        Constraint.distribute({ dir: "x" }, [a, b, c]),
        // each bar middle-aligned in x with its label
        Constraint.align({ x: "middle" }, [a, la]),
        Constraint.align({ x: "middle" }, [b, lb]),
        Constraint.align({ x: "middle" }, [c, lc]),
        // vertical gap between label and bar (label below the bar)
        Constraint.distribute({ dir: "y", spacing: 8 }, [la, a]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [lb, b]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [lc, c]),
      ])
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

export const OrdinalAxisWithTitle: StoryObj<Args> = {
  args: { w: 400, h: 360 },
  render: (args: Args) => {
    const container = initializeContainer();

    const a = createName("a");
    const b = createName("b");
    const c = createName("c");
    const bars = createName("bars");

    // bars ⊂ (labels + title). The bars are a self-distributed sub-layer; the
    // labels and title live alongside it in the root layer.
    Layer([
      // BARS TIER: just the bars, self-distributed.
      Layer([
        rect({ w: 40, h: 100, fill: "#e63946" }).name(a),
        rect({ w: 40, h: 250, fill: "#457b9d" }).name(b),
        rect({ w: 40, h: 150, fill: "#2a9d8f" }).name(c),
      ])
        .name(bars)
        .constrain(({ a, b, c }) => [
          Constraint.align({ y: "start" }, [a, b, c]),
          Constraint.distribute({ dir: "x" }, [a, b, c]),
        ]),
      text({ text: "salmon", fontSize: 12, fill: "#666" }).name("la"),
      text({ text: "bass", fontSize: 12, fill: "#fa0000" }).name("lb"),
      text({ text: "trout", fontSize: 12, fill: "#0048ff" }).name("lc"),
      text({ text: "species", fontSize: 14, fill: "#333" }).name("title"),
    ])
      .constrain(({ a, b, c, la, lb, lc, bars, title }) => [
        // each label centered in x on its bar
        Constraint.align({ x: "middle" }, [a, la]),
        Constraint.align({ x: "middle" }, [b, lb]),
        Constraint.align({ x: "middle" }, [c, lc]),
        // label sits below its bar
        Constraint.distribute({ dir: "y", spacing: 8 }, [la, a]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [lb, b]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [lc, c]),
        // title centered on the bars group's bbox, below the labels
        Constraint.align({ x: "middle" }, [bars, title]),
        Constraint.distribute({ dir: "y", spacing: 16 }, [title, la]),
      ])
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

// Everything flat: bars + labels + title are all direct children of ONE layer,
// so they share a single coordinate frame and every constraint reference
// resolves (nameToPlaceable only includes direct children).
//
// Stacked bottom→top in y so nothing sits below y=0: title (bottom) → label row
// → bars (top). This keeps the whole axis inside the canvas — the render only
// reserves ~20px below the baseline, so axis content that hangs into negative y
// gets clipped. (Finding for #464: a spec-built axis must offset content upward
// by the axis height; the render doesn't reserve room below the baseline.)
export const OrdinalAxisFlat: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      rect({ w: 40, h: 100, fill: "#e63946" }).name("a"),
      rect({ w: 40, h: 250, fill: "#457b9d" }).name("b"),
      rect({ w: 40, h: 150, fill: "#2a9d8f" }).name("c"),
      text({ text: "salmon", fontSize: 12, fill: "#666" }).name("la"),
      text({ text: "bass", fontSize: 12, fill: "#666" }).name("lb"),
      text({ text: "trout", fontSize: 12, fill: "#666" }).name("lc"),
      text({ text: "species", fontSize: 14, fill: "#333" }).name("title"),
    ])
      .constrain(({ a, b, c, la, lb, lc, title }) => [
        // x: bars spread, labels centered on bars, title centered on middle bar
        Constraint.distribute({ dir: "x" }, [a, b, c]),
        Constraint.align({ x: "middle" }, [a, la]),
        Constraint.align({ x: "middle" }, [b, lb]),
        Constraint.align({ x: "middle" }, [c, lc]),
        Constraint.align({ x: "middle" }, [b, title]),
        // y: stack from the bottom up. The first distribute anchors `title` at
        // y=0; each label sits above the title (same row); each bar sits above
        // its label — so the bars share a common bottom and nothing is negative.
        Constraint.distribute({ dir: "y", spacing: 8 }, [title, la]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [title, lb]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [title, lc]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [la, a]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [lb, b]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [lc, c]),
      ])
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

// Cross-tier via global tokens + refs (the Pulley pattern).
//
// Bars live in their own tier, named with `createName` tokens (global, unlike
// layer-scoped strings). The labels/title tiers then drop a `ref(token)` into
// their own layer as a local stand-in for the bar; the ref resolves the bar's
// position ACROSS the layer boundary (via _ref.tsx's LCA + transform walk), so
// the constraint aligning label↔ref is same-frame from the resolver's view.
// This is what makes cross-tier alignment work where bare nested names fail
// (nameToPlaceable doesn't descend, and dims aren't frame-corrected).
//
// Tiers are declared in dependency order so each ref resolves against a placed
// target: bars → labels → title.
export const OrdinalAxisRefs: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    const a = createName("a");
    const b = createName("b");
    const c = createName("c");
    const bars = createName("bars");

    layer({ x: 20, y: 20 }, [
      // ── tier 1: bars, fully placed, named with global tokens ──
      layer([
        rect({ w: 40, h: 100, fill: "#e63946" }).name(a),
        rect({ w: 40, h: 250, fill: "#457b9d" }).name(b),
        rect({ w: 40, h: 150, fill: "#2a9d8f" }).name(c),
      ])
        .name(bars)
        .constrain((g) => [
          Constraint.align({ y: "start" }, [g.a, g.b, g.c]),
          Constraint.distribute({ dir: "x", spacing: 30 }, [g.a, g.b, g.c]),
        ]),

      // ── tier 2: labels — each refs its bar across the layer boundary ──
      layer([
        ref(a).name("ra"),
        ref(b).name("rb"),
        ref(c).name("rc"),
        text({ text: "salmon", fontSize: 12, fill: "#666" }).name("la"),
        text({ text: "bass", fontSize: 12, fill: "#666" }).name("lb"),
        text({ text: "trout", fontSize: 12, fill: "#666" }).name("lc"),
      ]).constrain((g) => [
        // each label centered on its bar (via the ref stand-in), sitting below it
        Constraint.align({ x: "middle" }, [g.ra, g.la]),
        Constraint.align({ x: "middle" }, [g.rb, g.lb]),
        Constraint.align({ x: "middle" }, [g.rc, g.lc]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [g.la, g.ra]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [g.lb, g.rb]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [g.lc, g.rc]),
      ]),

      // ── tier 3: title — refs the whole bars group, centered on its bbox ──
      layer([
        ref(bars).name("rbars"),
        text({ text: "species", fontSize: 14, fill: "#333" }).name("title"),
      ]).constrain((g) => [
        Constraint.align({ x: "middle" }, [g.rbars, g.title]),
        Constraint.distribute( {dir: "y", spacing: 24}, [g.title, g.rbars])
      ]),
    ]).render(container, { w: args.w, h: args.h });

    return container;
  },
};
