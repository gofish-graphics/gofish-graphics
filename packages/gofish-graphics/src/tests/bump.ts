import _ from "lodash";
import { NewCarColor, newCarColors } from "../data/newCarColors";
import { line, ellipse, For, frame, groupBy, ref, stackY, v } from "../lib";

export const testBumpChart = () =>
  frame({}, [
    For(groupBy(newCarColors, "Year"), (d, key) =>
      stackY(
        {
          x: ((key as number) - 2000) * 10,
          spacing: 8,
          alignment: "start",
        },
        For(_.sortBy(d, "Rank"), (d) => ellipse({ w: 4, h: 4, fill: v(d.Color) }).name(`${d.Color}-${d.Year}`))
      )
    ),
    For(groupBy(newCarColors, "Color"), (d) =>
      line(
        { dir: "y", strokeWidth: 1, curve: "bezier" },
        For(d, (d) => ref(`${d.Color}-${d.Year}`))
      )
    ),
  ]);
