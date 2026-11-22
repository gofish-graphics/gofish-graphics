/**
 * `.tooltip()` (#1395): hover a mark to see a box that describes it. With
 * no argument the box shows every field with one value on the mark; with a
 * list, those fields in order. A static capture draws no box: each mark
 * carries its rows as an SVG `<title>`.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { catchLocationsArray, seafood } from "../../src/data/catch";
import {
  chart,
  circle,
  Coord,
  group,
  line,
  rect,
  scatter,
  spread,
  stack,
} from "../../src/lib";

const meta: Meta = { title: "Interaction/Tooltip" };
export default meta;

// The top 15 path types of the issue's screenshot. Only the first row is
// from the screenshot; the rest keep share = n / 91,554.
const pathTypes = [
  { path: "VO→VO", n: 11902, n_articles: 195 },
  { path: "INF→INF", n: 9811, n_articles: 188 },
  { path: "other→other", n: 8240, n_articles: 201 },
  { path: "VO→INF", n: 6590, n_articles: 172 },
  { path: "PK→PK", n: 5310, n_articles: 160 },
  { path: "VO→VO→VO", n: 4670, n_articles: 151 },
  { path: "INF→VO", n: 4120, n_articles: 149 },
  { path: "PK→VO", n: 3480, n_articles: 133 },
  { path: "VO→PK", n: 3110, n_articles: 128 },
  { path: "INF→INF→INF", n: 2740, n_articles: 117 },
  { path: "other→VO", n: 2290, n_articles: 109 },
  { path: "VO→other", n: 1950, n_articles: 98 },
  { path: "PK→INF", n: 1610, n_articles: 87 },
  { path: "INF→PK", n: 1330, n_articles: 74 },
  { path: "VO→INF→VO", n: 1090, n_articles: 66 },
].map((d) => ({ ...d, share: d.n / 91554 }));

export const BarChart: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bar Chart with Tooltips",
      description:
        "The fifteen most common path types as horizontal bars of their share, where hovering a bar shows every field of its row.",
    },
  },
  render: () => {
    const container = initializeContainer();

    chart(pathTypes, { w: 520, h: 400 })
      .flow(spread({ by: "path", dir: "y", spacing: 4 }))
      .mark(rect({ w: "share", fill: "#4c78a8" }).tooltip())
      .render(container);

    return container;
  },
};

export const StackedBars: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(seafood, { w: 400, h: 300 })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 8 }),
        stack({ by: "species", dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species" }).tooltip())
      .render(container);

    return container;
  },
};

export const Scatter: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(catchLocationsArray, { w: 400, h: 400 })
      .flow(scatter({ by: "lake", x: "x", y: "y" }))
      .mark(circle({ r: 6, fill: "#4c78a8" }).tooltip(["lake", "x", "y"]))
      .render(container);

    return container;
  },
};

const budget = [
  { series: "Revenue", year: 2018, value: 1.6 },
  { series: "Revenue", year: 2019, value: 1.9 },
  { series: "Revenue", year: 2020, value: 1.7 },
  { series: "Revenue", year: 2021, value: 2.3 },
  { series: "Revenue", year: 2022, value: 2.6 },
  { series: "Cost", year: 2018, value: 1.2 },
  { series: "Cost", year: 2019, value: 1.3 },
  { series: "Cost", year: 2020, value: 1.5 },
  { series: "Cost", year: 2021, value: 1.6 },
  { series: "Cost", year: 2022, value: 2.0 },
];

export const LineChart: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(budget, { w: 400, h: 260 })
      .flow(group({ by: "series" }))
      .mark(
        line({ x: "year", y: "value", stroke: "series", strokeWidth: 2 }).tooltip()
      )
      .render(container);

    return container;
  },
};

export const Donut: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(seafood, { coord: Coord.clock(), w: 300, h: 300 })
      .flow(stack({ by: "species", dir: "x", y: 50, h: 50 }))
      .mark(rect({ w: "count", fill: "species" }).tooltip())
      .render(container);

    return container;
  },
};
