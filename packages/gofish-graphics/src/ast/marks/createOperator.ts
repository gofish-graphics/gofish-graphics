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
import { GoFishRef } from "../_ref";
import { Mark, Operator } from "../types";
import {
  LayerContext,
  resolveMarkResult,
  stashLayerName,
} from "./chartBuilder";
import { inferSize, inferPos, inferColor, resolveMeasure } from "../channels";
import { discretePosition } from "../data";
import type { Measure } from "../data";
import type { MaybeValue, Value } from "../data";
import type { LabelAccessor, LabelOptions } from "../labels/labelPlacement";
import type { NameableMark } from "../withGoFish";
import {
  positionNode,
  type PositionNodeOptions,
} from "../graphicalOperators/positionNode";

// Re-exports for callers that previously got these from createOperator.
export type { LayerContext } from "./chartBuilder";
export { resolveMarkResult } from "./chartBuilder";

// NameableMark is the same type used by createMark — see withGoFish.ts.
export type { NameableMark } from "../withGoFish";

/**
 * Mark dispatch kind. Tagged on marks via the `__kind` symbol so layout
 * operators can route correctly:
 *
 *   per-item (default): T → Element. The mark is invoked once per data item;
 *     each invocation produces one node. Matches every legacy mark.
 *   expand: T[] → Element[]. The mark is invoked once with the whole group;
 *     it returns N nodes 1:1 with data. Used by `cut` so a single source
 *     shape can produce a sliced array of children that an upstream layout
 *     operator (`spread`, `stack`, …) arranges.
 */
export type MarkKind = "per-item" | "expand";

/**
 * Read the dispatch kind off a mark. Defaults to per-item so untagged marks
 * keep their legacy behavior.
 */
export function getMarkKind(mark: unknown): MarkKind {
  return ((mark as any)?.__kind as MarkKind | undefined) ?? "per-item";
}

/**
 * Stamp a kind on a mark function (mutating). Returns the mark for chaining.
 */
export function withMarkKind<M>(mark: M, kind: MarkKind): M {
  Object.defineProperty(mark as any, "__kind", {
    value: kind,
    writable: true,
    configurable: true,
  });
  return mark;
}

/**
 * Dispatch a mark over a group's data. Layout operators call this instead of
 * invoking the mark directly so per-item and expand kinds can share a single
 * call path.
 *
 *   per-item: one call per leaf with leaf-as-data. Returns `[oneNode]`.
 *             Preserves the aggregation contract of `inferSize`/`inferPos`
 *             on grouped data — every legacy mark stays unchanged.
 *   expand:   call mark once with the whole array; expect an array of nodes.
 *             The returned array is flattened by the caller across leaves.
 *
 * Both branches return `GoFishNode[]`. Per-item returns a singleton; expand
 * returns N nodes 1:1 with the input data.
 */
export async function applyMark<T>(
  mark: Mark<T> | Mark<T[]>,
  group: T | T[],
  groupKey?: string | number,
  layerContext?: LayerContext
): Promise<GoFishNode[]> {
  const kind = getMarkKind(mark);
  if (kind === "expand") {
    const items = Array.isArray(group) ? (group as T[]) : ([group] as T[]);
    const result = await (mark as Mark<T[]>)(items, groupKey, layerContext);
    return Promise.all(
      (Array.isArray(result) ? result : [result]).map((r) =>
        resolveMarkResult(r as any, layerContext)
      )
    );
  }
  // per-item: legacy behavior — one call per leaf, mark may aggregate.
  const node = await resolveMarkResult(
    (mark as Mark<T>)(group as T, groupKey, layerContext),
    layerContext
  );
  return [node];
}

/* ------------------------------------------------------------------------ *
 * Modifier factory
 *
 * Every chainable mark method (`.name`, `.label`, `.constrain`) shares one
 * shape: calling it returns a NEW mark that, when invoked, applies a mutation
 * to each node the base mark produced — one node for a per-item mark, every
 * slice for an expand mark (`cut`) — then returns the node(s). The returned
 * mark is re-decorated with the full modifier set so chains stay extensible,
 * and the mark-kind tag + IR-serialize metadata ride along.
 *
 * `createModifier` captures that shape as a config; `attachModifiers` wires a
 * set of them (plus a top-level `.render()`) onto a base mark. This is the one
 * system behind `nameableMark` (here), `createMark` (withGoFish.ts), and
 * `makeConstrainableMark` (chart.ts) — replacing three hand-rolled copies.
 * ------------------------------------------------------------------------ */

