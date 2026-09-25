// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

import type { JSX } from "solid-js";
import { GoFishAST } from "./_ast";
import { GoFishNode } from "./_node";
import type { AxesOptions } from "./gofish";
import type { ColorConfig } from "./colorSchemes";
import _, { ListOfRecursiveArraysOrValues } from "lodash";
import { ChartBuilder, LayerBuilder } from "./marks/chart";
import type { LayerContext } from "./marks/chart";
// Direct from chartBuilder (not the `chart` barrel): the one-way dependency
// rule is createOperator/withGoFish → chartBuilder, never the reverse.
import { resolveMarkResult } from "./marks/chartBuilder";
import {
  CHANNEL_INFER,
  ChannelAnnotations,
  ChannelType,
  DeriveMarkProps,
  inferEntrySize,
} from "./channels";
import {
  withMarkKind,
  nameableMark,
  type TranslateModifierOptions,
  type MarkKind,
  type ZOrderValue,
} from "./marks/createOperator";
import { isValue } from "./data";
import { splitLiveChannels } from "../interaction/live";
import { KNOWN_ALIAS_KEYS } from "./dims";
import { Mark } from "./types";
import type { ConstraintSpec, ConstraintRef } from "./constraints";
import type { LabelAccessor, LabelOptions } from "./labels/labelPlacement";
import type { Token } from "./createName";
import type { MarkTransition } from "../animation/transition";
import { attachTerminals } from "./marks/terminals";

export interface RenderOptions {
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  transform?: { x?: number; y?: number };
  debug?: boolean;
  defs?: JSX.Element[];
  axes?: AxesOptions;
  colorConfig?: ColorConfig;
}

/**
 * A single child element: a GoFishAST node, a promise of one, a mark (function),
 * or a v3 builder (`chart(...).mark(...)`, with or without `.layer(...)` tiers).
 * Marks are resolved by calling them with `undefined` (no data) to produce a
 * node; builders are resolved through their own `resolve()`.
 */
type GoFishChild =
  | GoFishAST
  | Promise<GoFishAST>
  | Mark<any>
  | ChartBuilder<any, any>
  | LayerBuilder;

/**
 * Children input type that can be a recursive structure, a promise of it, or null.
 * Accepts marks (functions) alongside GoFishAST nodes.
 */
type GoFishChildrenInput =
  | ListOfRecursiveArraysOrValues<GoFishChild>
  | Promise<ListOfRecursiveArraysOrValues<GoFishChild>>
  | null;

/**
 * Children input type with thunks that can be a recursive structure, a promise of it, or null
 */
type GoFishChildrenInputWithThunks =
  | ListOfRecursiveArraysOrValues<
      GoFishChild | (() => GoFishAST | Promise<GoFishAST>)
    >
  | Promise<
      ListOfRecursiveArraysOrValues<
        GoFishChild | (() => GoFishAST | Promise<GoFishAST>)
      >
    >
  | null;

/** A Promise-like object that also carries GoFishNode's chainable methods, so
 *  `.render()` / `.name()` / … work on the promises withGoFish returns. */
export interface PromiseWithRender<T> extends Promise<T> {
  render(
    container: HTMLElement,
    options: RenderOptions
  ): HTMLElement | Promise<HTMLElement>;
  toSVG(options?: Parameters<GoFishNode["toSVG"]>[0]): Promise<string>;
  toSVGElement(
    options?: Parameters<GoFishNode["toSVGElement"]>[0]
  ): Promise<SVGSVGElement>;
  save(
    filename: string,
    options?: Parameters<GoFishNode["save"]>[1]
  ): Promise<void>;
  toDisplayList(
    options?: Parameters<GoFishNode["toDisplayList"]>[0]
  ): ReturnType<GoFishNode["toDisplayList"]>;
  name(name: string | Token): PromiseWithRender<T>;
  label(accessor: LabelAccessor, options?: LabelOptions): PromiseWithRender<T>;
  setKey(key: string): PromiseWithRender<T>;
  setShared(shared: [boolean, boolean]): PromiseWithRender<T>;
  constrain(
    fn: (refs: Record<string, ConstraintRef>) => ConstraintSpec[]
  ): PromiseWithRender<T>;
  zOrder(value: number): PromiseWithRender<T>;
  scope(): PromiseWithRender<T>;
}

