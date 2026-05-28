import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { Chart, spread, stack, rect, derive, palette, gradient, assignGradientColor, layer, select } from "../../src/lib";
import { area, group } from "../../src/lib";
import { orderBy } from "lodash";
import { clock } from "../../src/ast/coordinateTransforms/clock";

const meta: Meta = {
  title: "Forward Syntax V3/Color Scales",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };
const defaultArgs = { w: 400, h: 400 };

// Numeric dataset: one value per item, suitable for gradient color demos
const scores = [
  { label: "A", value: 4 },
  { label: "B", value: 12 },
  { label: "C", value: 28 },
  { label: "D", value: 47 },
  { label: "E", value: 63 },
  { label: "F", value: 81 },
  { label: "G", value: 90 },
  { label: "H", value: 100 }
];

// Palette — named scheme (tableau10), colors cycle by species
export const PaletteNamedScheme: StoryObj<Args> = {
  name: "Palette / Named Scheme",
  args: defaultArgs,
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(seafood, { color: palette("tableau10") })
      .flow(spread({ by: "species",  dir: "x" }))
      .mark(rect({ h: "count", fill: "species" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// Palette — explicit string[] colors cycle by species
export const PaletteStringArray: StoryObj<Args> = {
  name: "Palette / String Array",
  args: defaultArgs,
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(seafood, { color: palette(["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00"]) })
      .flow(spread({ by: "species",  dir: "x" }))
      .mark(rect({ h: "count", fill: "species" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// Gradient — named scheme (blues), interpolates by numeric value
export const GradientNamedScheme: StoryObj<Args> = {
  name: "Gradient / Named Scheme",
  args: defaultArgs,
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(scores, { color: gradient("blues") })
      .flow(spread({ by: "label",  dir: "x" }))
      .mark(rect({ h: "value", fill: "value" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// Gradient — explicit string[] color stops, interpolates by numeric value
export const GradientStringArray: StoryObj<Args> = {
  name: "Gradient / String Array",
  args: defaultArgs,
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(scores, { color: gradient(["#f7fbff", "#42c663", "#6b0808"]) })
      .flow(spread({ by: "label",  dir: "x" }))
      .mark(rect({ h: "value", fill: "value" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// Paired bars — warm gradient for first of each pair, cold gradient for second
const pairedBars = [
  { pair: "P1", type: "warm", value: 20 },
  { pair: "P1", type: "cold", value: 20 },
  { pair: "P2", type: "warm", value: 45 },
  { pair: "P2", type: "cold", value: 45 },
  { pair: "P3", type: "warm", value: 70 },
  { pair: "P3", type: "cold", value: 70 },
  { pair: "P4", type: "warm", value: 90 },
  { pair: "P4", type: "cold", value: 90 },
];

const warmGradient = gradient(["#ffe0b2", "#e65100"]);
const coldGradient = gradient(["#bbdefb", "#0d47a1"]);

export const PairedPalettes: StoryObj<Args> = {
  name: "Paired / Warm + Cold Gradients",
  args: defaultArgs,
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(pairedBars)
      .flow(
        derive((d) => {
          const values = d.map((item) => item.value);
          const min = Math.min(...values);
          const max = Math.max(...values);
          return d.map((item) => {
            const t = max === min ? 0 : (item.value - min) / (max - min);
            const scale = item.type === "warm" ? warmGradient : coldGradient;
            return { ...item, color: assignGradientColor(scale, t) };
          });
        }),
        spread({ by: "pair",  dir: "x" }),
        stack({ by: "type",  dir: "x" })
      )
      .mark(rect({ h: "value", fill: "color" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// Nested derive — first half of lakes colored, Salmon highlighted within those
export const NestedDerive: StoryObj<Args> = {
  name: "Selective / Nested Derive",
  args: defaultArgs,
  render: (args: Args) => {
    const container = initializeContainer();

    const lakeOrder = ["Lake A", "Lake B", "Lake C", "Lake D", "Lake E", "Lake F"];

    Chart(seafood, {
      color: palette({
        "salmon-highlight": "#e15759",
        "first-half": "#4e79a7",
      }),
    })
      .flow(
        derive((d) =>
          d.map((item) => {
            const isFirstHalf = lakeOrder.indexOf(item.lake) < 3;
            const isSalmon = item.species === "Salmon";
            return {
              ...item,
              highlight:
                isFirstHalf && isSalmon
                  ? "salmon-highlight"
                  : isFirstHalf
                    ? "first-half"
                    : "",
            };
          })
        ),
        spread({ by: "lake",  dir: "x" }),
        stack({ by: "species",  dir: "x" })
      )
      .mark(rect({ h: "count", fill: "highlight" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// Selective via derive — compute a highlight field, color only matching rows
export const SelectiveDerive: StoryObj<Args> = {
  name: "Selective / Derive Highlight",
  args: defaultArgs,
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(seafood, { color: palette({ highlighted: "#e15759" }) })
      .flow(
        derive((d) =>
          d.map((item) => ({
            ...item,
            highlight: item.species === "Salmon" ? "highlighted" : ""
          }))
        ),
        spread({ by: "lake",  dir: "x" }),
        stack({ by: "species",  dir: "x" })
      )
      .mark(rect({ h: "count", fill: "highlight" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// Selective — only the mapped species is colored; others fall back to "#ccc"
export const SelectiveGroup: StoryObj<Args> = {
  name: "Selective / Highlight Group",
  args: defaultArgs,
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(seafood, { color: palette({ Salmon: "#e15759" }) })
      .flow(
        spread({ by: "lake",  dir: "x" }),
        stack({ by: "species",  dir: "x" })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// Ribbon — two highlighted species ribbons, others gray
export const RibbonHighlight: StoryObj<Args> = {
  name: "Ribbon / Two Highlighted",
  args: defaultArgs,
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      Chart(seafood, { color: palette({ Salmon: "#e15759", Trout: "#4e79a7" }) })
        .flow(
          spread({ by: "lake",  dir: "x", spacing: 64 }),
          derive((d) => orderBy(d, "count", "asc")),
          stack({ by: "species",  dir: "y" })
        )
        .mark(rect({ h: "count", fill: "species" }).name("bars")),
      Chart(select("bars"))
        .flow(group({ by: "species" }))
        .mark(area({ opacity: 0.6 })),
    ]).render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

// Rose — concentric rings, each lighter than the last via blues gradient
const NUM_RINGS = 6;
const NUM_SECTORS = 12;
const roseData = Array.from({ length: NUM_RINGS * NUM_SECTORS }, (_, i) => {
  const sector = i % NUM_SECTORS;
  const ring = Math.floor(i / NUM_SECTORS);
  return {
    sector: `S${sector + 1}`,
    ring,
    value: 2 + 25 * Math.abs(Math.sin(sector * 1.3) * Math.cos(ring * 0.9 + 1)),
  };
});

export const RoseGradient: StoryObj<Args> = {
  name: "Rose / Concentric Gradient",
  args: defaultArgs,
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(roseData, { color: gradient("blues"), coord: clock() })
      .flow(
        spread({ by: "sector", dir: "x", spacing: 0 }),
        stack({ by: "ring", dir: "y" }),
      )
      .mark(rect({ w: (Math.PI * 2) / NUM_SECTORS, emX: true, h: "value", fill: "ring" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};
