/**
 * Annotation layer — a bar chart with two component-level annotation tiers
 * added straight via `.layer(mark)`: a threshold rule (rect, its `y` in the
 * bars' count units) and a caption (text). No empty-data `chart()` scope is
 * needed — a datumless overlay is just a bare mark.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, rect, text, datum } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Annotation Layer",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

const data = [
  { cat: "a", count: 30 },
  { cat: "b", count: 80 },
  { cat: "c", count: 55 },
  { cat: "d", count: 72 },
];

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(data, { axes: true })
      .flow(spread({ by: "cat", dir: "x" }))
      .mark(rect({ h: "count", fill: "#6b9bd1" }))
      // Threshold rule: a bare rect tier. `datum(60)` is a data-space count
      // value, so it aligns with the bars' count scale; `w` spans the plot in
      // pixels. (A serializable data-space constant — round-trips to Python.)
      .layer(rect({ y: datum(60), h: 3, w: args.w, fill: "#333" }))
      // Caption: a bare text tier.
      .layer(text({ x: 20, y: 24, text: "threshold: 60", fill: "#333" }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