/**
 * Type guard to check if a value has a render method like GoFishNode
 */
function hasRenderMethod(value: any): value is GoFishNode {
  return value instanceof GoFishNode && typeof value.render === "function";
}

/**
 * Reify one operator child into a node. A child is a thunk/mark, a v3 BUILDER
 * (a single-tier `chart(...).mark(...)` or a layered `....layer(...)`), a
 * thenable, or an already-built node; `resolveMarkResult` is the one place that
 * knows all four, so both child loops below go through here. A thunk is called
 * with just the datum slot (`undefined`), as it always has been, and whatever
 * it returns is reified in turn.
 *
 * `null`/`undefined` (a thunk that opted out) comes back as `undefined` and is
 * dropped by the caller.
 */
async function reifyChild(
  child: unknown,
  layerContext: LayerContext
): Promise<GoFishAST | undefined> {
  if (typeof child === "function") {
    const result = await (child as any)(undefined);
    if (result == null) return undefined;
    return resolveMarkResult(result, layerContext);
  }
  if (child == null) return undefined;
  return resolveMarkResult(child as any, layerContext);
}

/** The GoFishNode methods `addRenderMethod` republishes on a promise: each one
 *  applies to the resolved node and rewraps the result. */
const CHAINABLE_NODE_METHODS = [
  "name",
  "scope",
  "label",
  "setKey",
  "setShared",
  "constrain",
  "zOrder",
] as const;

/** Wrap a Promise so GoFishNode's chainable methods and the export terminals
 *  can be called on it directly. */
export function addRenderMethod<T>(promise: Promise<T>): PromiseWithRender<T> {
  // Export terminals (render / toSVG / toSVGElement / save / toDisplayList) come
  // from the shared registry, so adding one touches a single list. The promise
  // resolves to a node directly; a non-GoFishNode result is unexportable.
  // See terminals.ts.
  attachTerminals(promise, async () => {
    const result = await promise;
    if (result instanceof GoFishNode) return result;
    throw new Error(
      "Cannot call an export terminal on this result. Only GoFishNode instances support export."
    );
  });

  for (const method of CHAINABLE_NODE_METHODS) {
    (promise as any)[method] = (...args: any[]) =>
      addRenderMethod(
        promise.then((result) =>
          result instanceof GoFishNode
            ? ((result as any)[method](...args) as T)
            : result
        )
      );
  }

  return promise as PromiseWithRender<T>;
}

/**
 * Recursively flattens nested structures and awaits all promises, returning a flat array.
 * If the type includes functions (thunks), they are preserved (not called).
 * Always returns a flat array.
 * ChartBuilder instances are automatically resolved.
 */
async function flattenAndAwaitPromises<T>(
  value:
    | T
    | Promise<T>
    | ListOfRecursiveArraysOrValues<T | Promise<T>>
    | Promise<ListOfRecursiveArraysOrValues<T | Promise<T>>>
    | null
    | undefined
): Promise<T[]> {
  if (value === null || value === undefined) {
    return [];
  }

  if (value instanceof Promise) {
    const resolved = await value;
    return flattenAndAwaitPromises(resolved);
  }

  // A chart/layer builder falls through to the single-value case below, which
  // preserves it unresolved — resolution is the child loops' business.

  if (Array.isArray(value)) {
    const awaited = await Promise.all(
      value.map((item) => flattenAndAwaitPromises(item))
    );
    return _.flattenDeep(awaited) as T[];
  }

  return [value as T];
}

/**
 * Process children sequentially, calling thunks and awaiting promises one at a time
 * ChartBuilder instances are automatically resolved sequentially
 */
export async function reifyChildrenSequentially(
  children: (
    | GoFishAST
    | (() => GoFishAST | Promise<GoFishAST>)
    | ChartBuilder<any, any>
    | LayerBuilder
    | Mark<any>
  )[],
  layerContext?: LayerContext
): Promise<GoFishAST[]> {
  // A thunked promise must resolve before the next child is resolved.
  const resolved: GoFishAST[] = [];
  const sharedLayerContext = layerContext ?? {};

  for (const child of children) {
    const node = await reifyChild(child, sharedLayerContext);
    if (node != null) resolved.push(node);
  }

  return resolved;
}

/**
 * Parse a node operator's `(opts?, children?)` / `(children)` overload. Both
 * factories below share it, so the two call shapes are defined once.
 */
