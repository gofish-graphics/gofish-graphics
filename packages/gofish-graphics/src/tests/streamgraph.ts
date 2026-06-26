/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";

import { color, color6 } from "../color";
import { layer } from "../ast/graphicalOperators/layer";
import { ellipse } from "../ast/shapes/ellipse";
import _ from "lodash";
import { ref } from "../ast/shapes/ref";
import { streamgraphData, streamgraphColorPalette } from "../data/streamgraphData";
import { stackX } from "../ast/graphicalOperators/stackX";
import { stackY } from "../ast/graphicalOperators/stackY";
import { area } from "../lib";
import { frame } from "../ast/graphicalOperators/frame";
const data = streamgraphData;
const colorPalette = streamgraphColorPalette;

export const testStreamgraph = () =>
  frame([
    stackX(
      {

        alignment: "middle",
        sharedScale: true,
      },
      [
        ..._(data)
          .groupBy("x")
          .map((items, xCoord) =>
            stackY(
              { x: value(xCoord) },
              items.map((d) =>
                rect({
                  h: value(d.y),
                  w: 0,
                  fill: value(d.c),
                }).name(`${xCoord}-${d.c}`)
              )
            )
          )
          .value(),
      ]
    ),
    ..._(data)
      .groupBy("c")
      .map((items, c) =>
        area(
          {
            dir: "x",
            interpolation: "linear",
            mixBlendMode: "normal",
            strokeWidth: 1,
          },
          items.map((d) => ref(`${d.x}-${d.c}`))
        )
      )
      .value(),
  ]);
