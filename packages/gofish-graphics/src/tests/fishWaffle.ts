/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { rect } from "../ast/shapes/rect";
import { stack } from "../ast/graphicalOperators/stack";
import { color, color6 } from "../color";
import { seafood } from "../data/catch";
import _ from "lodash";
import { stackX } from "../ast/graphicalOperators/stackX";
import { stackY } from "../ast/graphicalOperators/stackY";
import { For, groupBy, stackX, stackY } from "../lib";
const fishColors = {
  Bass: color.blue[5],
  Trout: color.red[5],
  Catfish: color.green[5],
  Perch: color.yellow[5],
  Salmon: color.purple[5],
};

export const testFishWaffle = (opts) =>
  stackX(
    { spacing: 8, sharedScale: true },
    _(seafood)
      .groupBy("lake")
      .map((d) =>
        stackY(
          { spacing: 2, alignment: "start" },
          _(d)
            .flatMap((d) => Array(d.count).fill(d))
            .chunk(opts.chunkSize)
            .map((d) =>
              stackX(
                { spacing: 2 },
                d.map((d) => rect({ w: 8, h: 8, fill: value(d.species) }))
              )
            )
            .value()
        )
      )
      .value()
  );

export const testFishWaffleWithFor = () =>
  stackX(
    { spacing: 8, sharedScale: true },
    For(groupBy(seafood, "lake"), (d) =>
      stackY(
        { spacing: 2, alignment: "start" },
        For(
          _(d)
            .reverse()
            .flatMap((d) => Array(d.count).fill(d))
            .chunk(4)
            .reverse(),
          (d) =>
            stackX(
              { spacing: 2 },
              For(d, (d) => rect({ w: 8, h: 8, fill: value(d.species) }))
            )
        )
      )
    )
  );
