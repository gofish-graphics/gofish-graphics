/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import { stack } from "../ast/graphicalOperators/stack";
import { color, color6 } from "../color";
import { seafood } from "../data/catch";
import _ from "lodash";
import { layer } from "../ast/graphicalOperators/layer";
import { ellipse } from "../ast/shapes/ellipse";
/*  From Claude :)
<!-- Balloon body (ellipse) -->
<ellipse cx="200" cy="150" rx="120" ry="150" fill="#ff5555" />

<!-- Balloon highlight (smaller ellipse) -->
<ellipse cx="170" cy="110" rx="35" ry="55" fill="#ff8888" />

<!-- Balloon knot (small ellipse) -->
<ellipse cx="200" cy="310" rx="15" ry="10" fill="#cc4444" />



<!-- Balloon bottom neck (rectangle) -->
<rect x="180" y="300" width="40" height="20" fill="#ee4444" rx="15" ry="10" />

<!-- Balloon tie (small rectangles) -->
<rect x="192" y="305" width="16" height="12" fill="#cc4444" rx="5" ry="5" />
*/

export const balloon = (options?: {
  x?: number;
  y?: number;
  scale?: number;
  color?: string[];
}) =>
  layer(
    {
      x: options?.x - 15 * (options?.scale ?? 1),
      y: options?.y + 27 * (options?.scale ?? 1),
      box: true,
      transform: {
        scale: { x: options?.scale ?? 1, y: (options?.scale ?? 1) * -1 },
      },
    },
    [
      ellipse({
        cx: 15,
        cy: 15,
        w: 24,
        h: 30,
        fill: (options?.color ?? color.red)[4],
      }),
      ellipse({
        cx: 12,
        cy: 11,
        w: 7,
        h: 11,
        fill: (options?.color ?? color.red)[3],
      }),
      rect({
        cx: 15,
        cy: 32,
        w: 8,
        h: 4,
        fill: (options?.color ?? color.red)[5],
        rx: 3,
        ry: 2,
      }),
      rect({
        cx: 15,
        cy: 32,
        w: 5,
        h: 2.4,
        fill: (options?.color ?? color.red)[6],
        rx: 2,
        ry: 1,
      }),
    ]
  );

export const testBalloon = (size: { width: number; height: number }) =>
  gofish({ width: size.width, height: size.height }, balloon());
