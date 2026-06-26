import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { titanic } from "../../src/data/titanic";
import { layer, spreadX, spreadY, stackY, rect, For, ribbon, ref } from "../../src/lib";
import { color6, gray, neutral } from "../../src/color";
import { groupBy } from "lodash";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Sankey Tree",
};
export default meta;

const classColor = {
  First: color6[0],
  Second: color6[1],
  Third: color6[2],
  Crew: color6[3],
};

export const Default: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Sankey Tree",
      description:
        "A branching flow diagram where the width of each tapering band encodes the magnitude of a quantity as it splits across successive tiers.",
    },
  },
  render: () => {
    const container = initializeContainer();
    const layerSpacing = 64;
    const internalSpacing = 2;
    layer([
      spreadX({ spacing: layerSpacing, alignment: "middle" }, [
        stackY(
          // y-down: reverse every vertical ordering so the tiers read the same
          // way they did under the old y-up convention. See issue #143/#16.
          { spacing: 0, alignment: "middle", reverse: true },
          For(groupBy(titanic, "class"), (items, cls) =>
            rect({
              w: 40,
              h: _(items).sumBy("count") / 10,
              fill: neutral,
            }).name(`${cls}-src`)
          )
        ),
        spreadY(
          { spacing: internalSpacing, alignment: "middle", reverse: true },
          For(groupBy(titanic, "class"), (items, cls) =>
            spreadX({ spacing: layerSpacing, alignment: "middle" }, [
              stackY(
                { spacing: 0, alignment: "middle", reverse: true },
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
                  reverse: true,
                },
                For(groupBy(items, "sex"), (items, sex) =>
                  spreadX({ spacing: layerSpacing, alignment: "middle" }, [
                    stackY(
                      {
                        spacing: 0,
                        alignment: "middle",
                        reverse: true,
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
                        reverse: true,
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
        ribbon(
          {
            dir: "x",
            fill: classColor[cls],
            interpolation: "bezier",
            opacity: 0.7,
            mixBlendMode: "multiply",
          },
          [ref(`${cls}-src`), ref(`${cls}-tgt`)]
        ),
        For(groupBy(items, "sex"), (sexItems, sex) => [
          ribbon(
            {
              dir: "x",
              fill: sex === "Female" ? color6[4] : color6[5],
              interpolation: "bezier",
              opacity: 0.7,
              mixBlendMode: "multiply",
            },
            [ref(`${cls}-${sex}-src`), ref(`${cls}-${sex}-tgt`)]
          ),
          For(groupBy(sexItems, "survived"), (survivedItems, survived) =>
            ribbon(
              {
                dir: "x",
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
                mixBlendMode: "multiply",
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
      axes: true,
    });
    return container;
  }
}