/**
 * A chainable mark modifier. `apply` mutates one produced node in place; the
 * factory iterates it over every node (expand marks yield N). `tag` runs once
 * on the wrapped mark function (not per node) to propagate metadata such as
 * the IR-serialize tag or the stashed layer name.
 */
export type ModifierConfig<Args extends any[] = any[]> = {
  /** Method name exposed on the mark, e.g. "name" | "label" | "constrain". */
  name: string;
  apply: (
    node: GoFishNode,
    layerContext: LayerContext | undefined,
    ...args: Args
  ) => void;
  tag?: (wrapped: Mark<any>, base: Mark<any>, ...args: Args) => void;
};

/** Register a modifier. Identity at runtime; the value is the typed config. */
export function createModifier<Args extends any[]>(
  cfg: ModifierConfig<Args>
): ModifierConfig<Args> {
  return cfg;
}

export type TranslateModifierOptions = PositionNodeOptions;

/**
 * Copy `from`'s `__serialize` tag (and `__axisFields`) onto `to`, letting the
 * modifier merge its own fields into the cloned tag. The merge callback (and
 * any side effect it carries, e.g. the warn on a function label accessor) runs
 * only when a base tag exists — matching the pre-factory behavior where an
 * untagged mark produced no warning and no tag.
 */
function propagateSerialize(
  from: object,
  to: object,
  merge: (tag: Record<string, any>) => void
): void {
  const tag = (from as any).__serialize;
  if (tag) {
    const nextTag: any = { ...tag };
    merge(nextTag);
    (to as any).__serialize = nextTag;
  }
  if ((from as any).__axisFields) {
    (to as any).__axisFields = (from as any).__axisFields;
  }
}

/** Build a single chainable method from a modifier config. */
function modifierMethod(
  base: Mark<any>,
  cfg: ModifierConfig,
  redecorate: (m: Mark<any>) => Mark<any>
): (...args: any[]) => Mark<any> {
  return (...args: any[]) => {
    const wrapped: Mark<any> = async (
      d: any,
      key?: string | number,
      layerContext?: LayerContext
    ) => {
      const raw = await (base as any)(d, key, layerContext);
      // Expand-kind marks return an array of nodes; per-item return one.
      // Apply the modifier to each produced node either way.
      if (Array.isArray(raw)) {
        const nodes = await Promise.all(
          raw.map((r) => resolveMarkResult(r, layerContext))
        );
        for (const node of nodes) cfg.apply(node, layerContext, ...args);
        return nodes as unknown as GoFishNode;
      }
      const node = await resolveMarkResult(raw, layerContext);
      cfg.apply(node, layerContext, ...args);
      return node;
    };
    // Preserve the kind tag so applyMark dispatches correctly through the
    // wrapped mark, then let the modifier stamp its own metadata.
    withMarkKind(wrapped, getMarkKind(base));
    cfg.tag?.(wrapped, base, ...args);
    return redecorate(wrapped);
  };
}

export function translateMark<T>(
  base: Mark<T>,
  opts: TranslateModifierOptions
): Mark<T> {
  const wrapped: Mark<T> = async (
    d: T,
    key?: string | number,
    layerContext?: LayerContext
  ) => {
    const raw = await (base as any)(d, key, layerContext);
    const node = await resolveMarkResult(raw, layerContext);
    return positionNode(opts, [node]);
  };
  withMarkKind(wrapped, getMarkKind(base));
  return nameableMark(wrapped) as Mark<T>;
}

/**
 * Attach a set of chainable modifiers (plus a top-level `.render()`) to a base
 * mark. Each method returns a mark re-decorated with the same set, so chains
 * keep every modifier available.
 */
