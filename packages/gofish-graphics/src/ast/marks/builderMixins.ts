/**
 * Runtime mixins for `ChartBuilder`.
 *
 * `.facet()` and `.stack()` are sugar for `.flow(spread/stack(...))`. They
 * live here (not on the class itself) so `chartBuilder.ts` doesn't need to
 * import the v3 `spread`/`stack` operators — that import would cycle back
 * through `createOperator` and into `chartBuilder.ts` itself. By patching
 * the prototype from a separate module that imports both pieces, the cycle
 * never closes.
 *
 * This file is loaded for its side effect from `lib.ts`. Importing it
 * once anywhere in the dependency graph makes `.facet`/`.stack` available
 * on every `ChartBuilder` instance.
 */

import { ChartBuilder } from "./chartBuilder";
import {
  spread,
  stack,
  type SpreadOptions,
  type StackOptions,
} from "../graphicalOperators/spread";
import type { Operator } from "../types";
import { toJSON } from "../../serialize/toJSON";
import type { Frontend } from "gofish-ir";

declare module "./chartBuilder" {
  interface ChartBuilder<TInput, TOutput> {
    /** Convenience: `.flow(spread(opts))`. */
    facet(opts: SpreadOptions): ChartBuilder<TInput, TInput>;
    /** Convenience: `.flow(stack(opts))`. */
    stack(opts: StackOptions): ChartBuilder<TInput, TInput>;
    /** Emit a frontend-IR document. See `gofish-ir`. */
    toJSON(): Promise<Frontend.FrontendIRDocument>;
  }
}

ChartBuilder.prototype.facet = function (opts: SpreadOptions) {
  return this.flow(spread(opts) as unknown as Operator<any, any>);
};

ChartBuilder.prototype.stack = function (opts: StackOptions) {
  return this.flow(stack(opts) as unknown as Operator<any, any>);
};

ChartBuilder.prototype.toJSON = function () {
  return toJSON(this as unknown as ChartBuilder<any>);
};
