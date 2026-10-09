import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  scatter,
  circle,
  rect,
  derive,
  field,
  layer,
  Constraint,
} from "../../src/lib";
import { penguins } from "../../src/data/penguins";

// Mirrors seaborn's jointplot:
//   sns.jointplot(data=penguins, x="bill_length_mm", y="bill_depth_mm")
// https://seaborn.pydata.org/generated/seaborn.jointplot.html
// (Our penguins export renames the fields to "Beak ..." rather than "bill ...".)

const meta: Meta = {
  title: "Seaborn/Marginal Histogram",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};

export default meta;

type Args = { w: number; h: number };

// The bins of `column`, `step` wide, as rows: each bin's edges and the number
// of rows in it.
// TODO(#1058): use `partition` with `field(column).bin({ step })` once it
// lands. The marginal bars must sit on the scatter's continuous scale, and
// `field(x).bin(p)` alone gives equal slots on an ordinal axis.
const histogram =
  (column: string, step: number) => (rows: Record<string, any>[]) => {
    const counts = new Map<number, number>();
    for (const r of rows) {
      const start = Math.floor(r[column] / step) * step;
      counts.set(start, (counts.get(start) ?? 0) + 1);
    }
    return [...counts]
      .sort(([a], [b]) => a - b)
      .map(([start, count]) => ({ start, end: start + step, count }));
  };

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Marginal Histogram (Jointplot)",
      description: "A scatter plot of penguin beak length against beak depth framed by marginal histograms of each variable along the top and right edges.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    // Our penguins export uses "Beak ..." rather than seaborn's "bill ..." field names.
    const data = penguins
      .filter(
        (d) =>
          (d as any)["Beak Length (mm)"] != null &&
          (d as any)["Beak Depth (mm)"] != null
      )
      .map((d, i) => ({ ...d, id: i }));

    (async () => {
      const sc = await chart(data)
        .flow(
          scatter({ by: "id", x: "Beak Length (mm)", y: "Beak Depth (mm)" } as any)
        )
        .mark(circle({ r: 3, fill: "steelblue", fillOpacity: 0.6 }))
        .resolve();
      sc.name("scatter");

      const topHist = await chart(data, { h: 80 })
        .flow(
          derive(histogram("Beak Length (mm)", 2)),
          scatter({
            xMin: field("start", "Beak Length (mm)"),
            xMax: field("end", "Beak Length (mm)"),
          } as any)
        )
        .mark(rect({ h: "count", fill: "steelblue" } as any))
        .resolve();
      topHist.name("topHist");

      const rightHist = await chart(data, { w: 80 })
        .flow(
          derive(histogram("Beak Depth (mm)", 1)),
          scatter({
            yMin: field("start", "Beak Depth (mm)"),
            yMax: field("end", "Beak Depth (mm)"),
          } as any)
        )
        .mark(rect({ w: "count", fill: "steelblue" } as any))
        .resolve();
      rightHist.name("rightHist");

      const GAP = 10;
      await layer([sc, topHist, rightHist])
        .relate(({ scatter, topHist, rightHist }: any) => [
          Constraint.position({ x: 0, y: 0, anchor: "baseline" }, [scatter]),
          Constraint.align({ x: "baseline" } as any, [scatter, topHist]),
          Constraint.align({ y: "baseline" } as any, [scatter, rightHist]),
          Constraint.position({ y: args.h + GAP, anchor: "start" } as any, [topHist]),
          Constraint.position({ x: args.w + GAP, anchor: "start" } as any, [rightHist]),
        ])
        .render(container, {
          w: args.w,
          h: args.h,
          axes: { x: { title: "Beak Length (mm)" }, y: { title: "Beak Depth (mm)" } },
        } as any);
    })();

    return container;
  },
};
