// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * The factory table and the {@link DeriveBridge} contract used by the
 * frontend-IR deserializer.
 *
 * The deserializer turns a {@link Frontend.FrontendIRDocument} into a live
 * GoFish `ChartBuilder` / `Mark` graph. Each construct the descriptor table
 * declares is rebuilt by one factory, looked up by its wire `type`
 * ({@link rebuild}); the `derive` operator and any `{__gofish_lambda}`
 * sentinels invoke a caller-supplied bridge (typically the Python anywidget
 * bridge).
 */

// Source-module imports (not `../lib`) — `lib.ts` re-exports this module,
// so importing back through `lib.ts` would create a cycle that resolves at
// module-load. Importing directly from each source module keeps the
// dependency graph acyclic.
import {
  ribbon,
  paint,
  blank,
  circle,
  derive,
  resolve as resolveOp,
  join as joinOp,
  selectAll,
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
import { enclose } from "../ast/graphicalOperators/enclose";
import { position } from "../ast/graphicalOperators/position";
import { treemap } from "../ast/graphicalOperators/treemap";
import { pack } from "../ast/graphicalOperators/pack";
// `cut` (the pure slice primitive, returns an array of slice node promises)
// and `cutMark` (the expand-mark form) — the deserializer dispatches
// between them by context: a `cut` IR node used as a chart `.mark(...)` →
// `cutMark`, used as a combinator child → expanded into slices via `cut`.
// `offset` is the public node operator a `{type:"offset"}` IR node maps to.
// These need recursive `mapMark` of their `source`/`children`, and they are
// not in the descriptor table, so they're applied directly in fromJSON.ts
// rather than through `FACTORIES`.
import { cut as cutSlices, cutMark } from "../ast/graphicalOperators/cut";
import { offset as offsetOp } from "../ast/graphicalOperators/offset";
import { setMeasureProvenance, type MeasureProvenance } from "../ast/data";
import { Frontend } from "gofish-ir";

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
 * The transport (Arrow over anywidget traitlets, JSON over HTTP, etc.) is the
 * bridge's responsibility. `applyLambda` returns the callback's results as
 * plain JSON values; any transport-specific wrapping is the bridge's job to
 * undo.
 */
export interface DeriveBridge {
  /**
   * Apply the lambda registered under `lambdaId` to a batch of rows.
   * Returns what the lambda produced (rows, or one value per row) as plain
   * JSON values.
   */
  applyLambda(lambdaId: string, rows: any[]): Promise<any[]>;
}

/**
 * The public factory that rebuilds each wire type, keyed by the descriptor
 * table's `type` (gofish-ir's `OPERATORS`, `LEAF_MARKS`, `COMBINATOR_MARKS`).
 * The descriptor's kind decides the call (see {@link rebuild}): an
 * operator or a leaf mark is `factory(opts)`, a combinator mark is
 * `factory(opts, children)`. So a dual-form construct (`spread`, `line`, …)
 * has one entry for both of its forms.
 *
 * The serialize test fails when a descriptor has no entry here (or in
 * {@link OPERATOR_BUILDERS}), or when an entry has no descriptor.
 */
export const FACTORIES: Record<string, (...args: any[]) => any> = {
  // Leaf marks.
  rect,
  circle,
  ellipse,
  petal,
  text,
  image,
  polygon,
  blank,
  // Relational marks: a leaf in a chart's `.mark(...)`, a combinator over
  // explicit children.
  line,
  ribbon,
  // Dual-form operators: an operator in `.flow(...)`, a combinator over
  // explicit children.
  spread,
  stack,
  scatter,
  group,
  table,
  treemap,
  pack,
  // Combinator-only marks.
  layer,
  enclose,
  position,
  arrow,
  // The compositing wire types keep their original names; the factories were
  // renamed (#196/#202).
  over,
  inside: intersect,
  xor: exclude,
  out: subtract,
  atop: paint,
  mask,
};

/**
 * Operators whose IR is not their factory's options object, so rebuilding
 * one takes real work. These stay hand-written on purpose.
 */
export const OPERATOR_BUILDERS: Record<
  string,
  (opts: Record<string, any>, bridge?: DeriveBridge) => Operator<any, any>
> = {
  // The IR names a Python lambda: the rebuilt operator calls it through the
  // bridge and puts back the measure provenance the rows lose on the way.
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
  // The IR names the layer to resolve against as a string; the factory takes
  // a selection.
  resolve: (opts) => {
    if (typeof opts.from !== "string") {
      throw new Error(
        "resolve operator IR is missing a string `from` (the layer name to " +
          "resolve against) — the Python/JS emitters always include it."
      );
    }
    return resolveOp(opts.cols as string[], {
      from: selectAll(opts.from),
      key: opts.key as string | undefined,
    });
  },
  // The factory takes the right-hand table as its first argument.
  join: (opts) => joinOp(opts.right as any[], { on: opts.on as string }),
  // The factory takes the prefix as its only argument.
  log: (opts) => log(opts.prefix),
};

/**
 * Rebuild the construct of the given kind and wire `type` from its options,
 * or return `undefined` when the descriptor table declares no construct of
 * that kind and type (an operator `{type: "layer"}` has none, though the
 * combinator `layer` does).
 *
 * The kind decides the call. An operator or a leaf mark is `factory(opts)`,
 * and a combinator mark is `factory(opts, children)`: a dual-form factory
 * reads a second argument as the combinator form's children, so an operator
 * must not get one. Only an {@link OPERATOR_BUILDERS} entry sees the bridge.
 */
export function rebuild(
  kind: Frontend.NodeKind,
  type: string,
  opts: Record<string, any>,
  { children, bridge }: { children?: unknown[]; bridge?: DeriveBridge } = {}
): any {
  if (!Object.hasOwn(Frontend.DESCRIPTOR_TABLES[kind], type)) return undefined;
  if (kind === "operator" && Object.hasOwn(OPERATOR_BUILDERS, type)) {
    return OPERATOR_BUILDERS[type](opts, bridge);
  }
  const factory = FACTORIES[type];
  return kind === "combinator-mark" ? factory(opts, children) : factory(opts);
}

// Re-export Frontend namespace for convenience.
export type { Frontend };
