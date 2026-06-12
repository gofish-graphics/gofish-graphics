import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Chart, scatter, circle, rect, derive, bin, layer, Constraint } from "../../src/lib";
import { penguins } from "../../src/data/penguins";

const meta: Meta = {
  title: "Vega-Lite/Marginal Histogram",
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

      await layer([sc, topHist, rightHist])
        .constrain(({ scatter, topHist, rightHist }: any) => [
          Constraint.align({ x: "baseline", y: "baseline" } as any, [scatter]),
          Constraint.align({ x: "baseline" } as any, [scatter, topHist]),
          Constraint.align({ y: "baseline" } as any, [scatter, rightHist]),
          Constraint.distribute({ dir: "y", spacing: 10 }, [scatter, topHist]),
          Constraint.distribute({ dir: "x", spacing: 10 }, [scatter, rightHist]),
        ])
        .render(container, { w: args.w, h: args.h, axes: true } as any);
    })();

    return container;
  },
};
