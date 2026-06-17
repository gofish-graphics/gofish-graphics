import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocations } from "../../src/data/catch";
import {
  Chart,
  scatter,
  layer,
  rect,
  petal,
  stackX,
  polar,
  v,
  Constraint,
} from "../../src/lib";
import { color } from "../../src/color";
import _ from "lodash";

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

// One flower per lake: petals are species (color), each petal sized by the
// species' catch, and the stem's height encodes the lake's total catch.
// Flowers are planted in a row by lake location (a 1-D scatter on x).
const scatterData = _(seafood)
  .groupBy("lake")
  .map((lakeData, lake) => ({
    lake,
    x: catchLocations[lake as keyof typeof catchLocations].x,
    collection: lakeData.map((item) => ({
      species: item.species,
      count: item.count,
    })),
  }))
  .value();

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

    Chart(scatterData, { axes: false })
      // 1-D scatter: position each flower by its lake's x location; all
      // flowers share a common ground line (alignment on the unpositioned y).
      .flow(scatter({ by: "lake", x: "x", alignment: "start" }))
      .mark((data) => {
        const collection = data[0].collection;
        // Stem height = the lake's total catch, in pixels (1px per fish). Each
        // flower is its own glyph chart, so a data-bound `h: "count"` would be
        // re-fit to that flower's own scale (every stem filling the full
        // height); an absolute height keeps the stems comparable across flowers.
        const total = _.sumBy(collection, "count");

        return Chart(collection).mark(
          layer([
            // Stem: a single green bar whose height encodes the lake's total catch.
            rect({ w: 4, h: total, fill: color.green[5] }).name("stem"),
            // Flower head: petals fanning out to a fixed radius in polar
            // coordinates, one per species — angular width encodes catch, color
            // encodes species (lightened toward white via `.lighten`).
            layer({ coord: polar() }, [
              stackX(
                {
                  h: FLOWER_RADIUS,
                  spacing: 0,
                  alignment: "start",
                  sharedScale: true,
                },
                collection.map((d) =>
                  petal({
                    w: v(d.count),
                    fill: v(d.species).lighten(0.5),
                  })
                )
              ),
            ]).name("flower"),
          ]).constrain(({ stem, flower }) => [
            // Center the flower head over the stem and snap its center onto
            // the stem's top (PICCL's pointSnap(flower, stem, [.5,.5]->[.5,1])).
            Constraint.align({ x: "middle" }, [stem, flower]),
            Constraint.align({ y: ["end", "middle"] }, [stem, flower]),
          ])
        );
      })
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
