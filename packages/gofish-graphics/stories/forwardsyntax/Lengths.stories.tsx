import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import {
  chart,
  spread,
  stack,
  ribbon,
  rect,
  text,
  layer,
  value,
  percent,
  fr,
  Color,
} from "../../src/lib";

// Lengths (#1176 step 6): a size or a gap given as `percent(n)` of the room
// it is laid out in, or as `fr(k)`, k shares of the room its nearest scope
// divides.
const meta: Meta = { title: "Forward Syntax/Lengths" };
export default meta;

const sales = [
  { store: "North", quarter: "Q1", sales: 32 },
  { store: "North", quarter: "Q2", sales: 41 },
  { store: "North", quarter: "Q3", sales: 38 },
  { store: "North", quarter: "Q4", sales: 52 },
  { store: "Harbor", quarter: "Q1", sales: 24 },
  { store: "Harbor", quarter: "Q2", sales: 22 },
  { store: "Harbor", quarter: "Q3", sales: 30 },
  { store: "Harbor", quarter: "Q4", sales: 27 },
  { store: "Hill", quarter: "Q1", sales: 45 },
  { store: "Hill", quarter: "Q2", sales: 39 },
  { store: "Hill", quarter: "Q3", sales: 33 },
  { store: "Hill", quarter: "Q4", sales: 36 },
];
const north = sales.filter((r) => r.store === "North");

/** A labeled box: a filled rect that fills its room, and its label. */
const panel = (dims: Record<string, unknown>, fill: string, label: string) =>
  layer(dims, [
    rect({ fill, stroke: "#555", strokeWidth: 1 }),
    text({ text: label, fontSize: 12 }),
  ]);

export const AreaFrGaps: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Area Chart With Flexible Gaps",
      description:
        "Fish catch by lake and species as stacked areas whose gaps between lakes share the chart's whole width.",
    },
  },
  render: () => {
    const container = initializeContainer();
    chart(seafood, { w: 500, h: 200 })
      .flow(
        spread({ by: "lake", dir: "x", spacing: fr(1) }),
        stack({ by: "species", dir: "y" })
      )
      .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 }))
      .render(container);
    return container;
  },
};

export const SidebarAndFrPanels: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: 720, h: 260 }, [
      spread({ dir: "x", spacing: 12, alignment: "start" }, [
        panel({ w: 140, h: 260 }, "#eeeeee", "sidebar 140 px"),
        panel({ w: fr(2), h: 260 }, "#dbe9f6", "main fr(2)"),
        panel({ w: fr(1), h: 260 }, "#fde7d4", "inspector fr(1)"),
      ]),
    ]).render(container, {});
    return container;
  },
};

export const SidebarAndFrCharts: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: 760, h: 260 }, [
      spread({ dir: "x", spacing: 24, alignment: "end" }, [
        panel({ w: 120, h: 200 }, "#eeeeee", "filters 120 px"),
        chart(sales, { w: fr(2), h: 200 })
          .flow(
            spread({ by: "quarter", dir: "x", spacing: 6 }),
            stack({ by: "store", dir: "y" })
          )
          .mark(rect({ h: "sales", fill: "store" })),
        chart(sales, { w: fr(1), h: 200 })
          .flow(spread({ by: "store", dir: "x", spacing: 6 }))
          .mark(rect({ h: "sales", fill: "#08519c" })),
      ]),
    ]).render(container, {});
    return container;
  },
};

export const Dashboard30And70: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: 720, h: 120 }, [
      spread({ dir: "x", spacing: 0, alignment: "start" }, [
        panel({ w: percent(30), h: 120 }, "#dbe9f6", "percent(30)"),
        panel({ w: percent(70), h: 120 }, "#fde7d4", "percent(70)"),
      ]),
    ]).render(container, {});
    return container;
  },
};

