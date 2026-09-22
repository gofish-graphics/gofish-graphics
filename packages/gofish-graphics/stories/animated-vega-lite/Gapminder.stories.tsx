/**
 * Gapminder — the *Animated Vega-Lite* update example (Zong, Pollock, Wootton,
 * Satyanarayan, IEEE VIS 2022), and the first version of GoFish's animation
 * surface (issue #831).
 *
 * The stories are one picture read several ways. The SPATIAL TWIN lays the
 * time axis out as one panel per year across x, with a line threading each
 * country through the panels. ANIMATED is the same spec with the two spatial
 * constructs read on time instead: `time.sequence` in place of the `spread`,
 * `time.transition` in place of the `line`. The panels collapse onto one
 * another and the line becomes the moving dot that traced it. FRAME1955 and
 * PAUSED1975 are single frames, the first filtered by hand and the second the
 * animation held still.
 *
 * SEQUENCE ONLY drops the transition: a sequence gives each keyframe a band of
 * time, so the chart holds a frame and then jumps, which is already an
 * animation. CURVES and CURVES PAUSED put that reading beside the three a
 * transition offers, four charts on one clock.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Frame,
  GoFish,
  chart,
  circle,
  filter,
  line,
  live,
  scatter,
  spread,
  spreadX,
  spreadY,
  text,
  time,
  timer,
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

/** The year field's own range. A `time.sequence` reads this off the data
 *  itself; a `timer` the chart shares with a readout has to be told it. */
const yearRange = (rows: any[]): [number, number] => {
  const years = rows.map((d) => Number(d.year));
  return [Math.min(...years), Math.max(...years)];
};

/**
 * The year the chart is showing, written large and pale in the plot's top
 * right — the readout Animated Vega-Lite's gapminder demo carries.
 *
 * It is a tier of its own, holding one row whose fields are the position it
 * sits at, so the label is placed by the chart's own x and y scales and stays
 * put when the chart is resized. `zOrder(-1)` puts it behind the dots, and
 * `live` keeps the string a paint-time patch rather than a re-resolve.
 */
const yearReadout = (clock: any) =>
  chart([{ fertility: 7.5, life_expect: 83 }])
    .flow(scatter({ x: "fertility", y: "life_expect" }))
    .mark(
      text({
        text: live(() => String(Math.floor(clock()))),
        fontSize: 48,
        fill: "#ccc",
      }).zOrder(-1)
    );

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

    const year = timer({ domain: yearRange(gapminder), duration: 5000 });

    chart(gapminder, { legend: false })
      .flow(
        time.sequence({ by: "year", on: year }),
        scatter({ by: "country", x: "fertility", y: "life_expect" })
      )
      .mark(circle({ r: 4, fill: "country" }))
      .layer(time.transition())
      .layer(yearReadout(year))
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

/**
 * The sequence on its own, with no transition layered over it.
 *
 * A sequence is `spread` read on time, and a spread gives each group a BAND —
 * so each year holds from its own value until the next year's arrives, and the
 * chart jumps from frame to frame. That is already an animation, and it is the
 * one Animated Vega-Lite's band scale on time plays. Layering a
 * `time.transition()` over it is what fills the gaps in.
 */
export const SequenceOnly: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    const year = timer({ domain: yearRange(gapminder), duration: 5000 });

    chart(gapminder, { legend: false })
      .flow(
        time.sequence({ by: "year", on: year }),
        scatter({ by: "country", x: "fertility", y: "life_expect" })
      )
      .mark(circle({ r: 4, fill: "country" }))
      .layer(yearReadout(year))
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};

/** How a panel reads the run. `null` is the sequence with nothing layered over
 *  it, which is what the step curve coincides with. */
type Reading = "step" | "linear" | "catmullRom" | null;