export function attachModifiers<T>(
  base: Mark<T>,
  configs: ModifierConfig[]
): Mark<T> {
  const redecorate = (m: Mark<any>) => attachModifiers(m, configs);
  for (const cfg of configs) {
    Object.defineProperty(base, cfg.name, {
      value: modifierMethod(base, cfg, redecorate),
      writable: true,
      configurable: true,
    });
  }
  Object.defineProperty(base, "translate", {
    value: (opts: TranslateModifierOptions) => translateMark(base, opts),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(base, "render", {
    value: async (
      container: Parameters<GoFishNode["render"]>[0],
      options: Parameters<GoFishNode["render"]>[1]
    ) => {
      const node = await resolveMarkResult((base as any)(undefined));
      return node.render(container, options);
    },
    writable: true,
    configurable: true,
  });
  // SVG-export terminals, mirroring `.render()` above.
  Object.defineProperty(base, "toSVG", {
    value: async (options?: Parameters<GoFishNode["toSVG"]>[0]) => {
      const node = await resolveMarkResult((base as any)(undefined));
      return node.toSVG(options);
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(base, "toSVGElement", {
    value: async (options?: Parameters<GoFishNode["toSVGElement"]>[0]) => {
      const node = await resolveMarkResult((base as any)(undefined));
      return node.toSVGElement(options);
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(base, "save", {
    value: async (
      filename: string,
      options?: Parameters<GoFishNode["save"]>[1]
    ) => {
      const node = await resolveMarkResult((base as any)(undefined));
      return node.save(filename, options);
    },
    writable: true,
    configurable: true,
  });
  return base;
}

/**
 * `.name(layerName)` — names each produced node and tags it for the chart's
 * post-resolve layer-registration walk (collectLayerRegistrations), so
 * `ref(...)`/`selectAll(...)` can find it back. Registration is deferred (a
 * `__layerRegistration` tag) rather than an inline `layerContext` push so
 * registry order follows parent-iteration order, not async-completion order.
 * Tokens are hygienic handles and don't join the string-keyed registry.
 */
export const nameModifier = createModifier<[layerName: string | symbol]>({
  name: "name",
  apply: (node, layerContext, layerName) => {
    node.name(layerName as any);
    if (layerContext && typeof layerName === "string" && layerName) {
      (node as { __layerRegistration?: string }).__layerRegistration =
        layerName;
    }
  },
  tag: (wrapped, base, layerName) => {
    // Propagate `__serialize` through the chain (so toJSON still emits this
    // mark) and surface the name as the IR's canonical top-level `name` field.
    // Tokens aren't supported by toJSON — the tag still propagates, the name
    // is omitted. Also stash the name for ChartBuilder.connect()'s lookup.
    propagateSerialize(base, wrapped, (tag) => {
      if (typeof layerName === "string") tag.name = layerName;
    });
    stashLayerName(wrapped, layerName);
  },
});

/** `.label(accessor, options?)` — defers label placement on each node. */
export const labelModifier = createModifier<
  [accessor: LabelAccessor, options?: LabelOptions]
>({
  name: "label",
  apply: (node, _layerContext, accessor, options) => {
    node.label(accessor, options);
  },
  tag: (wrapped, base, accessor, options) => {
    propagateSerialize(base, wrapped, (tag) => {
      if (typeof accessor === "string") {
        tag.label = {
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
    });
  },
});

/**
 * Attach chainable .name() and .label() to a mark, registering it into the
 * layer context when named so that ref(...)/selectAll(...) can find it back.
 */
export function nameableMark<T>(base: Mark<T>): NameableMark<T> {
  return attachModifiers(base, [
    nameModifier,
    labelModifier,
  ]) as NameableMark<T>;
}

/**
 * A "transform" modifier maps a mark to a new mark (e.g. `.cut`), rather than
 * mutating produced nodes. The transform result already carries its own
 * modifiers, so it isn't re-decorated; instead, the existing `.name()`/
 * `.label()` methods are wrapped to re-apply this decoration, keeping the
 * transform available after a naming/labeling chain.
 */
export type TransformModifier<Args extends any[] = any[]> = {
  name: string;
  transform: (mark: Mark<any>, ...args: Args) => Mark<any>;
};

/** Add transform modifiers to a mark (used by `attachCut`). */
export function attachTransformModifiers<M extends object>(
  mark: M,
  transforms: TransformModifier[]
): M {
  if (typeof mark !== "function") return mark;
  const m: any = mark;
  for (const t of transforms) {
    Object.defineProperty(m, t.name, {
      value: (...args: any[]) => t.transform(m, ...args),
      writable: true,
      configurable: true,
    });
  }
  for (const methodName of ["name", "label", "translate"] as const) {
    const original = m[methodName];
    if (typeof original === "function") {
      Object.defineProperty(m, methodName, {
        value: (...args: any[]) =>
          attachTransformModifiers(original.call(m, ...args), transforms),
        writable: true,
        configurable: true,
      });
    }
  }
  return mark;
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
export type ChannelSpec =
  | ChannelType
  | { type: ChannelType; entry?: boolean; discrete?: boolean };

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
  (opts: Options): TranslatableOperator<Datum[], Datum[]>;
  (
    opts: Options,
    marks: (Mark<Datum> | GoFishRef)[] | Promise<(Mark<Datum> | GoFishRef)[]>
  ): NameableMark<Datum>;
};

export type TranslatableOperator<T, U> = Operator<T, U> & {
  translate(opts: TranslateModifierOptions): TranslatableOperator<T, U>;
};

function attachTranslateOption<T extends object>(
  target: T,
  translate: (opts: TranslateModifierOptions) => T
): T {
  Object.defineProperty(target, "translate", {
    value: (opts: TranslateModifierOptions) => translate(opts),
    writable: true,
    configurable: true,
  });
  return target;
}

function translateOperator<T, U>(
  operator: Operator<T, U>,
  opts: TranslateModifierOptions
): TranslatableOperator<T, U> {
  const translated: Operator<T, U> = async (mark) => {
    const arranged = await operator(mark);
    return translateMark(arranged, opts) as Mark<T>;
  };
  return attachTranslateOption(translated, (next) =>
    translateOperator(translated, next)
  ) as TranslatableOperator<T, U>;
}

/**
 * Run a single channel inference over a data slice. `measure` is the channel's
 * resolved {@link Measure}, computed once per channel from the operator's whole
 * input array (which carries the measure-provenance symbol even when `data` is a
 * per-entry slice that does not) and passed down so `inferSize`/`inferPos` don't
 * recompute it per split entry.
 */
function runChannel(
  type: ChannelType,
  val: any,
  data: any[],
  measure: Measure | undefined
): any {
  if (type === "size") return inferSize(val, data, measure);
  if (type === "pos") return inferPos(val, data, measure);
  if (type === "color") return inferColor(val, data);
  return val;
}

function isNonNumericEntryField(
  accessor: unknown,
  data: Record<string, unknown>[]
): accessor is string {
  if (typeof accessor !== "string") return false;
  return data.some((row) => {
    const value = row?.[accessor];
    return (
      value !== undefined && value !== null && !Number.isFinite(Number(value))
    );
  });
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
    const discrete = typeof spec === "object" && spec.discrete === true;
    // The measure is loop-invariant across split entries (it depends only on
    // the accessor and `wholeData`'s provenance, not on which items a given
    // entry holds), so resolve it once per channel. Only size/pos consume it;
    // computing it for color/raw would add a spurious conflict-throw site.
    const measure =
      type === "size" || type === "pos"
        ? resolveMeasure(wholeData, val)
        : undefined;
    if (perEntry && entries !== undefined) {
      if (
        type === "pos" &&
        discrete &&
        isNonNumericEntryField(val, wholeData)
      ) {
        out[key] = [...entries.keys()].map((_, i) =>
          discretePosition(i, entries.size)
        );
        continue;
      }
      // Value aggregation uses each entry's items; the measure comes from
      // `wholeData` (the binned array still carries the symbol — each per-entry
      // slice does not).
      out[key] = [...entries.values()].map((items) =>
        runChannel(type, val, items, measure)
      );
    } else {
      out[key] = runChannel(type, val, wholeData, measure);
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
  function dual(opts: Options): TranslatableOperator<Datum[], Datum[]>;
  function dual(
    opts: Options,
    marks: (Mark<Datum> | GoFishRef)[] | Promise<(Mark<Datum> | GoFishRef)[]>
  ): NameableMark<Datum>;
  function dual(
    opts: Options,
    marks?: (Mark<Datum> | GoFishRef)[] | Promise<(Mark<Datum> | GoFishRef)[]>
  ): TranslatableOperator<Datum[], Datum[]> | NameableMark<Datum> {
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
    // Operator (traversal) form: split d, apply mark per leaf, layout.
    const operator: Operator<Datum[], Datum[]> = async (mark) => {
      return (async (
        d: Datum[],
        key?: string | number,
        layerContext?: LayerContext
      ) => {
        // Expand-kind marks (e.g. `cut`) consume the whole group at once and
        // emit N nodes 1:1 with the data — so the operator hands them a single
        // leaf containing all rows, regardless of the operator's own `split`
        // config. (The per-operator split, e.g. spread's identity split that
        // the waffle grid relies on, only applies to per-item marks.) The
        // resulting N expanded nodes are then arranged by `layout` below.
        const isExpand = getMarkKind(mark) === "expand";
        // An expand mark turns a group's rows into an ARRAY of slice nodes,
        // but a `by`-grouped operator needs exactly ONE child node per group.
        // So the cut can't hang directly under the `by`-operator — interpose a
        // layout operator between the grouping and the cut to collapse each
        // group's slices into a single node first.
        if (isExpand && (opts as any).by !== undefined) {
          throw new Error(
            `cut is an expand mark: it turns each group's rows into an array of ` +
              `slice nodes, but a \`by\`-grouped operator needs exactly one node ` +
              `per group. Interpose a layout operator between the by-grouping and ` +
              `the cut so each group's slices collapse into one node, e.g. ` +
              `.flow(spread({ by }), stack({ dir }))`
          );
        }
        const splitResult = isExpand
          ? new Map<number, Datum[]>([[0, d]])
          : cfg.split(opts, d);
        const entries =
          splitResult instanceof Map ? splitResult : splitResult.entries;
        const keys = splitResult instanceof Map ? undefined : splitResult.keys;
        // Route each leaf through applyMark so expand-kind marks (e.g. `cut`)
        // can return arrays that we flatten across leaves. Per-item marks
        // keep the legacy "one call per leaf" semantics — applyMark wraps
        // their single node in a singleton array.
        const nodesPerLeaf = await Promise.all(
          [...entries.entries()].map(async ([i, leaf]) => {
            const currentKey = key != undefined ? `${key}-${i}` : i;
            const leafNodes = await applyMark(
              mark,
              leaf as Datum | Datum[],
              currentKey,
              layerContext
            );
            const keyStr = currentKey?.toString() ?? "";
            for (const node of leafNodes) node.setKey(keyStr);
            // Record the (string) field this operator grouped by, so a later
            // `resolve(..., { from })` can match against it without the user
            // restating the key. The innermost grouping wins (`??=`); a function
            // `by` has no field name to record, so resolve errors there unless
            // given an explicit `key`.
            if (typeof (opts as any).by === "string") {
              for (const node of leafNodes) {
                if ((node as any).__splitBy === undefined) {
                  (node as any).__splitBy = (opts as any).by;
                }
              }
            }
            return leafNodes;
          })
        );
        const nodes = nodesPerLeaf.flat();
        const lowOpts = buildLayoutOpts(cfg.channels, opts, d, entries, keys);
        // Carry the grouping field (e.g. spread's `by`) into the node operator
        // so it can stamp the ORDINAL space it builds with a measure — the
        // discrete axis names itself off its own space, mirroring how a
        // continuous channel's field becomes its space's measure. `by` itself is
        // a stripped factory key, so route the resolved field via __axisFields.
        const opFields = cfg.axisFields?.(opts);
        if (
          opFields &&
          (opFields.x !== undefined || opFields.y !== undefined)
        ) {
          (lowOpts as any).__axisFields = opFields;
        }
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
    return attachTranslateOption(operator, (translateOpts) =>
      translateOperator(operator, translateOpts)
    ) as TranslatableOperator<Datum[], Datum[]>;
  }
  return dual as DualModeOperator<Datum, Options>;
}
