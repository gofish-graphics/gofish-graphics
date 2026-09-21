/**
 * The running example of *Animated Vega-Lite* (Zong, Pollock, Wootton,
 * Satyanarayan, IEEE VIS 2022), one story per panel of the paper's Figure 1.
 *
 * This file starts with panel A, the static picture the ornithologist starts
 * from: 72 species' daily positions threaded into one path each, over a map of
 * the Americas drawn under `geo(...)`. The animated panels of the figure (hover,
 * the played year, trails, and the play/scrub controls) need the reactive pieces
 * — `timer()`, `filter()`, `live()` channels on a connector, and the low-level
 * widgets — and come in a follow-up PR.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { birds } from "../../src/data/birds";
import { world110m } from "../../src/data/world110m";
import {
  chart,
  geo,
  group,
  line,
  polygon,
  scatter,
} from "../../src/lib";

const meta: Meta = {
  title: "Animated Vega-Lite/Bird Migration",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

/** The Americas under Equal Earth — the basemap every panel shares. */
const basemap = (options: { padding?: number } = {}) =>
  chart(world110m, {
    coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
    ...options,
  }).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));

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

    basemap()
      .layer(
        chart(birds)
          .flow(
            group({ by: "species" }),
            scatter({ by: "day", x: "lon", y: "lat" })
          )
          .mark(line({ stroke: "species", strokeWidth: 1, opacity: 0.5 }))
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
