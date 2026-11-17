import _ from "lodash";
import { spreadX } from "../ast/graphicalOperators/spreadX";
import { rect } from "../ast/shapes/rect";
import { FancyDims } from "../ast/dims";
import { GoFishAST } from "../ast/_ast";
import { children } from "solid-js";
export const spreadXTemplate = (
  data: any[],
  options: {
    name?: string;
    spacing?: number;
    alignment?: "start" | "middle" | "end";
    anchor?: "edge" | "start" | "middle" | "end" | "baseline";
    reverse?: boolean;
  } & FancyDims & { groupBy?: { field: string; sort?: string[] } },
  children: (d: any, i?: string | number) => any
) =>
  spreadX(
    options,
    options.groupBy
      ? _(data)
          .groupBy(options.groupBy.field)
          .toPairs()
          .sortBy(([i]) => options.groupBy?.sort?.indexOf(i) ?? 0)
          .fromPairs()
          .map((d, i) => children(d, i))
          .value()
      : _(data)
          .toPairs()
          .sortBy(([i]) => options.groupBy?.sort?.indexOf(i) ?? 0)
          .fromPairs()
          .map((d, i) => children(d, i))
          .value()
  );
