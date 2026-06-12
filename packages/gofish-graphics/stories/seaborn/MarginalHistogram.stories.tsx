import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Chart, scatter, circle, rect, derive, bin, layer, Constraint } from "../../src/lib";
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

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
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
      const sc = await Chart(data)
        .flow(
          scatter({ by: "id", x: "Beak Length (mm)", y: "Beak Depth (mm)" } as any)
        )
        .mark(circle({ r: 3, fill: "steelblue", fillOpacity: 0.6 }))
        .resolve();
      sc.name("scatter");

      const topHist = await Chart(data, { h: 80 })
        .flow(
          derive(bin("Beak Length (mm)")),
          scatter({ xMin: "start", xMax: "end" } as any)
        )
        .mark(rect({ h: "count", fill: "steelblue" } as any))
        .resolve();
      topHist.name("topHist");

      const rightHist = await Chart(data, { w: 80 })
        .flow(
          derive(bin("Beak Depth (mm)")),
          scatter({ yMin: "start", yMax: "end" } as any)
        )
        .mark(rect({ w: "count", fill: "steelblue" } as any))
        .resolve();
      rightHist.name("rightHist");

      const GAP = 10;
      await layer([sc, topHist, rightHist])
        .constrain(({ scatter, topHist, rightHist }: any) => [
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
