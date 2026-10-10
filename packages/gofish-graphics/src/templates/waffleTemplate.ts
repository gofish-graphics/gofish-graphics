import _ from "lodash";
import { stackX } from "../ast/graphicalOperators/stackX";
import { stackY } from "../ast/graphicalOperators/stackY";
import { rect } from "../ast/shapes/rect";
import { stackXTemplate } from "./stackXTemplate";

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
  stackXTemplate(
    data,
    {
      spacing: options.x.spacing,
      groupBy: { field: options.x.field, sort: options.x.sort },
    },
    (d) =>
      stackY(
        { spacing: options.spacing, alignment: "start" },
        _(d)
          .sortBy(
            (d) =>
              options.orderBy?.sort?.indexOf(d[options.orderBy?.field]) ?? 0
          )
          .chunk(options.chunkSize)
          .map((row) =>
            stackX(
              { spacing: options.spacing },
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
