import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { titanic } from "../../src/data/titanic";
import { spreadY, spreadX, /* enclose, */ ellipse } from "../../src/lib";
import { color6, gray } from "../../src/color";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Nested Waffle Chart",
};
export default meta;

type Args = { w: number; h: number };

const classColor = {
  First: color6[0],
  Second: color6[1],
  Third: color6[2],
  Crew: color6[3],
};

export const Default: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Nested Waffle Chart",
      description:
        "Titanic survival by passenger class shown as nested waffle grids, where colored dots fill each block in proportion to the count it represents.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    spreadY({ dir: "y", spacing: 8, alignment: "middle", sharedScale: true },
      _(titanic)
        .groupBy("class")
        .map((cls) =>
          spreadX(
            { spacing: 4, alignment: "end" },
            _(cls)
              .groupBy("sex")
              .map((sex) =>
                spreadY(
                  { spacing: 0.5, alignment: "end" },
                  _(sex) // Was missing this lodash chain before .reverse()
                    .reverse()
                    .flatMap((d) => Array(d.count).fill(d))
                    .chunk(
                      Math.ceil(
                        (_(sex).sumBy("count") / _(cls).sumBy("count")) * 32
                      )
                    )
                    .reverse()
                    .map((d) =>
                      spreadX(
                        { spacing: 0.5, alignment: "end" },
                        d.map((d) =>
                          ellipse({
                            w: 4,
                            h: 4,
                            fill:
                              d.survived === "No"
                                ? gray
                                : /* value(d.class) */ classColor[d.class],
                          })
                        )
                      )
                    )
                    .value()
                )
              )
              .value()
          )
        )
        .value()
    ).render(container, {
      axes: true,
    });
    return container;
  }
}
