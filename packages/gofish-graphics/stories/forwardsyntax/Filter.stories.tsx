import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import { chart, circle, field, filter, scatter } from "../../src/lib";

// `filter` with a field predicate: `field(name).between(lo, hi, { closed })`
// is data, so this chart serializes with a real `filter` operator and has a
// Python twin. The predicate also drops the birds with no recorded mass.
const meta: Meta = {
  title: "Forward Syntax/Filter",
};
export default meta;

export const FieldBetween: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(penguins, { axes: true })
      .flow(
        filter(field("Body Mass (g)").between(3500, 4500, { closed: "left" })),
        scatter({ x: "Flipper Length (mm)", y: "Beak Length (mm)" })
      )
      .mark(circle({ r: 3, fill: "Species" }))
      .render(container, { w: 400, h: 300 });

    return container;
  },
};