// 216 + 12 + 504 = 732 px in a 720 px layer: no content minimum, so the row
// overflows by its gap, and the layout warns.
export const Dashboard30And70WithGap: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: 720, h: 120 }, [
      spread({ dir: "x", spacing: 12, alignment: "start" }, [
        panel({ w: percent(30), h: 120 }, "#dbe9f6", "percent(30)"),
        panel({ w: percent(70), h: 120 }, "#fde7d4", "percent(70)"),
      ]),
    ]).render(container, {});
    return container;
  },
};

export const Dashboard3frAnd7frWithGap: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: 720, h: 120 }, [
      spread({ dir: "x", spacing: 12, alignment: "start" }, [
        panel({ w: fr(3), h: 120 }, "#dbe9f6", "fr(3)"),
        panel({ w: fr(7), h: 120 }, "#fde7d4", "fr(7)"),
      ]),
    ]).render(container, {});
    return container;
  },
};

export const BarsInsetPercent: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(north, { w: 400, h: 200 })
      .flow(spread({ by: "quarter", dir: "x", spacing: 0 }))
      .mark(rect({ h: "sales", fill: "#08519c", inset: percent(10) }))
      .render(container);
    return container;
  },
};

export const BarsFrSpacing: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(north, { w: 400, h: 200 })
      .flow(spread({ by: "quarter", dir: "x", spacing: fr(0.25) }))
      .mark(rect({ h: "sales", fill: "#08519c" }))
      .render(container);
    return container;
  },
};

const STORE_COLORS: Record<string, string> = {
  North: "#4e79a7",
  Harbor: "#f28e2b",
  Hill: "#59a14f",
};

export const LegendColumnPercent: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: 640, h: 260 }, [
      spread({ dir: "x", spacing: 16, alignment: "end" }, [
        chart(sales, {
          w: fr(1),
          h: 200,
          legend: false,
          color: Color.palette(STORE_COLORS),
        })
          .flow(
            spread({ by: "quarter", dir: "x", spacing: 8 }),
            stack({ by: "store", dir: "y" })
          )
          .mark(rect({ h: "sales", fill: "store" })),
        layer({ w: percent(20), h: 200 }, [
          spread(
            { dir: "y", spacing: 6, alignment: "start" },
            Object.entries(STORE_COLORS).map(([store, fill]) =>
              spread({ dir: "x", spacing: 6, alignment: "middle" }, [
                rect({ w: 12, h: 12, fill }),
                text({ text: store, fontSize: 12 }),
              ])
            )
          ),
        ]),
      ]),
    ]).render(container, { legend: false });
    return container;
  },
};

export const SmallMultiplesPercentSpacing: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(sales, { w: 600, h: 200 })
      .flow(spread({ by: "store", dir: "x", spacing: percent(5) }))
      .mark(
        chart({ axes: false })
          .flow(spread({ by: "quarter", dir: "x", spacing: fr(0.25) }))
          .mark(rect({ h: "sales", fill: "#08519c" }))
      )
      .render(container);
    return container;
  },
};

// The bar widths are data, so σ is pixels per sales unit, and `fr(0.25)` is
// a quarter of a sales unit: the layout warns that x mixes sizes.
export const FrInDataScopeWarns: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(north, { w: 400, h: 200 })
      .flow(spread({ by: "quarter", dir: "x", spacing: fr(0.25) }))
      .mark(rect({ w: "sales", h: "sales", fill: "#08519c" }))
      .render(container);
    return container;
  },
};

// Each quarter's band holds a bar that fills it and, at the bar's value, a
// cap 40% of the band wide: the cap's room is the band, so its width is 0.4σ.
export const PercentOfBand: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(north, { w: 400, h: 200 })
      .flow(spread({ by: "quarter", dir: "x", spacing: 8 }))
      .mark((d: any[]) =>
        layer([
          rect({ h: value(d[0].sales), fill: "#9ecae1" }),
          rect({ y: value(d[0].sales), w: percent(40), h: 4, fill: "#08519c" }),
        ])
      )
      .render(container);
    return container;
  },
};
