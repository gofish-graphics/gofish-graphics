import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import { chart, circle, scatter, spread, Overlap } from "../../src/lib";

// Beeswarms: `scatter`'s `overlap: separate()` moves each dot along the axis no
// field places, to the free spot nearest the alignment line.
const meta: Meta = {
  title: "Forward Syntax/Separate",
};
export default meta;

const weighed = penguins.filter((p) => p["Body Mass (g)"] !== null);

export const PenguinMass: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Penguin Mass Beeswarm",
      description:
        "A beeswarm of penguin body mass, one row per species, where each dot is one bird nudged up or down just enough to clear its neighbors, so the shape of every row shows how the masses are spread.",
    },
  },
  render: () => {
    const container = initializeContainer();

    chart(weighed, { axes: true })
      .flow(
        spread({ by: "Species", dir: "y", spacing: 16 }),
        scatter({
          x: "Body Mass (g)",
          alignment: "middle",
          overlap: Overlap.separate({ padding: 1 }),
        })
      )
      .mark(circle({ r: 3, fill: "Species" }))
      .render(container, { w: 560, h: 320 });

    return container;
  },
};

// One-sided: the dots grow up from the line at `start`.
export const OneSided: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(weighed, { axes: true })
      .flow(
        scatter({
          x: "Body Mass (g)",
          alignment: "start",
          overlap: Overlap.separate({ padding: 1 }),
        })
      )
      .mark(circle({ r: 3, fill: "Species" }))
      .render(container, { w: 560, h: 200 });

    return container;
  },
};

// Dots of different sizes: each pair keeps its two radii plus the padding
// apart.
export const MixedRadii: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(weighed.slice(0, 120), { axes: true })
      .flow(
        scatter({
          x: "Flipper Length (mm)",
          alignment: "middle",
          overlap: Overlap.separate({ padding: 1 }),
        })
      )
      .mark((d: (typeof weighed)[number]) =>
        circle({
          r: 2 + ((d["Body Mass (g)"] ?? 0) - 2700) / 600,
          fill: "Species",
        })(d)
      )
      .render(container, { w: 480, h: 200 });

    return container;
  },
};
