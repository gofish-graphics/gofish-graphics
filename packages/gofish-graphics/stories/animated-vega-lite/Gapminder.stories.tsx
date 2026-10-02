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
 * transition offers, four charts on one clock. CURVES KINEMATICS shows the
 * whole curve ladder (step, linear, monotone, smooth) and puts one country's
 * position, velocity and acceleration under each reading, on the same clock,
 * which is where the jerkiness of a straight reading, and the jumps in
 * acceleration of a curve that is only C1, become something you can point
 * at.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  frame,
  gofish,
  animation,
  chart,
  circle,
  filter,
  blank,
  layer,
  line,
  live,
  scatter,
  rect,
  spread,
  spreadX,
  spreadY,
  linear,
  text,
  time,
  timer,
} from "../../src/lib";
import { SMOOTH_CURVES, channelSpline } from "../../src/spline";
import { pausedClock } from "./pausedClock";
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

/** One panel's box, and the gap between two of them. The sparklines below the
 *  row are built from the same two numbers, so a sparkline sits exactly under
 *  the panel it reads. */
const PANEL_W = 240;
const PANEL_GAP = 16;

/** How a panel reads the run. `null` is the sequence with nothing layered over
 *  it, which is what the step curve coincides with. */
type Reading = "step" | "linear" | "monotone" | "smooth" | null;

/** A reading that moves the marks: every reading but the sequence alone. */
type Curve = Exclude<Reading, null>;

/** The four readings, left to right. */
const CURVES: { caption: string; curve: Reading }[] = [
  { caption: "no transition (sequence alone)", curve: null },
  { caption: "step: hold, then jump", curve: "step" },
  { caption: "linear", curve: "linear" },
  { caption: "monotone (default)", curve: "monotone" },
];

/** The three-panel cut: the step panel is left out because it is the same
 *  picture as the sequence alone. */