function parseOperatorArgs<T extends Record<string, any>, C>(
  args: any[],
  fnName: string
): { opts: T; children: C | undefined } {
  if (args.length > 2) {
    throw new Error(
      `${fnName}: Expected 0, 1, or 2 arguments, got ${args.length}`
    );
  }
  if (args.length === 2)
    return { opts: args[0] ?? ({} as T), children: args[1] };
  return { opts: {} as T, children: args.length === 1 ? args[0] : undefined };
}

/**
 * Turn a low-level `(opts, children) => node` function into an operator that
 * flattens deeply nested children, awaits promises anywhere in them, and lets
 * `opts` be omitted.
 */
export function createNodeOperator<T extends Record<string, any>, R>(
  func: (opts: T, children: GoFishAST[]) => R
): {
  (opts?: T, children?: GoFishChildrenInput): PromiseWithRender<Awaited<R>>;
  (children: GoFishChildrenInput): PromiseWithRender<Awaited<R>>;
} {
  return function (...args: any[]): PromiseWithRender<Awaited<R>> {
    const promise = (async () => {
      const { opts, children } = parseOperatorArgs<T, GoFishChildrenInput>(
        args,
        "createNodeOperator"
      );
      const flattened = await flattenAndAwaitPromises<
        | GoFishAST
        | Promise<GoFishAST>
        | ChartBuilder<any, any>
        | LayerBuilder
        | Mark<any>
      >(children);
      const layerContext: LayerContext = {};
      // Resolve marks (functions) and ChartBuilder instances; a mark is called
      // with undefined data to produce its node.
      const resolvedAll = await Promise.all(
        flattened.map((child) => reifyChild(child, layerContext))
      );
      const flatChildren = resolvedAll.filter(
        (child): child is GoFishAST =>
          child != null && !(child instanceof Promise)
      ) as GoFishAST[];
      return func(opts, flatChildren);
    })();
    return addRenderMethod(promise) as PromiseWithRender<Awaited<R>>;
  };
}

/**
 * Like {@link createNodeOperator}, but children may also be thunks, and they
 * are processed one at a time rather than in parallel — a child that reads a
 * name registered by an earlier sibling needs that order.
 */
export function createNodeOperatorSequential<T extends Record<string, any>, R>(
  func: (opts: T, children: GoFishAST[]) => R
): {
  (
    opts?: T,
    children?: GoFishChildrenInputWithThunks
  ): PromiseWithRender<Awaited<R>>;
  (children: GoFishChildrenInputWithThunks): PromiseWithRender<Awaited<R>>;
} {
  return function (...args: any[]): PromiseWithRender<Awaited<R>> {
    const promise = (async () => {
      const { opts, children } = parseOperatorArgs<
        T,
        GoFishChildrenInputWithThunks
      >(args, "createNodeOperatorSequential");
      // First phase: flatten and await, preserving thunks, marks, and
      // ChartBuilder instances for the sequential second phase.
      const flattenedWithThunks = await flattenAndAwaitPromises<
        | GoFishAST
        | (() => GoFishAST | Promise<GoFishAST>)
        | ChartBuilder<any, any>
        | LayerBuilder
        | Mark<any>
      >(children);
      const layerContext: LayerContext = {};
      const resolvedChildren = await reifyChildrenSequentially(
        flattenedWithThunks,
        layerContext
      );
      return func(opts, resolvedChildren);
    })();
    return addRenderMethod(promise) as PromiseWithRender<Awaited<R>>;
  };
}

/**
 * A mark with chainable .name and .label, plus a top-level .render() for
 * combinator-form callsites whose children carry their own data — typically
 * `For(...)` closures over pre-computed values, refs to other layers, or
 * already-resolved nodes. Calling `.render()` invokes the mark with
 * `undefined` data, so marks that read field accessors (e.g. `rect({h: "v"})`)
 * won't get any data — for those, wrap in a Chart instead:
 *   `chart(data).mark(spread({dir: "x"}, [...])).render(container, opts)`.
 */
