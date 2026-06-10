import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { titanic } from "../../src/data/titanic";
import { layer, spreadX, spreadY, stackY, rect, For, connectX, ref } from "../../src/lib";
import { color6, gray, neutral } from "../../src/color";
import { groupBy } from "lodash";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Sankey Tree",
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

const classColor = {
  First: color6[0],
  Second: color6[1],
  Third: color6[2],
  Crew: color6[3],
};

export const Default: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    const layerSpacing = 64;
    const internalSpacing = 2;
    layer([
      spreadX({ spacing: layerSpacing, alignment: "middle" }, [
        stackY(
          { spacing: 0, alignment: "middle" },
          For(groupBy(titanic, "class"), (items, cls) =>
            rect({
              w: 40,
              h: _(items).sumBy("count") / 10,
              fill: neutral,
            }).name(`${cls}-src`)
          )
        ),
        spreadY(
          { spacing: internalSpacing, alignment: "middle" },
          For(groupBy(titanic, "class"), (items, cls) =>
            spreadX({ spacing: layerSpacing, alignment: "middle" }, [
              stackY(
                { spacing: 0, alignment: "middle" },
                For(groupBy(items, "sex"), (items, sex) =>
                  rect({
                    w: 40,
                    h: _(items).sumBy("count") / 10,
                    fill: classColor[cls],
                  }).name(`${cls}-${sex}-src`)
                )
              ).name(`${cls}-tgt`),
              spreadY(
                {
                  h: _(items).sumBy("count") / 10,
                  spacing: internalSpacing * 2,
                  alignment: "middle",
                },
                For(groupBy(items, "sex"), (items, sex) =>
                  spreadX({ spacing: layerSpacing, alignment: "middle" }, [
                    stackY(
                      {
                        spacing: 0,
                        alignment: "middle",
                      },
                      For(groupBy(items, "survived"), (survivedItems, survived) =>
                        rect({
                          w: 40,
                          h: _(survivedItems).sumBy("count") / 10,
                          fill: sex === "Female" ? color6[4] : color6[5],
                        }).name(`${cls}-${sex}-${survived}-src`)
                      )
                    ).name(`${cls}-${sex}-tgt`),
                    spreadY(
                      {
                        w: 40,
                        spacing: internalSpacing * 4,
                        alignment: "middle",
                      },
                      For(groupBy(items, "survived"), (survivedItems, survived) => {
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
                        }).name(`${cls}-${sex}-${survived}-tgt`);
                      })
                    ),
                  ])
                )
              ),
            ])
          )
        ),
      ]),
      For(groupBy(titanic, "class"), (items, cls) => [
        connectX(
          {
            fill: classColor[cls],
            interpolation: "bezier",
            opacity: 0.7,
          },
          [ref(`${cls}-src`), ref(`${cls}-tgt`)]
        ),
        For(groupBy(items, "sex"), (sexItems, sex) => [
          connectX(
            {
              fill: sex === "Female" ? color6[4] : color6[5],
              interpolation: "bezier",
              opacity: 0.7,
            },
            [ref(`${cls}-${sex}-src`), ref(`${cls}-${sex}-tgt`)]
          ),
          For(groupBy(sexItems, "survived"), (survivedItems, survived) =>
            connectX(
              {
                fill:
                  sex === "Female"
                    ? survived === "No"
                      ? gray
                      : color6[4]
                    : survived === "No"
                      ? gray
                      : color6[5],
                interpolation: "bezier",
                opacity: 0.7,
              },
              [
                ref(`${cls}-${sex}-${survived}-src`),
                ref(`${cls}-${sex}-${survived}-tgt`),
              ]
            )
          ),
        ]),
      ]),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });
    return container;
  }
}
