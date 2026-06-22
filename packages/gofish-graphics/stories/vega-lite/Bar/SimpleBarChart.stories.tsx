import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, rect } from "../../../src/lib";

// Mirrors: https://vega.github.io/vega-lite/examples/bar.html

const values = [
  { a: "A", b: 28 },
  { a: "B", b: 55 },
  { a: "C", b: 43 },
  { a: "D", b: 91 },
  { a: "E", b: 81 },
  { a: "F", b: 53 },
  { a: "G", b: 19 },
  { a: "H", b: 87 },
  { a: "I", b: 52 },
];

const meta: Meta = {
  title: "Vega-Lite/Simple Bar Chart",
  argTypes: {
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};

export default meta;

type Args = { h: number };

export const Default: StoryObj<Args> = {
  args: { h: 300 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Simple Bar Chart",
      description: "A simple vertical bar chart with one bar per category, each bar's height encoding its value.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(values, { axes: true })
      .flow(spread({ by: "a",  dir: "x" }))
      .mark(rect({ h: "b" }))
      // Intentionally omit width to cover the rect default-width fallback path.
      .render(container, { h: args.h });

    return container;
  },
};
