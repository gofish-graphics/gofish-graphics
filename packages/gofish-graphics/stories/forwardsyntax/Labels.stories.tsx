import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import {
  Chart,
  spread,
  stack,
  table,
  rect,
  gradient,
  derive,
  palette,
} from "../../src/lib";
import {
  calculateLabelOffset,
  getLabelTextAnchor,
  type LabelPosition,
} from "../../src/ast/labels/labelPlacement";
import { sumBy, orderBy } from "lodash";
import data from "vega-datasets";

const meta: Meta = {
  title: "Forward Syntax V3/Labels",
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
    Chart(seafood)
      .flow(spread({ by: "lake",  dir: "x" }))
      .mark(rect({ h: "count" }).label("count"))
      .render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

// ─── center ───────────────────────────────────────────────────────────────────
// Centred within the shape. Auto-contrasts against the fill.

export const Center: StoryObj<Args> = {
  name: "Position: center",
  args: { w: 400, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    Chart(seafood)
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
      .render(container, { w: args.w, h: args.h, axes: true });
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
    Chart(seafood)
      .flow(spread({ by: "lake",  dir: "x" }))
      .mark(rect({ h: "count" }).label("count", { position: "outset" }))
      .render(container, { w: args.w, h: args.h, axes: true });
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
    Chart(seafood)
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
      .render(container, { w: args.w, h: args.h, axes: false });
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
    Chart(seafood)
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
      .render(container, { w: args.w, h: args.h, axes: false });
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
    Chart(seafood)
      .flow(spread({ by: "lake",  dir: "y" }))
      .mark(rect({ w: "count" }).label("count", { position: "outset-right", offset: 15 }))
      .render(container, { w: args.w, h: args.h, axes: true });
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
    Chart(seafood)
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
      .render(container, { w: args.w, h: args.h, axes: true });
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
    Chart(seafood)
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
      .render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

// ─── All positions grid ────────────────────────────────────────────────────────
// One row per position so they can be compared side by side.

const ALL_POSITIONS: LabelPosition[] = [
  "center",
  "outset",
  "inset-top",
  "inset-bottom",
  "inset-left",
  "inset-right",
  "inset-top-start",
  "inset-top-end",
  "outset-top",
  "outset-bottom",
  "outset-left",
  "outset-right",
  "outset-top-start",
  "outset-top-end",
];

export const AllPositions: StoryObj<{ w: number; h: number }> = {
  name: "All positions – comparison",
  args: { w: 400, h: 180 },
  render: (args) => {
    const outer = document.createElement("div");
    outer.style.display = "flex";
    outer.style.flexDirection = "column";
    outer.style.gap = "4px";
    document.body.appendChild(outer);

    for (const pos of ALL_POSITIONS) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";

      const label = document.createElement("div");
      label.textContent = pos;
      label.style.width = "130px";
      label.style.fontSize = "12px";
      label.style.fontFamily = "monospace";
      label.style.flexShrink = "0";
      row.appendChild(label);

      const container = document.createElement("div");
      container.style.flex = "1";
      row.appendChild(container);
      outer.appendChild(row);

      Chart(seafood)
        .flow(spread({ by: "lake",  dir: "x" }))
        .mark(rect({ h: "count" }).label("count", { position: pos, fontSize: 9 }))
        .render(container, { w: args.w, h: args.h, axes: false });
    }

    return outer;
  },
};

// ─── Label on spread (group label) ────────────────────────────────────────────
// The label is on the spread combinator, not on individual marks.
// Because the spread carries its own datum, resolveLabels keeps the label
// at the group level instead of propagating it down to each child rect.
// Result: one label per lake group, centred above the pair of bars.

export const LabelOnSpread: StoryObj<Args> = {
  name: "Label on Spread",
  args: { w: 500, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    Chart(seafood)
      .flow(spread({ by: "lake",  dir: "x", spacing: 50 }))
      .mark(async (d: any) => {
        const node = await Chart(d)
          .flow(stack({ by: "species",  dir: "x" }))
          .mark(rect({ h: "count" as any, fill: "species" as any }))
          .resolve();
        // Stamp datum so resolveLabels keeps the label at group level
        // instead of propagating it down to each species bar
        (node as any).datum = d[0];
        node.label("lake", { position: "outset-top-start", fontSize: 13, offset: 50, rotate: 60 });
        return node;
      })
      .render(container, { w: args.w, h: args.h, axes: false });
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
  render: (args) => {
    const container = initializeContainer();
    Chart(heatData, { color: gradient(["#e0f3ff", "#08519c"]) })
      .flow(table({ by: { x: "hour", y: "day" },  spacing: 4 }))
      .mark(
        rect({ fill: "value" }).label("value", { position: "center", fontSize: 11 })
      )
      .render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

// ─── Rotated labels ────────────────────────────────────────────────────────────
// Labels rotate clockwise for positive values, pivoting at the label's center.

export const Rotated: StoryObj<Args> = {
  name: "Rotate: diagonal labels",
  args: { w: 500, h: 300 },
  render: (args) => {
    const outer = document.createElement("div");
    outer.style.display = "flex";
    outer.style.flexDirection = "column";
    outer.style.gap = "8px";
    document.body.appendChild(outer);

    const cases: { label: string; rotate: number }[] = [
      { label: "rotate: 45°", rotate: 45 },
      { label: "rotate: -30°", rotate: -30 },
      { label: "rotate: 0°", rotate: 0 },
    ];

    for (const { label, rotate } of cases) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";

      const tag = document.createElement("div");
      tag.textContent = label;
      tag.style.width = "120px";
      tag.style.fontSize = "12px";
      tag.style.fontFamily = "monospace";
      tag.style.flexShrink = "0";
      row.appendChild(tag);

      const container = document.createElement("div");
      container.style.flex = "1";
      row.appendChild(container);
      outer.appendChild(row);

      Chart(seafood)
        .flow(spread({ by: "lake",  dir: "x" }))
        .mark(
          rect({ h: "count" }).label("count", { position: "outset-top", rotate })
        )
        .render(container, { w: args.w, h: args.h, axes: true });
    }

    return outer;
  },
};

// ─── Normalized stacked bar (population by age + gender) ──────────────────────
// Mirrors https://vega.github.io/vega-lite/examples/bar_stacked_normalize_labeled.html
// Each horizontal bar represents one age group; segments are Male / Female,
// normalized so every row spans 100%. Labels show the raw people count inside
// each segment in white text.

export const NormalizedStackedBarWithLabels: StoryObj<Args> = {
  name: "Normalized stacked bar – center labels",
  args: { w: 350, h: 400 },
  loaders: [async () => ({ population: await data["population.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();

    Chart(
      context.loaded.population.filter((row: any) => row.year === 2000) as any[],
      { color: palette({ Female: "#675193", Male: "#ca8861" }) }
    )
      .flow(
        // Decode the sex field to a readable string
        derive((d: any[]) =>
          d.map((row) => ({ ...row, sex: row.sex === 1 ? "Male" : "Female" }))
        ),
        // One row per age group, stacked horizontally
        spread({ by: "age",  dir: "y", reverse: true, spacing: 2 }),
        // Normalize within each age group so bars span 0→1
        derive((d: any[]) =>
          d.map((row) => ({
            ...row,
            proportion: row.people / sumBy(d, "people"),
          }))
        ),
        // Female left, Male right
        derive((d: any[]) => orderBy(d, "sex", "asc")),
        stack({ by: "sex",  dir: "x" })
      )
      .mark(
        rect({ w: "proportion", fill: "sex" }).label(
          (d: any) => {
            const row = Array.isArray(d) ? d[0] : d;
            return row.people;
          },
          { position: "center", color: "white" }
        )
      )
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// ─── position showcase ────────────────────────────────────────────────────────
// A single large rectangle with every position string rendered at its computed
// location. Blue = inset positions, amber = outset positions.

const SHOWCASE_POSITIONS: LabelPosition[] = [
  "center",
  "inset-top",
  "inset-top-start",
  "inset-top-end",
  "inset-bottom",
  "inset-bottom-start",
  "inset-bottom-end",
  "inset-left",
  "inset-left-start",
  "inset-left-end",
  "inset-right",
  "inset-right-start",
  "inset-right-end",
  "outset-top",
  "outset-top-start",
  "outset-top-end",
  "outset-bottom",
  "outset-bottom-start",
  "outset-bottom-end",
  "outset-left",
  "outset-left-start",
  "outset-left-end",
  "outset-right",
  "outset-right-start",
  "outset-right-end",
];

export const PositionShowcase: StoryObj = {
  name: "Position showcase – all positions on one rect",
  render: () => {
    const svgW = 700;
    const svgH = 460;
    const rectW = 320;
    const rectH = 200;
    const cx = svgW / 2;
    const cy = svgH / 2;
    const OFFSET = 14;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", String(svgW));
    svg.setAttribute("height", String(svgH));
    svg.style.fontFamily = "monospace";

    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("width", String(svgW));
    bg.setAttribute("height", String(svgH));
    bg.setAttribute("fill", "#f9fafb");
    svg.appendChild(bg);

    // Rectangle
    const mainRect = document.createElementNS(ns, "rect");
    mainRect.setAttribute("x", String(cx - rectW / 2));
    mainRect.setAttribute("y", String(cy - rectH / 2));
    mainRect.setAttribute("width", String(rectW));
    mainRect.setAttribute("height", String(rectH));
    mainRect.setAttribute("fill", "#dbeafe");
    mainRect.setAttribute("stroke", "#3b82f6");
    mainRect.setAttribute("stroke-width", "1.5");
    svg.appendChild(mainRect);

    // Crosshairs
    for (const [x1, y1, x2, y2] of [
      [cx - rectW / 2, cy, cx + rectW / 2, cy],
      [cx, cy - rectH / 2, cx, cy + rectH / 2],
    ] as [number, number, number, number][]) {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      line.setAttribute("stroke", "#93c5fd");
      line.setAttribute("stroke-dasharray", "3 3");
      svg.appendChild(line);
    }

    for (const pos of SHOWCASE_POSITIONS) {
      const { x, y } = calculateLabelOffset(pos, [rectW, rectH], {
        offset: OFFSET,
      });
      const lx = cx + x;
      const ly = cy - y; // negate: calculateLabelOffset uses y-up coords

      const isInset =
        pos === "center" || (pos as string).startsWith("inset");
      const color = isInset ? "#1d4ed8" : "#92400e";

      const dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", String(lx));
      dot.setAttribute("cy", String(ly));
      dot.setAttribute("r", "2.5");
      dot.setAttribute("fill", color);
      svg.appendChild(dot);

      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", String(lx));
      text.setAttribute("y", String(ly));
      text.setAttribute("fill", color);
      text.setAttribute("font-size", "9");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("text-anchor", getLabelTextAnchor(pos));
      text.textContent = pos;
      svg.appendChild(text);
    }

    const wrapper = document.createElement("div");
    wrapper.style.padding = "16px";
    wrapper.appendChild(svg);
    return wrapper;
  },
};
