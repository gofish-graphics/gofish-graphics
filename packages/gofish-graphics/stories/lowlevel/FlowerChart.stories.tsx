import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocations } from "../../src/data/catch";
import { layer, rect, For, petal, stackX, polar, v } from "../../src/lib";
import { color, color6 } from "../../src/color";
import { mix } from "spectral.js";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Flower Chart",
};
export default meta;

type Args = { w: number; h: number };

const scatterData = _(seafood)
  .groupBy("lake")
  .map((lakeData, lake) => ({
    lake,
    x: catchLocations[lake].x,
    y: catchLocations[lake].y,
    collection: lakeData.map((item) => ({
      species: item.species,
      count: item.count,
    })),
  }))
  .value();

export const Default: StoryObj<Args> = {
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
    layer(
      // `.map` (not `For`) so the outer `layer(...)` receives a real array:
      // unlike `frame`, layer's operator wrapper doesn't unwrap a bare `For`
      // promise passed as its sole argument.
      scatterData.map((sample) =>
        layer({ x: sample.x }, [
          rect({
            w: 2,
            h: sample.y,
            fill: color.green[5],
          }),
          layer(
            {
              y: sample.y,
              coord: polar(),
            },
            [
              stackX(
                {
                  h: _(sample.collection).sumBy("count") / 7,
                  spacing: 0,
                  alignment: "start",
                  sharedScale: true,
                },
                For(sample.collection, (d, i) =>
                  petal({
                    w: v(d.count),
                    fill: mix(color6[i % 6], color.white, 0.5),
                  })
                )
              ),
            ]
          ),
        ])
      )
    ).render(container, {
      axes: true,
    });

    return container;
  }
}
