import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Constraint, layer, rect, spread, value } from "../../src/lib";

/**
 * PROTOTYPE (issue #475): exact parity between `spread` and
 * `layer + Constraint.align + Constraint.distribute`, INCLUDING the
 * underlying-space / scale-solving work spread does (the composed SIZE claim,
 * its inversion for auto-fit, and the cross-axis alignment fold). Each pair
 * renders the same data at the same canvas size; their normalized DOM geometry
 * should match exactly.
 */
const meta: Meta = {
  title: "Low Level Syntax/Constraint Parity",
};
export default meta;

type Args = { w: number; h: number };

const COLORS = ["#e63946", "#457b9d", "#2a9d8f"];

// ── Bar chart: data-driven heights, fixed widths ───────────────────────────
// Stack axis (x) is fixed-size; cross axis (y) is data-driven, so it exercises
// the ALIGN space fold (SIZE → POSITION) and the shared posScale path.

const BAR_HEIGHTS = [30, 80, 50];

/** spread({ dir: "x", alignment: "start" }) over data-driven-height rects. */
export const SpreadBar: StoryObj<Args> = {
  args: { w: 300, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    spread(
      { dir: "x", alignment: "start", spacing: 8 },
      BAR_HEIGHTS.map((v, i) =>
        rect({ w: 40, h: value(v), fill: COLORS[i] })
      )
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

/** Layer of named rects + align(y, start) + distribute(x). */
export const ConstraintBar: StoryObj<Args> = {
  args: { w: 300, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer(
      BAR_HEIGHTS.map((v, i) =>
        rect({ w: 40, h: value(v), fill: COLORS[i] }).name(`r${i}`)
      )
    )
      .constrain(({ r0, r1, r2 }) => [
        Constraint.align({ y: "start" }, [r0, r1, r2]),
        Constraint.distribute({ dir: "x", spacing: 8 }, [r0, r1, r2]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ── Auto-fit: data-driven widths on the stack axis, canvas too small ───────
// Natural content (120 + 200 + 90 + 2·8 = 426) is far wider than the 200px
// canvas, so children must be scaled to fit. This exercises the SIZE sum +
// spacing composition and its Monotonic inversion against the allotted size.

const FIT_WIDTHS = [120, 200, 90];

/** spread({ dir: "x" }) over data-driven-width rects, into a 200px canvas. */
export const SpreadFit: StoryObj<Args> = {
  args: { w: 200, h: 60 },
  render: (args: Args) => {
    const container = initializeContainer();
    spread(
      { dir: "x", alignment: "start", spacing: 8 },
      FIT_WIDTHS.map((v, i) =>
        rect({ w: value(v), h: 60, fill: COLORS[i] })
      )
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

/** Layer + align(y, start) + distribute(x), into the same 200px canvas. */
export const ConstraintFit: StoryObj<Args> = {
  args: { w: 200, h: 60 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer(
      FIT_WIDTHS.map((v, i) =>
        rect({ w: value(v), h: 60, fill: COLORS[i] }).name(`r${i}`)
      )
    )
      .constrain(({ r0, r1, r2 }) => [
        Constraint.align({ y: "start" }, [r0, r1, r2]),
        Constraint.distribute({ dir: "x", spacing: 8 }, [r0, r1, r2]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ── Fill children: NO explicit size on the distribute axis ─────────────────
// Each child has a fixed height but no width, so it must CONSUME its budget
// slice on x. This exercises `allocateSlices` (equal split), which the
// explicit-width pairs above never reach (their widths win over the slice).

/** spread({ dir: "x" }) over fixed-height, width-less rects: equal slices. */
export const SpreadFill: StoryObj<Args> = {
  args: { w: 300, h: 80 },
  render: (args: Args) => {
    const container = initializeContainer();
    spread(
      { dir: "x", alignment: "start", spacing: 8 },
      COLORS.map((c) => rect({ h: 40, fill: c }))
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

/** Layer + align(y, start) + distribute(x) over the same width-less rects. */
export const ConstraintFill: StoryObj<Args> = {
  args: { w: 300, h: 80 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer(
      COLORS.map((c, i) => rect({ h: 40, fill: c }).name(`r${i}`))
    )
      .constrain(({ r0, r1, r2 }) => [
        Constraint.align({ y: "start" }, [r0, r1, r2]),
        Constraint.distribute({ dir: "x", spacing: 8 }, [r0, r1, r2]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ── Weighted fill children: budget split by weights, not equally ───────────

const WEIGHTS = [1, 2, 3];

/** spread({ stackWeights }) over width-less rects: proportional slices. */
export const SpreadWeights: StoryObj<Args> = {
  args: { w: 300, h: 80 },
  render: (args: Args) => {
    const container = initializeContainer();
    spread(
      { dir: "x", alignment: "start", spacing: 8, stackWeights: WEIGHTS },
      COLORS.map((c) => rect({ h: 40, fill: c }))
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

/** Layer + distribute({ weights }) over the same width-less rects. */
export const ConstraintWeights: StoryObj<Args> = {
  args: { w: 300, h: 80 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer(
      COLORS.map((c, i) => rect({ h: 40, fill: c }).name(`r${i}`))
    )
      .constrain(({ r0, r1, r2 }) => [
        Constraint.align({ y: "start" }, [r0, r1, r2]),
        Constraint.distribute({ dir: "x", spacing: 8, weights: WEIGHTS }, [
          r0,
          r1,
          r2,
        ]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ── Glue (stack): data-driven heights summed into a POSITION ───────────────
// Stacked bars: equal-width rects with data-driven heights glued on y. The
// glue fold sums the heights into POSITION([0, Σh]); children touch (spacing 0).

const STACK_HEIGHTS = [30, 50, 20];

/** spread({ dir: "y", glue: true }) over data-driven-height rects. */
export const SpreadGlue: StoryObj<Args> = {
  args: { w: 120, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    spread(
      { dir: "y", glue: true, alignment: "start" },
      STACK_HEIGHTS.map((v, i) => rect({ w: 60, h: value(v), fill: COLORS[i] }))
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

/** Layer + align(x, start) + distribute({ dir: "y", glue: true }). */
export const ConstraintGlue: StoryObj<Args> = {
  args: { w: 120, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer(
      STACK_HEIGHTS.map((v, i) =>
        rect({ w: 60, h: value(v), fill: COLORS[i] }).name(`r${i}`)
      )
    )
      .constrain(({ r0, r1, r2 }) => [
        Constraint.align({ x: "start" }, [r0, r1, r2]),
        Constraint.distribute({ dir: "y", glue: true }, [r0, r1, r2]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ── End alignment: EXACT PARITY, like every pair above (#552) ───────────────
// This pair once rendered differently by design; since #552 it is exact parity.
// The no-sibling alignment fallback now dispatches on the axis's UNDERLYING
// SPACE, not the call site (the shared `alignFallbackBaseline` in
// constraints/align.ts): a posScale-carrying (POSITION) axis falls back to the
// scale origin `posScale(0)`, a pixel-pure axis to the layer-box edge.
// Here both layers are SIZE-derived (data-driven-height rects), so both resolve
// the SAME `alignSpaceFold` POSITION space and the SAME posScale. The "end"
// (top) of every bar therefore lands on the scale's zero line in BOTH the
// spread and the constraint layer, and the bars hang into negative cross-coords
// (the SVG grows to reserve that overhang). Identical geometry — no divergence.
// (The remaining per-callsite difference, the `readPlaced` reader for an
// already-placed sibling, is out of scope for #552.)

/** spread({ dir: "x", alignment: "end" }) over data-driven-height rects. */
export const SpreadEnd: StoryObj<Args> = {
  args: { w: 300, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    spread(
      { dir: "x", alignment: "end", spacing: 8 },
      BAR_HEIGHTS.map((v, i) => rect({ w: 40, h: value(v), fill: COLORS[i] }))
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

/** Layer + align(y, end) + distribute(x) over the same rects. */
export const ConstraintEnd: StoryObj<Args> = {
  args: { w: 300, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer(
      BAR_HEIGHTS.map((v, i) =>
        rect({ w: 40, h: value(v), fill: COLORS[i] }).name(`r${i}`)
      )
    )
      .constrain(({ r0, r1, r2 }) => [
        Constraint.align({ y: "end" }, [r0, r1, r2]),
        Constraint.distribute({ dir: "x", spacing: 8 }, [r0, r1, r2]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
