import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import {
  chart,
  spread,
  rect,
  layer,
  selectAll,
  text,
  sumBy,
  group,
  pluck,
} from "../../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Bar/With Labels",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bar Chart with Value Labels",
      description:
        "A bar chart of total fish catch per lake with each bar's total annotated above it.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      chart(seafood)
        .flow(spread({ by: "lake",  dir: "x" }))
        .mark(rect({ h: "count" }).name("bars")),
      // `selectAll("bars")` yields one ref per lake; each ref's datum is that
      // lake's array of species records (an aggregate). `by: "lake"`
      // resolves because every row in a lake agrees on `lake` (homogeneity
      // collapse), giving one frame per lake; sum the aggregate's rows for the
      // per-lake total label.
      chart(selectAll("bars"))
        .flow(group({ by: "lake" }))
        .mark(((d: any[]) => {
          return spread({ dir: "y", alignment: "middle", spacing: 10 },
            [
              d[0],
              text({ text: String(sumBy(d[0].datum, "count")) }),
            ]
          );
        }) as any),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true
    });

    return container;
  },
};

// Demonstrates `pluck` — the un-collapsed sibling of the `by: "field"`
// homogeneity collapse. Within a lake the `species` field is multi-valued, so
// `datum.species` would NOT resolve (the "ill-posed" undefined). `pluck` is how
// you ask for *every* distinct value: here, the count of species in each lake.
export const SpeciesCountPerLake: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      chart(seafood)
        .flow(spread({ by: "lake", dir: "x" }))
        .mark(rect({ h: "count" }).name("bars")),
      chart(selectAll("bars"))
        .flow(group({ by: "lake" }))
        .mark(((d: any[]) => {
          // `pluck(ref, "species")` → the distinct species in this lake's bag.
          const species = pluck(d[0], "species") as string[];
          return spread({ dir: "y", alignment: "middle", spacing: 10 },
            [
              d[0],
              text({ text: `${species.length} spp` }),
            ]
          );
        }) as any),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true
    });

    return container;
  },
};