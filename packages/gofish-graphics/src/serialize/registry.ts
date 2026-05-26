/**
 * Factory registries and the {@link DeriveBridge} contract used by the
 * frontend-IR deserializer.
 *
 * The deserializer turns a {@link Frontend.FrontendIRDocument} into a live
 * GoFish `ChartBuilder` / `Mark` graph. The standard library of operators,
 * marks, and combinators is dispatched via three string-keyed maps; the
 * `derive` operator and any `{__gofish_lambda}` sentinels invoke a
 * caller-supplied bridge (typically the Python anywidget bridge).
 */

// Source-module imports (not `../lib`) — `lib.ts` re-exports this module,
// so importing back through `lib.ts` would create a cycle that resolves at
// module-load. Importing directly from each source module keeps the
// dependency graph acyclic.
import {
  area,
  atop,
  blank,
  circle,
  derive,
  inside,
  layer,
  line,
  log,
  mask,
  out,
  over,
  rect,
  xor,
  type ChartBuilder,
  type Mark,
  type Operator,
} from "../ast/marks/chart";
import { ellipse } from "../ast/shapes/ellipse";
import { petal } from "../ast/shapes/petal";
import { polygon } from "../ast/shapes/polygon";
import { text } from "../ast/shapes/text";
import { image } from "../ast/shapes/image";
import { spread, stack } from "../ast/graphicalOperators/spread";
import { scatter } from "../ast/graphicalOperators/scatter";
import { group } from "../ast/graphicalOperators/group";
import { table } from "../ast/graphicalOperators/table";
import { arrow } from "../ast/graphicalOperators/arrow";
import { connect } from "../ast/graphicalOperators/connect";
import { treemap as Treemap } from "../ast/graphicalOperators/treemap";
import type { Frontend } from "gofish-ir";

export type { ChartBuilder, Mark, Operator };

/**
 * Bridge used by the deserializer to invoke Python-registered lambdas.
 *
 * The deserializer encounters lambda references in two places:
 *
 *  - The `derive` operator's `lambdaId` field — calls `applyLambda` per
 *    operator invocation.
 *  - The `{ __gofish_lambda: id }` channel-value sentinel — converted to an
 *    async per-row accessor.
 *
 * The transport (Arrow over anywidget traitlets, etc.) is the bridge's
 * responsibility; the deserializer only sees rows of objects.
 */
export interface DeriveBridge {
  /**
   * Apply the lambda registered under `lambdaId` to a batch of rows.
   * Returns the row(s) the lambda produced.
   */
  applyLambda(lambdaId: string, rows: any[]): Promise<any[]>;
}

/**
 * Combinator-form factories: operator-like factories that, when called with
 * marks as the second argument, return a combined mark. Keyed by the
 * lowercase `type` discriminator.
 */
export const COMBINATOR_FACTORIES: Record<
  string,
  (opts: Record<string, any>, marks: Mark<any>[]) => Mark<any>
> = {
  // Casts mirror the widget-src pattern: the combinator factories' typed
  // signatures are stricter than what a runtime deserializer can satisfy
  // (e.g. tuple-of-two-marks for Porter-Duff), but the runtime accepts the
  // looser shape. Casting once at the dispatch boundary keeps the rest of
  // the deserializer typed.
  spread: (opts, marks) => (spread as any)(opts, marks) as unknown as Mark<any>,
  layer: (opts, marks) => (layer as any)(opts, marks) as unknown as Mark<any>,
  arrow: (opts, marks) => (arrow as any)(opts, marks) as unknown as Mark<any>,
  connect: (opts, marks) =>
    (connect as any)(opts, marks) as unknown as Mark<any>,
  treemap: (opts, marks) =>
    (Treemap as any)(opts, marks) as unknown as Mark<any>,
  over: (opts, marks) => (over as any)(opts, marks) as unknown as Mark<any>,
  inside: (opts, marks) => (inside as any)(opts, marks) as unknown as Mark<any>,
  xor: (opts, marks) => (xor as any)(opts, marks) as unknown as Mark<any>,
  out: (opts, marks) => (out as any)(opts, marks) as unknown as Mark<any>,
  atop: (opts, marks) => (atop as any)(opts, marks) as unknown as Mark<any>,
  mask: (opts, marks) => (mask as any)(opts, marks) as unknown as Mark<any>,
};

/**
 * Operator factories. The `derive` factory needs the bridge; the rest take
 * only opts. Keyed by the lowercase `type` discriminator.
 */
export const OPERATOR_MAP: Record<
  string,
  (
    opts: Record<string, any>,
    bridge?: DeriveBridge
  ) => Operator<any, any> | null
> = {
  derive: (opts, bridge) => {
    const lambdaId = opts.lambdaId;
    if (!lambdaId) {
      throw new Error("derive operator missing lambdaId");
    }
    if (!bridge) {
      throw new Error(
        "derive operator references a Python lambda but no DeriveBridge was supplied"
      );
    }
    return derive(async (d: any) => {
      const rows = Array.isArray(d) ? d : d == null ? [] : [d];
      if (rows.length === 0) {
        return Array.isArray(d) ? d : (d ?? null);
      }
      const result = await bridge.applyLambda(lambdaId, rows);
      return Array.isArray(d) ? result : (result[0] ?? null);
    });
  },
  spread: (opts) => spread(opts as any),
  stack: (opts) => stack(opts as any),
  group: (opts) => group(opts as any),
  scatter: (opts) => scatter(opts as any),
  table: (opts) => table(opts as any),
  log: (opts) => log(opts.label),
};

/**
 * Leaf-mark factories. Keyed by the lowercase `type` discriminator.
 */
export const MARK_MAP: Record<
  string,
  (opts: Record<string, any>) => Mark<any>
> = {
  rect: (opts) => rect(opts),
  circle: (opts) => circle(opts),
  line: (opts) => line(opts),
  area: (opts) => area(opts),
  blank: (opts) => blank(opts),
  ellipse: (opts) => ellipse(opts),
  petal: (opts) => petal(opts),
  text: (opts) => (text as any)(opts),
  image: (opts) => (image as any)(opts),
  polygon: (opts) => polygon(opts as any) as unknown as Mark<any>,
};

// Re-export Frontend namespace for convenience.
export type { Frontend };