const CURVES_THREE: { caption: string; curve: Reading }[] = [
  { caption: "no interpolation", curve: null },
  { caption: "linear", curve: "linear" },
  { caption: "monotone", curve: "monotone" },
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

/** A row of panels, one per reading, each under its caption, on a clock the
 *  caller hands in — so the playing and the paused stories are one picture
 *  read at two playheads. `panel` draws a reading's panel. `panelW` is a
 *  panel's width, and `leadW` the width of an empty cell before the first
 *  panel, which leaves a column for the labels of what goes `below`. */
const curvesRow = <C,>(
  container: HTMLElement,
  args: Args,
  clock: any,
  readings: { caption: string; curve: C }[],
  panel: (curve: C) => any,
  below: any[] = [],
  { panelW = PANEL_W, leadW }: { panelW?: number; leadW?: number } = {}
) =>
  gofish(
    container,
    { w: args.w, h: args.h, legend: false, axes: true } as any,
    () =>
      spreadY({ spacing: 16, alignment: "middle" }, [
        text({
          text: live(() => String(Math.floor(clock()))),
          fontSize: 40,
          fill: "#ccc",
        }),
        spreadX({ spacing: PANEL_GAP, alignment: "end" }, [
          ...(leadW === undefined
            ? []
            : [rect({ w: leadW, h: 1, fill: "none" })]),
          ...readings.map(({ caption, curve }) =>
            spreadY({ spacing: 8, alignment: "middle" }, [
              text({ text: caption, fontSize: 12, fill: "#555" }),
              frame({ w: panelW, h: 280 }, [panel(curve)]),
            ])
          ),
        ]),
        ...below,
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
    curvesRow(container, args, year, CURVES, (curve) =>
      curvePanel(gapminder, year, curve)
    );

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
    curvesRow(container, args, year, CURVES_THREE, (curve) =>
      curvePanel(gapminder, year, curve)
    );

    return container;
  },
};

/** The four readings of the curve ladder, left to right, each captioned with
 *  what it guarantees. The kinematics stories read these. */
const LADDER: { caption: string; curve: Curve }[] = [
  { caption: "step: hold, then jump", curve: "step" },
  { caption: "linear: C0, velocity jumps", curve: "linear" },
  { caption: "monotone: C1, no overshoot", curve: "monotone" },
  { caption: "smooth: C1, rounds peaks", curve: "smooth" },
];
/** The kinematics stories' panels are narrower than the other rows', so four
 *  of them fit across beside the column of sparkline labels. */
const LADDER_PANEL_W = 200;

/** The country the sparklines read, and the channel they read. Jamaica's life
 *  expectancy changes direction several times over the run, by amounts of the
 *  same order, so every keyframe leaves a mark of comparable size, and the
 *  turns are where the curves differ: `smooth` rounds the 1980 and 1990 peaks a
 *  little past the data, while the knots of the other candidates tell the
 *  curves apart less. Rwanda's 1990s crash is one smooth fall and recovery
 *  that every curve follows closely (`smooth` passes its points by 0.4% of
 *  its range, against Jamaica's 0.5%). China has one huge event in it (1960), which
 *  puts one spike on each chart and leaves the rest of the run looking
 *  flat. */
const SPARK_COUNTRY = "Jamaica";
const SPARK_FIELD = "life_expect";
/** How many samples of each KEYFRAME INTERVAL a sparkline is drawn from. The
 *  sampling is per interval rather than across the whole run so that nothing
 *  is ever averaged across a keyframe: every quantity here is defined one
 *  interval at a time, and the ones that jump at a keyframe jump because two
 *  samples sit on either side of it rather than because a difference reached
 *  across it. A straight segment needs two samples and a curve needs a few
 *  dozen, so the intervals that are straight ask for fewer. */
const SPARK_PER_INTERVAL = 20;
/** The nudge, in years, that lets a riser be vertical. A vertical step wants
 *  two samples at ONE time with two different values, and two such samples
 *  would collide: the sparkline groups its samples by time, and the moving
 *  dot's transition would be handed a run with a zero-length interval in it.
 *  So the second sample is moved a thousandth of a year along instead, which
 *  is a hundredth of a pixel wide on screen and still strictly increasing. */
const SPARK_EPS = 1e-3;
/** One sparkline's height, and the layout numbers that line the sparklines
 *  up under the panels. A panel's y-axis chrome is drawn outside its box,
 *  which pushes the panels apart by roughly 29px more than the `spacing`
 *  says. The sparklines have no chrome, so they are told that number
 *  (`SPARK_GAP`), and the label column under the row's empty lead cell is
 *  wider by the same amount, for the first panel's chrome. Both were read off
 *  a render, and both are cosmetic: a wrong number leaves the sparklines a few
 *  pixels off their panel, nothing more. */
const SPARK_H_PX = 70;
const PANEL_CHROME = 29;
const SPARK_GAP = PANEL_GAP + PANEL_CHROME;
/** The width of `n` sparklines side by side, one under each of `n` panels. */
const sparkW = (n: number) => n * LADDER_PANEL_W + (n - 1) * SPARK_GAP;
/** The width of the empty cell that leads the row of panels, and of the
 *  label column under it. */
const LEAD_W = 70;

/** What is plotted: where the value is, how fast it is moving, and how fast
 *  that is changing. */
const QUANTITIES = ["position", "velocity", "acceleration"] as const;
type Quantity = (typeof QUANTITIES)[number];

type Sample = { t: number; method: string; value: number };

/**
 * One country's run under each reading, with its velocity and acceleration.
 *
 * Every polyline here is assembled interval by interval, so that a quantity
 * which jumps at a keyframe is DRAWN jumping: the sample before the jump and
 * the sample after it sit a thousandth of a year apart, and the segment
 * between them is a vertical riser. Nothing is smoothed and nothing is
 * differenced across a keyframe, because the whole point of the picture is
 * what happens at the keyframes.
 *
 * Some of these quantities are not functions. Under the STEP reading the
 * position holds, then jumps at each keyframe by some amount J. Its velocity
 * is zero except at the keyframes, where it is an impulse of weight J:
 * infinitely tall and infinitely brief. An impulse cannot be plotted, so what
 * is drawn is the comb of weights, a zero line with a vertical spike of
 * height J at each keyframe. It is a picture OF the impulses, not of a
 * function. The acceleration is the derivative of an impulse, a doublet,
 * drawn the usual way as a spike of J up and then one of J down, side by
 * side. Under the LINEAR reading the position is a chain of straight
 * segments, its velocity a staircase of plateaus joined by risers, and its
 * acceleration a comb of impulses whose weights are the jumps in velocity.
 *
 * Under the two smooth readings all three quantities are functions, and
 * they come from `channelSpline(...).jet`: exact derivatives of the very
 * curve the transition above is following. The velocity is continuous for
 * both. The acceleration of `monotone` and `smooth` is finite but jumps at
 * the knots (they are only C1), so each interval is sampled just inside its
 * own ends and the intervals are joined by risers, which is what makes the
 * jumps read as jumps rather than as a steep ramp.
 */
const kinematics = (rows: any[]): Record<Quantity, Sample[]> => {
  const run = rows
    .filter((d) => d.country === SPARK_COUNTRY)
    .map((d) => ({ t: Number(d.year), v: Number(d[SPARK_FIELD]) }))
    .sort((a, b) => a.t - b.t);
  const knots = run.map((r) => r.t);
  const values = run.map((r) => r.v);
  const last = knots.length - 1;

  const out: Record<Quantity, Sample[]> = {
    position: [],
    velocity: [],
    acceleration: [],
  };
  const at = (q: Quantity, method: string, t: number, value: number) =>
    out[q].push({ t, method, value });

  // ── The step reading ─────────────────────────────────────────────────
  // The jump at keyframe k, and where its spike is drawn: on the keyframe,
  // except the last one, whose spike is drawn just before it so that it
  // stays inside the run.
  const jump = (k: number) => values[k] - values[k - 1];
  const spikeAt = (k: number) => knots[k] - (k === last ? 2 * SPARK_EPS : 0);

  at("position", "step", knots[0], values[0]);
  for (let k = 1; k <= last; k++) {
    at("position", "step", knots[k] - SPARK_EPS, values[k - 1]);
    at("position", "step", knots[k], values[k]);
  }

  at("velocity", "step", knots[0], 0);
  for (let k = 1; k <= last; k++) {
    at("velocity", "step", spikeAt(k) - SPARK_EPS, 0);
    at("velocity", "step", spikeAt(k), jump(k));
    at("velocity", "step", spikeAt(k) + SPARK_EPS, 0);
  }

  at("acceleration", "step", knots[0], 0);
  for (let k = 1; k <= last; k++) {
    const c = spikeAt(k);
    at("acceleration", "step", c - SPARK_EPS, 0);
    at("acceleration", "step", c - SPARK_EPS / 2, jump(k));
    at("acceleration", "step", c, 0);
    at("acceleration", "step", c + SPARK_EPS / 2, -jump(k));
    at("acceleration", "step", c + SPARK_EPS, 0);
  }

  // ── The linear reading ────────────────────────────────────────────────
  // The velocity of interval i, in years of life expectancy per year.
  const v = knots
    .slice(0, last)
    .map((t, i) => (values[i + 1] - values[i]) / (knots[i + 1] - t));

  for (let i = 0; i <= last; i++) at("position", "linear", knots[i], values[i]);

  for (let i = 0; i < last; i++) {
    // The plateau. Its left end is nudged past the keyframe for every
    // interval but the first, so the riser from the previous plateau has a
    // width to be drawn in rather than two samples at one time.
    at("velocity", "linear", knots[i] + (i > 0 ? SPARK_EPS : 0), v[i]);
    at("velocity", "linear", knots[i + 1], v[i]);
  }

  at("acceleration", "linear", knots[0], 0);
  for (let i = 1; i < last; i++) {
    at("acceleration", "linear", knots[i] - SPARK_EPS, 0);
    at("acceleration", "linear", knots[i], v[i] - v[i - 1]);
    at("acceleration", "linear", knots[i] + SPARK_EPS, 0);
  }
  at("acceleration", "linear", knots[last], 0);

  // ── The smooth readings ───────────────────────────────────────────────
  for (const curve of SMOOTH_CURVES) {
    const spline = channelSpline(curve, knots, values);
    for (let i = 0; i < last; i++) {
      const span = knots[i + 1] - knots[i];
      for (let s = 0; s <= SPARK_PER_INTERVAL; s++) {
        const u = s / SPARK_PER_INTERVAL;
        const t = knots[i] + span * u;
        // Position and velocity are continuous across a knot, so the shared
        // endpoint is emitted once, by the interval on its left.
        if (i === 0 || s > 0) {
          const [position, velocity] = spline.jet(i, u);
          at("position", curve, t, position);
          at("velocity", curve, t, velocity);
        }
        // Acceleration can have two values at a knot. Sample just inside
        // both ends of the interval instead, which takes the one-sided limits
        // and leaves the pair of them to be joined by a riser.
        const tA =
          t + (s === 0 ? SPARK_EPS : s === SPARK_PER_INTERVAL ? -SPARK_EPS : 0);
        at("acceleration", curve, tA, spline.jet(i, (tA - knots[i]) / span)[2]);
      }
    }
  }
  return out;
};

/** The samples, spread by method and placed at `(t, value)`, marked with an
 *  invisible circle for the curve or the dot to be layered over. Both of
 *  `sparkRow`'s charts are this one, so they infer the same scales.
 *
 *  The samples are marked with the SAME invisible circle in both, and only
 *  then threaded. A mark claims room for its own width, so a chart of 2.5px
 *  circles insets its plot by 2.5px and a chart of sizeless marks does not —
 *  and the dot would then ride a few pixels off the curve wherever the curve
 *  is steep. */
const sparkSamples = (samples: Sample[]) =>
  chart(samples, { legend: false, axes: false, padding: 0 })
    .flow(
      spread({ by: "method", dir: "x", spacing: SPARK_GAP, axes: false }),
      scatter({ by: "t", x: "t", y: "value", axes: false })
    )
    .mark(circle({ r: 2.5, opacity: 0 }));

/**
 * Sparklines for some of the readings, one per reading, and the dot that
 * walks them. `w` is the width they share.
 *
 * The readings are ONE chart, `spread` by method across x, which is what
 * makes the curves comparable: a chart resolves its scales over all of its
 * rows, so every sparkline in it is drawn against the same y domain, without
 * a domain ever being written down.
 *
 * The moving dot is a `time.transition` read on the samples themselves. The
 * samples are a run of keyframes like any other — `along: "t"` names their
 * time field and `at` hands the transition the clock the panels share — so
 * the transition paints one dot per run and slides it along the sampled
 * curve. The samples' own marks are there to be moved between rather than
 * seen, so they are drawn at `opacity: 0` and the transition supplies the
 * paint. This is the spelled-out form of the sugar the panels use, the one
 * `GapminderTower` calls level 2, and it needs no sequence: nothing here is
 * held and then jumped from, the dot only moves.
 *
 * The dot is a SECOND chart over the same samples, stacked on the curves in
 * one frame, rather than a `.layer(...)` tier inside the first: a transition
 * paints one shape per run, and layered inside it would find the line's own
 * per-sample marks in its run beside the dots. Both charts read the same rows
 * through the same flow with the same mark, so they infer the same scales and
 * land on the same pixels.
 */
const sparkRow = (samples: Sample[], clock: any, w: number) =>
  // A sparkline is a chart with no axes, and the coordinate frame is what says
  // so here: the whole picture is rendered with `axes: true`, an embedded
  // chart's own `axes: false` option is only read when that chart renders
  // itself, and an `axes: false` on the operators only silences the operator
  // that carries it, not the frame above it that ends up drawing the axis. A
  // coordinate frame owns its space, so no Cartesian axis is drawn inside one.
  frame({ w, h: SPARK_H_PX, coord: linear(), padding: 0 }, [
    frame({ w, h: SPARK_H_PX }, [
      sparkSamples(samples)
        // `curve: "linear"` is not a default worth leaning on here, it is
        // the whole point: an omitted curve is `auto`, and `auto` over a
        // continuous axis smooths with a monotone cubic — which would round the
        // corners off the staircase and turn the impulses into bumps, drawing
        // the smooth reading of a picture whose subject is that the readings
        // differ. The samples are already dense wherever a curve bends.
        .layer(line({ stroke: "#999", strokeWidth: 1, curve: "linear" })),
    ]),
    frame({ w, h: SPARK_H_PX }, [
      sparkSamples(samples).layer(
        time.transition({
          along: "t",
          at: clock,
          curve: "linear",
          fill: "#e4572e",
          opacity: 1,
        })
      ),
    ]),
  ]);

/**
 * The block of sparklines that sits under the row of panels: one row per
 * quantity, each row a label in the leftmost column and a sparkline under
 * each panel.
 */
const kinematicsBlock = (rows: any[], clock: any) => {
  const samples = kinematics(rows);
  return [
    // A panel draws its x-axis BELOW its box, in space the layout does not
    // know about, so the row's 16px of breathing room is already spent by the
    // time the sparklines arrive. This empty rect buys the axis its room back.
    rect({ w: 1, h: 36, fill: "none" }),
    spreadY(
      { spacing: 8, alignment: "middle" },
      QUANTITIES.map((q) =>
        spreadX({ spacing: PANEL_GAP, alignment: "middle" }, [
          // The label's cell is as wide as the row's lead cell plus the first
          // panel's chrome, and an empty `rect` is what gives it that width:
          // a `frame`'s own `w` sizes the box it lays out in, but a lone text
          // mark does not fill it, so the cell would collapse to the word.
          frame({ w: LEAD_W + PANEL_CHROME, h: SPARK_H_PX }, [
            rect({ w: LEAD_W + PANEL_CHROME, h: SPARK_H_PX, fill: "none" }),
            text({ text: q, fontSize: 11, fill: "#888" }),
          ]),
          // The step column is a chart of its own, with its own scale: its
          // velocity and acceleration are combs of impulse weights, which
          // are amounts, not rates, and would flatten every other curve in
          // the row. The other four share one scale.
          spreadX({ spacing: SPARK_GAP }, [
            sparkRow(
              samples[q].filter((d) => d.method === "step"),
              clock,
              sparkW(1)
            ),
            sparkRow(
              samples[q].filter((d) => d.method !== "step"),
              clock,
              sparkW(LADDER.length - 1)
            ),
          ]),
        ])
      )
    ),
  ];
};

/**
 * One panel of the curve ladder, with the sparklines' country picked out.
 *
 * Every country still moves, read with the panel's curve, but faded to grey,
 * so the others give context without competing. Over them, two charts of the
 * one country's rows are layered: its whole path through all of its years,
 * drawn with the panel's curve along the year, and its moving dot, larger
 * and darker, read with the same curve. The path is a `line` over the
 * country's own keyframes and the dot a `time.transition` over the same
 * keyframes on the same clock, so the dot rides exactly on the path: both
 * read one data-space curve over the years. The path is not threaded through
 * the sequence, so it is drawn whole, and shows where the dot is heading.
 * The layered charts place their marks by the same fields as the panel, so
 * they share its x and y scales.
 */
const highlightPanel = (rows: any[], clock: any, curve: Curve) => {
  const own = rows.filter((d) => d.country === SPARK_COUNTRY);
  const place = scatter({ x: "fertility", y: "life_expect" });
  return chart(rows, { legend: false, padding: 0 })
    .flow(
      time.sequence({ by: "year", on: clock }),
      scatter({ by: "country", x: "fertility", y: "life_expect" })
    )
    .mark(circle({ r: 4, fill: "#bbb", opacity: 0.35 }))
    .layer(time.transition({ curve: curve }))
    .layer(
      chart(own)
        .flow(scatter({ by: "year", x: "fertility", y: "life_expect" }))
        .mark(blank())
        .layer(
          line({
            along: "year",
            curve: curve,
            stroke: "#e4572e",
            strokeWidth: 1.5,
          })
        )
    )
    .layer(
      chart(own)
        .flow(time.sequence({ by: "year", on: clock }), place)
        .mark(circle({ r: 6, fill: "#e4572e", stroke: "#fff", strokeWidth: 1.5 }))
        .layer(time.transition({ curve: curve }))
    );
};

/**
 * The curve ladder with the reason underneath it: step, linear, monotone and
 * smooth, and under each one country's position, velocity and acceleration.
 *
 * The panels say what the readings look like; the sparklines say why. Read
 * across the velocity row: it is a comb of impulses under step and a
 * staircase that changes value instantly at each keyframe under linear, and
 * a continuous curve under the other two. Read across the acceleration
 * row: doublets under step, impulses under linear, and a curve that jumps at
 * each keyframe under monotone and smooth. A spike or a jump in acceleration
 * is what the eye reads as a jolt.
 *
 * Everything moves on one clock, the dots on the sparklines included, so at
 * any moment the dots mark the state the panels above them are drawing.
 */
export const CurvesKinematics: StoryObj<Args> = {
  args: { w: 1180, h: 620 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    const year = timer({ domain: yearRange(gapminder), duration: 10000 });
    curvesRow(
      container,
      args,
      year,
      LADDER,
      (curve) => highlightPanel(gapminder, year, curve),
      kinematicsBlock(gapminder, year),
      { panelW: LADDER_PANEL_W, leadW: LEAD_W }
    );

    return container;
  },
};

/**
 * The same picture held at 1957.5, halfway between the 1955 and 1960
 * keyframes: the one moment that says what each reading does, with the dots on
 * the sparklines marking the position, velocity and acceleration each reading
 * has there.
 */
export const CurvesKinematicsPaused: StoryObj<Args> = {
  args: { w: 1180, h: 620 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    const year = pausedClock(yearRange(gapminder), 10000, 1957.5);
    curvesRow(
      container,
      args,
      year,
      LADDER,
      (curve) => highlightPanel(gapminder, year, curve),
      kinematicsBlock(gapminder, year),
      { panelW: LADDER_PANEL_W, leadW: LEAD_W }
    );

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

    const year = pausedClock(yearRange(gapminder), 10000, 1957.5);
    curvesRow(container, args, year, CURVES, (curve) =>
      curvePanel(gapminder, year, curve)
    );

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

/** The countries the trail stories follow: few enough that every trail can be
 *  read, and each with a turn in it (China's famine around 1960, Rwanda's
 *  genocide in the 1990s, South Africa's life expectancy falling after 1990). */
const TRAIL_COUNTRIES = [
  "China",
  "India",
  "United States",
  "Rwanda",
  "South Africa",
];

/**
 * Gapminder with trails. Each country is a dot moving through the years, and
 * it leaves its past years behind it: a faint dot for each year it has passed
 * and a line threaded through them.
 *
 * Each year's mark is two layers. The faint dot is kept once reached
 * (`time.history`), which is the trail. The solid dot is the head: on its own
 * it is that year's dot, shown during its year, and with
 * `.transition({ update })` it glides from year to year instead. The line is
 * layered over the year marks, and is drawn over the window of the marks it
 * connects, the longer of their two layers', so it runs up to the playhead.
 * The head is always at the tip of its line, because the line and the head's
 * tween use the same curve, with the years as its knots.
 */
const trails = (
  rows: any[],
  clock: any,
  curve: "linear" | "monotone",
  options: Record<string, unknown> = {}
) =>
  chart(
    rows.filter((d) => TRAIL_COUNTRIES.includes(d.country)),
    options
  )
    .flow(
      time.sequence({ by: "year", on: clock }),
      scatter({ by: "country", x: "fertility", y: "life_expect" })
    )
    .mark(
      layer([
        time.history([circle({ r: 4, fill: "country", opacity: 0.3 })]),
        circle({ r: 4, fill: "country" }).transition({
          update: animation.tween({ curve }),
        }),
      ])
    )
    .layer(
      line({
        along: "year",
        stroke: "country",
        strokeWidth: 1.5,
        opacity: 0.6,
        curve,
      })
    );

export const Trails: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Gapminder Trails",
      description:
        "Five countries' fertility rate and life expectancy from 1955 to 2005, each a dot moving through the years that leaves a trail of its past years behind it.",
    },
  },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    const year = timer({ domain: yearRange(gapminder), duration: 10000 });
    trails(gapminder, year, "monotone")
      .layer(yearReadout(year))
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};

/** The trails held still at 1997.5, halfway between 1995 and 2000: every year
 *  up to 1995 is behind each moving dot, and Rwanda's dot is on its way back
 *  up from its fall in the early 1990s. */
export const TrailsPaused: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    const year = pausedClock(yearRange(gapminder), 10000, 1997.5);
    trails(gapminder, year, "monotone")
      .layer(yearReadout(year))
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};

