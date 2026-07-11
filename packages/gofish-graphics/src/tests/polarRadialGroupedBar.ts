import _ from "lodash";
import { gofish } from "../ast/gofish";
import { value } from "../ast/data";
import { spread } from "../ast/graphicalOperators/spread";
import { rect } from "../ast/shapes/rect";
import { color, /* color6 */ color6_20250323 as color6 } from "../color";
import { polar_DEPRECATED } from "../ast/coordinateTransforms/polar_DEPRECATED";
import { coord } from "../ast/coordinateTransforms/coord";
import { linear } from "../ast/coordinateTransforms/linear";

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

export const testPolarRadialGroupedBar = (size: { width: number; height: number }) => {
  // Create the visualization structure first
  return gofish(
    { width: size.width, height: size.height, transform: { x: 50, y: 200 } },
    coord({ transform: polar_DEPRECATED() }, [
      spread({ dir: 1, spacing: Math.PI / 4, alignment: "end", sharedScale: true, anchor: "middle" },
        Object.entries(_.groupBy(data, "category")).map(([category, items]) =>
          spread({ dir: 1, spacing: Math.PI / 8, alignment: "end", anchor: "middle" },
            items.map((d) =>
              rect({
                h: 5,
                // h: value(d.value, "value"),
                w: d.value * 100,
                emX: true,
                fill: d.group === "x" ? color6[0] : d.group === "y" ? color6[1] : color6[2],
              })
            )
          )
        )
      ),
    ])
  );
};
