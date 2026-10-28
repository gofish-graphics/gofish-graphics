import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import data from "vega-datasets";
import { seafood } from "../../src/data/catch";
import {
  arrow,
  blank,
  chart,
  circle,
  Constraint,
  createName,
  group,
  layer,
  line,
  Place,
  polygon,
  rect,
  ref,
  ribbon,
  scatter,
  Unit,
  selectAll,
  spread,
  stack,
  text,
} from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Label Placement",
};
export default meta;

// ─── points: Place.around() ──────────────────────────────────────────────────
// A dot's label goes around it by default (`Place.around()`): the first of
// eight compass spots, upper right first, that covers no other dot or label.
// Rows are sorted by population, so a big country's label wins a tie.
export const ScatterPointLabels: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Scatter Plot with Point Labels",
      description:
        "Life expectancy against fertility for the 36 most populous countries in 2005, each dot labeled with its country in the first free spot around it, so no label covers another label or a dot.",
    },
  },
  loaders: [
    async () => ({
      countries: ((await data["gapminder.json"]()) as any[])
        .filter((d) => d.year === 2005)
        .sort((a, b) => b.pop - a.pop)
        .slice(0, 36),
    }),
  ],
  render: (_args: unknown, context: any) => {
    const container = initializeContainer();
    chart(context.loaded.countries, { w: 640, h: 440 })
      .flow(scatter({ by: "country", x: "fertility", y: "life_expect" }))
      .mark(circle({ r: 4 }).label("country"))
      .render(container, { axes: true });
    return container;
  },
};

// ─── lines: Place.end() ──────────────────────────────────────────────────────
// A line's label goes past its last point by default (`Place.end()`); labels
// that would cover each other slide apart vertically. The prices are yearly
// averages of vega-datasets' monthly stocks.
const yearlyStocks = async () => {
  const rows = (await data["stocks.csv"]()) as any[];
  const acc = new Map<
    string,
    { symbol: string; date: string; sum: number; n: number }
  >();
  for (const d of rows) {
    const year = new Date(d.date).getFullYear();
    const key = `${d.symbol}${year}`;
    const e = acc.get(key) ?? {
      symbol: d.symbol,
      date: `${year}-07-01`,
      sum: 0,
      n: 0,
    };
    e.sum += +d.price;
    e.n += 1;
    acc.set(key, e);
  }
  return [...acc.values()].map((e) => ({
    symbol: e.symbol,
    date: e.date,
    price: Math.round((e.sum / e.n) * 100) / 100,
  }));
};

export const LineEndLabels: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Line Chart with End Labels",
      description:
        "Yearly average stock prices of five tech companies, each line named at its last point in place of a legend, with the crowded IBM and AMZN labels slid apart.",
    },
  },
  loaders: [async () => ({ stocks: await yearlyStocks() })],
  render: (_args: unknown, context: any) => {
    const container = initializeContainer();
    chart(context.loaded.stocks, { schema: { date: Unit.time() }, w: 560, h: 320 })
      .flow(
        group({ by: "symbol" }),
        scatter({ by: "date", x: "date", y: "price" })
      )
      .mark(
        line({ stroke: "symbol", strokeWidth: 2 }).label("symbol", {
          position: Place.end(),
        })
      )
      .render(container, { axes: true, legend: false });
    return container;
  },
};

// ─── lines: Place.along({ orient: "sloped" }) ────────────────────────────────
// Inline labels sit on the line 60% of the way along it, turned to the line,
// with a halo so the line does not run through the text. A label that would
// cover another line slides along its own.
export const InlineSlopedLabels: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Line Chart with Inline Labels",
      description:
        "The same stock prices with each name written on its own line, turned to follow it and outlined in white, sliding along the line wherever another line would cross it.",
    },
  },
  loaders: [async () => ({ stocks: await yearlyStocks() })],
  render: (_args: unknown, context: any) => {
    const container = initializeContainer();
    chart(context.loaded.stocks, { schema: { date: Unit.time() }, w: 560, h: 320 })
      .flow(
        group({ by: "symbol" }),
        scatter({ by: "date", x: "date", y: "price" })
      )
      .mark(
        line({ stroke: "symbol", strokeWidth: 2 }).label("symbol", {
          position: Place.along({ at: 0.6, orient: "sloped" }),
          halo: {},
          fontWeight: 600,
        })
      )
      .render(container, { axes: true, legend: false });
    return container;
  },
};

