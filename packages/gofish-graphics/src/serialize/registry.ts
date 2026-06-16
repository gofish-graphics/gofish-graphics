// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

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
  paint,
  blank,
  circle,
  derive,
  intersect,
  layer,
  line,
  log,
  mask,
  subtract,
  over,
  rect,
  exclude,
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
import {
  treemap as treemapOperator,
  Treemap,
} from "../ast/graphicalOperators/treemap";
// `cut` (the pure slice primitive, returns an array of slice node promises)
// and `cutMark` (the v3 expand-mark form) — the deserializer dispatches
// between them by context: a `cut` IR node used as a chart `.mark(...)` →
// `cutMark`, used as a combinator child → expanded into slices via `cut`.
// `offset` is the public node operator a `{type:"offset"}` IR node maps to.
// These need recursive `mapMark` of their `source`/`children`, so unlike the
// string-keyed MARK_MAP/COMBINATOR_FACTORIES they're applied directly in
// fromJSON.ts rather than via a flat factory map.
import { cut as cutSlices, cutMark } from "../ast/graphicalOperators/cut";
import { offset as offsetOp } from "../ast/graphicalOperators/offset";
import { setMeasureProvenance, type MeasureProvenance } from "../ast/data";
import type { Frontend } from "gofish-ir";

export type { ChartBuilder, Mark, Operator };
export { cutSlices, cutMark, offsetOp };

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
  // stack/scatter/group/table are DualModeOperators built via
  // `createOperator` (same as spread). Their `(opts, marks)` overload
  // produces a combinator-form Mark that `toJSON` emits with
  // `__combinator: true`, so the deserializer needs the matching
  // factories — otherwise the IR round-trips fine through `toJSON` but
  // fromJSON throws "Unknown combinator mark type".
  stack: (opts, marks) => (stack as any)(opts, marks) as unknown as Mark<any>,
  scatter: (opts, marks) =>
    (scatter as any)(opts, marks) as unknown as Mark<any>,
  group: (opts, marks) => (group as any)(opts, marks) as unknown as Mark<any>,
  table: (opts, marks) => (table as any)(opts, marks) as unknown as Mark<any>,
  layer: (opts, marks) => (layer as any)(opts, marks) as unknown as Mark<any>,
  arrow: (opts, marks) => (arrow as any)(opts, marks) as unknown as Mark<any>,
  connect: (opts, marks) =>
    (connect as any)(opts, marks) as unknown as Mark<any>,
  treemap: (opts, marks) =>
    (Treemap as any)(opts, marks) as unknown as Mark<any>,
  // Keys are the IR wire types (unchanged); values are the renamed
  // (Figma-inspired, #196/#202) combinator factories.
  over: (opts, marks) => (over as any)(opts, marks) as unknown as Mark<any>,
  inside: (opts, marks) =>
    (intersect as any)(opts, marks) as unknown as Mark<any>,
  xor: (opts, marks) => (exclude as any)(opts, marks) as unknown as Mark<any>,
  out: (opts, marks) => (subtract as any)(opts, marks) as unknown as Mark<any>,
  atop: (opts, marks) => (paint as any)(opts, marks) as unknown as Mark<any>,
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
      // A derive operator with no `lambdaId` is what the JS-side `toJSON`
      // emits for pure-JS `derive(fn)` callsites — function bodies aren't
      // JSON-serializable. Such IRs are inspect-only; they can't be
      // round-tripped through fromJSON because there's no callable to
      // wire up. The Python widget emits the `lambdaId`-carrying form.
      throw new Error(
        "derive operator missing lambdaId — this IR was emitted from a pure-JS " +
          "derive(fn) callsite and isn't round-trippable (function bodies don't serialize). " +
          "Only IRs emitted by the Python wrapper or hand-built IRs with explicit " +
          "lambdaIds can be deserialized."
      );
    }
    if (!bridge) {
      throw new Error(
        "derive operator references a Python lambda but no DeriveBridge was supplied"
      );
    }
    // A data transform (e.g. `bin`) declares measure provenance for its output
    // columns in the IR (the array-symbol provenance can't ride the rows across
    // the RPC). Re-apply it to the returned rows so channel inference unifies a
    // histogram's edges on the source field's axis (mirrors the JS bin).
    const provenance = opts.provenance as MeasureProvenance | undefined;
    return derive(async (d: any) => {
      const rows = Array.isArray(d) ? d : d == null ? [] : [d];
      if (rows.length === 0) {
        return Array.isArray(d) ? d : (d ?? null);
      }
      const result = await bridge.applyLambda(lambdaId, rows);
      const tagged =
        provenance !== undefined
          ? setMeasureProvenance(result, provenance)
          : result;
      return Array.isArray(d) ? tagged : (tagged[0] ?? null);
    });
  },
  spread: (opts) => spread(opts as any),
  stack: (opts) => stack(opts as any),
  group: (opts) => group(opts as any),
  scatter: (opts) => scatter(opts as any),
  table: (opts) => table(opts as any),
  treemap: (opts) => treemapOperator(opts as any),
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
