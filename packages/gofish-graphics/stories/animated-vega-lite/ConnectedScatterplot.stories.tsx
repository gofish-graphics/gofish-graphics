/**
 * Connected scatterplot — the *Animated Vega-Lite* example (Zong, Pollock,
 * Wootton, Satyanarayan, IEEE VIS 2022) of a line drawn in over time: miles
 * driven per person against the price of gas, one point a year from 1956 to
 * 2010, after Hannah Fairfield's "Driving Shifts Into Reverse" in the New
 * York Times.
 *
 * How the Animated Vega-Lite spec reads in GoFish:
 *
 * - `mark: "line"` with x = miles and y = gas is `scatter({ x: "miles",
 *   y: "gas" })` in the flow and `line(...)` as the mark.
 * - `order: "year"` is `along: "year"`: the line threads the years in order.
 * - `time: { field: "year", scale: { type: "band", range: { step: 200 } } }`
 *   is `time.sequence({ by: "year", on: year })`, with a clock that spends
 *   200 ms on each year.
 * - The constant `key` is not needed. Animated Vega-Lite needs it to say that
 *   every row belongs to the same line. Here a line is split by every
 *   grouping in the flow except the one it runs along, and there is no other
 *   grouping, so every year is on one line already.
 * - The animation selection's predicate `{ field: "year", lte: anim_value }`
 *   is `time.history()` in the flow: every year the playhead has reached
 *   stays shown.
 * - The compiler's special case for lines (add rows between the years, drop
 *   the ones past the playhead, so the tip glides) is the cut GoFish makes at
 *   paint: a line threaded through a sequence's keyframes is drawn over the
 *   window of the marks it connects, here up to the playhead, and cut there,
 *   at the exact point in data time. The tip is where a moving dot would be at
 *   the same moment.
 *
 * ANIMATED is that port, line and all. PAUSED1979 holds it at 1979.5, halfway
 * through a year, so the cut inside a segment shows. WITH DOTS draws each
 * year's point too, styled like the static connected scatterplot, and each dot
 * appears as the line reaches it. MOVING DOT layers a dot that travels along
 * the line's tip over the year dots, and MOVING DOT PAUSED 1979 holds it
 * still. COMET keeps only the last ten years, so the line is cut at both ends,
 * and COMET PAUSED 1979 holds it still.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  animation,
  chart,
  circle,
  layer,
  line,
  scatter,
  time,
  timer,
} from "../../src/lib";
import { drivingShifts } from "../../src/data/drivingShifts";
import { pausedClock } from "./pausedClock";

const meta: Meta = {
  title: "Animated Vega-Lite/Connected Scatterplot",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 2000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };
type Clock = ReturnType<typeof timer>;

/** The years the data runs over, and one pass through them at 200 ms a year,
 *  Animated Vega-Lite's band step. */
const YEARS: [number, number] = [1956, 2010];
const DURATION = 54 * 200;

/** A point in time halfway through a year, where the line is cut inside a
 *  segment rather than on a knot. */
const AT = 1979.5;

/** The clock a playing story runs on, and the one a paused twin is held
 *  still on, at `AT`. */
const playing = (): Clock => timer({ domain: YEARS, duration: DURATION });
const paused = (): Clock => pausedClock(YEARS, DURATION, AT);

/** The dots, styled like the static connected scatterplot
 *  (`stories/forwardsyntax/Scatter.stories.tsx`). */
const dot = () =>
  circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 });

/** The keyframes every picture here plays through: one per year, placed by
 *  miles and gas. */
const years = (clock: Clock) =>
  chart(drivingShifts).flow(
    time.sequence({ by: "year", on: clock }),
    scatter({ x: "miles", y: "gas" })
  );

/** The port: the line alone, drawn in up to the playhead. Every year stays,
 *  so the line is drawn over everything the playhead has reached. */
const port = (clock: Clock) =>
  chart(drivingShifts)
    .flow(
      time.sequence({ by: "year", on: clock }),
      time.history(),
      scatter({ x: "miles", y: "gas" })
    )
    .mark(line({ along: "year", curve: "linear" }));

/**
 * The port. The line starts at 1956 and is drawn in, one year every 200 ms,
 * with its tip gliding through each year rather than jumping from point to
 * point.
 */
export const Animated: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Connected Scatter Plot Animated",
      description:
        "Fifty-five years of miles driven per person against the price of gas, with the line drawn in year by year as the animation plays.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    port(playing()).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

/** The port held still halfway through 1979, so the line ends halfway along
 *  the segment from 1979 to 1980. */
export const Paused1979: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();
    port(paused()).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

/**
 * Each year's dot, kept once reached, with the line layered over them. A dot
 * shows once the playhead reaches its year, which is the moment the line's tip
 * arrives at it, and the line is drawn over the same window as the dots it
 * connects. The line's curve is left to its default, which smooths the run
 * with a Catmull-Rom spline, so this is also the cut inside a curve.
 */
const withDots = (clock: Clock) =>
  years(clock)
    .mark(time.history([dot()]))
    .layer(line({ along: "year", stroke: "black", strokeWidth: 2 }));

export const WithDots: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();
    withDots(playing()).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

/** The dots held still halfway through 1979: every dot up to 1979 is shown,
 *  and the line runs on halfway to 1980. */
export const WithDotsPaused1979: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();
    withDots(paused()).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

/** The moving dot: orange, so it stands out from the year dots. */
const orangeDot = () =>
  circle({ r: 4, fill: "#e4572e", stroke: "black", strokeWidth: 2 });

/**
 * WITH DOTS plus a moving dot. Each year's mark is two layers: the year dot
 * kept once reached (`time.history`), and the moving dot, which on its own is
 * that year's dot shown during its year and, with `.transition({ update })`,
 * glides from year to year instead. The line is layered over the year marks,
 * whose lifetime is the longer of their two layers', so it is drawn up to the
 * playhead. Both the line and the moving dot are smooth, and both use the
 * years as their knots, so the moving dot rides exactly on the line's tip.
 */
const movingDot = (clock: Clock) =>
  years(clock)
    .mark(
      layer([
        time.history([dot()]),
        orangeDot().transition({ update: animation.tween() }),
      ])
    )
    .layer(line({ along: "year", stroke: "black", strokeWidth: 2 }));

export const MovingDot: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();
    movingDot(playing()).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });
    return container;
  },
};

/** The moving dot held still halfway through 1979: the year dots up to 1979
 *  stay behind, and the moving dot sits on the line's tip halfway to 1980. */
export const MovingDotPaused1979: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();
    movingDot(paused()).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });
    return container;
  },
};

/** Only the last ten years: the line's tail is cut as well as its tip, so a
 *  ten-year stretch of the run travels along the path. */
const comet = (clock: Clock) =>
  chart(drivingShifts)
    .flow(
      time.sequence({ by: "year", on: clock }),
      time.history({ last: 10 }),
      scatter({ x: "miles", y: "gas" })
    )
    .mark(line({ along: "year", curve: "linear" }));

export const Comet: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();
    comet(playing()).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

/** The comet held still halfway through 1979: the line runs from halfway
 *  through 1969 to halfway through 1979, cut at both ends. */
export const CometPaused1979: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();
    comet(paused()).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};
