import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, stack, rect } from "../../src/lib";

// The 32 specs of the type-system proposal's small inventory example
// (proposals/type-system/). Every column is undeclared, so today's engine
// draws every spec. Example data: 3 warehouses, 6 months.

const meta: Meta = { title: "Probe/Type System Grid" };
export default meta;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const WAREHOUSES = ["North", "South", "West"];
const TEMP = [-1, 2, 7, 12, 17, 21];

// stock: inventory at the end of the month (a snapshot). sold: units sold in
// the month. price: average price per unit. temp: mean temperature in °C.
const rows = MONTHS.flatMap((month, m) =>
  WAREHOUSES.map((warehouse, w) => ({
    warehouse,
    month,
    stock: Math.round(420 + 90 * Math.cos((m + w) / 3) + 60 * w),
    sold: Math.round(
      120 + 60 * Math.sin((m + w * 2) / 2) + 25 * w + 10 * ((m * 7 + w * 3) % 5)
    ),
    price:
      Math.round((9 + 1.5 * Math.sin((m + 3 * w) / 2.5) + w * 0.8) * 100) / 100,
    temp: TEMP[m] + 2 * w,
  }))
);

const showError = (container: HTMLElement) => (err: unknown) => {
  const box = document.createElement("pre");
  box.style.cssText =
    "width: 380px; box-sizing: border-box; margin: 0; padding: 12px; white-space: pre-wrap; " +
    "font: 12px/1.4 monospace; color: #8a1c1c; background: #fdecec; border: 1px solid #e3a0a0;";
  box.textContent =
    "ERROR: " + (err instanceof Error ? err.message : String(err));
  container.replaceChildren(box);
};

export const SoldMonth1: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "month", dir: "x" }),
        stack({ by: "warehouse", dir: "y" })
      )
      .mark(rect({ h: "sold", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const SoldMonth2: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "month", dir: "y" }),
        spread({ by: "warehouse", dir: "x" })
      )
      .mark(rect({ h: "sold", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const SoldMonth3: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "month", dir: "x" }),
        spread({ by: "warehouse", dir: "x" })
      )
      .mark(rect({ h: "sold", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const SoldMonth4: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "month", dir: "y" }),
        stack({ by: "warehouse", dir: "y" })
      )
      .mark(rect({ h: "sold", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const SoldWarehouse1: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "warehouse", dir: "x" }),
        stack({ by: "month", dir: "y" })
      )
      .mark(rect({ h: "sold", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const SoldWarehouse2: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "warehouse", dir: "y" }),
        spread({ by: "month", dir: "x" })
      )
      .mark(rect({ h: "sold", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const SoldWarehouse3: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "warehouse", dir: "x" }),
        spread({ by: "month", dir: "x" })
      )
      .mark(rect({ h: "sold", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const SoldWarehouse4: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "warehouse", dir: "y" }),
        stack({ by: "month", dir: "y" })
      )
      .mark(rect({ h: "sold", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const StockMonth1: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
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

export const StockMonth2: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "month", dir: "y" }),
        spread({ by: "warehouse", dir: "x" })
      )
      .mark(rect({ h: "stock", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const StockMonth3: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "month", dir: "x" }),
        spread({ by: "warehouse", dir: "x" })
      )
      .mark(rect({ h: "stock", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const StockMonth4: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "month", dir: "y" }),
        stack({ by: "warehouse", dir: "y" })
      )
      .mark(rect({ h: "stock", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const StockWarehouse1: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
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

export const StockWarehouse2: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "warehouse", dir: "y" }),
        spread({ by: "month", dir: "x" })
      )
      .mark(rect({ h: "stock", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const StockWarehouse3: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "warehouse", dir: "x" }),
        spread({ by: "month", dir: "x" })
      )
      .mark(rect({ h: "stock", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const StockWarehouse4: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "warehouse", dir: "y" }),
        stack({ by: "month", dir: "y" })
      )
      .mark(rect({ h: "stock", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const PriceMonth1: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
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

export const PriceMonth2: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "month", dir: "y" }),
        spread({ by: "warehouse", dir: "x" })
      )
      .mark(rect({ h: "price", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const PriceMonth3: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "month", dir: "x" }),
        spread({ by: "warehouse", dir: "x" })
      )
      .mark(rect({ h: "price", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const PriceMonth4: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "month", dir: "y" }),
        stack({ by: "warehouse", dir: "y" })
      )
      .mark(rect({ h: "price", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const PriceWarehouse1: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "warehouse", dir: "x" }),
        stack({ by: "month", dir: "y" })
      )
      .mark(rect({ h: "price", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const PriceWarehouse2: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "warehouse", dir: "y" }),
        spread({ by: "month", dir: "x" })
      )
      .mark(rect({ h: "price", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const PriceWarehouse3: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "warehouse", dir: "x" }),
        spread({ by: "month", dir: "x" })
      )
      .mark(rect({ h: "price", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const PriceWarehouse4: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "warehouse", dir: "y" }),
        stack({ by: "month", dir: "y" })
      )
      .mark(rect({ h: "price", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const TempMonth1: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "month", dir: "x" }),
        stack({ by: "warehouse", dir: "y" })
      )
      .mark(rect({ h: "temp", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const TempMonth2: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "month", dir: "y" }),
        spread({ by: "warehouse", dir: "x" })
      )
      .mark(rect({ h: "temp", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const TempMonth3: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "month", dir: "x" }),
        spread({ by: "warehouse", dir: "x" })
      )
      .mark(rect({ h: "temp", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const TempMonth4: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "month", dir: "y" }),
        stack({ by: "warehouse", dir: "y" })
      )
      .mark(rect({ h: "temp", fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const TempWarehouse1: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "warehouse", dir: "x" }),
        stack({ by: "month", dir: "y" })
      )
      .mark(rect({ h: "temp", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const TempWarehouse2: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "warehouse", dir: "y" }),
        spread({ by: "month", dir: "x" })
      )
      .mark(rect({ h: "temp", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const TempWarehouse3: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        spread({ by: "warehouse", dir: "x" }),
        spread({ by: "month", dir: "x" })
      )
      .mark(rect({ h: "temp", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

export const TempWarehouse4: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { axes: true, w: 300, h: 220 })
      .flow(
        stack({ by: "warehouse", dir: "y" }),
        stack({ by: "month", dir: "y" })
      )
      .mark(rect({ h: "temp", fill: "month" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};
