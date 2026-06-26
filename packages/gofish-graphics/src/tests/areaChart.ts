/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import { stack } from "../ast/graphicalOperators/stack";
import { color, color6 } from "../color";
import { layer } from "../ast/graphicalOperators/layer";
import { ellipse } from "../ast/shapes/ellipse";
import _ from "lodash";
import { ref } from "../ast/shapes/ref";
import { streamgraphData, streamgraphColorPalette } from "../data/streamgraphData";
import { stackX } from "../ast/graphicalOperators/stackX";
import { frame } from "../ast/graphicalOperators/frame";
import { area, For, frame, stackX } from "../lib";
const data = streamgraphData;
const colorPalette = streamgraphColorPalette;

export const testSingletonAreaChart = () =>
  frame([
    stackX(
      { spacing: 0, sharedScale: true },
      For(
        data.filter((d) => d.c === 1),
        (d) =>
          rect({
            name: `${d.x}`,
            x: value(d.x),
            h: value(d.y),
            w: 0,
          })
      )
    ),
    area(
      {
        dir: "x",
        interpolation: "linear",
        // opacity: 0.7,
        // mixBlendMode: "normal",
        opacity: 0.7,
        mixBlendMode: "multiply",
      },
      For(
        data.filter((d) => d.c === 1),
        (d) => ref(`${d.x}`)
      )
    ),
  ]);

export const testAreaChart = () =>
  frame([
    ..._(data)
      .groupBy("c")
      .flatMap((items, c) =>
        stackX(
          { spacing: 0, sharedScale: true },
          items.map((d) =>
            rect({
              name: `${c}-${d.x}`,
              x: value(d.x),
              h: value(d.y),
              w: 0,
              fill: value(c),
            })
          )
        )
      )
      .value(),
    ..._(data)
      .groupBy("c")
      .map((items, c) =>
        area(
          {
            dir: "x",
            interpolation: "linear",
            // opacity: 0.7,
            // mixBlendMode: "normal",
            opacity: 0.7,
            mixBlendMode: "multiply",
          },
          items.map((d) => ref(`${c}-${d.x}`))
        )
      )
      .value(),
  ]);