// ─── areas: Place.interior() ─────────────────────────────────────────────────
// A band's label goes inside it by default (`Place.interior()`), where the
// label's own box can grow largest: the thick middle of each stream.
export const StreamgraphInteriorLabels: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Streamgraph with Band Labels",
      description:
        "Fish catch by species across six lakes as a streamgraph, each species named inside its band where the band is thick enough to hold the name.",
    },
  },
  render: () => {
    const container = initializeContainer();
    chart(seafood, { w: 520, h: 360 })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 64, alignment: "middle" }),
        stack({ by: "species", dir: "y" })
      )
      .mark(
        ribbon({ h: "count", fill: "species", opacity: 0.8 }).label("species")
      )
      .render(container, { legend: false });
    return container;
  },
};

// ─── regions: Place.interior() on non-convex polygons ────────────────────────
// Four wings of a floor plan, each a non-convex polygon. A polygon's label
// goes inside it by default (`Place.interior()`), in the middle of its
// widest arm.
const T = 1.4;
const wings = [
  {
    name: "West Wing",
    ring: [
      [0, 0],
      [4, 0],
      [4, T],
      [T, T],
      [T, 4 - T],
      [4, 4 - T],
      [4, 4],
      [0, 4],
    ],
  },
  {
    name: "Cloister",
    ring: [
      [5, 0],
      [9, 0],
      [9, 4],
      [9 - T, 4],
      [9 - T, T],
      [5 + T, T],
      [5 + T, 4],
      [5, 4],
    ],
  },
  {
    name: "Annex",
    ring: [
      [10, 0],
      [14, 0],
      [14, T],
      [10 + T, T],
      [10 + T, 4],
      [10, 4],
    ],
  },
  {
    name: "Gallery",
    ring: [
      [15, 4],
      [17, 0],
      [19, 4],
      [19 - T * 0.9, 4],
      [17, 1.7],
      [15 + T * 0.9, 4],
    ],
  },
];

export const PolygonInteriorLabels: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(wings, { axes: false, w: 640, h: 150 })
      .flow(group({ by: "name" }))
      .mark(
        polygon({ points: "ring", fill: "name", opacity: 0.85 }).label("name")
      )
      .render(container, { legend: false });
    return container;
  },
};

// The same wings labeled at `"center"`: the center of the box, which for the
// C and the L lies outside the shape. The auto color reads where the label
// landed, so those two labels take the color for the page, not white.
export const PolygonCenterLabels: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(wings, { axes: false, w: 640, h: 150 })
      .flow(group({ by: "name" }))
      .mark(
        polygon({ points: "ring", fill: "name", opacity: 0.85 }).label("name", {
          position: "center",
        })
      )
      .render(container, { legend: false });
    return container;
  },
};

// ─── paths: which side ───────────────────────────────────────────────────────
// A small state diagram whose edges are arrows. `side: "left"` is the side of
// the direction of travel, so every label of the clockwise ring lands outside
// it, and the labels of the two opposite edges between X and Y separate.
// `side: "above"` is the screen's: a vertical edge has no above, so its label
// is hidden.
const EDGE = "#90a4ae";
const stateNodes = [
  { id: "A", x: 0, y: 0 },
  { id: "B", x: 200, y: 0 },
  { id: "C", x: 200, y: 170 },
  { id: "D", x: 0, y: 170 },
  { id: "X", x: 310, y: 85 },
  { id: "Y", x: 480, y: 85 },
];
const stateEdges = [
  { from: "A", to: "B", label: "submit" },
  { from: "B", to: "C", label: "review" },
  { from: "C", to: "D", label: "approve" },
  { from: "D", to: "A", label: "archive" },
  { from: "X", to: "Y", label: "request" },
  { from: "Y", to: "X", label: "reply" },
];
const stateDiagram = (side: "left" | "above" | "on") => {
  const names = Object.fromEntries(
    stateNodes.map((n) => [n.id, createName(n.id)])
  );
  return layer({ x: 20, y: 20 }, [
    ...stateNodes.map((n) =>
      layer({ x: n.x, y: n.y }, [
        layer([
          rect({
            w: 56,
            h: 34,
            rx: 6,
            fill: "#e2ebf6",
            stroke: "#457b9d",
            strokeWidth: 2,
          }).name("box"),
          text({ text: n.id, fontSize: 13, fill: "#1d3557" }).name("id"),
        ]).relate(({ box, id }) => [
          Constraint.align({ x: "middle", y: "middle" }, [box, id]),
        ]),
      ]).name(names[n.id])
    ),
    ...stateEdges.map((e) =>
      arrow(
        {
          stroke: EDGE,
          strokeWidth: 2,
          bow: e.from === "X" || e.from === "Y" ? 0.3 : 0,
          stretch: 0,
          straights: false,
          padStart: 4,
          padEnd: 8,
        },
        [ref(names[e.from]), ref(names[e.to])]
      ).label(() => e.label, {
        position: Place.along({ side, orient: "sloped" }),
        color: "#546e7a",
        background: side === "on" ? {} : undefined,
      })
    ),
  ]);
};

