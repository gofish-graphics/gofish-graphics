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
 * transition offers, four charts on one clock. CURVES THREE KINEMATICS cuts
 * that down to three readings and puts one country's position, velocity and
 * acceleration under each of them, on the same clock, which is where the
 * jerkiness of a straight reading becomes something you can point at.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Frame,
  GoFish,
  chart,
  circle,
  filter,
  group,
  line,
  live,
  scatter,
  selectAll,
  rect,
  spread,
  spreadX,
  spreadY,
  linear,
  text,
  time,
  timer,
} from "../../src/lib";
import { catmullRomJet } from "../../src/catmullRom";
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
type Reading = "step" | "linear" | "catmullRom" | null;

/** The four readings, left to right. */
const CURVES: { caption: string; curve: Reading }[] = [
  { caption: "no transition (sequence alone)", curve: null },
  { caption: "step: hold, then jump", curve: "step" },
  { caption: "linear", curve: "linear" },
  { caption: "catmullRom (default)", curve: "catmullRom" },
];

/** The three-panel cut: the step panel is left out because it is the same
 *  picture as the sequence alone. */
const CURVES_THREE: { caption: string; curve: Reading }[] = [
  { caption: "no interpolation", curve: null },
  { caption: "linear", curve: "linear" },
  { caption: "catmullRom", curve: "catmullRom" },
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
  readings: { caption: string; curve: Reading }[] = CURVES,
  below: any[] = []
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
              Frame({ w: PANEL_W, h: 280 }, [curvePanel(rows, clock, curve)]),
            ])
          )
        ),
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
    curvesRow(container, args, gapminder, year, CURVES_THREE);

    return container;
  },
};

/** The country the sparklines read, and the channel they read. Jamaica's life
 *  expectancy changes direction several times over the run, by amounts of the
 *  same order, so every keyframe leaves a mark of comparable size — a country
 *  with one huge event in it (China in 1960) would put one spike on the chart
 *  and leave the rest of the run looking flat. */
const SPARK_COUNTRY = "Jamaica";
const SPARK_FIELD = "life_expect";
/** How many samples of each KEYFRAME INTERVAL a sparkline is drawn from. The
 *  sampling is per interval rather than across the whole run so that nothing
 *  is ever averaged across a keyframe: every quantity here is defined one
 *  interval at a time, and the ones that jump at a keyframe jump because two
 *  samples sit on either side of it rather than because a difference reached
 *  across it. A straight segment needs two samples and a cubic needs a few
 *  dozen, so the intervals that are straight ask for fewer. */
const SPARK_PER_INTERVAL = 20;
/** The nudge, in years, that lets a riser be vertical. A vertical step wants
 *  two samples at ONE time with two different values, and two such samples
 *  would collide: the sparkline groups its samples by time, and the moving
 *  dot's transition would be handed a run with a zero-length interval in it.
 *  So the second sample is moved a thousandth of a year along instead, which
 *  is a hundredth of a pixel wide on screen and still strictly increasing. */
const SPARK_EPS = 1e-3;
/** One sparkline's box. Two of them plus a gap is one pair of panels — but
 *  the gap is the one the PANELS end up with, not the one they ask for: a
 *  panel's y-axis chrome is drawn outside its box, which pushes the panels
 *  apart by roughly 29px more than the `spacing` says. The sparklines have no
 *  chrome, so they have to be told that number to line up under the panels,
 *  and `SPARK_LABEL_W` is what slides the whole block right by the same
 *  reasoning (the block is centered, so a cell of width L moves it L/2). Both
 *  were read off a render, and both are cosmetic: a wrong number leaves the
 *  sparklines a few pixels off their panel, nothing more. */