/** The two gliding curves side by side on one clock: straight segments on
 *  the left, the smooth curve on the right. Each moving dot stays on the tip
 *  of its own line either way, because the line and the transition in a panel
 *  use the same curve. */
const TRAIL_CURVES = (["linear", "monotone"] as const).map((curve) => ({
  caption: curve,
  curve,
}));

const trailCurvesRow = (
  container: HTMLElement,
  args: Args,
  rows: any[],
  clock: any
) =>
  curvesRow(container, args, clock, TRAIL_CURVES, (curve) =>
    trails(rows, clock, curve, { legend: false, padding: 0 })
  );

export const TrailsCurves: StoryObj<Args> = {
  args: { w: 600, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    const year = timer({ domain: yearRange(gapminder), duration: 10000 });
    trailCurvesRow(container, args, gapminder, year);

    return container;
  },
};

/** The two curves held still at 1967.5, after China's trail has turned
 *  through its 1960 famine: the straight segments meet at a corner at 1960,
 *  and the smooth curve swings round it. */
export const TrailsCurvesPaused: StoryObj<Args> = {
  args: { w: 600, h: 400 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    const year = pausedClock(yearRange(gapminder), 10000, 1967.5);
    trailCurvesRow(container, args, gapminder, year);

    return container;
  },
};
