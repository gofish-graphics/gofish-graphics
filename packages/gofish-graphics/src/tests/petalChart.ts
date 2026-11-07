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
import { petal } from "../ast/shapes/petal";
const data = [
  { category: 1, value: 4 },
  { category: 2, value: 6 },
  { category: 3, value: 10 },
  { category: 4, value: 3 },
  { category: 5, value: 7 },
  { category: 6, value: 8 },
];

export const testPetalChart = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height, transform: { x: 100, y: 150 } },
    coord({ transform: polar_DEPRECATED() }, [
      stack({ dir: 1, alignment: "start" },
        data.map((d, i) =>
          petal({
            w: 80,
            h: /* value(d.b, "value") */ d.value / 6.05,
            emY: true,
            fill: color6[i % 6],
          })
        )
      ),
    ])
  );
