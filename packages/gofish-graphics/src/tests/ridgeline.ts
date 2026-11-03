import { streamgraphData } from "../data/streamgraphData";
import {
  spreadY,
  map,
  groupBy,
  spreadX,
  rect,
  v,
  layer,
  ribbon,
  ref,
} from "../lib";

export const testRidgeline = () =>
  spreadY(
    { spacing: -30 },
    map(groupBy(streamgraphData, "c"), (items, c) =>
      layer([
        spreadX(
          { spacing: 20 },
          map(items, (d) =>
            rect({
              // x: d.x * 20,
              // h: v(d.y),
              h: d.y,
              w: 0,
              fill: v(d.c),
            }).name(`${d.c}-${d.x}`)
          )
        ),
        ribbon(
          {
            dir: "x",
            opacity: 0.7,
            mixBlendMode: "multiply",
          },
          map(items, (d) => ref(`${d.c}-${d.x}`))
        ),
      ])
    )
  );
