import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocations } from "../../src/data/catch";
import {
  Chart,
  scatter,
  spread,
  rect,
  layer,
  selectAll,
  group,
  petal,
  stackX,
  polar,
  v,
} from "../../src/lib";
import { color } from "../../src/color";

const meta: Meta = {
  title: "Low Level Syntax/Flower Chart",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 1400, step: 20 } },
    h: { control: { type: "number", min: 200, max: 800, step: 20 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// Fixed radius of every flower head, in pixels. The petals fan out to this
// shared length; only their colors and angular widths vary with the data.
const FLOWER_RADIUS = 40;

// Each species row tagged with its lake's planting location on x.
const stemData = seafood.map((d) => ({
  ...d,
  x: catchLocations[d.lake as keyof typeof catchLocations].x,
}));

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Flower Chart",
      description:
        "A distribution rendered as a meadow, where each binned count grows a layered flower of colored petals atop a green stem.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    // The same shape as a labeled bar chart — but the bars are stems and the
    // labels are flowers. The stems are a real bar chart, so their heights
    // share one scale and grow with each lake's total catch (the `count` size
    // channel auto-sums per lake); each flower is the stem's "label", placed on
    // top of it via the selectAll + spread pattern.
    layer([
      // Stems: one thin green bar per lake, planted at the lake's x location,
      // height = total catch (one chart, so all stems share the height scale).
      Chart(stemData)
        .flow(scatter({ by: "lake", x: "x" }))
        .mark(rect({ w: 4, h: "count", fill: color.green[5] }).name("stems")),
      // Flowers: each stem's label. `selectAll("stems")` yields one ref per
      // lake (its datum is that lake's species rows); stack a polar petal fan
      // on top of the stem.
      Chart(selectAll("stems"))
        .flow(group({ by: "datum.lake" }))
        .mark(((d: any[]) =>
          spread({ dir: "y", alignment: "middle", spacing: -FLOWER_RADIUS }, [
            d[0],
            layer({ coord: polar() }, [
              stackX(
                {
                  h: FLOWER_RADIUS,
                  spacing: 0,
                  alignment: "start",
                  sharedScale: true,
                },
                (d[0].datum as { species: string; count: number }[]).map((r) =>
                  petal({
                    w: v(r.count),
                    fill: v(r.species).lighten(0.5),
                  })
                )
              ),
            ]),
          ])) as any),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: false,
    });

    return container;
  },
};
