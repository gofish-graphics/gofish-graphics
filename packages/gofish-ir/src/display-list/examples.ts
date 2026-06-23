/**
 * Canonical display-list examples — used by tests and as documentation
 * fixtures. Each is a valid {@link DisplayListDocument}.
 */

import type { DisplayListDocument } from "./schema.js";

/** Two bars + an axis tick, the lowered form of a minimal bar chart. */
export const exampleBars: DisplayListDocument = {
  irVersion: 0,
  ir: "gofish-display-list",
  viewport: { w: 200, h: 120 },
  items: [
    {
      kind: "rect",
      x: 10,
      y: 40,
      w: 16,
      h: 60,
      style: { fill: "#4190c5" },
      datum: { category: "A", value: 60 },
      role: "node",
    },
    {
      kind: "rect",
      x: 34,
      y: 70,
      w: 16,
      h: 30,
      style: { fill: "#4190c5" },
      datum: { category: "B", value: 30 },
      role: "node",
    },
    {
      kind: "text",
      x: 10,
      y: 110,
      text: "A",
      fontSize: 10,
      textAnchor: "start",
      role: "overlay",
    },
  ],
};

/** A warped petal (coordinate transform already applied → a path) + its label. */
export const examplePetal: DisplayListDocument = {
  irVersion: 0,
  ir: "gofish-display-list",
  viewport: { w: 160, h: 160 },
  items: [
    {
      kind: "path",
      d: "M80,80 C100,40 120,60 80,20 C40,60 60,40 80,80 Z",
      style: { fill: "#e15759", fillOpacity: 0.8 },
      datum: { species: "Walleye", count: 12 },
      role: "node",
    },
  ],
};

export const allExamples: DisplayListDocument[] = [exampleBars, examplePetal];
