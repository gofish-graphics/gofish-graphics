/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import { stack } from "../ast/graphicalOperators/stack";
import { black, color, color6 } from "../color";
import { coord } from "../ast/coordinateTransforms/coord";
import { polar_DEPRECATED } from "../ast/coordinateTransforms/polar_DEPRECATED";
import { layer } from "../ast/graphicalOperators/layer";
import { petal } from "../ast/shapes/petal";
import { balloon } from "./balloon";
import { linear } from "../ast/coordinateTransforms/linear";
import { wavy } from "../ast/coordinateTransforms/wavy";
const data = [
  { category: 1, value: 4 },
  { category: 2, value: 6 },
  { category: 3, value: 10 },
  { category: 4, value: 3 },
  { category: 5, value: 7 },
  { category: 6, value: 8 },
];

const colorMap = {
  0: color.red,
  1: color.blue,
  2: color.green,
  3: color.yellow,
  4: color.purple,
  5: color.orange,
};

export const testScatterBalloon = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height, transform: { x: 200, y: 1000 } },
    coord(
      { transform: wavy(), x: 0, y: 0 },
      /* layer( */
      Array.from({ length: 10 }).map((_, i) =>
        (() => {
          const x = Math.random() * 200;
          const y = Math.random() * 200;
          const w = Math.random() * 10 + 5;

          return layer([
            rect({
              x: x,
              w: 1,
              y: y,
              h: size.height - y,
              emY: true,
              fill: black,
            }),
            balloon({ scale: 1, x: x, y: y, color: colorMap[i % 6] }),
          ]);
        })()
      )
    )
  );
