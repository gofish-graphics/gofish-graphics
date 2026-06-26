/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { rect } from "../ast/shapes/rect";
import { stack } from "../ast/graphicalOperators/stack";
import { color, color6 } from "../color";
import { layer } from "../ast/graphicalOperators/layer";
import _ from "lodash";
import { ref } from "../ast/shapes/ref";
import { streamgraphColorPalette, streamgraphData } from "../data/streamgraphData";
import { frame } from "../ast/graphicalOperators/frame";
import { drivingShifts } from "../data/drivingShifts";
import { line, ellipse, For, frame } from "../lib";

// const data = [
//   { x: 0, y: 28, c: 0 },
//   { x: 0, y: 20, c: 1 },
//   { x: 1, y: 43, c: 0 },
//   { x: 1, y: 35, c: 1 },
//   { x: 2, y: 81, c: 0 },
//   { x: 2, y: 10, c: 1 },
//   { x: 3, y: 19, c: 0 },
//   { x: 3, y: 15, c: 1 },
//   { x: 4, y: 52, c: 0 },
//   { x: 4, y: 48, c: 1 },
//   { x: 5, y: 24, c: 0 },
//   { x: 5, y: 28, c: 1 },
//   { x: 6, y: 87, c: 0 },
//   { x: 6, y: 66, c: 1 },
//   { x: 7, y: 17, c: 0 },
//   { x: 7, y: 27, c: 1 },
//   { x: 8, y: 68, c: 0 },
//   { x: 8, y: 16, c: 1 },
//   { x: 9, y: 49, c: 0 },
//   { x: 9, y: 25, c: 1 },
// ];

const data = streamgraphData;

const colorPalette = streamgraphColorPalette;

export const testConnectedScatterplot = () =>
  frame({}, [
    For(drivingShifts, (d) =>
      ellipse({
        x: value(d.miles),
        y: value(d.gas),
        w: 6,
        h: 6,
        fill: "white",
        stroke: "black",
        strokeWidth: 2,
      }).name(`${d.year}`)
    ),
    line(
      {
        dir: "x",
        interpolation: "linear",
        stroke: "black",
        strokeWidth: 2,
      },
      For(drivingShifts, (d) => ref(`${d.year}`))
    ),
    For(drivingShifts, (d) =>
      ellipse({
        x: value(d.miles),
        y: value(d.gas),
        w: 6,
        h: 6,
        fill: "white",
        stroke: "black",
        strokeWidth: 2,
      })
    ),
  ]);
