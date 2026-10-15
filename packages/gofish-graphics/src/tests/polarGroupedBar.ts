import _ from "lodash";
import { gofish } from "../ast/gofish";
import { value } from "../ast/data";
import { spread } from "../ast/graphicalOperators/spread";
import { rect } from "../ast/shapes/rect";
import { color, /* color6 */ color6_20250323 as color6 } from "../color";
import { polar_DEPRECATED } from "../ast/coordinateTransforms/polar_DEPRECATED";
import { coord } from "../ast/coordinateTransforms/coord";
import { arcLengthPolar } from "../ast/coordinateTransforms/arcLengthPolar";
import { frame } from "../ast/graphicalOperators/frame";

const data = [
  { category: "none", group: "x", value: 0 },
  // { category: "none", group: "x", value: 0 },
  // { category: "none", group: "x", value: 0 },
  { category: "A", group: "x", value: 0.3 },
  { category: "A", group: "y", value: 0.6 },
  { category: "A", group: "z", value: 0.9 },
  { category: "B", group: "x", value: 0.7 },
  { category: "B", group: "y", value: 0.2 },
  { category: "B", group: "z", value: 1.1 },
  { category: "C", group: "x", value: 0.6 },
  { category: "C", group: "y", value: 0.1 },
  { category: "C", group: "z", value: 0.2 },
];

export const testPolarGroupedBar = () => {
  // Create the visualization structure first
  return frame({ coord: polar_DEPRECATED() }, [
    spread({ dir: 0, spacing: 20, alignment: "end" },
      Object.entries(_.groupBy(data, "category")).map(([category, items]) =>
        spread({ dir: 0, spacing: 2, alignment: "end" },
          items.map((d) =>
            rect({
              w: 30,
              // emX: true,
              // h: value(d.value, "value"),
              h: d.value,
              emY: true,
              // fill: d.group === "x" ? color6[0] : d.group === "y" ? color6[1] : color6[2],
              fill: value(d.group),
            })
          )
        )
      )
    ),
  ]);
};