export type NameableMark<T> = Mark<T> & {
  name(layerName: string | Token): NameableMark<T>;
  label(accessor: LabelAccessor, options?: LabelOptions): NameableMark<T>;
  zOrder(value: ZOrderValue<T>): NameableMark<T>;
  /** How the mark looks in each phase of an animation: `animation.grow()`,
   *  `animation.fadeIn()`, … (see `src/animation/`). */
  transition(spec: MarkTransition): NameableMark<T>;
  translate(opts: TranslateModifierOptions): NameableMark<T>;
  render(
    container: Parameters<GoFishNode["render"]>[0],
    options: Parameters<GoFishNode["render"]>[1]
  ): Promise<ReturnType<GoFishNode["render"]>>;
  toSVG(options?: Parameters<GoFishNode["toSVG"]>[0]): Promise<string>;
  toSVGElement(
    options?: Parameters<GoFishNode["toSVGElement"]>[0]
  ): Promise<SVGSVGElement>;
  save(
    filename: string,
    options?: Parameters<GoFishNode["save"]>[1]
  ): Promise<void>;
  toDisplayList(
    options?: Parameters<GoFishNode["toDisplayList"]>[0]
  ): ReturnType<GoFishNode["toDisplayList"]>;
};

/**
 * Mark-factory IR serialization config — passed as the optional third
 * argument to `createMark`. A string is shorthand for `{ type: <string> }`.
 *
 * The factory tags each produced mark with `__serialize: { type, opts }`
 * so the frontend-IR emitter (gofish-graphics/serialize/toJSON) can
 * reconstruct the mark on the wire.
 */
export type MarkSerializeConfig<P = any> =
  | string
  | {
      /** IR discriminator (lowercase to match the wire format), e.g. "rect". */
      type: string;
      /**
       * Optional shape function. Default: copy `markOpts` verbatim. Use to
       * strip non-serializable fields or rename keys.
       */
      shape?: (opts: P) => Record<string, unknown>;
    };

/**
 * Creates a high-level mark from a low-level shape function plus optional
 * channel annotations. Channel annotations describe how each prop encodes data:
 * - "size":  accepts `number | keyof T`, uses inferSize
 * - "pos":   accepts `number | keyof T`, uses inferPos
 * - "color": accepts `string | keyof T`, uses inferColor
 * - "raw":   accepts `V | keyof T`, uses inferRaw
 * - unannotated props pass through unchanged
 *
 * Omitting `channels` is just the empty-annotations special case: all props
 * pass through as-is, which is the right default for `(props) => Node`-style
 * components composed from existing marks.
 *
 * The output node is always made a scope root, so any `.name(token)`
 * registrations inside the shape function are hygienic — external paths like
 * `ref([token, "x", ...])` resolve into this mark's scope rather than leaking
 * to an outer ancestor.
 *
 * The returned mark supports `.name("layerName" | token)` so that when used
 * in a chart, each produced node is registered for `ref("layerName")` /
 * `selectAll("layerName")`.
 */
export function createMark<P extends Record<string, any>>(
  shapeFn: (props: P) => GoFishNode | PromiseLike<GoFishNode>
): (props: P) => NameableMark<P>;
export function createMark<P extends Record<string, any>>(
  shapeFn: (props: P) => GoFishNode | PromiseLike<GoFishNode>,
  channels: undefined,
  serialize: MarkSerializeConfig<P>
): (props: P) => NameableMark<P>;
export function createMark<
  ShapeProps extends Record<string, any>,
  C extends ChannelAnnotations<ShapeProps>,
>(
  shapeFn: (
    opts: ShapeProps,
    data?: any[]
  ) =>
    | GoFishNode
    | GoFishNode[]
    | PromiseLike<GoFishNode>
    | PromiseLike<GoFishNode[]>,
  channels: C,
  serialize?: MarkSerializeConfig,
  cfg?: { kind?: MarkKind }
): <T extends Record<string, any>>(
  opts: DeriveMarkProps<ShapeProps, C, T>
) => NameableMark<T | T[] | { item: T | T[]; key: number | string }>;
export function createMark(
  shapeFn: any,
  channels: Record<string, any> = {},
  serialize?: MarkSerializeConfig,
  cfg?: { kind?: MarkKind }
): any {
  const kind: MarkKind = cfg?.kind ?? "per-item";
  const serializeConfig: { type: string; shape?: (o: any) => any } | undefined =
    typeof serialize === "string" ? { type: serialize } : serialize;
  return (markOpts: Record<string, any>) =>
    buildCreatedMark(shapeFn, channels, serializeConfig, kind, markOpts);
}

