/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import { spread } from "../ast/graphicalOperators/spread";
import { color, color6 } from "../color";
import { seafood } from "../data/catch";
import _ from "lodash";

const fishColors = {
  Bass: color.blue[5],
  Trout: color.red[5],
  Catfish: color.green[5],
  Perch: color.yellow[5],
  Salmon: color.purple[5],
};

const waffleY = (
  data: any[],
  { y, numRows }: { y: string; numRows: number },
  mark: (d: any) => any
) =>
  spread({ dir: "y", spacing: 2, alignment: "start" },
    _(data)
      .reverse()
      .flatMap((d) => Array(d[y]).fill(d))
      .chunk(numRows)
      .reverse()
      .map((d) =>
        spread({ dir: "x", spacing: 2, alignment: "start" }, d.map(mark))
      )
      .value()
  );

export const testFishWaffleRefactor = (size: {
  width: number;
  height: number;
}) =>
  gofish(
    { width: size.width, height: size.height },
    spread({ dir: "x", spacing: 8, alignment: "end" },
      _(seafood)
        .groupBy("lake")
        .map((d) =>
          waffleY(d, { y: "count", numRows: 4 }, (d) =>
            rect({ w: 8, h: 8, fill: fishColors[d.species] })
          )
        )
        .value()
    )
  );
