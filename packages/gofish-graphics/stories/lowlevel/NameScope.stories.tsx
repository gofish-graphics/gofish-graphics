import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Constraint,
  arrow,
  chart,
  circle,
  enclose,
  field,
  layer,
  line,
  rect,
  ribbon,
  scatter,
  selectAll,
  spread,
  text,
  Shape,
} from "../../src/lib";

// String-name resolution checks. NOT gallery-tagged: these are test-like.
// `ref("x")` and `.relate()` operands share one lookup: start at the use
// site, widen one ancestor at a time, stop at the first level that has the
// name, never cross a createMark boundary. The error cases (duplicate at one
// level, missing name, createMark boundary) are covered by
// src/tests/nameScope.test.ts, since a story cannot render a thrown error.
const meta: Meta = {
  title: "Low Level Syntax/Name Scope",
};
export default meta;

const planets = [
  { name: "mercury", r: 8, fill: "#b5b5b5", stroke: "#8a8a8a" },
  { name: "venus", r: 14, fill: "#e8c77a", stroke: "#c9a24d" },
  { name: "earth", r: 15, fill: "#4a90d9", stroke: "#2d6fb3" },
  { name: "mars", r: 10, fill: "#d9603b", stroke: "#b04424" },
];

// An outer layer's `.relate()` names `mercury`, which lives inside
// enclose › spread. The nested operand is rigidly attached to `planets`. The
// arrow is a drawing clause, laid out after the constraints place the label.
export const NestedOperand: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      enclose(
        {
          padding: 20,
          fill: "#252150",
          stroke: "none",
          shape: Shape.box({ rx: 16 }),
        },
        [
          spread(
            { dir: "x", spacing: 50, alignment: "middle" },
            planets.map((d) =>
              circle({
                r: d.r,
                fill: d.fill,
                stroke: d.stroke,
                strokeWidth: 3,
              }).name(d.name)
            )
          ),
        ]
      ).name("planets"),
      text({ text: "Mercury", fill: "#E94560", fontSize: 14 }).name("label"),
    ])
      .relate(({ mercury, planets, label }) => [
        Constraint.align({ x: "middle" }, [mercury, label]),
        Constraint.distribute({ dir: "y", spacing: 20 }, [planets, label]),
        arrow({ stroke: "#E94560" }, [label, mercury]),
      ])
      .render(container, { w: 400, h: 200 });
    return container;
  },
};

// One constrained mark repeated per chart row, with the same local names in
// every row: each row's layer finds its own `bar` and `tick`.
export const PerRowNames: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(
      [
        { k: "a", v: 40 },
        { k: "b", v: 90 },
        { k: "c", v: 60 },
      ],
      { axes: false, w: 200, h: 120 }
    )
      .flow(spread({ by: "k", dir: "x", spacing: 20, axes: false }))
      .mark(
        layer([
          rect({ w: 40, h: "v", fill: "#9cc3e6" }).name("bar"),
          rect({ w: 16, h: 4, fill: "#1a5683" }).name("tick"),
        ]).relate(({ bar, tick }) => [
          Constraint.align({ x: "middle", y: "end" }, [bar, tick]),
        ])
      )
      .render(container);
    return container;
  },
};

// A `.relate()` operand keeps the layer that bound it (#1236). The callout is
// a nested layer with a swatch of its own named "density", and its arrow
// still points at the outer curve.
const normal = Array.from({ length: 81 }, (_, i) => {
  const x = -4 + i / 10;
  return { x, pdf: Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI) };
});
export const NestedCallout: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      chart(normal, { w: 240, h: 160 })
        .flow(scatter({ x: "x" }))
        .mark(
          ribbon({ h: "pdf", fill: "#D1E4F6", stroke: "#467DA8" }).name(
            "density"
          )
        ),
    ])
      .relate(({ density }) => [
        layer([
          rect({
            x: 55,
            y: 205,
            w: 12,
            h: 12,
            fill: "#D1E4F6",
            stroke: "#467DA8",
          }).name("density"),
          text({ x: 73, y: 205, text: "standard normal", fontSize: 12 }).name(
            "note"
          ),
        ]).relate(({ note }) => [
          arrow({ stroke: "#C0392B", padEnd: 2 }, [note, density]),
        ]),
      ])
      .render(container, { axes: false });
    return container;
  },
};

// A `selectAll` inside a `.relate()` clause sees the layer's chart names, as
// it would as a plain child (#1236).
const monthlyMeans = [
  { month: 1, mean: 8.4 },
  { month: 2, mean: 9.9 },
  { month: 3, mean: 12.3 },
  { month: 4, mean: 15.4 },
  { month: 5, mean: 19.6 },
  { month: 6, mean: 22.3 },
  { month: 7, mean: 26.0 },
  { month: 8, mean: 25.8 },
  { month: 9, mean: 22.3 },
  { month: 10, mean: 16.3 },
  { month: 11, mean: 10.7 },
  { month: 12, mean: 7.9 },
];
export const ClauseSelectAll: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      chart(monthlyMeans)
        .flow(scatter({ x: "month", y: "mean" }))
        .mark(circle({ r: 3.5, fill: "#467DA8" }).name("means")),
    ])
      .relate(() => [
        chart(selectAll("means")).mark(line({ stroke: "#467DA8" })),
      ])
      .render(container, { w: 420, h: 200, axes: false });
    return container;
  },
};

// A drawing clause survives the default axes (#1235): axis elaboration wraps
// the clause in its slot, and the axes' own `.relate()` cannot drop it.
export const ClauseWithDefaultAxes: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const dots = (fill: string, r: number) =>
      chart(monthlyMeans)
        .flow(scatter({ x: "month", y: "mean" }))
        .mark(circle({ r, fill }));
    layer([dots("#9cc3e6", 6)])
      .relate(() => [dots("#1a5683", 2.5)])
      .render(container, { w: 420, h: 200 });
    return container;
  },
};

// `selectAll` widens like `ref` (#1236). Each group's median dot is named
// "median" inside its own per-cell layer; from outside the spread, the
// nearest scopes that have the name are all the cells, so `selectAll`
// gathers the six dots and the line runs through them.
const groups = [
  { g: "A", mu: 0 },
  { g: "B", mu: 0.6 },
  { g: "C", mu: 1.4 },
  { g: "D", mu: 1.1 },
  { g: "E", mu: 1.9 },
  { g: "F", mu: 2.4 },
];
const groupDensity = groups.flatMap(({ g, mu }) =>
  Array.from({ length: 81 }, (_, i) => {
    const x = -3 + i / 10;
    const z = x - mu;
    return { g, mu, x, pdf: Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) };
  })
);
export const MedianTrend: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      chart(groupDensity, { w: 360, axes: false })
        .flow(
          spread({
            by: "g",
            dir: "y",
            anchor: "baseline",
            spacing: 30,
          })
        )
        .mark(
          layer([
            chart()
              .flow(scatter({ x: "x", h: 28 }))
              .mark(ribbon({ h: "pdf", fill: "#D1E4F6", stroke: "#467DA8" })),
            chart().mark(
              circle({
                cx: field("mu").median(),
                cy: 4,
                r: 3,
                fill: "#C0392B",
              }).name("median")
            ),
          ])
        ),
      chart(selectAll("median")).mark(line({ stroke: "#C0392B" }).zOrder(1)),
    ]).render(container, { axes: false });
    return container;
  },
};
