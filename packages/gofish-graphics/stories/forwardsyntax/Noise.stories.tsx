import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import { denseMasses as dense } from "../../src/data/denseMasses";
import {
  chart,
  circle,
  scatter,
  spread,
  Overlap,
} from "../../src/lib";

// Noise: `scatter`'s `overlap: noise()` spreads each dot along the axis no
// field places, inside an outline that follows how many dots share each part
// of the data axis. Each dot adds a small bell-shaped bump; the outline is the
// sum. `sina()` and `jitter()` are noise with other defaults.
const meta: Meta = {
  title: "Forward Syntax/Noise",
};
export default meta;

const weighed = penguins.filter((p) => p["Body Mass (g)"] !== null);

export const PenguinMass: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Penguin Mass Noise",
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
          overlap: Overlap.noise(),
        })
      )
      .mark(circle({ r: 3, fill: "Species" }))
      .render(container, { w: 560, h: 320 });

    return container;
  },
};

export const PenguinMassSina: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Penguin Mass Sina Plot",
      description:
        "Penguin body mass for each species as a sina plot: one dot per bird, spread inside the smooth violin outline of that species' mass distribution.",
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
          overlap: Overlap.sina(),
        })
      )
      .mark(circle({ r: 3, fill: "Species" }))
      .render(container, { w: 560, h: 320 });

    return container;
  },
};

// Classic jitter: uniform random offsets in a flat band.
export const PenguinMassJitter: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(weighed, { axes: true })
      .flow(
        spread({ by: "Species", dir: "y", spacing: 16 }),
        scatter({
          x: "Body Mass (g)",
          alignment: "middle",
          overlap: Overlap.jitter(),
        })
      )
      .mark(circle({ r: 3, fill: "Species" }))
      .render(container, { w: 560, h: 320 });

    return container;
  },
};

const denseStory = (overlap: Overlap.Overlap): StoryObj => ({
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

// The default: blue noise, smoothing 0 (no smoothing beyond the dots' size).
export const DenseDefault = denseStory(Overlap.noise({ padding: 0.5 }));
// A smoother outline: bells with a bandwidth of 100 g.
export const DenseSmoothing = denseStory(
  Overlap.noise({ padding: 0.5, smoothing: 100 })
);
// Quasirandom spreading, the fastest.
export const DenseQuasi = denseStory(
  Overlap.noise({ padding: 0.5, randomness: "quasi" })
);
// Sina: the bandwidth from Silverman's rule, per group.
export const DenseSina = denseStory(Overlap.sina({ padding: 0.5 }));
// Classic jitter: uniform offsets in a flat band.
export const DenseJitter = denseStory(Overlap.jitter({ padding: 0.5 }));
