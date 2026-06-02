// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Operator Factory — /internals/frontend/operator-factory
// </gofish-wiki>

/**
 * createOperator: a factory for v3 layout operators.
 *
 * Every layout operator (spread, stack, scatter, table, group) has the same
 * underlying shape: split the data into pieces, apply a mark to each piece,
 * hand the resulting children to a low-level layout function. This factory
 * captures that shape once so each operator is a short config:
 *
 *   split    : (opts, data) -> [ (key, subdata), ... ] + optional meta
 *   layout   : the low-level node builder (e.g. Spread, Scatter, Frame, Table)
 *   channels?: { w: "size" } — auto-apply inferSize/inferPos/inferColor
 *
 * High-level opts are passed to `layout` directly (after channels apply and
 * meta merges). This requires high-level `OperatorOptions` to match the
 * low-level layout function's opts shape — naming and types should align
 * between the two. v3-only keys (`by`, `debug`) are stripped before layout.
 *
 * The returned function has two call shapes, disambiguated by whether a
 * marks-shape is passed as the second argument:
 *
 *   operator form (inside .flow()):   createOp(opts)                -> Operator
 *   combinator form (inside a mark):  createOp(opts, marksShape)    -> Mark
 *
 * See the "Operator Factory" internals essay
 * (apps/docs/docs/internals/v3/operator-factory.md) for a full walk-through.
 */

import { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import { Mark, Operator } from "../types";
import { LayerContext, resolveMarkResult } from "./chartBuilder";
import { inferSize, inferPos, inferColor } from "../channels";
import type { MaybeValue, Value } from "../data";
import type { LabelAccessor, LabelOptions } from "../labels/labelPlacement";
import type { NameableMark } from "../withGoFish";

// Re-exports for callers that previously got these from createOperator.
export type { LayerContext } from "./chartBuilder";
export { resolveMarkResult } from "./chartBuilder";

// NameableMark is the same type used by createMark — see withGoFish.ts.
export type { NameableMark } from "../withGoFish";

/**
 * Attach chainable .name() and .label() to a mark, registering it into the
 * layer context when named so that select(...) can find it back.
 */
export function nameableMark<T>(base: Mark<T>): NameableMark<T> {
  const withName = (layerName: string): NameableMark<T> => {
    const wrapped: Mark<T> = async (
      d: T,
      key?: string | number,
      layerContext?: LayerContext
    ) => {
      const node = await resolveMarkResult(
        base(d, key, layerContext),
        layerContext
      );
      node.name(layerName);
      // Tag for the post-resolve tree walk in ChartBuilder.resolve
      // (collectLayerRegistrations); inline pushing here would record
      // async-completion order instead of parent-iteration order.
      if (layerContext && layerName) {
        (node as { __layerRegistration?: string }).__layerRegistration =
          layerName;
      }
      return node;
    };
    // Propagate `__serialize` through the chain so toJSON can still emit
    // this mark's IR, and stash the layerName so the emitter surfaces it
    // as the canonical top-level `name` field. Without this, every
    // `.name("...")` call would strip the serialize tag.
    propagateSerializeWithName(base, wrapped, layerName);
    return nameableMark(wrapped);
  };
  const withLabel = (
    accessor: LabelAccessor,
    options?: LabelOptions
  ): NameableMark<T> => {
    const wrapped: Mark<T> = async (
      d: T,
      key?: string | number,
      layerContext?: LayerContext
    ) => {
      const node = await resolveMarkResult(
        base(d, key, layerContext),
        layerContext
      );
      node.label(accessor, options);
      return node;
    };
    propagateSerializeWithLabel(base, wrapped, accessor, options);
    return nameableMark(wrapped);
  };
  const render = async (
    container: Parameters<GoFishNode["render"]>[0],
    options: Parameters<GoFishNode["render"]>[1]
  ) => {
    const node = await resolveMarkResult(base(undefined as any));
    return node.render(container, options);
  };
  Object.defineProperty(base, "name", {
    value: withName,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(base, "label", {
    value: withLabel,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(base, "render", {
    value: render,
    writable: true,
    configurable: true,
  });
  return base as NameableMark<T>;
}

/**
 * Copy the `__serialize` metadata tag from `from` to `to` and merge a
 * chained name (and `__axisFields` for axis-title inference) onto it.
 *
 * `name` lives in a dedicated tag slot rather than `opts` so the
 * frontend-IR emitter can surface it as the canonical top-level `name`
 * field of the leaf/combinator IR (matching Python's emit shape).
 *
 * Layer-name tokens (`Token` from `createName`) are not yet supported by
 * `toJSON` — when one is passed we still propagate the tag (so the mark
 * stays serializable for its other fields) but omit the `name`.
 */
function propagateSerializeWithName(
  from: object,
  to: object,
  layerName: unknown
): void {
  const tag = (from as any).__serialize;
  if (!tag) return;
  const nextTag: any = { ...tag };
  if (typeof layerName === "string") {
    nextTag.name = layerName;
  }
  (to as any).__serialize = nextTag;
  // Keep axis-field inference working through the chain.
  if ((from as any).__axisFields) {
    (to as any).__axisFields = (from as any).__axisFields;
  }
}

function propagateSerializeWithLabel(
  from: object,
  to: object,
  accessor: unknown,
  options: unknown
): void {
  const tag = (from as any).__serialize;
  if (!tag) return;
  const nextTag: any = { ...tag };
  if (typeof accessor === "string") {
    nextTag.label = {
      accessor,
      ...(options && typeof options === "object" ? options : {}),
    };
  } else if (
    typeof accessor === "function" &&
    typeof console !== "undefined" &&
    typeof console.warn === "function"
  ) {
    // Function accessors can't be JSON-serialized. The mark stays
    // serializable (the rest of the tag propagates) but the label is
    // dropped from the emitted IR. Matches `dataToIR`'s warn precedent.
    console.warn(
      "[gofish-ir] .label(fn): function accessors aren't serializable; " +
        "label will be omitted from the emitted IR. Use a string field " +
        "name if you need the label to round-trip."
    );
  }
  (to as any).__serialize = nextTag;
  if ((from as any).__axisFields) {
    (to as any).__axisFields = (from as any).__axisFields;
  }
}

/**
 * What a split returns. Insertion order is preserved (ES Map spec), which
 * matters for layout ordering.
 *
 * Each bucket may be either a `Datum[]` (the typical groupBy case) or a
 * single `Datum` (the no-`by` per-item case). The downstream mark and
 * `inferSize`/`inferPos`/`inferColor` all normalise via
 * `Array.isArray(d) ? d : [d]`, so both forms work uniformly.
 *
 * If the operator also needs to feed axis labels (e.g. `{colKeys, rowKeys}`
 * for table) into the layout function's opts, return the wrapped
 * `{entries, keys}` form instead of a bare Map.
 */
export type SplitResult<Datum> =
  | Map<string | number, Datum | Datum[]>
  | {
      entries: Map<string | number, Datum | Datum[]>;
      keys?: Record<string, string[]>;
    };

/** Data-encoded opts (same shape as createMark's channel annotations). */
export type ChannelType = "size" | "pos" | "color";

/**
 * Channel spec. String form is the default (aggregate over all data, produces
 * one value). Object form adds flags — notably `entry: true`, which runs the
 * inference once per split entry (using each entry's items) and collects the
 * results into an array. Entry-flagged channels are only meaningful in the
 * operator (traversal) form; in the combinator form they act as the aggregate
 * form for whatever data the combinator was called with.
 */
export type ChannelSpec = ChannelType | { type: ChannelType; entry?: boolean };

export type ChannelAnnotations<Options> = Partial<
  Record<keyof Options, ChannelSpec>
>;

/**
 * The user-facing input type for a single channel-annotated opt, given its
 * ChannelSpec and the datum type. Mirrors DeriveMarkProps from channels.ts
 * but also handles the `entry` flag:
 *
 *   "size" / "pos"        → number | (keyof Datum & string) | MaybeValue<T>
 *   "color"               → string | (keyof Datum & string) | MaybeValue<string>
 *   entry-flagged "size"  → (keyof Datum & string) | MaybeValue<T>[]
 *   entry-flagged "pos"   → (keyof Datum & string) | MaybeValue<T>[]
 *   entry-flagged "color" → (keyof Datum & string) | MaybeValue<string>[]
 *
 * The entry forms don't accept a scalar because the layout function expects
 * an array (one value per child) when the channel is entry-based.
 */
type ChannelInput<Spec, Datum> = Spec extends { type: infer Type; entry: true }
  ? Type extends "size"
    ? (keyof Datum & string) | MaybeValue<number>[] | undefined
    : Type extends "pos"
      ? (keyof Datum & string) | MaybeValue<number>[] | undefined
      : Type extends "color"
        ? (keyof Datum & string) | MaybeValue<string>[] | undefined
        : never
  : Spec extends "size" | { type: "size" }
    ? number | (keyof Datum & string) | Value<number> | undefined
    : Spec extends "pos" | { type: "pos" }
      ? number | (keyof Datum & string) | Value<number> | undefined
      : Spec extends "color" | { type: "color" }
        ? string | (keyof Datum & string) | Value<string> | undefined
        : never;

/**
 * Derive the user-facing options type from a low-level layout's props type
 * and a set of channel annotations. Channel-annotated keys get the
 * channel-input widening; other keys pass through unchanged.
 */
export type DeriveOperatorOptions<LayoutProps, Channels, Datum> = {
  [K in keyof LayoutProps]: K extends keyof Channels
    ? Channels[K] extends undefined
      ? LayoutProps[K]
      : ChannelInput<NonNullable<Channels[K]>, Datum>
    : LayoutProps[K];
};

/** The low-level layout function passed as createOperator's first arg. */
export type LayoutFn<Options> = (
  opts: Options,
  children: GoFishAST[]
) => GoFishAST | PromiseLike<GoFishAST | PromiseLike<GoFishAST>>;

/**
 * Config for createOperator (second positional arg).
 *
 * - `split` (required): split the data into an ordered Map of (key, subdata)
 *   entries. Can also return `keys` — axis labels (colKeys/rowKeys for table)
 *   that merge into opts before `layout` is called.
 * - `channels` (optional): per-opt data-aware encodings, applied to the opts
 *   before they reach `layout`. Mirrors createMark's channel annotations.
 *
 * Combinator form is mechanical: the factory enumerates the marks array with
 * integer keys and applies each mark to the shared data. No user hook.
 *
 * Note: the high-level `Options` type should match the low-level `layout`
 * function's opts shape. If you find yourself wanting a translation layer,
 * change one side's naming to match the other rather than threading an
 * adapter through the factory.
 */
export type OperatorConfig<Datum, Options> = {
  split: (opts: Options, d: Datum[]) => SplitResult<Datum>;
  channels?: ChannelAnnotations<Options>;
  /**
   * Optional hook returning the axis-field encoding ChartBuilder uses to
   * auto-infer axis titles. e.g. `spread({by: "lake", dir: "x"})` should report
   * `{x: "lake"}` so an x-axis title `lake` is inferred.
   */
  axisFields?: (opts: Options) => { x?: string; y?: string } | undefined;
  /**
   * Optional IR-serialization config. When set, the factory tags the
   * produced operator with an `__serialize: { type, opts }` marker the
   * frontend-IR emitter (gofish-graphics/serialize/toJSON) reads. Each
   * standard-library operator should declare its IR discriminator here;
   * user-built operators may omit it (the emitter falls back to opaque
   * `{ type: "derive" }` for any operator that lacks a tag).
   */
  serialize?: {
    /** IR discriminator (lowercase to match the wire format), e.g. "spread". */
    type: string;
    /**
     * Optional shape function: takes the original options and returns the
     * IR payload. Default behavior is to copy opts verbatim. Use this when
     * the runtime opts diverge from what the IR should carry — e.g. to
     * strip non-serializable fields or rename a key.
     */
    shape?: (opts: Options) => Record<string, unknown>;
  };
};

export type DualModeOperator<Datum, Options> = {
  (opts: Options): Operator<Datum[], Datum[]>;
  (
    opts: Options,
    marks: Mark<Datum>[] | Promise<Mark<Datum>[]>
  ): NameableMark<Datum>;
};

/** Run a single channel inference over a data slice. */
function runChannel(type: ChannelType, val: any, data: any[]): any {
  if (type === "size") return inferSize(val, data);
  if (type === "pos") return inferPos(val, data);
  if (type === "color") return inferColor(val, data);
  return val;
}

/**
 * Apply channel annotations: runs inferSize/inferPos/inferColor on the
 * specified opts keys, returning a new opts object.
 *
 * - Plain channels ("size"/"pos"/"color") aggregate over all of `d` and
 *   produce a single value.
 * - Entry-flagged channels (`{type, entry: true}`) run once per split entry
 *   and collect the results into an array, one value per entry.
 * - If the opts value is already an array, channels pass it through unchanged
 *   (user supplied the final form directly).
 */
function applyChannels<Options extends Record<string, any>>(
  opts: Options,
  channels: ChannelAnnotations<Options> | undefined,
  d: any,
  entries: Map<string | number, any> | undefined
): Options {
  if (!channels) return opts;
  const wholeData = Array.isArray(d) ? d : [d];
  const out: any = { ...opts };
  for (const key of Object.keys(channels) as Array<keyof Options>) {
    const spec = channels[key];
    const val = out[key];
    if (val === undefined || spec === undefined) continue;
    // User already supplied the final-form array — leave it alone. This is
    // also the path for combinator-form callsites that pre-built per-child
    // arrays (e.g. `scatter({x: [0, 1, 2]}, [...marks])`), and for entry-
    // flagged channels where the user passed an explicit array.
    if (Array.isArray(val)) continue;
    const type: ChannelType = typeof spec === "string" ? spec : spec.type;
    const perEntry = typeof spec === "object" && spec.entry === true;
    if (perEntry && entries !== undefined) {
      out[key] = [...entries.values()].map((items) =>
        runChannel(type, val, items)
      );
    } else {
      out[key] = runChannel(type, val, wholeData);
    }
  }
  return out as Options;
}

/**
 * Factory-only opts that never flow through to the low-level `layout` function.
 * `by`: the universal split-spec key.
 * `debug`: diagnostic-only, handled inside `split` if at all.
 */
const FACTORY_ONLY_KEYS = new Set<string>(["by", "debug"]);

/** Strip factory-only keys from opts before passing to `layout`. */
function stripFactoryKeys<Options extends Record<string, any>>(
  opts: Options
): Options {
  const out: any = {};
  for (const [k, v] of Object.entries(opts)) {
    if (!FACTORY_ONLY_KEYS.has(k)) out[k] = v;
  }
  return out as Options;
}

/** Build the low-level opts passed to `layout`. */
function buildLayoutOpts<Datum, Options extends Record<string, any>>(
  channels: ChannelAnnotations<Options> | undefined,
  opts: Options,
  d: Datum | Datum[],
  entries: Map<string | number, Datum | Datum[]> | undefined,
  keys: Record<string, string[]> | undefined
): Options {
  const withChannels = applyChannels(opts, channels, d, entries);
  const stripped = stripFactoryKeys(withChannels);
  // Merge split's axis keys (e.g. colKeys, rowKeys for table) into opts.
  return keys !== undefined ? ({ ...stripped, ...keys } as Options) : stripped;
}

/**
 * Factory that turns a low-level `layout` function plus `{split, channels}`
 * config into a layout operator with both combinator and operator (traversal)
 * forms.
 *
 * Signature mirrors `createMark(shapeFn, channels)` — low-level builder
 * first, config second.
 */
export function createOperator<Datum, Options extends Record<string, any>>(
  layout: LayoutFn<Options>,
  cfg: OperatorConfig<Datum, Options>
): DualModeOperator<Datum, Options> {
  function dual(opts: Options): Operator<Datum[], Datum[]>;
  function dual(
    opts: Options,
    marks: Mark<Datum>[] | Promise<Mark<Datum>[]>
  ): NameableMark<Datum>;
  function dual(
    opts: Options,
    marks?: Mark<Datum>[] | Promise<Mark<Datum>[]>
  ): Operator<Datum[], Datum[]> | NameableMark<Datum> {
    if (marks !== undefined) {
      // Combinator form: apply each mark to the same data d, then layout.
      const base: Mark<Datum> = async (
        d: Datum,
        key?: string | number,
        layerContext?: LayerContext
      ) => {
        // Marks may be a Promise<Mark[]> when produced by helpers like
        // `For(...)` — await before mapping. Entries may also be already
        // resolved nodes (e.g. `ref(...)`) rather than mark functions, so
        // pass non-functions through as-is.
        const resolvedMarks = await Promise.resolve(marks);
        const nodes = await Promise.all(
          resolvedMarks.map(async (mark, i) => {
            const currentKey = key != undefined ? `${key}-${i}` : i;
            const result =
              typeof mark === "function"
                ? mark(d, currentKey, layerContext)
                : mark;
            return resolveMarkResult(result, layerContext);
          })
        );
        const lowOpts = buildLayoutOpts(
          cfg.channels,
          opts,
          d,
          undefined,
          undefined
        );
        const node = (await layout(lowOpts, nodes)) as GoFishNode;
        (node as any).datum = d;
        return node;
      };
      const combinator = nameableMark(base);
      // Tag combinator-form mark with IR-serialization metadata, mirroring
      // the operator-form tagging below. The `__combinator: true` flag tells
      // the emitter to write the spec into the mark tree (with `children`)
      // rather than into the operators[] list. We stash the child marks on
      // the tag so the emitter can walk them — without this, the children
      // are trapped inside the closure of `base`.
      if (cfg.serialize) {
        const payload = cfg.serialize.shape ? cfg.serialize.shape(opts) : opts;
        (combinator as any).__serialize = {
          type: cfg.serialize.type,
          opts: payload,
          __combinator: true,
          children: marks,
        };
      }
      return combinator;
    }
    // Operator (traversal) form: split d, apply one mark per leaf, layout.
    const operator: Operator<Datum[], Datum[]> = async (mark) => {
      return (async (
        d: Datum[],
        key?: string | number,
        layerContext?: LayerContext
      ) => {
        const splitResult = cfg.split(opts, d);
        const entries =
          splitResult instanceof Map ? splitResult : splitResult.entries;
        const keys = splitResult instanceof Map ? undefined : splitResult.keys;
        const nodes = await Promise.all(
          [...entries.entries()].map(async ([i, leaf]) => {
            const currentKey = key != undefined ? `${key}-${i}` : i;
            const node = await resolveMarkResult(
              mark(leaf as Datum[], currentKey, layerContext),
              layerContext
            );
            node.setKey(currentKey?.toString() ?? "");
            return node;
          })
        );
        const lowOpts = buildLayoutOpts(cfg.channels, opts, d, entries, keys);
        return (await layout(lowOpts, nodes)) as unknown as GoFishNode;
      }) as Mark<Datum[]>;
    };
    // Tag the operator with axis fields so ChartBuilder can auto-infer
    // axis titles. Applies to operator-form only (combinator form returns a
    // mark that's already typed via createMark's axis-field tagging).
    const fields = cfg.axisFields?.(opts);
    if (fields && (fields.x !== undefined || fields.y !== undefined)) {
      (operator as any).__axisFields = fields;
    }
    // Tag the operator with IR-serialization metadata so the frontend-IR
    // emitter can reconstruct it as `{ type, ...opts }` on the wire.
    if (cfg.serialize) {
      const payload = cfg.serialize.shape ? cfg.serialize.shape(opts) : opts;
      (operator as any).__serialize = {
        type: cfg.serialize.type,
        opts: payload,
      };
    }
    return operator;
  }
  return dual as DualModeOperator<Datum, Options>;
}
