/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { stack } from "../ast/graphicalOperators/stack";
import { color, color6 } from "../color";
import { layer } from "../ast/graphicalOperators/layer";
import _ from "lodash";
import { streamgraphData, streamgraphColorPalette } from "../data/streamgraphData";
import { stackX } from "../ast/graphicalOperators/stackX";
import { stackY } from "../ast/graphicalOperators/stackY";
import { frame } from "../ast/graphicalOperators/frame";
import { ribbon, frame, groupBy, For, rect, ref, stackX, stackY, v } from "../lib";
const data = streamgraphData;
const colorPalette = streamgraphColorPalette;

export const testStackedAreaChart = () =>
  frame([
    stackX({ sharedScale: true }, [
      _(data)
        .groupBy("x")
        .map((items, xCoord) =>
          stackY(
            { x: value(xCoord) },
            items.map((d) =>
              rect({
                name: `${xCoord}-${d.c}`,
                h: value(d.y),
                w: 0,
                fill: value(d.c),
              })
            )
          )
        )
        .value(),
    ]),
    _(data)
      .groupBy("c")
      .map((items, c) =>
        ribbon(
          {
            dir: "x",
            interpolation: "linear",
            // opacity: 0.7,
            mixBlendMode: "normal",
            strokeWidth: 1,
          },
          items.map((d) => ref(`${d.x}-${d.c}`))
        )
      )
      .value(),
  ]);

export const testStackedAreaChartV2API = () =>
  frame([
    stackX({ sharedScale: true }, [
      For(groupBy(data, "x"), (items, xCoord) =>
        stackY(
          { x: v(xCoord) },
          For(items, (d) =>
            rect({
              name: `${xCoord}-${d.c}`,
              h: v(d.y),
              w: 0,
              fill: v(d.c),
            })
          )
        )
      ),
    ]),
    For(groupBy(data, "c"), (items, c) =>
      ribbon(
        {
          dir: "x",
          // opacity: 0.7,
          mixBlendMode: "normal",
          strokeWidth: 1,
        },
        For(items, (d) => ref(`${d.x}-${d.c}`))
      )
    ),
  ]);
