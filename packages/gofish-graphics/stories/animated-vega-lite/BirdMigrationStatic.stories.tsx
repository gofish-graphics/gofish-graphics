/**
 * Panel A of the *Animated Vega-Lite* bird migration example (Fig. 1): the
 * static picture the ornithologist starts from. It is a pure spec, so it lives
 * in its own file, apart from the interactive panels B–E in
 * BirdMigration.stories.tsx, and has a Python parity port (#856).
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { birds } from "../../src/data/birds";
import { world110m } from "../../src/data/world110m";
import { chart, group, line, polygon, scatter, Coord } from "../../src/lib";

const meta: Meta = {
  title: "Animated Vega-Lite/Bird Migration Static",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

export const A_StaticLines: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bird Migration A: Static",
      description:
        "A static visualization of 72 bird species' yearly migrations, each species' daily positions threaded into one path over a map of the Americas.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    // The Americas under Equal Earth. The window is the original's framing:
    // its spec fits the world into 1000 px and clips at x = 400 px, a straight
    // line that is lon -180 at the equator on the left and passes through lon
    // -58.7 at lat 84 on the right, so Greenland is cut there as it is in the
    // original. `legend: false`: the bird layer colors
    // by species, and a 72-entry swatch column would take more of the canvas
    // than the map. The colors still come from the scale; only the chrome is
    // dropped.
    chart(world110m, {
      coord: Coord.geo("equalEarth", { lon: [-180, -58.7], lat: [-60, 84] }),
      legend: false,
      w: args.w,
      h: args.h,
    })
      .mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }))
      .layer(
        chart(birds)
          .flow(
            group({ by: "species" }),
            scatter({ by: "day", x: "lon", y: "lat" })
          )
          .mark(line({ stroke: "species", strokeWidth: 1, opacity: 0.5 }))
      )
      .render(container);

    return container;
  },
};
