/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import { stack } from "../ast/graphicalOperators/stack";
import { black, color, color6, white } from "../color";
import { coord } from "../ast/coordinateTransforms/coord";
import { polar_DEPRECATED } from "../ast/coordinateTransforms/polar_DEPRECATED";
import { layer } from "../ast/graphicalOperators/layer";
import { petal } from "../ast/shapes/petal";
import _ from "lodash";
import { mix } from "spectral.js";
import { polar } from "../ast/coordinateTransforms/polar";
import { stackX } from "../ast/graphicalOperators/stackX";
import { seafood, catchLocations } from "../data/catch";
import { frame } from "../ast/graphicalOperators/frame";

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

export const testScatterPie2 = () =>
  frame(
    {},
    scatterData.map((sample) =>
      frame(
        {
          x: sample.x,
          y: sample.y,
          coord: polar(),
        },
        [
          stackX(
            {
              h: _(sample.collection).sumBy("count") / 7,
              spacing: 0,
              alignment: "start",
            },
            sample.collection.map((d, i) =>
              rect({
                w: value(d.count),
                fill: color6[i % 6],
              })
            )
          ),
        ]
      )
    )
  );
