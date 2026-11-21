import _ from "lodash";
import { spreadX } from "../ast/graphicalOperators/spreadX";
import { spreadY } from "../ast/graphicalOperators/spreadY";
import { rect } from "../ast/shapes/rect";

// Shared waffle mark function
export const waffleMark = (
  data: any[],
  options: {
    chunkSize: number;
    spacing: number;
    rectSize: number;
    fillFn: (d: any) => string;
    orderBy?: { field: string; sort: string[] };
  }
) =>
  spreadY(
    { spacing: 0, alignment: "start" },
    _(data)
      .sortBy(
        (d) => options.orderBy?.sort?.indexOf(d[options.orderBy?.field]) ?? 0
      )
      .chunk(options.chunkSize)
      .reverse()
      .map((row) =>
        spreadX(
          { spacing: 0 },
          row.map((d) =>
            rect({
              w: options.rectSize,
              h: options.rectSize,
              fill: options.fillFn(d),
            })
          )
        )
      )
      .value()
  );