const SPARK_H_PX = 70;
const PANEL_CHROME = 29;
const SPARK_GAP = PANEL_GAP + PANEL_CHROME;
const SPARK_W = PANEL_W * 2 + SPARK_GAP;
const SPARK_LABEL_W = 295;

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
 * Under the LINEAR reading the position is a chain of straight segments, so
 * it is exactly its eleven keyframes. Its velocity is constant inside each
 * interval, (p₂ − p₁)/(t₂ − t₁), and changes instantly at every keyframe: a
 * staircase of plateaus joined by vertical risers. Its acceleration is zero
 * everywhere except at the keyframes, where it is an impulse — infinitely
 * tall and infinitely brief, with a finite weight equal to the jump in
 * velocity. An impulse cannot be plotted, so what is drawn is the comb of
 * weights: a zero line with a vertical spike at each keyframe whose height is
 * that jump, sign and all. It is a picture OF the impulses, not of a function.
 *
 * Under the SMOOTH reading all three are functions. The position is the
 * spline, the velocity is continuous, and the acceleration is finite but
 * DISCONTINUOUS at the knots — a Catmull-Rom is only C¹ — so each interval is
 * sampled just inside its own ends and the intervals are joined by risers,
 * which is what makes the jumps read as jumps rather than as a steep ramp.
 * All three come from `catmullRomJet`, the library's own spline read with its
 * derivatives, so the velocity and acceleration are exact derivatives of the
 * very curve the transition above is following.
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

  // ── The smooth reading ────────────────────────────────────────────────
  for (let i = 0; i < last; i++) {
    const span = knots[i + 1] - knots[i];
    for (let s = 0; s <= SPARK_PER_INTERVAL; s++) {
      const u = s / SPARK_PER_INTERVAL;
      const t = knots[i] + span * u;
      // Position and velocity are continuous across a knot, so the shared
      // endpoint is emitted once, by the interval on its left.
      if (i === 0 || s > 0) {
        const [position, velocity] = catmullRomJet(knots, values, i, u);
        at("position", "catmullRom", t, position);
        at("velocity", "catmullRom", t, velocity);
      }
      // Acceleration has two values at a knot. Sample just inside both ends
      // of the interval instead, which takes the one-sided limits and leaves
      // the pair of them to be joined by a riser.
      const tA =
        t + (s === 0 ? SPARK_EPS : s === SPARK_PER_INTERVAL ? -SPARK_EPS : 0);
      at(
        "acceleration",
        "catmullRom",
        tA,
        catmullRomJet(knots, values, i, (tA - knots[i]) / span)[2]
      );
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
 * One quantity's pair of sparklines, and the dot that walks them.
 *
 * Both readings are ONE chart, `spread` by method across x, which is what
 * makes the two curves comparable: a chart resolves its scales over all of its
 * rows, so the linear sparkline and the smooth one are drawn against the same
 * y domain, for every quantity, without a domain ever being written down.
 *
 * The moving dot is a `time.transition` read on the samples themselves. The
 * samples are a run of keyframes like any other — `along: "t"` names their
 * time field and `at` hands the transition the clock the three panels share —
 * so the transition paints one dot per run and slides it along the sampled
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
const sparkRow = (samples: Sample[], clock: any) =>
  // A sparkline is a chart with no axes, and the coordinate frame is what says
  // so here: the whole picture is rendered with `axes: true`, an embedded
  // chart's own `axes: false` option is only read when that chart renders
  // itself, and an `axes: false` on the operators only silences the operator
  // that carries it, not the frame above it that ends up drawing the axis. A
  // coordinate frame owns its space, so no Cartesian axis is drawn inside one.
  Frame({ w: SPARK_W, h: SPARK_H_PX, coord: linear(), padding: 0 }, [
    Frame({ w: SPARK_W, h: SPARK_H_PX }, [
      sparkSamples(samples)
        // `curve: "linear"` is not a default worth leaning on here, it is
        // the whole point: an omitted curve is `auto`, and `auto` over a
        // continuous axis smooths with a Catmull-Rom — which would round the
        // corners off the staircase and turn the impulses into bumps, drawing
        // the smooth reading of a picture whose subject is that the two
        // readings differ. (Here "linear" is the screen-space path shape; it
        // is the same name and the same idea as `curve: "linear"` on a
        // transition, which names an interpolation in time rather than a path
        // in space.)
        .layer(line({ stroke: "#999", strokeWidth: 1, curve: "linear" })),
    ]),
    Frame({ w: SPARK_W, h: SPARK_H_PX }, [
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
 * quantity, each row a label in the leftmost column and the two sparklines
 * under the linear and smooth panels, with one caption under the lot.
 *
 * The leftmost column is the "no interpolation" panel's, and there is nothing
 * kinematic to say about it — it does not move between keyframes, it jumps —
 * so the quantity labels live there instead of a fourth empty column.
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
          // The label's cell is as wide as the "no interpolation" column, and
          // an empty `rect` is what gives it that width: a `Frame`'s own `w`
          // sizes the box it lays out in, but a lone text mark does not fill
          // it, so the cell would collapse to the word.
          Frame({ w: SPARK_LABEL_W, h: SPARK_H_PX }, [
            rect({ w: SPARK_LABEL_W, h: SPARK_H_PX, fill: "none" }),
            text({ text: q, fontSize: 11, fill: "#888" }),
          ]),
          sparkRow(samples[q], clock),
        ])
      )
    ),
  ];
};

