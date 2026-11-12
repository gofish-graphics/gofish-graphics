import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  spread,
  stack,
  partition,
  rect,
  field,
  derive,
  Unit,
  Trait,
  Domain,
  Calendar,
  Bin,
  Coord,
} from "../../src/lib";

// Renders for the type-system proposal (proposals/type-system/). Each story
// draws what GoFish draws TODAY for one example in the proposal. The data is
// small, synthetic example data.

const meta: Meta = { title: "Probe/Type System Proposal" };
export default meta;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WAREHOUSES = ["North", "South", "West"];

// Example data: one row per warehouse per month. `stock` is the inventory on
// hand at the end of the month (a level), `sold` is the units sold during the
// month (a flow), `price` is the average price per unit (a rate).
const rows = MONTHS.flatMap((month, m) =>
  WAREHOUSES.map((warehouse, w) => {
    const sold = Math.round(
      120 + 60 * Math.sin((m + w * 2) / 2) + 25 * w + 10 * ((m * 7 + w * 3) % 5)
    );
    return {
      warehouse,
      month,
      stock: Math.round(420 + 90 * Math.cos((m + w) / 3) + 60 * w),
      sold,
      price:
        Math.round((9 + 1.5 * Math.sin((m + 3 * w) / 2.5) + w * 0.8) * 100) /
        100,
    };
  })
);

const SIX = MONTHS.slice(0, 6);
const half = rows.filter((r) => SIX.includes(r.month));

const Items = Unit("items", { traits: [Trait.summable()] });
const Month = Unit({
  domain: Domain.discrete(MONTHS),
  traits: [Trait.ordered()],
});

const W = 420;
const H = 260;

// A titled panel inside the story container, so one PNG can hold two charts.
const panel = (container: HTMLElement, caption: string) => {
  const div = document.createElement("div");
  div.style.cssText =
    "display: inline-block; vertical-align: top; margin-right: 28px;";
  const cap = document.createElement("div");
  cap.textContent = caption;
  cap.style.cssText =
    "font: 600 14px/1.3 system-ui, sans-serif; color: #222; margin: 0 0 6px 0;";
  div.appendChild(cap);
  const target = document.createElement("div");
  div.appendChild(target);
  container.appendChild(div);
  return target;
};

// Show the message GoFish throws in place of the chart.
const showError = (container: HTMLElement) => (err: unknown) => {
  const box = document.createElement("pre");
  box.style.cssText =
    `width: ${W}px; box-sizing: border-box; margin: 0; padding: 12px 16px; white-space: pre-wrap; ` +
    "font: 13px/1.4 monospace; color: #8a1c1c; background: #fdecec; border: 1px solid #e3a0a0;";
  box.textContent =
    "ERROR: " + (err instanceof Error ? err.message : String(err));
  container.replaceChildren(box);
};

