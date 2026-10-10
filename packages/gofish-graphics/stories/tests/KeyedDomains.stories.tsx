import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, stack, rect } from "../../src/lib";

// Checks for measure-keyed domains (#1114): a size never splits a domain.
// Not gallery-tagged: these are test-like checks.
const meta: Meta = {
  title: "Tests/Keyed Domains",
};
export default meta;

// The largest value is 1.1, in group B.
const values = [
  { group: "A", item: "p", value: 0.4 },
  { group: "A", item: "q", value: 0.7 },
  { group: "A", item: "r", value: 0.5 },
  { group: "B", item: "p", value: 1.1 },
  { group: "B", item: "q", value: 0.3 },
  { group: "B", item: "r", value: 0.8 },
  { group: "C", item: "p", value: 0.2 },
  { group: "C", item: "q", value: 0.6 },
  { group: "C", item: "r", value: 0.9 },
];

// Every inner group is 150px tall. The groups share the y domain, 0 to 1.1,
// so 1.1 maps to 150px in every group, and a bar of 0.55 is half as tall in
// group A as the bar of 1.1 in group B. The chart is 150px tall too, so its
// y axis lines up with the groups.
export const GroupedBarsInnerHeight: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(values)
      .flow(
        spread({ by: "group", dir: "x", spacing: 24 }),
        stack({ by: "item", dir: "x", h: 150 })
      )
      .mark(rect({ w: 20, h: "value", fill: "item" }))
      .render(container, { w: 300, h: 150, axes: true });
    return container;
  },
};

// A chart with its own size keeps its axes: it maps its keyed domains into
// its own w and h, and the render gives it no other size.
export const ChartOwnSize: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(values.filter((d) => d.group === "B"), { w: 240, h: 160 })
      .flow(spread({ by: "item", dir: "x", spacing: 12 }))
      .mark(rect({ w: 40, h: "value", fill: "item" }))
      .render(container, { axes: true });
    return container;
  },
};
