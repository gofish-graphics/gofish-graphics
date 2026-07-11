/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import { stack } from "../ast/graphicalOperators/stack";
import { color, color6, gray, neutral } from "../color";
import { coord } from "../ast/coordinateTransforms/coord";
import { polar_DEPRECATED } from "../ast/coordinateTransforms/polar_DEPRECATED";
import { linear } from "../ast/coordinateTransforms/linear";
import _ from "lodash";
import { frame } from "../ast/graphicalOperators/frame";

const data = [
  { category: "A", group: "x", value: 0.1 },
  { category: "A", group: "y", value: 0.6 },
  { category: "A", group: "z", value: 0.9 },
  { category: "B", group: "x", value: 0.7 },
  { category: "B", group: "y", value: 0.2 },
  { category: "B", group: "z", value: 1.1 },
  { category: "C", group: "x", value: 0.6 },
  { category: "C", group: "y", value: 0.1 },
  { category: "C", group: "z", value: 0.2 },
];

export const testPolarCenterStackedBar = () =>
  frame({ coord: polar_DEPRECATED() }, [
    stack(
      {
        x: 2,
        dir: 1,
        spacing: (2 * Math.PI) / 3,
        alignment: "start",
        sharedScale: true,
        anchor: "middle",
      },
      Object.entries(_.groupBy(data, "category")).map(([category, items]) =>
        stack({ dir: 0,
            spacing: 0,
            alignment: "middle",
          },
          items.toReversed().map((d) =>
            rect({
              // h: 40,
              h: Math.PI / 3,
              // emY: true,
              // w: value(d.value, "value"),
              w: (d.value * 50) / 20,
              emX: true,
              fill: value(d.group),
              // stroke: gray,
              // strokeWidth: 0.5,
            })
          )
        )
      )
    ),
  ]);
