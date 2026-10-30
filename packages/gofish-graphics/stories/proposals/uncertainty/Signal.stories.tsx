import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  circle,
  Color,
  filter,
  group,
  layer,
  line,
  Overlap,
  rect,
  ribbon,
  scatter,
  spread,
  stack,
} from "../../../src/lib";
import {
  busDots,
  fanBands,
  fanHistory,
  fanMedian,
  gradientRows,
  halfEyeRows,
  pointIntervalRows,
  raincloudRows,
} from "./signal-data";

/**
 * Prototypes for "uncertainty as signal" (#980), the ggdist geometries, drawn
 * in today's GoFish. There is no distribution type yet, so the density grids,
 * quantiles and intervals are precomputed in `signal-data.ts`.
 */
const meta: Meta = { title: "Proposals/Uncertainty/Signal" };
export default meta;

const INK = "#1f3b5c";
const SLAB = "#9ebcda";

// ggdist stat_halfeye: a half density slab, with a point at the median and
// thick (66%) and thin (95%) intervals under it.
export const HalfEye: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(halfEyeRows, { w: 520, axes: { x: { title: "value" }, y: true } })
      .flow(spread({ by: "group", dir: "y", anchor: "baseline", spacing: 64 }))
      .mark(
        layer({ h: 60 }, [
          chart()
            .flow(
              filter((d) => d.kind === "slab"),
              scatter({ x: "x" })
            )
            .mark(ribbon({ h: "pdf", fill: SLAB })),
          chart()
            .flow(filter((d) => d.kind === "interval"))
            .mark(
              layer([
                rect({ x: "lo95", x2: "hi95", h: 1.5, fill: INK }),
                rect({ x: "lo66", x2: "hi66", h: 4, fill: INK }),
                circle({ cx: "median", r: 4, fill: INK }),
              ])
            ),
        ])
      )
      .render(container);
    return container;
  },
};

// ggdist stat_pointinterval: a point at the median with thick (66%) and thin
// (95%) intervals, one row per group.
export const PointInterval: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(pointIntervalRows, {
      w: 480,
      axes: { x: { title: "value" }, y: true },
    })
      .flow(spread({ by: "group", dir: "y", spacing: 16 }))
      .mark(
        layer([
          rect({ x: "lo95", x2: "hi95", h: 1.5, fill: INK }),
          rect({ x: "lo66", x2: "hi66", h: 5, fill: INK }),
          circle({ cx: "median", r: 4, fill: INK }),
        ])
      )
      .render(container);
    return container;
  },
};

// ggdist stat_gradientinterval: a bar whose color fades with the density,
// with the point interval on top. Approximation: 80 thin cells, each filled
// on a white-to-blue gradient scale by the density at its center. GoFish has
// no fill gradient along one mark.
export const GradientInterval: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(gradientRows, {
      w: 520,
      color: Color.gradient(["#ffffff", "#3a6ea5"]),
      legend: false,
      axes: { x: { title: "value" }, y: true },
    })
      .flow(spread({ by: "group", dir: "y", spacing: 14 }))
      .mark(
        layer([
          chart()
            .flow(
              filter((d) => d.kind === "cell"),
              scatter({ xMin: "x0", xMax: "x1" })
            )
            .mark(
              rect({
                cy: 0,
                h: 22,
                fill: "density",
                stroke: "density",
                strokeWidth: 0.6,
              })
            ),
          chart()
            .flow(filter((d) => d.kind === "interval"))
            .mark(
              layer([
                rect({ x: "lo95", x2: "hi95", cy: 0, h: 1.5, fill: INK }),
                rect({ x: "lo66", x2: "hi66", cy: 0, h: 4, fill: INK }),
                circle({ cx: "median", cy: 0, r: 4, fill: INK }),
              ])
            ),
        ])
      )
      .render(container);
    return container;
  },
};

// Quantile dotplot (Kay et al. 2016): twenty quantiles of the bus's arrival
// time, binned and stacked, so each dot is a 5% chance.
export const QuantileDotplot: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(busDots, {
      w: 480,
      h: 160,
      axes: { x: { title: "minutes until the bus arrives" }, y: false },
    })
      .flow(
        scatter({ by: "bin", x: "bin", alignment: "end" }),
        stack({ dir: "y", spacing: 1 })
      )
      .mark(circle({ r: 9, fill: SLAB, stroke: INK, strokeWidth: 1 }))
      .render(container);
    return container;
  },
};

// Raincloud: per species a density slab above the baseline, the point
// interval on it, and the raw birds jittered below.
export const Raincloud: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(raincloudRows, {
      w: 560,
      legend: false,
      axes: { x: { title: "Body mass (g)" }, y: true },
    })
      .flow(spread({ by: "species", dir: "y", spacing: 20 }))
      .mark(
        layer([
          chart()
            .flow(
              filter((d) => d.kind === "slab"),
              scatter({ x: "mass" })
            )
            .mark(ribbon({ h: "pdf", fill: "species", opacity: 0.7 })),
          chart()
            .flow(
              filter((d) => d.kind === "interval"),
              scatter({ y: 0 })
            )
            .mark(
              layer([
                rect({ x: "lo95", x2: "hi95", h: 1.5, fill: INK }),
                rect({ x: "lo66", x2: "hi66", h: 4, fill: INK }),
                circle({ cx: "median", r: 4, fill: INK }),
              ])
            ),
          chart()
            .flow(
              filter((d) => d.kind === "point"),
              scatter({ x: "mass", overlap: Overlap.jitter() }).translate({
                y: -16,
              })
            )
            .mark(circle({ r: 1.5, fill: "species", opacity: 0.6 })),
        ])
      )
      .render(container);
    return container;
  },
};

// Fan chart: the observed series, then nested 95%, 80% and 50% forecast
// bands around the median forecast, widening with the horizon.
export const FanChart: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      chart(fanBands, {
        color: Color.palette({
          "95%": "#dbe6f2",
          "80%": "#a9c3df",
          "50%": "#6f98c6",
        }),
      })
        .flow(
          group({ by: "level" }),
          scatter({ by: "t", x: "t", yMin: "lo", yMax: "hi" })
        )
        .mark(rect({ w: 0, fill: "level" }))
        .layer(ribbon({ fill: "level" })),
      chart(fanMedian)
        .flow(scatter({ by: "t", x: "t", y: "value" }))
        .mark(line({ stroke: INK, strokeWidth: 2 })),
      chart(fanHistory)
        .flow(scatter({ by: "t", x: "t", y: "value" }))
        .mark(line({ stroke: "#333", strokeWidth: 1.5 })),
    ]).render(container, {
      w: 520,
      h: 300,
      axes: { x: { title: "time step" }, y: { title: "value" } },
    });
    return container;
  },
};
