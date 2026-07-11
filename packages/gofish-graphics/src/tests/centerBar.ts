/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import { spread } from "../ast/graphicalOperators/spread";
import { color, color6 } from "../color";
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

export const testCenterBar = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height },
    spread({ dir: 0, spacing: 20, alignment: "end", sharedScale: true, anchor: "middle" },
      data.map((d) => rect({ w: Math.random() * 15 + 5, h: value(d.b, "value"), fill: color6[0] }))
    )
  );
