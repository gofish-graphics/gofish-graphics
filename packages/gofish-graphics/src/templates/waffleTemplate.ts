import _ from "lodash";
import { spreadX } from "../ast/graphicalOperators/spreadX";
import { spreadY } from "../ast/graphicalOperators/spreadY";
import { rect } from "../ast/shapes/rect";
import { spreadXTemplate } from "./spreadXTemplate";

// Shared waffle mark function
export const waffleTemplate = (
  data: any[],
  options: {
    x: { field: string; sort: string[]; spacing: number };
    chunkSize: number;
    spacing: number;
    rectSize: number;
    fillFn: (d: any) => string;
    orderBy?: { field: string; sort: string[] };
  }
) =>
  spreadXTemplate(
    data,
    {
      spacing: 0,
      groupBy: { field: options.x.field, sort: options.x.sort },
    },
    (d) =>
      spreadY(
        { spacing: 0, alignment: "start" },
        _(d)
          .sortBy(
            (d) =>
              options.orderBy?.sort?.indexOf(d[options.orderBy?.field]) ?? 0
          )
          .chunk(options.chunkSize)
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
      )
  );
