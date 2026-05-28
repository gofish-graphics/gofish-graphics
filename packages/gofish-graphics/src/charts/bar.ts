import {
  Chart,
  rect,
  spread,
  stack,
  Mark,
  ChartBuilder,
  Operator,
} from "../lib";
import { Stackable } from "./stackable";

// Wrapper class that adds .stack() method to ChartBuilder
class BarChartBuilder<TInput, TOutput = TInput>
  implements Stackable<TInput, TOutput>
{
  private builder: ChartBuilder<TInput, TOutput>;
  private readonly barOrientation: "x" | "y";

  constructor(
    builder: ChartBuilder<TInput, TOutput>,
    barOrientation: "x" | "y"
  ) {
    this.builder = builder;
    this.barOrientation = barOrientation;
  }

  async resolve() {
    return this.builder.resolve();
  }

  async render(
    ...args: Parameters<ChartBuilder<TInput, TOutput>["render"]>
  ): Promise<ReturnType<ChartBuilder<TInput, TOutput>["render"]>> {
    return this.builder.render(...args);
  }

  stack<K extends keyof TOutput & string>(
    field: K,
    options?: {
      x?: number;
      y?: number;
      w?: number | (keyof TOutput & string);
      h?: number | (keyof TOutput & string);
      alignment?: "start" | "middle" | "end";
    }
  ): BarChartBuilder<TInput, TOutput> {
    const stackOp = stack({
      by: field,
      ...options,
      dir: this.barOrientation,
    });
    return new BarChartBuilder(
      this.builder.flow(stackOp as unknown as Operator<TInput, TOutput>),
      this.barOrientation
    );
  }
}

export const barChart = <T extends Record<string, any>>(
  data: T[],
  options: {
    x: keyof T & string;
    y: keyof T & string;
    orientation?: "x" | "y";
    fill?: (keyof T & string) | string;
    mark?: (options: {
      h?: string | number | (keyof T & string);
      w?: string | number | (keyof T & string);
      fill?: string | (keyof T & string);
      [key: string]: any;
    }) => Mark<T | T[] | { item: T | T[]; key: number | string }>;
  }
) => {
  // Both x and y are required
  if (options.x === undefined || options.y === undefined) {
    throw new Error("bar chart requires both 'x' and 'y' encoding channels");
  }

  const markFn = options.mark ?? rect;
  const orientation = options.orientation ?? "y";

  // Vertical bar chart (orientation: "y"): spread along x-axis using x field, height from y field
  if (orientation === "y") {
    const builder = Chart(data)
      .flow(spread({ by: options.x, dir: "x" }))
      .mark(
        markFn({
          h: options.y,
          fill: options.fill,
        })
      );
    return new BarChartBuilder(builder as ChartBuilder<T[], T[]>, orientation);
  }

  // Horizontal bar chart (orientation: "x"): spread along y-axis using y field, width from x field
  if (orientation === "x") {
    const builder = Chart(data)
      .flow(spread({ by: options.y, dir: "y" }))
      .mark(
        markFn({
          w: options.x,
          fill: options.fill,
        })
      );
    return new BarChartBuilder(builder as ChartBuilder<T[], T[]>, orientation);
  }

  throw new Error(
    `bar chart orientation must be either 'x' or 'y', got '${orientation}'`
  );
};
