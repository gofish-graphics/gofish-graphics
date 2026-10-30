import type { Meta, StoryObj } from "@storybook/html";
import { groupBy, meanBy } from "lodash";
import { initializeContainer } from "../../helper";
import {
  chart,
  circle,
  line,
  rect,
  scatter,
  spread,
  stack,
  group,
  derive,
  partition,
  field,
  Bin,
  Color,
  Coord,
  Curve,
} from "../../../src/lib";
import {
  bootPoints,
  bootLines,
  forecasts,
  forecastWeights,
  replicates,
  observedMeanRule,
  ecdf,
  jkCdfDraws,
  pieDraws,
  ccdfDraws,
  probitZero,
} from "./papers-a-data";

// Prototypes for #980 (distribution-valued data), drawn in today's GoFish.
// Draws are precomputed in papers-a-data.ts. See
// proposals/uncertainty-specs/papers-a.md for the proposed spellings.

const meta: Meta = {
  title: "Proposals/Uncertainty/Papers A",
};
export default meta;

type Args = { w: number; h: number };

/** Petek et al.: 40 crisp points and 39 bootstrap regression lines. */
export const BootstrapSpaghetti: StoryObj<Args> = {
  args: { w: 420, h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(bootPoints, { w: args.w, h: args.h })
      .flow(scatter({ by: "id", x: "x", y: "y" }))
      .mark(circle({ r: 3, fill: "#222" }))
      .layer(
        chart(bootLines)
          .flow(group({ by: "draw" }), scatter({ by: "x", x: "x", y: "y" }))
          .mark(line({ stroke: "#d62728", strokeWidth: 1.5, opacity: 0.12 }))
      )
      .render(container);
    return container;
  },
};

/** Zou et al.: nine forecast lines, opacity set by each model's weight. */
export const WeightedForecasts: StoryObj<Args> = {
  args: { w: 480, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    // Line opacity takes a number, not a field, so each weighted model is
    // its own layer.
    const [first, ...rest] = forecastWeights.map((weight) =>
      chart(forecasts.filter((d) => d.weight === weight))
        .flow(scatter({ by: "month", x: "month", y: "temp" }))
        .mark(line({ stroke: "#1f4e79", strokeWidth: 2, opacity: weight }))
    );
    rest
      .reduce((c, layer) => c.layer(layer), first)
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

/** Guo et al. (VMC): a histogram of the mean of each replicated dataset,
 *  with the observed mean as a vertical line. */
export const AggregatePerDraw: StoryObj<Args> = {
  args: { w: 480, h: 260 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(replicates, { w: args.w, h: args.h })
      .flow(
        // The per-draw fold, by hand: one row per replicate, its mean.
        derive((rows) =>
          Object.values(groupBy(rows, "draw")).map((g) => ({
            mean: meanBy(g, "y"),
          }))
        ),
        partition({ by: field("mean").bin(Bin.step(0.05)), dir: "x" })
      )
      .mark(rect({ h: field("mean").count(), fill: "#9ecae1", inset: 0.5 }))
      .layer(
        chart(observedMeanRule)
          .flow(scatter({ by: "count", x: "mean", y: "count" }))
          .mark(
            line({ stroke: "#08306b", strokeWidth: 2, curve: Curve.linear() })
          )
      )
      .render(container);
    return container;
  },
};

/** Piccolotto et al.: 50 posterior Normal CDFs over the empirical CDF. */
export const JkCdf: StoryObj<Args> = {
  args: { w: 420, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(jkCdfDraws, { w: args.w, h: args.h })
      .flow(group({ by: "draw" }), scatter({ by: "x", x: "x", y: "p" }))
      .mark(line({ stroke: "#3182bd", strokeWidth: 1, opacity: 0.15 }))
      .layer(
        chart(ecdf)
          .flow(scatter({ by: "x", x: "x", y: "p" }))
          .mark(line({ stroke: "#111", strokeWidth: 1.5, curve: Curve.step() }))
      )
      .render(container);
    return container;
  },
};

/** Piccolotto et al.: a jk pie, one ring per posterior draw of the category
 *  probabilities, stacked by category around each ring. */
export const JkPie: StoryObj<Args> = {
  args: { w: 360, h: 360 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(pieDraws, { coord: Coord.clock(), axes: false, w: args.w, h: args.h })
      .flow(
        spread({ by: "draw", dir: "y", spacing: 1, y: 30 }),
        stack({ by: "category", dir: "x" })
      )
      .mark(rect({ w: "p", h: 6, fill: "category" }))
      .render(container);
    return container;
  },
};

/** Sarma: probit-scaled CCDF of a 5-level rating, one line per posterior
 *  draw and condition. The median is where the lines cross 0. */
export const ProbitCcdf: StoryObj<Args> = {
  args: { w: 420, h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(ccdfDraws, {
      w: args.w,
      h: args.h,
      color: Color.palette({ Control: "#7f7f7f", Treatment: "#d95f02" }),
    })
      .flow(group({ by: "line" }), scatter({ by: "k", x: "k", y: "z" }))
      .mark(
        line({
          stroke: "condition",
          strokeWidth: 1,
          opacity: 0.3,
          curve: Curve.linear(),
        })
      )
      .layer(
        chart(probitZero)
          .flow(scatter({ by: "k", x: "k", y: "z" }))
          .mark(
            line({
              stroke: "#111",
              strokeDasharray: "4 3",
              curve: Curve.linear(),
            })
          )
      )
      .render(container);
    return container;
  },
};