/** The four readings, left to right. */
const CURVES: { caption: string; curve: Reading }[] = [
  { caption: "no transition (sequence alone)", curve: null },
  { caption: "step: hold, then jump", curve: "step" },
  { caption: "linear", curve: "linear" },
  { caption: "catmullRom (default)", curve: "catmullRom" },
];

/** One panel of the comparison: the same animated scatter, read one way, on a
 *  clock it shares with the other three.
 *
 *  `padding: 0` for the same reason the bird-migration controls panel needs it:
 *  a chart's coord padding is drawn OUTSIDE its box, so in a composition it
 *  would paint over the neighbor the `spreadX` stacked against it. */
const curvePanel = (rows: any[], clock: any, curve: Reading) => {
  const keyframes = chart(rows, { legend: false, padding: 0 })
    .flow(
      time.sequence({ by: "year", on: clock }),
      scatter({ by: "country", x: "fertility", y: "life_expect" })
    )
    .mark(circle({ r: 4, fill: "country" }));
  return curve === null
    ? keyframes
    : keyframes.layer(time.transition({ curve }));
};

/** The whole comparison, on a clock the caller hands in — so the playing and
 *  the paused stories are one picture read at two playheads. */
const curvesRow = (
  container: HTMLElement,
  args: Args,
  rows: any[],
  clock: any,
  readings: { caption: string; curve: Reading }[] = CURVES
) =>
  GoFish(
    container,
    { w: args.w, h: args.h, legend: false, axes: true } as any,
    () =>
      spreadY({ spacing: 16, alignment: "middle" }, [
        text({
          text: live(() => String(Math.floor(clock()))),
          fontSize: 40,
          fill: "#ccc",
        }),
        spreadX(
          { spacing: 16, alignment: "end" },
          readings.map(({ caption, curve }) =>
            spreadY({ spacing: 8, alignment: "middle" }, [
              text({ text: caption, fontSize: 12, fill: "#555" }),
              Frame({ w: 240, h: 280 }, [curvePanel(rows, clock, curve)]),
            ])
          )
        ),
      ])
  );

/**
 * The four readings side by side, on ONE clock, so the difference between them
 * is the only thing moving.
 *
 * `on` is what makes that possible: a sequence normally builds its own clock,
 * and four charts would then keep four times. Handed a `timer`, all four play
 * the same playhead, and the year readout above the row reads it too.
 *
 * Watch the leftmost two: they are the same picture. A sequence holds each
 * keyframe until the next year arrives, and `curve: "step"` asks a transition
 * to do exactly that, so the transition has nothing left to add.
 */
export const Curves: StoryObj<Args> = {
  args: { w: 1160, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    // Ten seconds rather than five: the four readings differ most between
    // keyframes, and a slower clock spends longer there.
    const year = timer({ domain: yearRange(gapminder), duration: 10000 });
    curvesRow(container, args, gapminder, year);

    return container;
  },
};

/**
 * The three-panel cut for sharing: no interpolation, linear, smooth. The step
 * panel is left out because it is the same picture as the first one.
 */
export const CurvesThree: StoryObj<Args> = {
  args: { w: 880, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    const year = timer({ domain: yearRange(gapminder), duration: 10000 });
    curvesRow(container, args, gapminder, year, [
      { caption: "no interpolation", curve: null },
      { caption: "linear", curve: "linear" },
      { caption: "smooth (catmullRom)", curve: "catmullRom" },
    ]);

    return container;
  },
};

/**
 * The same four panels held at 1957.5, halfway between the 1955 and 1960
 * keyframes — the one moment that says what each reading does. A country's dot
 * sits at its 1955 position in the first two panels, halfway to 1960 in the
 * third, and slightly off that straight line in the fourth, where the spline
 * is already bending toward 1965.
 */
export const CurvesPaused: StoryObj<Args> = {
  args: { w: 1160, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    const year = timer({
      domain: yearRange(gapminder),
      duration: 10000,
      playing: false,
    });
    year.set(1957.5);
    curvesRow(container, args, gapminder, year);

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