// a. Months spread on x, warehouses stacked, h = stock. Correct.
export const InventoryByWarehouse: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(half, { schema: { stock: Items }, axes: true, w: W, h: H })
      .flow(
        spread({ by: "month", dir: "x" }),
        stack({ by: "warehouse", dir: "y" })
      )
      .mark(rect({ h: "stock", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// b. Warehouses spread on x, months stacked, h = stock. Draws; wrong.
export const InventoryByMonth: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(half, { schema: { stock: Items }, axes: true, w: W, h: H })
      .flow(
        spread({ by: "warehouse", dir: "x" }),
        stack({ by: "month", dir: "y" })
      )
      .mark(rect({ h: "stock", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// The weighted mean of price by month, written by hand.
const weightedPrice = (rs: typeof rows) =>
  SIX.map((month) => {
    const g = rs.filter((r) => r.month === month);
    const sold = g.reduce((s, r) => s + r.sold, 0);
    return { month, price: g.reduce((s, r) => s + r.price * r.sold, 0) / sold };
  });

// c. One bar per month, h = price over per-warehouse rows: today a sum.
export const PriceSummed: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(half, { axes: true, w: W, h: H })
      .flow(spread({ by: "month", dir: "x" }))
      .mark(rect({ h: "price", fill: "#5b7aa6" }))
      .render(panel(container, 'Today: h = "price" (a sum of 3 prices)'))
      .catch(showError(container));
    chart(half, { axes: true, w: W, h: H })
      .flow(derive(weightedPrice), spread({ by: "month", dir: "x" }))
      .mark(rect({ h: "price", fill: "#5b7aa6" }))
      .render(panel(container, "By hand: mean weighted by sold"))
      .catch(showError(container));
    return container;
  },
};

// c, probe: the same spec with price declared in a unit with no CanSum.
export const PriceSummedDeclared: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(half, { schema: { price: Unit("USD/item") }, axes: true, w: W, h: H })
      .flow(spread({ by: "month", dir: "x" }))
      .mark(rect({ h: "price", fill: "#5b7aa6" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// d. Warehouses stacked, h = price. Draws; wrong.
export const PriceStacked: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(half, { axes: true, w: W, h: H })
      .flow(
        spread({ by: "month", dir: "x" }),
        stack({ by: "warehouse", dir: "y" })
      )
      .mark(rect({ h: "price", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// e. Daily snapshots of stock, binned by month.
const pad = (n: number) => String(n).padStart(2, "0");
const DAYS_IN = [31, 28, 31, 30, 31, 30];
const daily = DAYS_IN.flatMap((n, m) =>
  Array.from({ length: n }, (_, d) => d + 1).flatMap((day) =>
    WAREHOUSES.map((warehouse, w) => ({
      day: `2026-${pad(m + 1)}-${pad(day)}`,
      lastDay: day === n,
      warehouse,
      stock: Math.round(
        420 +
          90 * Math.cos((m + day / n + w) / 3) +
          60 * w +
          15 * Math.sin(day + w)
      ),
    }))
  )
);
const lastOfMonth = (rs: typeof daily) => rs.filter((r) => r.lastDay);

export const DailySnapshots: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(daily, {
      schema: { day: Unit.time(), stock: Items },
      axes: true,
      w: W,
      h: H,
    })
      .flow(
        spread({
          by: field("day").bin(Calendar.year).bin(Calendar.month),
          dir: "x",
        }),
        stack({ by: "warehouse", dir: "y" })
      )
      .mark(rect({ h: "stock", fill: "warehouse" }))
      .render(panel(container, "Today: about 30 days summed per bar"))
      .catch(showError(container));
    chart(daily, {
      schema: { day: Unit.time(), stock: Items },
      axes: true,
      w: W,
      h: H,
    })
      .flow(
        derive(lastOfMonth),
        spread({
          by: field("day").bin(Calendar.year).bin(Calendar.month),
          dir: "x",
        }),
        stack({ by: "warehouse", dir: "y" })
      )
      .mark(rect({ h: "stock", fill: "warehouse" }))
      .render(panel(container, "By hand: the last day of each month"))
      .catch(showError(container));
    return container;
  },
};

// f. Months spread around the clock, h = sold. Today the user picks the
// spacing and the angular width by hand, and the loop does not close evenly:
// 12 widths and 11 spacings leave a larger gap between Dec and Jan.
export const MonthsClock: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, {
      coord: Coord.clock(),
      schema: { month: Month },
      axes: true,
      padding: 60,
      w: 400,
      h: 400,
    })
      .flow(spread({ by: "month", dir: "x", spacing: 0.1 }))
      .mark(rect({ w: 0.4, emX: true, h: "sold", fill: "#5b7aa6" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// j. A histogram with unequal bins, h = count.
// Example data: ages of 400 library members.
const ages = Array.from({ length: 400 }, (_, i) => {
  const u = ((i * 0.6180339887) % 1) * 0.999;
  const v = ((i * 0.7548776662) % 1) * 0.999;
  return { age: Math.round(8 + 70 * (0.55 * u + 0.45 * v) ** 1.15) };
});
export const HistogramUnequal: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(ages, { axes: true, w: W, h: H })
      .flow(
        partition({
          by: field("age").bin(Bin.thresholds([18, 25, 35, 65])),
          dir: "x",
        })
      )
      .mark(rect({ h: field("age").count(), fill: "#5b7aa6", inset: 0.5 }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// k. Bars whose height is a temperature in °C. Example data: mean monthly
// temperature in one city.
const temps = [-3, -1, 4, 10, 16, 21, 24, 23, 18, 11, 5, -1].map((temp, i) => ({
  month: MONTHS[i],
  temp,
}));
export const TempBars: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(temps, { axes: true, w: W, h: H })
      .flow(spread({ by: "month", dir: "x" }))
      .mark(rect({ h: "temp", fill: "#c0675b" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// k, probe: the same spec with temp declared in °C.
export const TempBarsDeclared: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(temps, { schema: { temp: Unit("°C") }, axes: true, w: W, h: H })
      .flow(spread({ by: "month", dir: "x" }))
      .mark(rect({ h: "temp", fill: "#c0675b" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};