/**
 * The three-panel cut with the reason underneath it.
 *
 * The panels say what the two readings look like; the sparklines say why. Read
 * down the linear column: the position is a chain of straight segments, so the
 * velocity is a staircase that changes value instantly at each keyframe, and
 * the acceleration is nothing at all except a spike at each of those instants.
 * A spike in acceleration is exactly what the eye reads as a jolt. Down the
 * smooth column the position has no corners, the velocity is a continuous
 * curve, and the acceleration stays bounded, so nothing ever jolts.
 *
 * Everything moves on one clock, the dots on the sparklines included, so at
 * any moment the dots mark the state the panels above them are drawing.
 */
export const CurvesThreeKinematics: StoryObj<Args> = {
  args: { w: 880, h: 620 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    const year = timer({ domain: yearRange(gapminder), duration: 10000 });
    curvesRow(
      container,
      args,
      gapminder,
      year,
      CURVES_THREE,
      kinematicsBlock(gapminder, year)
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
export const CurvesThreeKinematicsPaused: StoryObj<Args> = {
  args: { w: 880, h: 620 },
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const gapminder = context.loaded.gapminder as any[];

    const year = pausedClock(yearRange(gapminder), 10000, 1957.5);
    curvesRow(
      container,
      args,
      gapminder,
      year,
      CURVES_THREE,
      kinematicsBlock(gapminder, year)
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
 * The keyframes are the faint dots. The sequence keeps all its history, so
 * every year the playhead has reached stays on screen, and the line threaded
 * through the dots is drawn up to the playhead. The transition over the same
 * dots draws the moving dot. It is a tier of its own over the dots
 * (`selectAll("years")`, split by country) because `.layer(...)` reads the tier
 * just before it, which is the lines. With a gliding curve each year's dot
 * covers only its own moment, so it appears the moment the moving dot leaves
 * it, and the moving dot is always at the tip of its line: the line and the
 * transition use the same curve, with the years as its knots.
 *
 * The moving dot takes its size and color from the keyframes, and its opacity
 * from the transition, which is 1 unless it is given. That is why it stands
 * out from the faint dots it leaves behind.
 */
const trails = (
  rows: any[],
  clock: any,
  curve: "linear" | "catmullRom",
  options: Record<string, unknown> = {}
) =>
  chart(
    rows.filter((d) => TRAIL_COUNTRIES.includes(d.country)),
    options
  )
    .flow(
      time.sequence({ by: "year", on: clock, history: Infinity }),
      scatter({ by: "country", x: "fertility", y: "life_expect" })
    )
    .mark(circle({ r: 4, fill: "country", opacity: 0.3 }).name("years"))
    .layer(
      line({
        along: "year",
        stroke: "country",
        strokeWidth: 1.5,
        opacity: 0.6,
        curve,
      })
    )
    .layer(
      chart(selectAll("years"))
        .flow(group({ by: "country" }))
        .mark(time.transition({ curve }))
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
    trails(gapminder, year, "catmullRom")
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
    trails(gapminder, year, "catmullRom")
      .layer(yearReadout(year))
      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};

/** The two gliding curves side by side on one clock: straight segments on
 *  the left, the smooth curve on the right. Each moving dot stays on the tip
 *  of its own line either way, because the line and the transition in a panel
 *  use the same curve. */
const trailCurvesRow = (
  container: HTMLElement,
  args: Args,
  rows: any[],
  clock: any
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
          (["linear", "catmullRom"] as const).map((curve) =>
            spreadY({ spacing: 8, alignment: "middle" }, [
              text({ text: curve, fontSize: 12, fill: "#555" }),
              Frame({ w: PANEL_W, h: 280 }, [
                trails(rows, clock, curve, { legend: false, padding: 0 }),
              ]),
            ])
          )
        ),
      ])
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
