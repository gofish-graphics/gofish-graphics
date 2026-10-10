/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import { stack } from "../ast/graphicalOperators/stack";
import { color, color6 } from "../color";
import { coord } from "../ast/coordinateTransforms/coord";
import { bipolar } from "../ast/coordinateTransforms/bipolar";
import { polar_DEPRECATED } from "../ast/coordinateTransforms/polar_DEPRECATED";
const data = [
  { a: "A", b: 28 },
  { a: "B", b: 55 },
  { a: "C", b: 43 },
  { a: "D", b: 91 },
  { a: "E", b: 81 },
  { a: "F", b: 53 },
  { a: "G", b: 19 },
  { a: "H", b: 87 },
  { a: "I", b: 52 },
];

/* TODO: stack translation is actually just increasing the size of all the bars??? */
export const testBipolarBar = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height, transform: { x: 200, y: 200 } },
    coord({ transform: bipolar(), grid: true }, [
      // stack(
      //   { direction: 0, spacing: 4, alignment: "start" },
      //   data.map((d, i) =>
      //     rect({ w: 20, h: /* value(d.b, "value") */ d.b / 40, emY: true, fill: i < 3 ? "none" : color6[i % 6] })
      //   )
      // ),
      rect({ x: -1, y: 2, w: 1, h: 1, emY: true, fill: "red" }),
      rect({ x: -0.5, y: 2, w: 1, h: 1, emY: true, fill: "red" }),
      rect({ x: 0, y: 2, w: 1, h: 1, emY: true, fill: "red" }),
      rect({ x: 0.5, y: 2, w: 1, h: 1, emY: true, fill: "red" }),
      rect({ x: 1, y: 2, w: 1, h: 1, emY: true, fill: "red" }),
      rect({ x: -2, y: 1, w: 3, h: 1, emX: true, fill: "blue" }),
      rect({ x: -2, y: 2, w: 3, h: 1, emX: true, fill: "blue" }),
      rect({ x: -2, y: 2.5, w: 3, h: 1, emX: true, fill: "blue" }),
      rect({ x: -2, y: 2.645, w: 3, h: 1, emX: true, fill: "blue" }),
      rect({ x: -2, y: 3, w: 3, h: 1, emX: true, fill: "blue" }),
      rect({ x: -2, y: 4, w: 3, h: 1, emX: true, fill: "blue" }),
    ])
  );
