import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { titanic } from "../../src/data/titanic";
import { spreadX, spreadY, rect } from "../../src/lib";
import { color6, gray, neutral } from "../../src/color";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Icicle Chart",
};
export default meta;

const classColor = {
  First: color6[0],
  Second: color6[1],
  Third: color6[2],
  Crew: color6[3],
};

export const Simplified: StoryObj = {
  render: () => {
    const container = initializeContainer();

    spreadX({ alignment: "middle", spacing: 0 }, [
      rect({
        w: 40,
        h: _(titanic).sumBy("count") / 10,
        fill: neutral,
      }),
      spreadY(
        { alignment: "middle", spacing: 0 },
        _(titanic)
          .groupBy("class")
          .map((items, cls) =>
            rect({
              w: 40,
              h: _(items).sumBy("count") / 10,
              fill: classColor[cls],
            })
          )
          .value()
      ),
    ]).render(container, {
      axes: true,
    });
    return container;
  },
};

export const Default: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Icicle Chart",
      description:
        "Titanic passengers broken down by class and then survival as an icicle diagram, with nested rectangles in successive columns sized to encode each group's count.",
    },
  },
  render: () => {
    const container = initializeContainer();

    spreadX({ alignment: "middle", spacing: 0 }, [
      rect({
        w: 40,
        h: _(titanic).sumBy("count") / 10,
        fill: neutral,
      }),
      spreadY(
        { alignment: "middle", spacing: 0 },
        _(titanic)
          .groupBy("class")
          .map((items, cls) =>
            spreadX(
              {
                h: _(items).sumBy("count") / 10,
                alignment: "start",
                spacing: 0,
              },
              [
                rect({ w: 40, fill: classColor[cls] }),
                spreadY(
                  { alignment: "middle", spacing: 0 },
                  _(items)
                    .groupBy("sex")
                    .map((items, sex) =>
                      spreadX({ alignment: "middle", spacing: 0 }, [
                        rect({
                          w: 0,
                          h: _(items).sumBy("count") / 10,
                          fill: sex === "Female" ? color6[4] : color6[5],
                        }),
                        spreadY(
                          {
                            w: 40,

                            alignment: "middle",
                            spacing: 0,
                          },
                          _(items)
                            .groupBy("survived")
                            .map((survivedItems, survived) => {
                              return rect({
                                h: _(survivedItems).sumBy("count") / 10,
                                fill:
                                  sex === "Female"
                                    ? survived === "No"
                                      ? gray
                                      : color6[4]
                                    : survived === "No"
                                      ? gray
                                      : color6[5],
                              });
                            })
                            .value()
                        ),
                      ])
                    )
                    .value()
                ),
              ]
            )
          )
          .value()
      ),
    ]).render(container, {
      axes: true,
    });
    return container;
  },
};