export const ArrowLabelsLeft: StoryObj = {
  render: () => {
    const container = initializeContainer();
    stateDiagram("left").render(container);
    return container;
  },
};

// The same diagram with each label on its edge, on a white box, the way a
// diagram's edge labels are often drawn.
export const ArrowLabelsOnBackground: StoryObj = {
  render: () => {
    const container = initializeContainer();
    stateDiagram("on").render(container);
    return container;
  },
};

export const ArrowLabelsAbove: StoryObj = {
  render: () => {
    const container = initializeContainer();
    stateDiagram("above").render(container);
    return container;
  },
};

// ─── paths: a list of sides ──────────────────────────────────────────────────
// Three close series. With `side: "above"`, Actual has no room above its line
// at the middle, squeezed under Plan, so its label slides back along the
// line to where there is. With `side: ["above", "below"]` every side is
// tried at a spot before the label slides, so it stays at the middle and
// flips below.
const plan = [3.0, 3.6, 4.1, 4.5, 5.0, 5.6, 6.0, 6.3, 6.6];
const budget = [
  ...plan.map((y, x) => ({ series: "Plan", x, y })),
  ...plan.map((y, x) => ({
    series: "Actual",
    x,
    y: y - 0.55 - 0.05 * Math.sin(x),
  })),
  ...[1.2, 1.3, 1.25, 1.5, 1.7, 1.6, 1.9, 2.1, 2.0].map((y, x) => ({
    series: "Cost",
    x,
    y,
  })),
];
const budgetChart = (side: "above" | ("above" | "below")[]) =>
  chart(budget, { w: 360, h: 220 })
    .flow(group({ by: "series" }), scatter({ by: "x", x: "x", y: "y" }))
    .mark(
      line({ stroke: "series", strokeWidth: 2 }).label("series", {
        position: Place.along({ at: 0.5, side, orient: "sloped" }),
        fontWeight: 600,
      })
    );

export const SideAbove: StoryObj = {
  render: () => {
    const container = initializeContainer();
    budgetChart("above").render(container, {
      axes: true,
      legend: false,
    });
    return container;
  },
};

export const SideAboveOrBelow: StoryObj = {
  render: () => {
    const container = initializeContainer();
    budgetChart(["above", "below"]).render(container, {
      axes: true,
      legend: false,
    });
    return container;
  },
};

