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
 *   is `history: Infinity`: every year the playhead has reached stays shown.
 * - The compiler's special case for lines (add rows between the years, drop
 *   the ones past the playhead, so the tip glides) is the cut GoFish makes at
 *   paint: a line threaded through a sequence's keyframes is drawn up to the
 *   playhead and cut there, at the exact point in data time. The tip is where
 *   a `time.transition()` dot would be at the same moment.
 *
 * ANIMATED is that port, line and all. PAUSED1979 holds it at 1979.5, halfway
 * through a year, so the cut inside a segment shows. WITH DOTS draws each
 * year's point too, styled like the static connected scatterplot, and each dot
 * appears as the line reaches it. MOVING DOT adds a `time.transition()` dot
 * that travels along the line's tip, leaving the year dots behind it as its
 * trail, and MOVING DOT PAUSED 1979 holds it still. COMET keeps only the last
 * ten years, so the line is cut at both ends, and COMET PAUSED 1979 holds it
 * still.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  circle,
  line,
  scatter,
  selectAll,
  time,
  timer,
} from "../../src/lib";
import { drivingShifts } from "../../src/data/drivingShifts";

const meta: Meta = {
  title: "Animated Vega-Lite/Connected Scatterplot",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 2000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

/** A point in time halfway through a year, where the line is cut inside a
 *  segment rather than on a knot. */
const AT = 1979.5;

/** The dots, styled like the static connected scatterplot
 *  (`stories/forwardsyntax/Scatter.stories.tsx`). */
const dot = () =>
  circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 });

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

    const year = timer({ domain: [1956, 2010], duration: 54 * 200 }); // 200 ms per year, AVL's band step

    chart(drivingShifts)
      .flow(
        time.sequence({ by: "year", on: year, history: Infinity }),
        scatter({ x: "miles", y: "gas" })
      )
      .mark(line({ along: "year", curve: "linear" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

/** The port held still halfway through 1979, so the line ends halfway along
 *  the segment from 1979 to 1980. */
export const Paused1979: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(drivingShifts)
      .flow(
        time.sequence({
          by: "year",
          playing: false,
          at: AT,
          history: Infinity,
        }),
        scatter({ x: "miles", y: "gas" })
      )
      .mark(line({ along: "year", curve: "linear" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

/**
 * Each year's dot, with the line layered over them. A dot is a keyframe, so it
 * shows once the playhead reaches its year, which is the moment the line's tip
 * arrives at it. The line's curve is left to its default, which smooths the
 * run with a Catmull-Rom spline, so this is also the cut inside a curve.
 */
export const WithDots: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();

    const year = timer({ domain: [1956, 2010], duration: 54 * 200 });

    chart(drivingShifts)
      .flow(
        time.sequence({ by: "year", on: year, history: Infinity }),
        scatter({ x: "miles", y: "gas" })
      )
      .mark(dot())
      .layer(line({ along: "year", stroke: "black", strokeWidth: 2 }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

/** The dots held still halfway through 1979: every dot up to 1979 is shown,
 *  and the line runs on halfway to 1980. */
export const WithDotsPaused1979: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(drivingShifts)
      .flow(
        time.sequence({
          by: "year",
          playing: false,
          at: AT,
          history: Infinity,
        }),
        scatter({ x: "miles", y: "gas" })
      )
      .mark(dot())
      .layer(line({ along: "year", stroke: "black", strokeWidth: 2 }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

/**
 * WITH DOTS plus a moving dot: the dots, the line threaded through them, and a
 * `time.transition()` over the same dots. The sequence keeps all its history,
 * so the transition draws one dot moving through the years and the year dots
 * stay behind it as its trail.
 *
 * The transition is a tier of its own over the dots (`selectAll("dots")`)
 * because `.layer(...)` reads the tier just before it, which here is the line.
 * It reads the sequence's clock like any transition over the sequence's
 * keyframes.
 *
 * Both the line and the transition are smooth, and both use the years as
 * their knots, so the moving dot rides exactly on the line's tip. A gliding
 * transition covers the time between two years, so each year's dot covers only
 * its own moment: it shows the moment the moving dot leaves it, and the trail
 * has no gap behind the moving dot.
 */
const movingDot = (sequence: Record<string, unknown>) =>
  chart(drivingShifts)
    .flow(
      time.sequence({ by: "year", history: Infinity, ...sequence } as any),
      scatter({ x: "miles", y: "gas" })
    )
    .mark(dot().name("dots"))
    .layer(line({ along: "year", stroke: "black", strokeWidth: 2 }))
    .layer(
      chart(selectAll("dots")).mark(
        time.transition({ fill: "#e4572e", stroke: "black", strokeWidth: 2 })
      )
    );

export const MovingDot: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();

    const year = timer({ domain: [1956, 2010], duration: 54 * 200 });
    movingDot({ on: year }).render(container, {
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

    movingDot({ playing: false, at: AT }).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

/** Only the last ten years: the line's tail is cut as well as its tip, so a
 *  ten-year stretch of the run travels along the path. */
export const Comet: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();

    const year = timer({ domain: [1956, 2010], duration: 54 * 200 });

    chart(drivingShifts)
      .flow(
        time.sequence({ by: "year", on: year, history: 10 }),
        scatter({ x: "miles", y: "gas" })
      )
      .mark(line({ along: "year", curve: "linear" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

/** The comet held still halfway through 1979: the line runs from halfway
 *  through 1969 to halfway through 1979, cut at both ends. */
export const CometPaused1979: StoryObj<Args> = {
  args: { w: 500, h: 500 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(drivingShifts)
      .flow(
        time.sequence({ by: "year", playing: false, at: AT, history: 10 }),
        scatter({ x: "miles", y: "gas" })
      )
      .mark(line({ along: "year", curve: "linear" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};
