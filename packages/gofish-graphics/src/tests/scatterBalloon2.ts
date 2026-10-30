/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import { stack } from "../ast/graphicalOperators/stack";
import { black, color, color6, mix, white } from "../color";
import { coord } from "../ast/coordinateTransforms/coord";
import { polar_DEPRECATED } from "../ast/coordinateTransforms/polar_DEPRECATED";
import { layer } from "../ast/graphicalOperators/layer";
import { petal } from "../ast/shapes/petal";
import _ from "lodash";
import { balloon } from "./balloon";
import { wavy } from "../ast/coordinateTransforms/wavy";
import { seafood } from "../data/catch";
import { catchLocations } from "../data/catch";
import { frame } from "../ast/graphicalOperators/frame";
const baseData = [
  { category: 1, value: 4 },
  { category: 2, value: 6 },
  { category: 3, value: 10 },
  { category: 4, value: 3 },
  { category: 5, value: 7 },
  { category: 6, value: 8 },
];

// Create ten copies with randomly mutated values
const flowerData = Array.from({ length: 10 }).map(() =>
  baseData.map((item) => ({
    category: item.category,
    value: Math.round(item.value * (0.5 + Math.random())),
  }))
);

const bakedFlowerData = [
  [
    {
      category: 1,
      value: 3,
    },
    {
      category: 2,
      value: 3,
    },
    {
      category: 3,
      value: 8,
    },
    {
      category: 4,
      value: 3,
    },
    {
      category: 5,
      value: 6,
    },
    {
      category: 6,
      value: 9,
    },
  ],
  [
    {
      category: 1,
      value: 4,
    },
    {
      category: 2,
      value: 9,
    },
    {
      category: 3,
      value: 8,
    },
    {
      category: 4,
      value: 4,
    },
    {
      category: 5,
      value: 8,
    },
    {
      category: 6,
      value: 11,
    },
  ],
  [
    {
      category: 1,
      value: 4,
    },
    {
      category: 2,
      value: 5,
    },
    {
      category: 3,
      value: 10,
    },
    {
      category: 4,
      value: 2,
    },
    {
      category: 5,
      value: 8,
    },
    {
      category: 6,
      value: 8,
    },
  ],
  [
    {
      category: 1,
      value: 4,
    },
    {
      category: 2,
      value: 5,
    },
    {
      category: 3,
      value: 7,
    },
    {
      category: 4,
      value: 3,
    },
    {
      category: 5,
      value: 6,
    },
    {
      category: 6,
      value: 10,
    },
  ],
  [
    {
      category: 1,
      value: 4,
    },
    {
      category: 2,
      value: 7,
    },
    {
      category: 3,
      value: 6,
    },
    {
      category: 4,
      value: 3,
    },
    {
      category: 5,
      value: 6,
    },
    {
      category: 6,
      value: 10,
    },
  ],
  [
    {
      category: 1,
      value: 3,
    },
    {
      category: 2,
      value: 7,
    },
    {
      category: 3,
      value: 13,
    },
    {
      category: 4,
      value: 2,
    },
    {
      category: 5,
      value: 8,
    },
    {
      category: 6,
      value: 8,
    },
  ],
  [
    {
      category: 1,
      value: 4,
    },
    {
      category: 2,
      value: 5,
    },
    {
      category: 3,
      value: 7,
    },
    {
      category: 4,
      value: 3,
    },
    {
      category: 5,
      value: 6,
    },
    {
      category: 6,
      value: 6,
    },
  ],
  [
    {
      category: 1,
      value: 4,
    },
    {
      category: 2,
      value: 9,
    },
    {
      category: 3,
      value: 7,
    },
    {
      category: 4,
      value: 4,
    },
    {
      category: 5,
      value: 5,
    },
    {
      category: 6,
      value: 8,
    },
  ],
  [
    {
      category: 1,
      value: 4,
    },
    {
      category: 2,
      value: 6,
    },
    {
      category: 3,
      value: 14,
    },
    {
      category: 4,
      value: 2,
    },
    {
      category: 5,
      value: 6,
    },
    {
      category: 6,
      value: 4,
    },
  ],
  [
    {
      category: 1,
      value: 5,
    },
    {
      category: 2,
      value: 8,
    },
    {
      category: 3,
      value: 7,
    },
    {
      category: 4,
      value: 4,
    },
    {
      category: 5,
      value: 7,
    },
    {
      category: 6,
      value: 11,
    },
  ],
];

const scaleFactor = (2 * Math.PI) / _(flowerData).sumBy("value");

const colorMap = {
  0: color.red,
  1: color.blue,
  2: color.green,
  3: color.yellow,
  4: color.purple,
  5: color.orange,
};

const scatterData = _(seafood)
  .groupBy("lake")
  .map((lakeData, lake) => ({
    lake,
    x: catchLocations[lake as keyof typeof catchLocations].x,
    y: catchLocations[lake as keyof typeof catchLocations].y,
    collection: lakeData.map((item) => ({
      species: item.species,
      count: item.count,
    })),
  }))
  .value();

export const testScatterBalloon2 = (height: number) =>
  frame(
    { coord: wavy(), x: 0, y: 0 },
    scatterData.map((data, i) =>
      frame({ x: data.x }, [
        rect({
          x: 0,
          y: 0,
          // x: data.x,
          // y: data.y,
          w: 1,
          h: data.y,
          emY: true,
          fill: black,
        }),
        balloon({
          scale: 1,
          x: 0,
          y: data.y,
          color: /* colorMap[i % 6] */ [
            null,
            null,
            null,
            mix(color6[i % 6], white, 0.5),
            color6[i % 6],
            mix(color6[i % 6], black, 0.1),
            mix(color6[i % 6], black, 0.35),
          ],
        }),
      ])
    )
  );