function buildCreatedMark(
  shapeFn: any,
  channels: Record<string, any>,
  serializeConfig: { type: string; shape?: (o: any) => any } | undefined,
  kind: MarkKind,
  markOpts: Record<string, any>
): any {
  const baseMark: Mark<any> = async (
    input,
    keyParam?: string | number,
    _layerContext?: LayerContext
  ) => {
    // Unwrap input: handles T, T[], or { item, key } patterns
    let d: any, key: number | string | undefined;
    if (typeof input === "object" && input !== null && "item" in input) {
      d = (input as any).item;
      key = (input as any).key;
    } else {
      d = input;
      key = keyParam;
    }

    if (markOpts.debug) {
      console.log("mark", key, d);
    }

    const data = Array.isArray(d) ? d : [d];

    // Build shape props by encoding each channel. The plain string spec
    // ("size"/"pos"/"color"/"raw") aggregates over `data` and produces a
    // single value. The object form `{type, entry: true}` produces a
    // per-row array — used by expand-kind marks. Unannotated props (which
    // is everything when channels is omitted/empty) pass through.
    // `CHANNEL_INFER.raw` is async so a callable accessor may return a Promise
    // — the Python wrapper bridges `text(text=lambda d: ...)` that way.
    const shapeProps: Record<string, any> = {};
    // `live(...)` channels: the pipeline renders (and measures) the accessor's
    // resolve-time value; the paint layer re-evaluates it reactively per frame
    // via the datum-bound thunk baked at lower time. One split, shared with
    // every other mark factory — see `splitLiveChannels`.
    const { static: resolvedOpts, live: liveChannels } = splitLiveChannels(
      markOpts,
      d
    );
    for (const propName of Object.keys(resolvedOpts)) {
      if (propName === "debug") continue;
      const channelSpec = channels[propName];
      const markValue = resolvedOpts[propName];

      let channelType: ChannelType | undefined =
        typeof channelSpec === "string" ? channelSpec : channelSpec?.type;
      // Coordinate-space axis aliases aren't declared channels, but they carry
      // the same value semantics as the canonical dims they resolve to: a
      // `<name>Size` alias is a SIZE channel, a position alias (theta/r) a POS
      // channel. Infer that here so `rSize: "field"` aggregates like `h: "field"`
      // before the resolveAliases pass moves the value onto the dims.
      if (channelType === undefined && KNOWN_ALIAS_KEYS.has(propName)) {
        channelType = propName.endsWith("Size") ? "size" : "pos";
      }
      const isEntry =
        typeof channelSpec === "object" && channelSpec?.entry === true;

      if (isValue(markValue)) {
        // Already a Value wrapper (e.g. v(...)) — pass through directly
        shapeProps[propName] = markValue;
      } else if (isEntry && channelType === "size") {
        shapeProps[propName] = inferEntrySize(markValue, data);
      } else if (channelType !== undefined) {
        shapeProps[propName] = await CHANNEL_INFER[channelType](
          markValue,
          data
        );
      } else {
        shapeProps[propName] = markValue;
      }
    }

    // For expand-kind marks, hand the data array to shapeFn so it can
    // build N output nodes 1:1 with input rows. shapeFn may be async.
    const result = await shapeFn(
      shapeProps,
      kind === "expand" ? data : undefined
    );
    if (Array.isArray(result)) {
      // Expand path: stamp each slice with its own datum.
      for (let i = 0; i < result.length; i++) {
        const node = result[i];
        node.datum = data[i] ?? d;
        if (liveChannels) node.__gfLive = liveChannels;
      }
      return result as unknown as GoFishNode;
    }
    const node = result as GoFishNode;
    node.datum = d;
    if (liveChannels) node.__gfLive = liveChannels;
    node.scope();
    // Mark as a component for string-name search bounding. Distinct from
    // _isScope so future operators that scope (for token reasons) don't
    // silently break ref("name") lookups across them.
    node._isComponent = true;
    return node;
  };
  withMarkKind(baseMark, kind);

  // Tag with IR-serialization metadata for the frontend-IR emitter.
  if (serializeConfig) {
    const payload = serializeConfig.shape
      ? serializeConfig.shape(markOpts)
      : markOpts;
    (baseMark as any).__serialize = {
      type: serializeConfig.type,
      opts: payload,
    };
  }

  return nameableMark(baseMark);
}