// ─── avoiding ────────────────────────────────────────────────────────────────
// The scatter of countries with a least-squares trend line. With
// `avoiding: selectAll("trend")` the labels also keep off the line, as they
// keep off the dots and each other.
const trendScatter = (countries: any[]) => {
  const n = countries.length;
  const mx = countries.reduce((s, r) => s + r.fertility, 0) / n;
  const my = countries.reduce((s, r) => s + r.life_expect, 0) / n;
  const slope =
    countries.reduce(
      (s, r) => s + (r.fertility - mx) * (r.life_expect - my),
      0
    ) / countries.reduce((s, r) => s + (r.fertility - mx) ** 2, 0);
  const xs = countries.map((r) => r.fertility);
  const ends = [Math.min(...xs), Math.max(...xs)].map((fertility) => ({
    fertility,
    life_expect: my + slope * (fertility - mx),
  }));
  // The trend line is drawn first, so it is placed when the labels look
  // for it.
  return chart(ends, { w: 640, h: 440 })
    .flow(scatter({ by: "fertility", x: "fertility", y: "life_expect" }))
    .mark(blank().name("ends"))
    .layer(
      chart(selectAll("ends")).mark(
        line({ stroke: "#9e9e9e", strokeWidth: 2 }).name("trend")
      )
    )
    .layer(
      chart(countries)
        .flow(scatter({ by: "country", x: "fertility", y: "life_expect" }))
        .mark(
          circle({ r: 4 }).label("country", { avoiding: selectAll("trend") })
        )
    );
};

export const AvoidingTrendLine: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Point Labels Avoiding a Trend Line",
      description:
        "The countries' scatter with its least-squares trend line, each country label placed clear of the line as well as of the dots and the other labels.",
    },
  },
  loaders: [
    async () => ({
      countries: ((await data["gapminder.json"]()) as any[])
        .filter((d) => d.year === 2005)
        .sort((a, b) => b.pop - a.pop)
        .slice(0, 36),
    }),
  ],
  render: (_args: unknown, context: any) => {
    const container = initializeContainer();
    trendScatter(context.loaded.countries).render(container, { axes: true });
    return container;
  },
};

// ─── boxes: Place.around on bars ─────────────────────────────────────────────
// Each bar's value goes above it, or just inside its top when there is no
// room above (the tallest bar reaches the top of the plot).
const sales = [
  { month: "Jan", units: 42 },
  { month: "Feb", units: 58 },
  { month: "Mar", units: 100 },
  { month: "Apr", units: 77 },
  { month: "May", units: 64 },
  { month: "Jun", units: 91 },
];

export const BarValuesAboveOrInside: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(sales, { w: 320, h: 200 })
      .flow(spread({ by: "month", dir: "x" }))
      .mark(
        rect({ h: "units", fill: "#4e79a7" }).label("units", {
          position: Place.around({
            directions: ["top"],
            side: ["outset", "inset"],
          }),
        })
      )
      .render(container, { axes: true });
    return container;
  },
};

// ─── boxes: a part of the outline ────────────────────────────────────────────
// `at: "x-max"` names a bar's right edge, so each label sits just past the
// end of its bar, within the bar's height, or just inside the end when the
// bar reaches the end of the plot.
export const BarEndPart: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(sales, { w: 320, h: 200 })
      .flow(spread({ by: "month", dir: "y" }))
      .mark(
        rect({ w: "units", fill: "#59a14f" }).label("units", {
          position: Place.along({ at: "x-max", side: ["outset", "inset"] }),
        })
      )
      .render(container, { axes: true });
    return container;
  },
};

// ─── boxes: inside first ─────────────────────────────────────────────────────
// Counts that span three orders of magnitude. Each bar's value goes just
// inside its top, or above it when the bar is too short to hold it.
const counts = [
  { k: "A", v: 2 },
  { k: "B", v: 6 },
  { k: "C", v: 14 },
  { k: "D", v: 35 },
  { k: "E", v: 120 },
  { k: "F", v: 1450 },
];

export const BarValuesInsideOrAbove: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(counts, { w: 320, h: 200 })
      .flow(spread({ by: "k", dir: "x" }))
      .mark(
        rect({ h: "v", fill: "#4e79a7" }).label("v", {
          position: Place.around({
            directions: ["top"],
            side: ["inset", "outset"],
          }),
        })
      )
      .render(container, { axes: true });
    return container;
  },
};

// The same counts across: each value goes just inside the end of its bar,
// or just past the end when the bar is too short to hold it.
export const BarValuesInsideOrPastEnd: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(counts, { w: 320, h: 200 })
      .flow(spread({ by: "k", dir: "y" }))
      .mark(
        rect({ w: "v", fill: "#59a14f" }).label("v", {
          position: Place.along({ at: "x-max", side: ["inset", "outset"] }),
        })
      )
      .render(container, { axes: true });
    return container;
  },
};
