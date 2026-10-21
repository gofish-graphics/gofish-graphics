import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Constraint,
  layer,
  rect,
  spread,
  text,
  value,
  Coord,
} from "../../src/lib";
import type { RelateFn } from "../../src/ast/constraints/relate";

const meta: Meta = {
  title: "Low Level Syntax/Constraints",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

const makeYRects = () => [
  rect({ w: 80, h: 40, fill: "#e63946" }).name("a"),
  rect({ w: 120, h: 40, fill: "#457b9d" }).name("b"),
  rect({ w: 60, h: 40, fill: "#2a9d8f" }).name("c"),
];

const makeXRects = () => [
  rect({ w: 40, h: 80, fill: "#e63946" }).name("a"),
  rect({ w: 40, h: 120, fill: "#457b9d" }).name("b"),
  rect({ w: 40, h: 60, fill: "#2a9d8f" }).name("c"),
];

const makeCenterToCenterRects = () => [
  rect({ w: 30, h: 80, fill: "#e63946" }).name("a"),
  rect({ w: 50, h: 80, fill: "#457b9d" }).name("b"),
  rect({ w: 20, h: 80, fill: "#2a9d8f" }).name("c"),
];

// ──────────────────────────────────────────────────────────
// Equivalence: spread = align + distribute
//
// Each case is one graphic: the same three rects placed by `spread`, and
// beside them by the `align` + `distribute` constraints it is equivalent to,
// each captioned. The two draw the same picture.
// ──────────────────────────────────────────────────────────

/** A drawing captioned above with `caption`. */
const captioned = (caption: string, body: any) =>
  spread({ dir: "y", spacing: 12, alignment: "start" }, [
    text({ text: caption, fontSize: 14 }),
    body,
  ]);

/** One equivalence case: `rects` placed by `spread(spreadOptions)` beside
 *  the same rects placed by the constraints `relate` returns. */
const equivalence = (
  rects: () => any[],
  spreadOptions: Record<string, unknown>,
  relate: RelateFn,
  args: Args
): StoryObj<Args> => ({
  args,
  render: (args: Args) => {
    const container = initializeContainer();
    spread({ dir: "x", spacing: 40, alignment: "start" }, [
      captioned("Spread", spread(spreadOptions as any, rects())),
      captioned("Constraints", layer(rects()).relate(relate)),
    ]).render(container, { w: args.w, h: args.h });
    return container;
  },
});

/**
 * spread({ dir: "y", alignment: "start" })
 *   ≡ align({ dir: "x", alignment: "start" }) + distribute({ dir: "y" })
 *
 * Three rects of different widths, stacked vertically, left-aligned.
 */
export const SpreadY_AlignStart: StoryObj<Args> = equivalence(
  makeYRects,
  { dir: "y", alignment: "start" },
  ({ a, b, c }) => [
    Constraint.align({ x: "start" }, [a, b, c]),
    Constraint.distribute({ dir: "y" }, [a, b, c]),
  ],
  { w: 400, h: 220 }
);

/**
 * spread({ dir: "y", alignment: "end" })
 *   ≡ align({ dir: "x", alignment: "end" }) + distribute({ dir: "y" })
 *
 * Three rects of different widths, stacked vertically, right-aligned.
 */
export const SpreadY_AlignEnd: StoryObj<Args> = equivalence(
  makeYRects,
  { dir: "y", alignment: "end" },
  ({ a, b, c }) => [
    Constraint.align({ x: "end" }, [a, b, c]),
    Constraint.distribute({ dir: "y" }, [a, b, c]),
  ],
  { w: 400, h: 220 }
);

/**
 * spread({ dir: "y", alignment: "middle" })
 *   ≡ align({ dir: "x", alignment: "middle" }) + distribute({ dir: "y" })
 *
 * Three rects of different widths, stacked vertically, center-aligned.
 *
 * Both spread-middle and constraint align-middle fall back to box-center
 * (size/2) when no child is placed (since #543). Neither pins an absolute x
 * position; both compare the same freely-translated system after layout
 * normalization.
 */
export const SpreadY_AlignMiddle: StoryObj<Args> = equivalence(
  makeYRects,
  { dir: "y", alignment: "middle" },
  ({ a, b, c }) => [
    Constraint.align({ x: "middle" }, [a, b, c]),
    Constraint.distribute({ dir: "y" }, [a, b, c]),
  ],
  { w: 400, h: 220 }
);

/**
 * spread({ dir: "x", alignment: "start" })
 *   ≡ align({ dir: "y", alignment: "start" }) + distribute({ dir: "x" })
 *
 * Three rects of different heights, spread horizontally, bottom-aligned.
 */
export const SpreadX_AlignStart: StoryObj<Args> = equivalence(
  makeXRects,
  { dir: "x", alignment: "start" },
  ({ a, b, c }) => [
    Constraint.align({ y: "start" }, [a, b, c]),
    Constraint.distribute({ dir: "x" }, [a, b, c]),
  ],
  { w: 400, h: 220 }
);

// ──────────────────────────────────────────────────────────
// Spacing
// ──────────────────────────────────────────────────────────

/**
 * spread({ dir: "y", alignment: "start", spacing: 20 })
 *   ≡ align({ dir: "x", alignment: "start" }) + distribute({ dir: "y", spacing: 20 })
 */
export const SpreadY_Spacing: StoryObj<Args> = equivalence(
  makeYRects,
  { dir: "y", alignment: "start", spacing: 20 },
  ({ a, b, c }) => [
    Constraint.align({ x: "start" }, [a, b, c]),
    Constraint.distribute({ dir: "y", spacing: 20 }, [a, b, c]),
  ],
  { w: 400, h: 260 }
);

/**
 * spread({ dir: "x", alignment: "end", spacing: 15 })
 *   ≡ align({ dir: "y", alignment: "end" }) + distribute({ dir: "x", spacing: 15 })
 */
export const SpreadX_Spacing_AlignEnd: StoryObj<Args> = equivalence(
  makeXRects,
  { dir: "x", alignment: "end", spacing: 15 },
  ({ a, b, c }) => [
    Constraint.align({ y: "end" }, [a, b, c]),
    Constraint.distribute({ dir: "x", spacing: 15 }, [a, b, c]),
  ],
  { w: 460, h: 220 }
);

// ──────────────────────────────────────────────────────────
// Center-to-center mode
// ──────────────────────────────────────────────────────────

/**
 * spread({ dir: "x", alignment: "start", spacing: 60, anchor: "middle" })
 *   ≡ align({ dir: "y", alignment: "start" }) + distribute({ dir: "x", spacing: 60, anchor: "middle" })
 */
export const SpreadX_CenterToCenter: StoryObj<Args> = equivalence(
  makeCenterToCenterRects,
  { dir: "x", alignment: "start", spacing: 60, anchor: "middle" },
  ({ a, b, c }) => [
    Constraint.align({ y: "start" }, [a, b, c]),
    Constraint.distribute({ dir: "x", spacing: 60, anchor: "middle" }, [
      a,
      b,
      c,
    ]),
  ],
  { w: 460, h: 160 }
);

// ──────────────────────────────────────────────────────────
// Reverse order
// ──────────────────────────────────────────────────────────

/**
 * spread({ dir: "y", alignment: "start", reverse: true })
 *   ≡ align({ dir: "x", alignment: "start" }) + distribute({ dir: "y", order: "reverse" })
 *
 * reverse: true reverses the children array in spread; order: "reverse" does the same.
 */
export const SpreadY_Reversed: StoryObj<Args> = equivalence(
  makeYRects,
  { dir: "y", alignment: "start", reverse: true },
  ({ a, b, c }) => [
    Constraint.align({ x: "start" }, [a, b, c]),
    Constraint.distribute({ dir: "y", order: "reverse" }, [a, b, c]),
  ],
  { w: 400, h: 220 }
);

/**
 * `end` alignment on a PIXEL-PURE axis: posScales don't cross a coordinate
 * transform boundary (children of `coord` receive scale *factors* instead),
 * so the cross-axis `end` fallback inside `wavy()` is the layer-box edge —
 * the bar ends seat flush at the box top instead of hanging from a scale
 * origin. Locks in the space-kind-dispatched fallback (#552): before the
 * unification, spread's pixel-pure `end` fallback was 0 (a call-site quirk
 * that seated the ends at the layer origin).
 */
export const SpreadEndUnderCoordTransform: StoryObj<Args> = {
  args: { w: 300, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer({ coord: Coord.wavy(), x: 0, y: 0 }, [
      spread({ dir: "x", alignment: "end", spacing: 8 }, [
        rect({ w: 40, h: value(30), fill: "#e63946" }),
        rect({ w: 40, h: value(80), fill: "#457b9d" }),
        rect({ w: 40, h: value(50), fill: "#2a9d8f" }),
      ]),
    ]).render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ──────────────────────────────────────────────────────────
// Partial placement: align only (one axis)
// ──────────────────────────────────────────────────────────

/**
 * Only an align constraint on the x-axis. Children share a right edge
 * but are NOT distributed vertically — they all default to y=0 (overlap).
 */
export const AlignOnly: StoryObj<Args> = {
  args: { w: 300, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      rect({ w: 80, h: 40, fill: "#e63946" }).name("a"),
      rect({ w: 120, h: 60, fill: "#457b9d" }).name("b"),
      rect({ w: 60, h: 30, fill: "#2a9d8f" }).name("c"),
    ])
      .relate(({ a, b, c }) => [Constraint.align({ x: "end" }, [a, b, c])])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

/**
 * Same as AlignOnly, but children are manually placed on y.
 * Useful for making x-alignment behavior obvious without distribution.
 */
export const AlignOnlyManualY: StoryObj<Args> = {
  args: { w: 300, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      rect({ w: 80, h: 40, y: 20, fill: "#e63946" }).name("a"),
      rect({ w: 120, h: 60, y: 100, fill: "#457b9d" }).name("b"),
      rect({ w: 60, h: 30, y: 200, fill: "#2a9d8f" }).name("c"),
    ])
      .relate(({ a, b, c }) => [Constraint.align({ x: "end" }, [a, b, c])])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

/**
 * Only a distribute constraint on the y-axis. Children are spaced vertically
 * but NOT aligned horizontally — they all default to x=0.
 */
export const DistributeOnly: StoryObj<Args> = {
  args: { w: 300, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      rect({ w: 80, h: 40, fill: "#e63946" }).name("a"),
      rect({ w: 120, h: 40, fill: "#457b9d" }).name("b"),
      rect({ w: 60, h: 40, fill: "#2a9d8f" }).name("c"),
    ])
      .relate(({ a, b, c }) => [
        Constraint.distribute({ dir: "y", spacing: 10 }, [a, b, c]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ──────────────────────────────────────────────────────────
// Subset selection
// ──────────────────────────────────────────────────────────

/**
 * Different constraints on different subsets of children.
 * - "a" and "b" are distributed vertically with spacing
 * - "c" and "d" are distributed vertically with different spacing
 * - All four are aligned on the right edge
 *
 * This is impossible with a single spread — it would require nesting.
 */
export const SubsetSelection: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      rect({ w: 100, h: 50, fill: "#e63946" }).name("a"),
      rect({ w: 80, h: 50, fill: "#457b9d" }).name("b"),
      rect({ w: 120, h: 50, fill: "#2a9d8f" }).name("c"),
      rect({ w: 60, h: 50, fill: "#f4a261" }).name("d"),
    ])
      .relate(({ a, b, c, d }) => [
        Constraint.align({ x: "end" }, [a, b, c, d]),
        Constraint.distribute({ dir: "y", spacing: 5 }, [a, b]),
        Constraint.distribute({ dir: "y", spacing: 30 }, [c, d]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

/**
 * A background rect participates in alignment but NOT distribution.
 * The content rects are distributed vertically and aligned with the background.
 */
export const BackgroundNotDistributed: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      rect({ w: 150, h: 200, fill: "#e2ebf6" }).name("bg"),
      rect({ w: 100, h: 40, fill: "#e63946" }).name("a"),
      rect({ w: 80, h: 40, fill: "#457b9d" }).name("b"),
      rect({ w: 120, h: 40, fill: "#2a9d8f" }).name("c"),
    ])
      .relate(({ bg, a, b, c }) => [
        Constraint.align({ x: "start" }, [bg, a, b, c]),
        Constraint.distribute({ dir: "y", spacing: 10 }, [a, b, c]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ──────────────────────────────────────────────────────────
// Cross-axis constraints
// ──────────────────────────────────────────────────────────

/**
 * Align on both axes independently with different anchors.
 * All children share a center on x and are distributed on y.
 */
export const AlignCenterDistributeY: StoryObj<Args> = {
  args: { w: 300, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      rect({ w: 80, h: 40, fill: "#e63946" }).name("a"),
      rect({ w: 120, h: 60, fill: "#457b9d" }).name("b"),
      rect({ w: 40, h: 30, fill: "#2a9d8f" }).name("c"),
      rect({ w: 100, h: 50, fill: "#f4a261" }).name("d"),
    ])
      .relate(({ a, b, c, d }) => [
        Constraint.align({ x: "middle" }, [a, b, c, d]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [a, b, c, d]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ──────────────────────────────────────────────────────────
// "span" / "size" alignment values (#726)
// ──────────────────────────────────────────────────────────

/**
 * `align({ x: "span" })` / `align({ y: "span" })`: a bare, unbound rect
 * ("border") adopts an already-placed group's full extent on both axes —
 * position AND size — without the group moving. `group` is a literal-
 * positioned sub-layer (so it is already placed when the outer align runs),
 * matching the Bluefish `LayoutFunction` pattern this value grammar replaces
 * (cell border / highlight / underline — take the source's `[min, max]` and
 * stamp it onto a bare rect).
 */
export const AlignSpan: StoryObj<Args> = {
  args: { w: 340, h: 220 },
  render: (args: Args) => {
    const container = initializeContainer();
    const group = layer({ x: 40, y: 50 }, [
      rect({ w: 60, h: 60, fill: "#e63946" }).name("a"),
      rect({ w: 60, h: 60, fill: "#457b9d" }).name("b"),
      rect({ w: 60, h: 60, fill: "#2a9d8f" }).name("c"),
    ])
      .relate(({ a, b, c }) => [
        Constraint.align({ y: "start" }, [a, b, c]),
        Constraint.distribute({ dir: "x", spacing: 10 }, [a, b, c]),
      ])
      .name("group");

    layer([
      group,
      rect({ fill: "none", stroke: "#333", strokeWidth: 2 }).name("border"),
    ])
      .relate(({ group, border }) => [
        Constraint.align({ x: "span" }, [group, border]),
        Constraint.align({ y: "span" }, [group, border]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

/**
 * `align({ x: "size" })`: a bare, unbound-on-x divider rect adopts a placed
 * stack's WIDTH without moving — its x position is left to the parent seed
 * (it is not itself given an x, and no other constraint touches its x), and
 * its y is set independently (a literal `y`, positioning it below the
 * stack). Verifies "size" copies length only, with no position coupling.
 */
export const AlignSize: StoryObj<Args> = {
  args: { w: 320, h: 180 },
  render: (args: Args) => {
    const container = initializeContainer();
    const stack = layer({ x: 0, y: 20 }, [
      rect({ w: 220, h: 30, fill: "#e63946" }).name("s1"),
      rect({ w: 220, h: 30, fill: "#457b9d" }).name("s2"),
    ])
      .relate(({ s1, s2 }) => [
        Constraint.align({ x: "start" }, [s1, s2]),
        Constraint.distribute({ dir: "y", spacing: 4 }, [s1, s2]),
      ])
      .name("stack");

    layer([stack, rect({ y: 110, h: 10, fill: "#2a9d8f" }).name("divider")])
      .relate(({ stack, divider }) => [
        Constraint.align({ x: "size" }, [stack, divider]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
