import { MaybeValue, value } from "../ast/data";
import { rect } from "../ast/shapes/rect";
import { spreadXTemplate } from "./spreadXTemplate";
import { stackYTemplate } from "./stackYTemplate";

export const rectTemplate = (
  data: any,
  options: {
    x: { field: string; sort: string[]; spacing: number };
    y: { field: string; sort: string[]; spacing?: number };
    w: number | string;
    h: number | string;
    fillFn: (d: any) => string;
    stroke?: string;
    strokeWidth?: number;
  }
) => {
  return spreadXTemplate(
    data,
    {
      spacing: 0,
      groupBy: { field: options.x.field, sort: options.x.sort },
    },
    (dataX) =>
      stackYTemplate(
        dataX,
        {
          spacing: options.y.spacing ?? 0,
          groupBy: { field: options.y.field, sort: options.y.sort },
        },
        (d, keyXY) =>
          rect({
            w:
              typeof options.w === "number"
                ? options.w
                : value(d[options.w as string]),
            h:
              typeof options.h === "number"
                ? options.h
                : value(d[options.h as string]),
            fill: options.fillFn(keyXY),
            stroke: options.stroke,
            strokeWidth: options.strokeWidth,
          })
      )
  );
};
