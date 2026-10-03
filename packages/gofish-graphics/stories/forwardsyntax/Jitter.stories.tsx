import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import { denseMasses as dense } from "../../src/data/denseMasses";
import { chart, circle, jitter, scatter, spread } from "../../src/lib";

// Jitter: `scatter`'s `overlap: jitter()` spreads each dot along the axis no
// field places, inside an outline that follows how many dots share each part
// of the data axis.
const meta: Meta = {
  title: "Forward Syntax/Jitter",
};
export default meta;

const weighed = penguins.filter((p) => p["Body Mass (g)"] !== null);

export const PenguinMass: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Penguin Mass Jitter",
      description:
        "Penguin body mass for each species as an evenly spread cloud of dots, one dot per bird, whose outline swells where many birds share a similar mass.",
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
          overlap: jitter(),
        })
      )
      .mark(circle({ r: 3, fill: "Species" }))
      .render(container, { w: 560, h: 320 });

    return container;
  },
};


const denseStory = (overlap: ReturnType<typeof jitter>): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    chart(dense, { axes: true })
      .flow(
        spread({ by: "group", dir: "y", spacing: 16 }),
        scatter({ x: "mass", alignment: "middle", overlap })
      )
      .mark(circle({ r: 2, fill: "group" }))
      .render(container, { w: 640, h: 420 });
    return container;
  },
});

// The default: blue noise in a dot-sized outline.
export const DenseDefault = denseStory(jitter({ padding: 0.5 }));
// A smoother outline: dots counted over 300 g.
export const DenseSmoothing = denseStory(
  jitter({ padding: 0.5, smoothing: 300 })
);
// Quasirandom spreading, the fastest.
export const DenseQuasi = denseStory(
  jitter({ padding: 0.5, randomness: "quasi" })
);
// Classic jitter: uniform offsets in a flat band.
export const DenseUniformFlat = denseStory(
  jitter({ padding: 0.5, randomness: "uniform", smoothing: Infinity })
);
