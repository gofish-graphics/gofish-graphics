/**
 * Gapminder, four ways: the desugaring tower under `time.sequence` and
 * `time.transition`.
 *
 * Each story is the same picture, with one more piece of the sugar written
 * out by hand. All four are held at the same playhead, 1957.5, halfway between
 * the 1955 and 1960 keyframes, where interpolation is actually doing work.
 *
 * Level 0 is the sugar: a sequence in the flow and a bare transition layered
 * over it. Level 1 writes out the key and the path tier, which is the same
 * expansion `line` has — name the marks, select them back, group by the
 * complement of the time field, and name the time field with `along`. Level 2
 * writes out the clock: the sequence becomes a plain `group({ by: "year" })`
 * and a raw `timer` is handed to the transition as `at`. Level 3 drops the
 * relational mark altogether and interpolates in data space, so an ordinary
 * scatter draws one row per country at the playhead's moment.
 *
 * The claim: levels 0 through 2 are REWRITES. They are the same computation
 * with different amounts of it inferred, and they agree exactly. Level 3 is
 * the upstream reading, and it is a different computation: it interpolates the
 * data and re-runs the whole pipeline, where the others interpolate the placed
 * geometry. It agrees with the others here only because a fixed-domain scatter
 * is affine in the quantities being interpolated, which is the condition the
 * animation design note states in section 4.1. The keyframes are still drawn
 * in level 3, as `blank()`, because they are what gives the axes their domains.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  blank,
  chart,
  circle,
  derive,
  group,
  interpolate,
  scatter,
  selectAll,
  time,
  timer,
} from "../../src/lib";
import data from "vega-datasets";

const meta: Meta = {
  title: "Animated Vega-Lite/Gapminder Tower",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 2000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

/** The moment every level in the tower is held at: halfway between the 1955
 *  and 1960 keyframes, so nothing is sitting on a keyframe and the four
 *  levels have to agree about an interpolated value rather than a stored one. */
const AT = 1957.5;
/** The year field's own range, which `time.sequence` reads off the data and a
 *  raw `timer` has to be told. */
const YEARS: [number, number] = [1955, 2005];

/** A paused clock parked at the shared playhead — what levels 2 and 3 use in
 *  place of the one a sequence would have owned. */
const pausedClock = () => {
  const clock = timer({ domain: YEARS, duration: 5000, playing: false });
  clock.set(AT);
  return clock;
};

/**
 * Level 0, the sugar. A sequence in the flow and a bare transition layered
 * over it; the key, the path tier and the clock are all inferred.
 */
export const L0Sugar: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    chart(gapminder, { legend: false })
      .flow(
        time.sequence({ by: "year", duration: 5000, playing: false, at: AT }),
        scatter({ by: "country", x: "fertility", y: "life_expect" })
      )
      .mark(circle({ r: 4, fill: "country" }))
      .layer(time.transition())
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};

/**
 * Level 1: the key and the path tier written out. This is the expansion a
 * bare `line()` gets too — name the marks, select them back in a tier of
 * their own, group by the complement of the path tier, and name the path tier
 * with `along`. The clock is still the sequence's, inherited by the layered
 * tier the same way that tier inherits the marks it connects.
 */
export const L1ExplicitKey: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    chart(gapminder, { legend: false })
      .flow(
        time.sequence({ by: "year", duration: 5000, playing: false, at: AT }),
        scatter({ by: "country", x: "fertility", y: "life_expect" })
      )
      .mark(circle({ r: 4, fill: "country" }).name("kf"))
      .layer(
        chart(selectAll("kf"))
          .flow(group({ by: "country" }))
          .mark(time.transition({ along: "year" }))
      )
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};

/**
 * Level 2: the clock written out. Nothing about `time.sequence` is left,
 * because there was nothing left to it: superimposing the keyframes is what
 * `group({ by: "year" })` already does, and the clock it owned is now a plain
 * `timer` handed to the transition as `at`.
 */
export const L2ExplicitClock: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];
    const year = pausedClock();

    chart(gapminder, { legend: false })
      .flow(
        group({ by: "year" }),
        scatter({ by: "country", x: "fertility", y: "life_expect" })
      )
      .mark(circle({ r: 4, fill: "country" }).name("kf"))
      .layer(
        chart(selectAll("kf"))
          .flow(group({ by: "country" }))
          .mark(time.transition({ along: "year", at: year }))
      )
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};

/**
 * Level 3: no relational mark at all. `interpolate` reads the whole table at
 * the playhead's moment and gives back one row per country, and an ordinary
 * scatter draws those rows. The keyframe tier is still here, drawn as
 * `blank()`, because it is what the axes get their domains from: without it
 * the scales would be inferred from one moment's rows and the chart would
 * rescale as it played.
 *
 * This is the upstream reading, not a rewrite of the others. It agrees with
 * them because the path from a row to a placed circle is affine in fertility
 * and life expectancy once the domains are fixed, so interpolating before
 * layout and interpolating after it land in the same place.
 */
export const L3DataSpace: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];
    const year = pausedClock();

    chart(gapminder, { legend: false })
      .flow(
        group({ by: "year" }),
        scatter({ by: "country", x: "fertility", y: "life_expect" })
      )
      .mark(blank())
      .layer(
        chart(gapminder)
          .flow(
            derive((rows: any[]) =>
              interpolate(rows, {
                along: "year",
                key: "country",
                at: year(),
              })
            ),
            scatter({ by: "country", x: "fertility", y: "life_expect" })
          )
          .mark(circle({ r: 4, fill: "country" }))
      )
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};
