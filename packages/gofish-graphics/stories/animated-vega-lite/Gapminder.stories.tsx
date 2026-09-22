/**
 * Gapminder — the *Animated Vega-Lite* update example (Zong, Pollock, Wootton,
 * Satyanarayan, IEEE VIS 2022), and the first version of GoFish's animation
 * surface (issue #831).
 *
 * The four stories are one picture read four ways. The SPATIAL TWIN lays the
 * time axis out as one panel per year across x, with a line threading each
 * country through the panels. ANIMATED is the same spec with the two spatial
 * constructs read on time instead: `time.sequence` in place of the `spread`,
 * `time.transition` in place of the `line`. The panels collapse onto one
 * another and the line becomes the moving dot that traced it. FRAME1955 and
 * PAUSED1975 are single frames, the first filtered by hand and the second the
 * animation held still.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  circle,
  filter,
  line,
  scatter,
  spread,
  time,
} from "../../src/lib";
import data from "vega-datasets";

const meta: Meta = {
  title: "Animated Vega-Lite/Gapminder",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 2000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

/**
 * The spatial twin of the animation: `spread` by year lays the time axis out
 * across x as eleven panels, `scatter` places each country inside its panel,
 * and the `line` threads ALONG the year tier — so the split is its complement,
 * one path per country, which is exactly the trajectory the animated version
 * would trace over time.
 */
export const SpatialTwin: StoryObj<Args> = {
  args: { w: 1150, h: 280 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    chart(gapminder, { legend: false })
      .flow(
        spread({ by: "year", dir: "x", spacing: 12 }),
        scatter({ by: "country", x: "fertility", y: "life_expect" })
      )
      .mark(circle({ r: 2.5, fill: "country" }))
      .layer(
        line({
          along: "year",
          stroke: "country",
          strokeWidth: 0.5,
          opacity: 0.5,
        })
      )
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};

/**
 * The animation itself. Beside the spatial twin above, two words changed:
 * `spread` became `time.sequence` and `line` became `time.transition`. Every
 * year is still laid out and still threaded; they are just laid out on top of
 * one another and threaded in time, so the thread is walked instead of drawn.
 *
 * Nothing says which countries correspond across years. The transition splits
 * on the complement of the sequence's field, the same rule that gives the
 * spatial twin one line per country, so the correspondence Animated Vega-Lite
 * spells `key: "country"` is inferred from the flow.
 */
export const Animated: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Gapminder Animated",
      description:
        "Fifty years of every country's fertility rate and life expectancy, played as an animation in which each country is one moving dot.",
    },
  },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    chart(gapminder, { legend: false })
      .flow(
        time.sequence({ by: "year", duration: 5000 }),
        scatter({ by: "country", x: "fertility", y: "life_expect" })
      )
      .mark(circle({ r: 4, fill: "country" }))
      .layer(time.transition())
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};

/**
 * The same animation held still at 1975, halfway through. `playing: false`
 * starts the clock paused and `at` puts the playhead where you want it, which
 * is what a screenshot needs and what a hand-scrubbed chart would write.
 */
export const Paused1975: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    chart(gapminder, { legend: false })
      .flow(
        time.sequence({ by: "year", playing: false, at: 1975 }),
        scatter({ by: "country", x: "fertility", y: "life_expect" })
      )
      .mark(circle({ r: 4, fill: "country" }))
      .layer(time.transition())
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};

/** One frame of the animation: the 1955 scatter the playback starts from. */
export const Frame1955: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    chart(gapminder, { legend: false })
      .flow(
        filter((d: any) => d.year === 1955),
        scatter({ by: "country", x: "fertility", y: "life_expect" })
      )
      .mark(circle({ r: 4, fill: "country" }))
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};
