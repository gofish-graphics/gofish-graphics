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
 * Exercises: chart root, data in a table, single operator, leaf mark with channel
 * properties, the `.name()` user-supplied name via `origin.name`.
 */
export const exampleBarChart: FrontendIRDocument = {
  irVersion: 0,
  ir: "gofish-frontend",
  root: {
    type: "chart",
    data: { type: "table", id: "t0" },
    operators: [{ type: "spread", by: "lake", dir: "x" }],
    mark: {
      type: "rect",
      origin: { name: "bars" },
      h: "count",
      fill: "species",
    },
    options: { w: 500, h: 300, axes: true },
  },
  tables: {
    t0: [
      { lake: "A", species: "trout", count: 12 },
      { lake: "A", species: "bass", count: 8 },
      { lake: "B", species: "trout", count: 5 },
      { lake: "B", species: "bass", count: 14 },
    ],
  },
};

/**
 * A layer of two charts on the same canvas: `layer([chart(...), chart(...)])`.
 *
 * Exercises: a combinator mark at the root (a root holds anything a mark
 * position does), chart children, the `select`-style data reference (one
 * chart selects from a named layer in the other).
 */
export const exampleLayer: FrontendIRDocument = {
  irVersion: 0,
  ir: "gofish-frontend",
  root: {
    type: "layer",
    __combinator: true,
    children: [
      {
        type: "chart",
        data: { type: "table", id: "t0" },
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
  tables: { t0: [{ x: 1, y: 2 }] },
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
    data: { type: "table", id: "t0" },
    operators: [{ type: "scatter", x: "hp", y: "mpg" }],
    mark: { type: "circle", r: 3, fill: "steelblue" },
  },
  tables: {
    t0: [
      { mpg: 22, hp: 110 },
      { mpg: 19, hp: 150 },
      { mpg: 30, hp: 88 },
    ],
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
    data: { type: "table", id: "t0" },
    mark: {
      type: "treemap",
      __combinator: true,
      options: { size: "value" },
      children: [{ type: "rect", fill: "region" }],
    },
  },
  tables: {
    t0: [
      { region: "north", value: 100 },
      { region: "south", value: 60 },
      { region: "east", value: 80 },
    ],
  },
};

/**
 * A bare mark not wrapped in a chart (e.g. an icon or static decoration).
 *
 * Exercises: a leaf mark at the root, with literal channel values.
 */
export const exampleCustomMark: FrontendIRDocument = {
  irVersion: 0,
  ir: "gofish-frontend",
  root: {
    type: "text",
    origin: { name: "title" },
    text: "Catch by Lake",
    fontSize: 16,
  },
};

/**
 * A `.layer(...)` chain: bars, then a ribbon over them.
 *   chart(seafood).flow(spread({by: "lake", dir: "x"}),
 *                       stack({by: "species", dir: "y"}))
 *                 .mark(rect({h: "count", fill: "species"}))
 *                 .layer(chart().flow(group({by: "species"})).mark(ribbon()))
 *
 * Exercises: the `layer-chain` root, a `previous-tier` tier.
 */
export const exampleLayerChain: FrontendIRDocument = {
  irVersion: 0,
  ir: "gofish-frontend",
  root: {
    type: "layer-chain",
    tiers: [
      {
        type: "chart",
        data: { type: "table", id: "t0" },
        operators: [
          { type: "spread", by: "lake", dir: "x" },
          { type: "stack", by: "species", dir: "y" },
        ],
        mark: { type: "rect", h: "count", fill: "species" },
      },
      {
        type: "chart",
        data: { type: "previous-tier" },
        operators: [{ type: "group", by: "species" }],
        mark: { type: "ribbon", opacity: 0.8 },
      },
    ],
  },
  tables: {
    t0: [
      { lake: "A", species: "trout", count: 12 },
      { lake: "A", species: "bass", count: 8 },
      { lake: "B", species: "trout", count: 5 },
      { lake: "B", species: "bass", count: 14 },
    ],
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
  { name: "bare mark", doc: exampleCustomMark },
  { name: "layer chain", doc: exampleLayerChain },
];
