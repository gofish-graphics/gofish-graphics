import _ from "lodash";
import { gofish } from "../ast/gofish";
import { value } from "../ast/data";
import { stack } from "../ast/graphicalOperators/stack";
import { spread } from "../ast/graphicalOperators/spread";
import { rect } from "../ast/shapes/rect";
import { color } from "../color";

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

export const testStackedBar = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height },
    spread({ dir: 0, spacing: 8, alignment: "end" },
      // TODO: I could probably make the width be uniform flexible basically
      Object.entries(_.groupBy(data, "category")).map(([category, items]) =>
        stack({ dir: 1, alignment: "middle" },
          items.toReversed().map((d) =>
            rect({
              w: 30,
              h: value(d.value, "value"),
              fill: d.group === "x" ? color.red[5] : d.group === "y" ? color.blue[5] : color.green[5],
            })
          )
        )
      )
    )
  );
