import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Bin,
  chart,
  circle,
  Coord,
  derive,
  field,
  intersect,
  layer,
  partition,
  region,
  ribbon,
  scatter,
  spread,
  stack,
} from "../../src/lib";
import { fnCurve } from "../../src/ast/shapes/_prototypeFnCurve";
import {
  type Dist,
  exactQuantiles,
  FILL,
  kde,
  masses,
  monthDist,
  months,
  normal,
  PAPER_FILL,
  PAPER_STROKE,
  STROKE,
  weather,
} from "./croissantDist";

/**
 * THROWAWAY prototype stories for approach B of the croissant-sampling
 * proposal (#1332): a function in a channel, sampled at render time by the
 * prototype node `fnCurve` (src/ast/shapes/_prototypeFnCurve.tsx).
 * `fnCurve({ f: d.pdf, range })` stands in for `ribbon({ h: x.density() })`.
 * The cut layer still emulates a Dist cut with exact quantile rows.
 */
const meta: Meta = { title: "Proposals/Croissant Sampling B" };
export default meta;

const croissantB = (d: Dist, { n = 10, fill = FILL, stroke = STROKE } = {}) =>
  layer([
    chart([{}]).mark(
      fnCurve({ f: d.pdf, range: d.range }).name("density").hidden()
    ),
  ]).relate(({ density }) => [
    chart(exactQuantiles(d))
      .flow(partition({ by: field("v").bin(Bin.quantiles(n)), dir: "x" }))
      .mark(
        layer([
          intersect({ fill, stroke, strokeWidth: 2 }, [
            density,
            region({ inset: 3 }),
          ]),
          circle({ cx: field("v").median(), cy: 6, r: 3, fill: stroke }),
        ])
      ),
  ]);

export const Normal: StoryObj = {
  render: () => {
    const container = initializeContainer();
    croissantB(normal(0, 1), {
      n: 5,
      fill: PAPER_FILL,
      stroke: PAPER_STROKE,
    }).render(container, {
      w: 480,
      h: 200,
      axes: { x: { title: "x" }, y: false },
    });
    return container;
  },
};

export const PenguinBodyMass: StoryObj = {
  render: () => {
    const container = initializeContainer();
    croissantB(kde(masses)).render(container, {
      w: 520,
      h: 220,
      axes: { x: { title: "Body mass (g)" }, y: false },
    });
    return container;
  },
};

export const Ridgeline: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(weather, {
      w: 520,
      axes: { x: { title: "Daily high (°C)" }, y: false },
    })
      .flow(
        spread({
          by: field("month").sort(months),
          dir: "y",
          anchor: "baseline",
          spacing: 36,
        })
      )
      .mark(
        layer({ h: 34 }, [
          chart().mark(
            fnCurve((rows) => {
              const d = monthDist(rows);
              return { f: d.pdf, range: d.range };
            })
              .name("density")
              .hidden()
          ),
        ]).relate(({ density }) => [
          chart()
            .flow(
              derive((rows: any[]) => exactQuantiles(monthDist(rows))),
              partition({ by: field("v").bin(Bin.quantiles(5)), dir: "x" })
            )
            .mark(
              layer([
                intersect({ fill: FILL, stroke: STROKE, strokeWidth: 1.5 }, [
                  density,
                  region({ inset: 2 }),
                ]),
                circle({
                  cx: field("v").median(),
                  cy: 5,
                  r: 2.25,
                  fill: STROKE,
                }),
              ])
            ),
        ])
      )
      .render(container);
    return container;
  },
};

// Coords: a density of wind directions (two von Mises bumps) as an area in
// polar, so the same resampler bends it.
const vonMises = (mu: number, k: number) => (t: number) =>
  Math.exp(k * (Math.cos(t - mu) - 1));
const wind = (t: number) =>
  0.7 * vonMises(Math.PI / 3, 4)(t) + 0.3 * vonMises((4 * Math.PI) / 3, 8)(t);

export const Polar: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart([{}], { coord: Coord.polar(), w: 300, h: 300, axes: false })
      .mark(
        fnCurve({
          f: wind,
          range: [0, 2 * Math.PI],
          pinY: true,
          fill: FILL,
          stroke: STROKE,
          strokeWidth: 1.5,
        })
      )
      .render(container);
    return container;
  },
};

// Stress 1: two function areas under `stack`. Stack moves whole boxes.
const f1 = (x: number) => normal(-1, 0.8).pdf(x);
const f2 = (x: number) => 0.6 * normal(1, 0.6).pdf(x);

export const Stack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    stack({ dir: "y", spacing: 0 }, [
      fnCurve({
        f: f1,
        range: [-4, 4],
        fill: FILL,
        stroke: STROKE,
        strokeWidth: 1,
      }),
      fnCurve({
        f: f2,
        range: [-4, 4],
        fill: PAPER_FILL,
        stroke: PAPER_STROKE,
        strokeWidth: 1,
      }),
    ]).render(container, { w: 420, h: 220, axes: true });
    return container;
  },
};

// The same two curves stacked from rows (approach A): pointwise.
const stackRows = Array.from({ length: 161 }, (_, i) => -4 + i / 20).flatMap(
  (x) => [
    { x, series: "f", y: f1(x) },
    { x, series: "g", y: f2(x) },
  ]
);
export const StackFromRows: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(stackRows, { w: 420, h: 220, axes: true })
      .flow(scatter({ by: "x", x: "x" }), stack({ by: "series", dir: "y" }))
      .mark(ribbon({ h: "y", fill: "series", opacity: 0.85 }))
      .render(container);
    return container;
  },
};

// Stress 2: a plain function over an explicit domain.
export const Sin: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart([{}], { w: 420, h: 160, axes: true })
      .mark(
        fnCurve({
          kind: "line",
          f: (x) => Math.sin(x) + 0.3 * Math.sin(7 * x),
          range: [0, 4 * Math.PI],
          stroke: STROKE,
        })
      )
      .render(container);
    return container;
  },
};

// Stress 3: a parametric curve, an Archimedean spiral.
export const Parametric: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart([{}], { w: 300, h: 300, axes: true })
      .mark(
        fnCurve({
          kind: "line",
          param: {
            x: (t) => t * Math.cos(t),
            y: (t) => t * Math.sin(t),
            t: [0, 6 * Math.PI],
          },
          stroke: STROKE,
        })
      )
      .render(container);
    return container;
  },
};

// A narrow kernel (25 g): the case where sampling shows.
export const NarrowBandwidth: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const d = kde(masses, 25);
    chart([{}], {
      w: 520,
      h: 60,
      axes: { x: { title: "Body mass (g)" }, y: false },
    })
      .mark(
        fnCurve({
          f: d.pdf,
          range: d.range,
          fill: FILL,
          stroke: STROKE,
          strokeWidth: 1,
        })
      )
      .render(container);
    return container;
  },
};
