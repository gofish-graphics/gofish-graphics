/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { rect } from "../ast/shapes/rect";
import { color, color6 } from "../color";
import { seafood } from "../data/catch";
import _ from "lodash";
import { map, groupBy, spreadX, spreadY } from "../lib";
const fishColors = {
  Bass: color.blue[5],
  Trout: color.red[5],
  Catfish: color.green[5],
  Perch: color.yellow[5],
  Salmon: color.purple[5],
};

export const testFishWaffle = (opts) =>
  spreadX(
    { spacing: 0},
    _(seafood)
      .groupBy("lake")
      .map((d) =>
        spreadY(
          { spacing: 0, alignment: "start" },
          _(d)
            .flatMap((d) => Array(d.count).fill(d))
            .chunk(opts.chunkSize)
            .map((d) =>
              spreadX(
                { spacing: 0},
                d.map((d) => rect({ w: 8, h: 8, fill: value(d.species) }))
              )
            )
            .value()
        )
      )
      .value()
  );

export const testFishWaffleWithFor = () =>
  spreadX(
    { spacing: 0},
    map(groupBy(seafood, "lake"), (d) =>
      spreadY(
        { spacing: 0, alignment: "start" },
        map(
          _(d)
            .reverse()
            .flatMap((d) => Array(d.count).fill(d))
            .chunk(4)
            .reverse(),
          (d) =>
            spreadX(
              { spacing: 0},
              map(d, (d) => rect({ w: 8, h: 8, fill: value(d.species) }))
            )
        )
      )
    )
  );
