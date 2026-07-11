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
import { polar_DEPRECATED } from "../ast/coordinateTransforms/polar_DEPRECATED";
import { linear } from "../ast/coordinateTransforms/linear";
const data = [
  { a: "A", b: 28 },
  { a: "B", b: 55 },
  { a: "C", b: 43 },
  { a: "D", b: 91 },
  { a: "E", b: 81 },
  { a: "F", b: 53 },
  // { a: "G", b: 19 },
  // { a: "H", b: 87 },
  // { a: "I", b: 52 },
];

export const testPolarCenterBar = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height, transform: { x: 200, y: 100 } },
    coord({ transform: polar_DEPRECATED() }, [
      stack(
        {
          x: 20,
          dir: 1,
          spacing: (2 * Math.PI) / 6,
          alignment: "start",
          sharedScale: true,
          anchor: "middle",
        },
        data.map((d, i) => rect({ h: Math.random() * 15 + 5, w: value(d.b, "value"), fill: color6[i % 6] }))
      ),
    ])
  );
