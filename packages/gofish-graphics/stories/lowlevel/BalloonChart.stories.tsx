import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocations } from "../../src/data/catch";
import { layer, ellipse, rect, wavy } from "../../src/lib";
import { color, color6 } from "../../src/color";
import { mix } from "spectral.js";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Balloon Chart",
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
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    const colorMap = {
      0: color.red,
      1: color.blue,
      2: color.green,
      3: color.yellow,
      4: color.purple,
      5: color.orange,
    };

    const Balloon = (options) =>
      layer(
        {
          x: options?.x - 15 * (options?.scale ?? 1),
          y: options?.y + 27 * (options?.scale ?? 1),
          box: true,
          transform: {
            scale: { x: options?.scale ?? 1, y: (options?.scale ?? 1) * -1 },
          },
        },
        [
          ellipse({
            cx: 15,
            cy: 15,
            w: 24,
            h: 30,
            fill: (options?.color ?? color.red)[4],
          }),
          ellipse({
            cx: 12,
            cy: 11,
            w: 7,
            h: 11,
            fill: (options?.color ?? color.red)[3],
          }),
          rect({
            cx: 15,
            cy: 32,
            w: 8,
            h: 4,
            fill: (options?.color ?? color.red)[5],
            rx: 3,
            ry: 2,
          }),
          rect({
            cx: 15,
            cy: 32,
            w: 5,
            h: 2.4,
            fill: (options?.color ?? color.red)[6],
            rx: 2,
            ry: 1,
          }),
        ]
      );

    layer(
      { coord: wavy(), x: 0, y: 0 },
      scatterData.map((data, i) =>
        layer({ x: data.x }, [
          rect({
            x: 0,
            y: 0,
            w: 1,
            h: data.y,
            emY: true,
            fill: color.black,
          }),
          Balloon({
            scale: 1,
            x: 0,
            y: data.y,
            color: /* colorMap[i % 6] */[
              null,
              null,
              null,
              mix(color6[i % 6], color.white, 0.5),
              color6[i % 6],
              mix(color6[i % 6], color.black, 0.1),
              mix(color6[i % 6], color.black, 0.35),
            ],
          }),
        ])
      )
    ).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};
