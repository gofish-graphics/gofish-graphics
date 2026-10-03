import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import { chart, circle, scatter, spread, swarm } from "../../src/lib";
import {
  blueNoiseProto,
  quasirandomProto,
  uniformJitterProto,
} from "../../src/ast/graphicalOperators/overlapPrototypes";

// PROTOTYPE comparison, not gallery material: four ways to keep dots apart on
// a scatter's free axis, on the same data and the same layout as the gallery
// beeswarm (Forward Syntax/Swarm/PenguinMass). Uniform jitter, quasirandom
// and blue noise share one `width` (the largest offset from the line). The
// prototypes are internal (overlapPrototypes.ts), so they are cast to the
// public option type here.
const meta: Meta = {
  title: "Overlap prototypes",
};
export default meta;

type Strategy = Parameters<typeof scatter>[0]["overlap"];

const weighed = penguins.filter((p) => p["Body Mass (g)"] !== null);

/** About 1000 synthetic birds in three groups, from a seeded generator. */
const dense = (() => {
  let s = 12345;
  const rand = () => (s = (1664525 * s + 1013904223) % 4294967296) / 4294967296;
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
        Math.round((rand() < 0.5 ? normal(3400, 250) : normal(4600, 300)) / 25) *
        25,
    });
  for (let i = 0; i < 330; i++)
    rows.push({
      group: "C (skewed)",
      mass: Math.round((3000 + 900 * -Math.log(1 - rand())) / 25) * 25,
    });
  return rows;
})();

const NORMAL_WIDTH = 24;
const DENSE_WIDTH = 40;

const penguinStory = (overlap: Strategy): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    chart(weighed, { axes: true })
      .flow(
        spread({ by: "Species", dir: "y", spacing: 16 }),
        scatter({ x: "Body Mass (g)", alignment: "middle", overlap })
      )
      .mark(circle({ r: 3, fill: "Species" }))
      .render(container, { w: 560, h: 320 });
    return container;
  },
});

const denseStory = (overlap: Strategy): StoryObj => ({
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

// (a) Reference: the shipped beeswarm.
export const PenguinsA_Swarm = penguinStory(swarm({ padding: 1 }));
// (d) Plain random jitter in a fixed ±width band.
export const PenguinsD_UniformJitter = penguinStory(
  uniformJitterProto({ width: NORMAL_WIDTH, seed: 1 }) as unknown as Strategy
);
// (b) ggbeeswarm quasirandom: van der Corput by rank × KDE envelope.
export const PenguinsB_Quasirandom = penguinStory(
  quasirandomProto({ width: NORMAL_WIDTH }) as unknown as Strategy
);
// (c) Blue noise: Mitchell's best candidate inside the KDE envelope.
export const PenguinsC_BlueNoise = penguinStory(
  blueNoiseProto({
    width: NORMAL_WIDTH,
    padding: 1,
    k: 10,
    seed: 1,
  }) as unknown as Strategy
);

export const DenseA_Swarm = denseStory(swarm({ padding: 0.5 }));
export const DenseD_UniformJitter = denseStory(
  uniformJitterProto({ width: DENSE_WIDTH, seed: 1 }) as unknown as Strategy
);
export const DenseB_Quasirandom = denseStory(
  quasirandomProto({ width: DENSE_WIDTH }) as unknown as Strategy
);
export const DenseC_BlueNoise = denseStory(
  blueNoiseProto({
    width: DENSE_WIDTH,
    padding: 0.5,
    k: 10,
    seed: 1,
  }) as unknown as Strategy
);
