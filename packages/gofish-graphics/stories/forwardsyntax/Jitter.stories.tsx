import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
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

/** About 1000 synthetic masses in three groups, from a seeded generator:
 *  normal, bimodal, and skewed (with a pile of tied values near 4500). */
const dense = (() => {
  let s = 12345;
  const rand = () =>
    (s = (1664525 * s + 1013904223) % 4294967296) / 4294967296;
  const normal = (mu: number, sd: number) =>
    mu +
    sd * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const rows: { group: string; mass: number }[] = [];
  for (let i = 0; i < 340; i++)
    rows.push({ group: "A", mass: Math.round(normal(3700, 420) / 25) * 25 });
  for (let i = 0; i < 330; i++)
    rows.push({
      group: "B (bimodal)",
      mass:
        Math.round(
          (rand() < 0.5 ? normal(3400, 250) : normal(4600, 300)) / 25
        ) * 25,
    });
  for (let i = 0; i < 330; i++)
    rows.push({
      group: "C (skewed)",
      mass: Math.round((3000 + 900 * -Math.log(1 - rand())) / 25) * 25,
    });
  return rows;
})();

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
