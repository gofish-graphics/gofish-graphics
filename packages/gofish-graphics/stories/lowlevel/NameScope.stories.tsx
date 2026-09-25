import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Constraint,
  arrow,
  chart,
  circle,
  enclose,
  layer,
  rect,
  ref,
  spread,
  text,
} from "../../src/lib";

// String-name resolution checks. NOT gallery-tagged: these are test-like.
// `ref("x")` and `.constrain()` operands share one lookup: start at the use
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

// An outer layer's `.constrain()` names `mercury`, which lives inside
// enclose › spread. The nested operand is rigidly attached to `planets`.
export const NestedOperand: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      enclose({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
        spread(
          { dir: "x", spacing: 50, alignment: "middle" },
          planets.map((d) =>
            circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 }).name(
              d.name
            )
          )
        ),
      ]).name("planets"),
      text({ text: "Mercury", fill: "#E94560", fontSize: 14 }).name("label"),
      arrow({ stroke: "#E94560" }, [ref("label"), ref("mercury")]),
    ])
      .constrain(({ mercury, planets, label }) => [
        Constraint.align({ x: "middle" }, [mercury, label]),
        Constraint.distribute({ dir: "y", spacing: 20 }, [planets, label]),
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
      { axes: false }
    )
      .flow(spread({ by: "k", dir: "x", spacing: 20, axes: false }))
      .mark(
        layer([
          rect({ w: 40, h: "v", fill: "#9cc3e6" }).name("bar"),
          rect({ w: 16, h: 4, fill: "#1a5683" }).name("tick"),
        ]).constrain(({ bar, tick }) => [
          Constraint.align({ x: "middle", y: "end" }, [bar, tick]),
        ])
      )
      .render(container, { w: 200, h: 120 });
    return container;
  },
};
