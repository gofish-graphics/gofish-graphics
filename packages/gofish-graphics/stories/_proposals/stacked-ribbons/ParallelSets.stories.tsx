import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { titanic } from "../../../src/data/titanic";
import {
  chart,
  spread,
  stack,
  rect,
  ribbon,
  selectAll,
  group,
  layer,
  field,
} from "../../../src/lib";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Parallel Sets" };
export default meta;

// Approach B: "ends are rows". Each titanic row is one PATH through the three
// axes; unpivot it into one row per (path, axis): the path's END on that axis.
const AXES = ["class", "sex", "survived"] as const;
export function unpivotEnds<T extends Record<string, any>>(
  rows: T[],
  axes: readonly (keyof T & string)[],
  value: keyof T & string
) {
  return rows.flatMap((r, path) =>
    axes.map((axis) => ({
      ...r,
      path,
      axis,
      category: String(r[axis]),
      value: r[value] as number,
    }))
  );
}

// Path order = lexicographic order of the path's categories, so ribbons leave
// and enter each category bar in a consistent order (few crossings).
const sorted = [...titanic].sort(
  (a, b) =>
    a.class.localeCompare(b.class) ||
    a.sex.localeCompare(b.sex) ||
    a.survived.localeCompare(b.survived)
);
const ends0 = unpivotEnds(sorted, AXES, "count");

// Per-end sort key (the crossing-reducer): inside a category on axis k, order
// the ends by the path's category on the NEIGHBOR axes, nearest first
// (k-1, k-2, ..., then k+1, ...). A single `by: "path"` cannot express this
// because the right order differs per axis.
const ends = ends0.map((e) => {
  const k = AXES.indexOf(e.axis as any);
  const order = [...AXES.slice(0, k).reverse(), ...AXES.slice(k + 1)];
  return { ...e, rank: order.map((a) => String(e[a])).join("|") };
});

// 3. Same as ByPath, with the per-axis sort key.
export const Ranked: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      chart(ends)
        .flow(
          spread({ by: "axis", dir: "x", spacing: 120 }),
          spread({ by: field("category").sort(), dir: "y", spacing: 12 }),
          spread({ by: field("rank").sort(), dir: "y", spacing: 0, axes: false })
        )
        .mark(rect({ w: 12, h: "value", fill: "class" }).name("ends")),
      chart(selectAll("ends"))
        .flow(group({ by: "path" }))
        .mark(ribbon({ opacity: 0.6, fill: "class" })),
    ]).render(container, { w: 500, h: 400 });
    return container;
  },
};

// 1. Fused bag form: `.layer(ribbon())` over the flow, path tier = axis.
export const Fused: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(ends)
      .flow(
        spread({ by: "axis", dir: "x", spacing: 120 }),
        spread({ by: "category", dir: "y", spacing: 12 }),
        stack({ by: "path", dir: "y" })
      )
      .mark(rect({ w: 12, h: "value", fill: "class" }))
      .layer(ribbon({ opacity: 0.6, fill: "class", along: "axis" }))
      .render(container, { w: 500, h: 400 });
    return container;
  },
};

// 2. Refs-bag form: name the ports, regroup them by path, one ribbon per path.
export const ByPath: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      chart(ends)
        .flow(
          spread({ by: "axis", dir: "x", spacing: 120 }),
          spread({ by: "category", dir: "y", spacing: 12 }),
          stack({ by: "path", dir: "y" })
        )
        .mark(rect({ w: 12, h: "value", fill: "class" }).name("ends")),
      chart(selectAll("ends"))
        .flow(group({ by: "path" }))
        .mark(ribbon({ opacity: 0.6, fill: "class" })),
    ]).render(container, { w: 500, h: 400 });
    return container;
  },
};

// Probe: the same fused form without the category tier. If ribbons appear,
// the category tier's split is what emptied Fused.
export const FusedNoCategory: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(ends)
      .flow(
        spread({ by: "axis", dir: "x", spacing: 120 }),
        spread({ by: "path", dir: "y", spacing: 0 })
      )
      .mark(rect({ w: 12, h: "value", fill: "class" }))
      .layer(ribbon({ opacity: 0.6, fill: "class", along: "axis" }))
      .render(container, { w: 500, h: 400 });
    return container;
  },
};
