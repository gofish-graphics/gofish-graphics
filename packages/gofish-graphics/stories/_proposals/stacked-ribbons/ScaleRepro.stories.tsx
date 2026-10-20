import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, stack, rect } from "../../../src/lib";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Scale Repro" };
export default meta;

// Column A: 4 categories of 25 each. Column B: 2 categories of 50 each.
// Both columns total 100, so with one shared scale they should be equally tall.
const rows = [
  ...["a1", "a2", "a3", "a4"].map((c) => ({ col: "A", cat: c, v: 25 })),
  ...["b1", "b2"].map((c) => ({ col: "B", cat: c, v: 50 })),
];

export const SpreadInSpread: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows)
      .flow(
        spread({ by: "col", dir: "x", spacing: 40 }),
        spread({ by: "cat", dir: "y", spacing: 10 })
      )
      .mark(rect({ w: 20, h: "v" }))
      .render(container, { w: 300, h: 300 });
    return container;
  },
};

export const StackInSpread: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows)
      .flow(
        spread({ by: "col", dir: "x", spacing: 40 }),
        stack({ by: "cat", dir: "y" })
      )
      .mark(rect({ w: 20, h: "v" }))
      .render(container, { w: 300, h: 300 });
    return container;
  },
};

const halves = (rs: typeof rows) =>
  rs.flatMap((r) => [
    { ...r, v: r.v / 2, p: 0 },
    { ...r, v: r.v / 2, p: 1 },
  ]);

// Workaround probe: the inner tier as a zero-spacing spread instead of a stack.
export const Spread0InSpreadInSpread: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(halves(rows))
      .flow(
        spread({ by: "col", dir: "x", spacing: 40 }),
        spread({ by: "cat", dir: "y", spacing: 10 }),
        spread({ by: "p", dir: "y", spacing: 0 })
      )
      .mark(rect({ w: 20, h: "v" }))
      .render(container, { w: 300, h: 300 });
    return container;
  },
};

// Probe: two columns with the SAME number of categories but different totals.
export const StackInSpreadSameCount: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const r2 = [
      ...["a1", "a2"].map((c) => ({ col: "A", cat: c, v: 25 })),
      ...["b1", "b2"].map((c) => ({ col: "B", cat: c, v: 50 })),
    ];
    chart(halves(r2))
      .flow(
        spread({ by: "col", dir: "x", spacing: 40 }),
        spread({ by: "cat", dir: "y", spacing: 10 }),
        stack({ by: "p", dir: "y" })
      )
      .mark(rect({ w: 20, h: "v" }))
      .render(container, { w: 300, h: 300 });
    return container;
  },
};

// Same as SpreadInSpread, but the inner tier stacks ends inside each category.
export const StackInSpreadInSpread: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows.flatMap((r) => [{ ...r, v: r.v / 2, p: 0 }, { ...r, v: r.v / 2, p: 1 }]))
      .flow(
        spread({ by: "col", dir: "x", spacing: 40 }),
        spread({ by: "cat", dir: "y", spacing: 10 }),
        stack({ by: "p", dir: "y" })
      )
      .mark(rect({ w: 20, h: "v" }))
      .render(container, { w: 300, h: 300 });
    return container;
  },
};
