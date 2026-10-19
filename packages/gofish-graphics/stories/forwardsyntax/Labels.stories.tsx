import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import {
  chart,
  spread,
  stack,
  table,
  rect,
  derive,
  field,
  Color,
} from "../../src/lib";
import type { LabelPosition } from "../../src/ast/labels/labelPlacement";
import data from "vega-datasets";
import { titanicPassengers } from "../../src/data/titanicPassengers";

const meta: Meta = {
  title: "Forward Syntax/Labels",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// ─── default (no position) ────────────────────────────────────────────────────
// Infers the best position based on shape geometry.

export const Default: StoryObj<Args> = {
  name: "Position: default",
  args: { w: 400, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood)
      .flow(spread({ by: "lake",  dir: "x" }))
      .mark(rect({ h: "count" }).label(field("count").sum()))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ─── center ───────────────────────────────────────────────────────────────────
// Centred within the shape. Auto-contrasts against the fill.

export const Center: StoryObj<Args> = {
  name: "Position: center",
  args: { w: 400, h: 300 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Stacked Bar with Centered Labels",
      description: "Catch counts by lake stacked by species, with each segment's value centered inside it in auto-contrasting text.",
    },
  },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood)
      .flow(
        spread({ by: "lake",  dir: "x" }),
        stack({ by: "species",  dir: "y" })
      )
      .mark(
        rect({ h: "count", fill: "species" }).label("count", {
          position: "center",
          fontSize: 10,
        })
      )
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ─── outset (top) ─────────────────────────────────────────────────────────────
// Sits above the top edge of the shape.

export const Above: StoryObj<Args> = {
  name: "Position: outset (top)",
  args: { w: 400, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood)
      .flow(spread({ by: "lake",  dir: "x" }))
      .mark(rect({ h: "count" }).label(field("count").sum(), { position: "outset" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ─── outset-bottom ────────────────────────────────────────────────────────────
// Sits below the bottom edge of each segment.

export const Below: StoryObj<Args> = {
  name: "Position: outset-bottom",
  args: { w: 400, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood, { axes: false })
      .flow(
        spread({ by: "lake",  dir: "y", spacing: 30 }),
        stack({ by: "species",  dir: "x" })
      )
      .mark(
        rect({ w: "count", fill: "species" }).label("count", {
          position: "outset-bottom",
          fontSize: 9,
        })
      )
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ─── outset-left ──────────────────────────────────────────────────────────────
// Sits to the left of each segment.

export const Left: StoryObj<Args> = {
  name: "Position: outset-left",
  args: { w: 400, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood, { axes: false })
      .flow(
        spread({ by: "lake",  dir: "y" }),
        spread({ by: "species",  dir: "x", spacing: 25 })
      )
      .mark(
        rect({ w: "count", fill: "species" }).label("count", {
          position: "outset-left",
          fontSize: 9,
          offset: 13,
        })
      )
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ─── outset-right ─────────────────────────────────────────────────────────────
// Sits to the right of the shape. Natural for horizontal bars.

export const Right: StoryObj<Args> = {
  name: "Position: outset-right",
  args: { w: 400, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood)
      .flow(spread({ by: "lake",  dir: "y" }))
      .mark(rect({ w: "count" }).label(field("count").sum(), { position: "outset-right", offset: 15 }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ─── outset-top-start ─────────────────────────────────────────────────────────
// Above the bar, label anchored at the left edge (start). Good for x-stacked bars.

export const AboveStart: StoryObj<Args> = {
  name: "Position: outset-top-start",
  args: { w: 500, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood)
      .flow(
        spread({ by: "lake",  dir: "x" }),
        stack({ by: "species",  dir: "x" })
      )
      .mark(
        rect({ h: "count", fill: "species" }).label("count", {
          position: "outset-top-start",
          fontSize: 9,
        })
      )
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ─── outset-top-end ───────────────────────────────────────────────────────────
// Above the bar, label anchored at the right edge (end). Good for x-stacked bars.

export const AboveEnd: StoryObj<Args> = {
  name: "Position: outset-top-end",
  args: { w: 500, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood)
      .flow(
        spread({ by: "lake",  dir: "x" }),
        stack({ by: "species",  dir: "x" })
      )
      .mark(
        rect({ h: "count", fill: "species" }).label("count", {
          position: "outset-top-end",
          fontSize: 9,
        })
      )
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ─── All positions ─────────────────────────────────────────────────────────────
// The same bars once per position, one story each, so they can be compared by
// stepping through them in the sidebar.

const positionStory = (position: LabelPosition): StoryObj<Args> => ({
  name: `All positions – ${position}`,
  args: { w: 400, h: 180 },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood, { axes: false })
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(rect({ h: "count" }).label(field("count").sum(), { position, fontSize: 9 }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
});

export const AllPositionsCenter: StoryObj<Args> = positionStory("center");
export const AllPositionsOutset: StoryObj<Args> = positionStory("outset");
export const AllPositionsInsetTop: StoryObj<Args> = positionStory("inset-top");
export const AllPositionsInsetBottom: StoryObj<Args> = positionStory("inset-bottom");
export const AllPositionsInsetLeft: StoryObj<Args> = positionStory("inset-left");
export const AllPositionsInsetRight: StoryObj<Args> = positionStory("inset-right");
export const AllPositionsInsetTopStart: StoryObj<Args> = positionStory("inset-top-start");
export const AllPositionsInsetTopEnd: StoryObj<Args> = positionStory("inset-top-end");
export const AllPositionsOutsetTop: StoryObj<Args> = positionStory("outset-top");
export const AllPositionsOutsetBottom: StoryObj<Args> = positionStory("outset-bottom");
export const AllPositionsOutsetLeft: StoryObj<Args> = positionStory("outset-left");
export const AllPositionsOutsetRight: StoryObj<Args> = positionStory("outset-right");
export const AllPositionsOutsetTopStart: StoryObj<Args> = positionStory("outset-top-start");
export const AllPositionsOutsetTopEnd: StoryObj<Args> = positionStory("outset-top-end");

// ─── Label on spread (group label) ────────────────────────────────────────────
// `.label(accessor, options?)` chained on the operator (not the mark): each
// split leaf (a lake's rows) gets its produced node stamped with the leaf's
// own subdata and a deferred label — resolveLabels then keeps the label at
// the group level instead of propagating it down to each species bar.
// Result: one label per lake group, centred above the pair of bars. `"lake"`
// is constant across every row in the group (it's the `by` field itself), so
// the bare-string accessor just works — no aggregate needed.

export const LabelOnSpread: StoryObj<Args> = {
  name: "Label on Spread",
  args: { w: 500, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood, { axes: false })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 50 }).label("lake", {
          position: "outset-top-start",
          fontSize: 13,
          rotate: 60,
        })
      )
      .mark(async (d: any) => {
        return chart(d, { axes: false })
          .flow(stack({ by: "species", dir: "x" }))
          .mark(rect({ h: "count" as any, fill: "species" as any }))
          .resolve();
      })
      .render(container, { w: args.w, h: args.h });
    return container;
  }
};

// ─── Label on stack (per-group label, #702) ───────────────────────────────────
// `.label(accessor)` chained directly on a `stack({by, dir})` operator: each
// class's leaf produces one rect, stamped with that leaf's own rows and a
// deferred label reading `pclass` off the group's rows — one label per
// stacked segment, no manual datum-stamping workaround needed. `"pclass"` is
// constant across every row in the group (it's the `by` field itself), so
// the bare-string accessor just works — no aggregate needed.

export const LabelOnStackOperator: StoryObj<Args> = {
  name: "Label on Stack operator (per-group)",
  args: { w: 260, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(titanicPassengers, { axes: false })
      .flow(
        stack({ by: "pclass", dir: "y" }).label("pclass", {
          position: "center",
          fontSize: 14,
          color: "white",
        })
      )
      .mark(rect({ w: 120, h: field("survived").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  }
};

// ─── Label on stack (group-total aggregate label, #702 redesign) ─────────────
// `.label(field("count").sum())` chained directly on a `stack({by, dir})`
// operator: the accessor is a `field(...)` aggregate, not a bare field name,
// so it folds each group's rows to their SUM rather than requiring the field
// to be constant across the group. One label per stacked class, showing the
// class's total passenger count (not any single row's value).

export const LabelOnStackAggregate: StoryObj<Args> = {
  name: "Label on Stack operator (group total)",
  args: { w: 260, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(titanicPassengers, { axes: false })
      .flow(
        stack({ by: "pclass", dir: "y" }).label(field("survived").count(), {
          position: "center",
          fontSize: 14,
          color: "white",
        })
      )
      .mark(rect({ w: 120, h: field("survived").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  }
};

// ─── Heatmap center ────────────────────────────────────────────────────────────

const heatData = ["Mon", "Tue", "Wed", "Thu", "Fri"].flatMap((day, di) =>
  ["9am", "12pm", "3pm"].map((hour, hi) => ({
    day,
    hour,
    value: [42, 78, 55, 91, 33, 67, 24, 89, 61, 15, 74, 48, 36, 83, 70][
      di * 3 + hi
    ],
  }))
);

export const HeatmapWithLabels: StoryObj<Args> = {
  name: "Heatmap – center labels (auto-contrast)",
  args: { w: 420, h: 280 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Labeled Heatmap",
      description: "A day-by-hour heatmap shaded along a blue gradient with each cell's value labeled in auto-contrasting text.",
    },
  },
  render: (args) => {
    const container = initializeContainer();
    chart(heatData, { color: Color.gradient(["#e0f3ff", "#08519c"]) })
      .flow(table({ by: { x: "hour", y: "day" },  spacing: 4 }))
      .mark(
        rect({ fill: "value" }).label("value", { position: "center", fontSize: 11 })
      )
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ─── Rotated labels ────────────────────────────────────────────────────────────
// Labels rotate clockwise for positive values, pivoting at the label's center.

const rotatedStory = (rotate: number): StoryObj<Args> => ({
  name: `Rotate: ${rotate}°`,
  args: { w: 500, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood)
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(
        rect({ h: "count" }).label(field("count").sum(), { position: "outset-top", rotate })
      )
      .render(container, { w: args.w, h: args.h });
    return container;
  },
});

export const Rotate45: StoryObj<Args> = rotatedStory(45);
export const RotateNeg30: StoryObj<Args> = rotatedStory(-30);
export const Rotate0: StoryObj<Args> = rotatedStory(0);

// ─── Normalized stacked bar (population by age + gender) ──────────────────────
// Mirrors https://vega.github.io/vega-lite/examples/bar_stacked_normalize_labeled.html
// Each horizontal bar represents one age group; segments are Male / Female,
// normalized so every row spans 100%. Labels show the raw people count inside
// each segment in white text.

export const NormalizedStackedBarWithLabels: StoryObj<Args> = {
  name: "Normalized stacked bar – center labels",
  args: { w: 350, h: 400 },
  loaders: [async () => ({ population: await data["population.json"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Normalized Stacked Bar with Labels",
      description: "US population by age group split into Male and Female shares, normalized so each horizontal bar spans 100% with raw counts labeled inside.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();

    chart(
      context.loaded.population.filter((row: any) => row.year === 2000) as any[],
      {
        color: Color.palette({ Female: "#675193", Male: "#ca8861" }),
        // Keep the continuous proportion x-axis at the bottom (y-end).
        axes: { x: { side: "end", title: "proportion" }, y: true },
      }
    )
      .flow(
        // Decode the sex field to a readable string
        derive((d: any[]) =>
          d.map((row) => ({ ...row, sex: row.sex === 1 ? "Male" : "Female" }))
        ),
        // One row per age group; y-down reads top→bottom, so age 0 lands at the
        // top (matching the Vega-Lite reference).
        spread({ by: "age", dir: "y", spacing: 2 }),
        // Female left, Male right; normalize within each age group so bars span 0→1
        stack({ by: field("sex").sort(), dir: "x", size: field("people").normalize() })
      )
      .mark(
        rect({ fill: "sex" }).label("people", {
          position: "center",
          color: "white",
        })
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

// ─── two labels per bar (repeated .label(), #706) ─────────────────────────────
// Repeated `.label()` calls on the same mark append rather than overwrite:
// each bar carries both a bold white value label centered inside it AND a
// small category label above it, with independent styling (fontFamily/
// fontWeight/fontStyle round-trip through the wire IR the same way).

export const TwoLabelsPerBar: StoryObj<Args> = {
  name: "Two labels per bar (repeated .label())",
  args: { w: 400, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    chart(seafood)
      .flow(spread({ by: "lake", dir: "x", spacing: 40 }))
      .mark(
        rect({ h: field("count").sum() })
          .label(field("count").sum(), {
            position: "center",
            color: "white",
            fontWeight: "bold",
          })
          .label("lake", { position: "outset-top", fontSize: 9 })
      )
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ─── position showcase ────────────────────────────────────────────────────────
// One rect with a label at every position, each naming its own position.
// Blue = inset positions, amber = outset positions. An inset corner is the
// same spot from either edge (`inset-top-start` is `inset-left-start`), so
// each corner gets one label that names both. The single datum maps each
// position to its text, so `.label(position)` reads that text.

const SHOWCASE_LABELS: Partial<Record<LabelPosition, string>> = {
  center: "center",
  "inset-top": "inset-top",
  "inset-bottom": "inset-bottom",
  "inset-left": "inset-left",
  "inset-right": "inset-right",
  "inset-top-start": "inset-top-start = inset-left-start",
  "inset-top-end": "inset-top-end = inset-right-start",
  "inset-bottom-start": "inset-bottom-start = inset-left-end",
  "inset-bottom-end": "inset-bottom-end = inset-right-end",
  "outset-top": "outset-top",
  "outset-top-start": "outset-top-start",
  "outset-top-end": "outset-top-end",
  "outset-bottom": "outset-bottom",
  "outset-bottom-start": "outset-bottom-start",
  "outset-bottom-end": "outset-bottom-end",
  "outset-left": "outset-left",
  "outset-left-start": "outset-left-start",
  "outset-left-end": "outset-left-end",
  "outset-right": "outset-right",
  "outset-right-start": "outset-right-start",
  "outset-right-end": "outset-right-end",
};

export const PositionShowcase: StoryObj = {
  name: "Position showcase – all positions on one rect",
  render: () => {
    const container = initializeContainer();
    const positions = Object.keys(SHOWCASE_LABELS) as LabelPosition[];
    const mark = positions.reduce(
      (m, position) =>
        m.label(position, {
          position,
          fontSize: 11,
          fontFamily: "monospace",
          color: position.startsWith("outset") ? "#92400e" : "#1d4ed8",
        }),
      rect({ w: 660, h: 280, fill: "#dbeafe", stroke: "#3b82f6", strokeWidth: 1.5 })
    );
    chart([SHOWCASE_LABELS], { axes: false })
      .mark(mark)
      .render(container, { w: 660, h: 280 });
    return container;
  },
};
