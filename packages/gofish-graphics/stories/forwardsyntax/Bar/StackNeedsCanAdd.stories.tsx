import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, stack, rect, Unit, Trait } from "../../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Bar/Stack Needs CanAdd",
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

// One dataset with a temperature column and a USD column, and three steps of
// one spec (from the GUGOG 2026 talk). With no schema, GoFish checks nothing
// and stacks the temperatures. With a schema, °C has no CanAdd, so GoFish
// refuses to stack "temp". USD declares Trait.summable(), so stacking "usd"
// passes. The numbers are illustrative.
const cities = [
  { month: "Jun", city: "Boston", temp: 21, usd: 120 },
  { month: "Jun", city: "Chicago", temp: 22, usd: 95 },
  { month: "Jul", city: "Boston", temp: 24, usd: 135 },
  { month: "Jul", city: "Chicago", temp: 25, usd: 110 },
  { month: "Aug", city: "Boston", temp: 23, usd: 150 },
  { month: "Aug", city: "Chicago", temp: 24, usd: 128 },
];

const schema = {
  temp: Unit("°C"),
  usd: Unit("USD", { traits: [Trait.summable()] }),
};

export const NoSchema: StoryObj<Args> = {
  args: { w: 460, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(cities, { w: args.w, h: args.h })
      .flow(spread({ by: "month", dir: "x" }), stack({ by: "city", dir: "y" }))
      .mark(rect({ h: "temp", fill: "city" }))
      .render(container);
    return container;
  },
};

// The spec is meant to be refused: the story shows the message GoFish throws
// (render rejects its promise) in place of the chart.
export const CelsiusRefused: StoryObj<Args> = {
  args: { w: 460, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(cities, { schema, w: args.w, h: args.h })
      .flow(spread({ by: "month", dir: "x" }), stack({ by: "city", dir: "y" }))
      .mark(rect({ h: "temp", fill: "city" }))
      .render(container)
      .then(
        () => console.error("Stacking °C was expected to throw"),
        (err: unknown) => {
          const box = document.createElement("pre");
          box.style.cssText =
            `width: ${args.w}px; box-sizing: border-box; margin: 0; ` +
            "padding: 12px 16px; white-space: pre-wrap; " +
            "font: 14px/1.4 monospace; color: #8a1c1c; background: #fdecec; " +
            "border: 1px solid #e3a0a0; border-radius: 4px;";
          box.textContent = err instanceof Error ? err.message : String(err);
          container.replaceChildren(box);
        }
      );
    return container;
  },
};

export const UsdStacks: StoryObj<Args> = {
  args: { w: 460, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(cities, { schema, w: args.w, h: args.h })
      .flow(spread({ by: "month", dir: "x" }), stack({ by: "city", dir: "y" }))
      .mark(rect({ h: "usd", fill: "city" }))
      .render(container);
    return container;
  },
};
