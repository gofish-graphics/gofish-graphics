/**
 * Canonical example frontend-IR documents.
 *
 * These are the testbed for the validator and serve as worked examples for
 * downstream consumers (Olli, the Python wrapper, alternative renderers).
 * Each example covers a distinct shape of the schema.
 */

import type { FrontendIRDocument } from "./schema.js";

/**
 * A simple bar chart:
 *   chart(seafood).flow(spread({by: "lake", dir: "x"}))
 *                 .mark(rect({h: "count", fill: "species"}).name("bars"))
 *
 * Exercises: chart root, inline data, single operator, leaf mark with channel
 * properties, the `.name()` user-supplied name via `origin.name`.
 */
export const exampleBarChart: FrontendIRDocument = {
  irVersion: 0,
  ir: "gofish-frontend",
  root: {
    type: "chart",
    data: {
      type: "inline",
      rows: [
        { lake: "A", species: "trout", count: 12 },
        { lake: "A", species: "bass", count: 8 },
        { lake: "B", species: "trout", count: 5 },
        { lake: "B", species: "bass", count: 14 },
      ],
    },
    operators: [{ type: "spread", by: "lake", dir: "x" }],
    mark: {
      type: "rect",
      origin: { name: "bars" },
      h: "count",
      fill: "species",
    },
    options: { w: 500, h: 300, axes: true },
  },
};

/**
 * A layer of two charts on the same canvas.
 *
 * Exercises: layer root, multiple chart children, the `select`-style data
 * reference (one chart selects from a named layer in the other).
 */
export const exampleLayer: FrontendIRDocument = {
  irVersion: 0,
  ir: "gofish-frontend",
  root: {
    type: "layer",
    charts: [
      {
        type: "chart",
        data: { type: "inline", rows: [{ x: 1, y: 2 }] },
        operators: [{ type: "scatter", x: "x", y: "y" }],
        mark: { type: "circle", origin: { name: "points" }, r: 4 },
      },
      {
        type: "chart",
        data: { type: "select", layer: "points" },
        mark: { type: "ref", selection: "points" },
      },
    ],
  },
};

/**
 * A scatter chart: data → scatter operator with explicit x/y channels.
 *
 * Exercises: scatter operator with channel values, leaf mark without label.
 */
export const exampleScatter: FrontendIRDocument = {
  irVersion: 0,
  ir: "gofish-frontend",
  root: {
    type: "chart",
    data: {
      type: "inline",
      rows: [
        { mpg: 22, hp: 110 },
        { mpg: 19, hp: 150 },
        { mpg: 30, hp: 88 },
      ],
    },
    operators: [{ type: "scatter", x: "hp", y: "mpg" }],
    mark: { type: "circle", r: 3, fill: "steelblue" },
  },
};

/**
 * A treemap, built combinator-form: a `treemap` combinator wraps rect leaves.
 *
 * Exercises: combinator-form mark in the mark tree (with `__combinator: true`),
 * nested children.
 */
export const exampleTreemap: FrontendIRDocument = {
  irVersion: 0,
  ir: "gofish-frontend",
  root: {
    type: "chart",
    data: {
      type: "inline",
      rows: [
        { region: "north", value: 100 },
        { region: "south", value: 60 },
        { region: "east", value: 80 },
      ],
    },
    mark: {
      type: "treemap",
      __combinator: true,
      options: { valueField: "value" },
      children: [{ type: "rect", fill: "region" }],
    },
  },
};

/**
 * A bare mark not wrapped in a chart (e.g. an icon or static decoration).
 *
 * Exercises: raw-mark root, simple leaf mark with literal channel values.
 */
export const exampleCustomMark: FrontendIRDocument = {
  irVersion: 0,
  ir: "gofish-frontend",
  root: {
    type: "raw-mark",
    mark: {
      type: "text",
      origin: { name: "title" },
      text: "Catch by Lake",
      fontSize: 16,
    },
    options: { w: 200, h: 40 },
  },
};

export const allExamples: ReadonlyArray<{
  name: string;
  doc: FrontendIRDocument;
}> = [
  { name: "bar chart", doc: exampleBarChart },
  { name: "layer", doc: exampleLayer },
  { name: "scatter", doc: exampleScatter },
  { name: "treemap", doc: exampleTreemap },
  { name: "raw-mark", doc: exampleCustomMark },
];
