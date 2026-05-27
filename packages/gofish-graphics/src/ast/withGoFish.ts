// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

/* 
1. Supports direct and data style.

2. Supports `v` syntax. (TODO)

*/

import type { JSX } from "solid-js";
import { GoFishAST } from "./_ast";
import { GoFishNode } from "./_node";
import type { AxesOptions } from "./gofish";
import type { ColorConfig } from "./colorSchemes";
import _, { ListOfRecursiveArraysOrValues } from "lodash";
import { ChartBuilder } from "./marks/chart";
import type { LayerContext } from "./marks/chart";
import {
  ChannelAnnotations,
  DeriveMarkProps,
  inferSize,
  inferPos,
  inferColor,
  inferRaw,
} from "./channels";
import { isValue } from "./data";
import { Mark } from "./types";
import type { ConstraintSpec, ConstraintRef } from "./constraints";
import type { LabelAccessor, LabelOptions } from "./labels/labelPlacement";
import type { Token } from "./createName";

/**
 * Options for rendering a GoFish node
 */
export interface RenderOptions {
  w: number;
  h: number;
  x?: number;
  y?: number;
  transform?: { x?: number; y?: number };
  debug?: boolean;
  defs?: JSX.Element[];
  axes?: AxesOptions;
  colorConfig?: ColorConfig;
}

/**
 * A single child element: a GoFishAST node, a promise of one, or a mark (function).
 * Marks are resolved by calling them with `undefined` (no data) to produce a node.
 */
type GoFishChild = GoFishAST | Promise<GoFishAST> | Mark<any>;

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

/**
 * A Promise-like object that also has chainable methods from GoFishNode.
 * This allows calling .render(), .name(), .setKey(), .setShared() on promises returned by withGoFish.
 */
export interface PromiseWithRender<T> extends Promise<T> {
  render(
    container: HTMLElement,
    options: RenderOptions
  ): HTMLElement | Promise<HTMLElement>;
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
 * Type guard to check if value is a ChartBuilder
 */
function isChartBuilder(value: any): value is ChartBuilder<any, any> {
  return value instanceof ChartBuilder;
}

/**
 * Wraps a Promise to add chainable methods that proxy to GoFishNode.
 * This allows calling .render(), .name(), .setKey(), .setShared() on promises.
 */
export function addRenderMethod<T>(promise: Promise<T>): PromiseWithRender<T> {
  // Add the render method directly to the promise object
  // In JavaScript, you can add properties to any object, including Promises
  (promise as any).render = function (
    container: HTMLElement,
    options: RenderOptions
  ): HTMLElement | Promise<HTMLElement> {
    return promise.then((result) => {
      // Check if the result has a render method (like GoFishNode)
      if (hasRenderMethod(result)) {
        return result.render(container, options);
      }
      throw new Error(
        "Cannot call render on this result. Only GoFishNode instances have a render method."
      );
    });
  };

  // Add chainable methods that return new PromiseWithRender
  (promise as any).name = function (
    name: string | Token
  ): PromiseWithRender<T> {
    return addRenderMethod(
      promise.then((result) => {
        if (result instanceof GoFishNode) {
          return result.name(name) as T;
        }
        return result;
      })
    );
  };

  (promise as any).scope = function (): PromiseWithRender<T> {
    return addRenderMethod(
      promise.then((result) => {
        if (result instanceof GoFishNode) {
          return result.scope() as T;
        }
        return result;
      })
    );
  };

  (promise as any).label = function (
    accessor: LabelAccessor,
    options?: LabelOptions
  ): PromiseWithRender<T> {
    return addRenderMethod(
      promise.then((result) => {
        if (result instanceof GoFishNode) {
          return result.label(accessor, options) as T;
        }
        return result;
      })
    );
  };

  (promise as any).setKey = function (key: string): PromiseWithRender<T> {
    return addRenderMethod(
      promise.then((result) => {
        if (result instanceof GoFishNode) {
          return result.setKey(key) as T;
        }
        return result;
      })
    );
  };

  (promise as any).setShared = function (
    shared: [boolean, boolean]
  ): PromiseWithRender<T> {
    return addRenderMethod(
      promise.then((result) => {
        if (result instanceof GoFishNode) {
          return result.setShared(shared) as T;
        }
        return result;
      })
    );
  };

  (promise as any).constrain = function (
    fn: (refs: Record<string, ConstraintRef>) => ConstraintSpec[]
  ): PromiseWithRender<T> {
    return addRenderMethod(
      promise.then((result) => {
        if (result instanceof GoFishNode) {
          return result.constrain(fn) as T;
        }
        return result;
      })
    );
  };

  (promise as any).zOrder = function (value: number): PromiseWithRender<T> {
    return addRenderMethod(
      promise.then((result) => {
        if (result instanceof GoFishNode) {
          return result.zOrder(value) as T;
        }
        return result;
      })
    );
  };

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

  // If it's a promise, await it first
  if (value instanceof Promise) {
    const resolved = await value;
    return flattenAndAwaitPromises(resolved);
  }

  // If it's a ChartBuilder, preserve it (don't resolve here)
  // ChartBuilder instances should be resolved sequentially in reifyChildrenSequentially
  // For non-sequential contexts, they'll be resolved when processed
  if (isChartBuilder(value)) {
    return [value as T];
  }

  // If it's an array, recursively await all elements
  if (Array.isArray(value)) {
    const awaited = await Promise.all(
      value.map((item) => flattenAndAwaitPromises(item))
    );
    return _.flattenDeep(awaited) as T[];
  }

  // Otherwise, return as single-element array
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
    | Mark<any>
  )[],
  layerContext?: LayerContext
): Promise<GoFishAST[]> {
  // if the child is a thunked promise, it must be resolved before the next child is resolved
  const resolved: GoFishAST[] = [];
  const sharedLayerContext = layerContext ?? {};

  for (const child of children) {
    if (typeof child === "function") {
      // It's a thunk or mark — call it (marks receive undefined as data)
      const result = (child as any)(undefined);
      const resolvedChild = result instanceof Promise ? await result : result;
      if (resolvedChild != null) {
        // If it's a ChartBuilder, resolve it
        if (isChartBuilder(resolvedChild)) {
          const node = await resolvedChild
            .withLayerContext(sharedLayerContext)
            .resolve();
          resolved.push(node);
        } else {
          resolved.push(resolvedChild);
        }
      }
    } else if (isChartBuilder(child)) {
      // If it's a ChartBuilder, resolve it sequentially
      const node = await child.withLayerContext(sharedLayerContext).resolve();
      resolved.push(node);
    } else {
      // It's already a GoFishAST, add it directly
      resolved.push(child);
    }
  }

  return resolved;
}

/* 
- Flattens deeply nested children
- Allows opts to be optional
- Supports arrays where individual elements can be promises
*/
export function createNodeOperator<T extends Record<string, any>, R>(
  func: (opts: T, children: GoFishAST[]) => R
): {
  (opts?: T, children?: GoFishChildrenInput): PromiseWithRender<Awaited<R>>;
  (children: GoFishChildrenInput): PromiseWithRender<Awaited<R>>;
} {
  return function (...args: any[]): PromiseWithRender<Awaited<R>> {
    const promise = (async () => {
      let opts: T;
      let children: GoFishChildrenInput | undefined;
      if (args.length === 2) {
        opts = args[0] ?? ({} as T);
        children = args[1];
      } else if (args.length === 1) {
        opts = {} as T;
        children = args[0];
      } else if (args.length === 0) {
        opts = {} as T;
        children = undefined;
      } else {
        throw new Error(
          `createNodeOperator: Expected 0, 1, or 2 arguments, got ${args.length}`
        );
      }
      // Flatten nested structures and await all promises
      const flattened = await flattenAndAwaitPromises<
        GoFishAST | Promise<GoFishAST> | ChartBuilder<any, any> | Mark<any>
      >(children);
      const layerContext: LayerContext = {};
      // Resolve marks (functions), ChartBuilder instances, and filter out promises
      const resolvedAll = await Promise.all(
        flattened.map(async (child) => {
          if (typeof child === "function") {
            // It's a mark — call with undefined to produce a GoFishNode
            return await (child as Mark<any>)(undefined as any);
          }
          if (isChartBuilder(child)) {
            return await child.withLayerContext(layerContext).resolve();
          }
          return child;
        })
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
 * Sequential version of withGoFish that supports thunks (functions) in children.
 * Processes thunks sequentially (one at a time) rather than in parallel.
 *
 * - Flattens deeply nested children
 * - Allows opts to be optional
 * - Supports arrays where individual elements can be promises or thunks
 * - Processes thunks sequentially to ensure proper execution order
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
      let opts: T;
      let children: GoFishChildrenInputWithThunks | undefined;
      if (args.length === 2) {
        opts = args[0] ?? ({} as T);
        children = args[1];
      } else if (args.length === 1) {
        opts = {} as T;
        children = args[0];
      } else if (args.length === 0) {
        opts = {} as T;
        children = undefined;
      } else {
        throw new Error(
          `createNodeOperatorSequential: Expected 0, 1, or 2 arguments, got ${args.length}`
        );
      }
      // First phase: flatten nested structures and await promises, preserving thunks, marks, and ChartBuilder instances
      const flattenedWithThunks = await flattenAndAwaitPromises<
        | GoFishAST
        | (() => GoFishAST | Promise<GoFishAST>)
        | ChartBuilder<any, any>
        | Mark<any>
      >(children);
      const layerContext: LayerContext = {};
      // Second phase: process thunks and ChartBuilder instances sequentially
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
  render(
    container: Parameters<GoFishNode["render"]>[0],
    options: Parameters<GoFishNode["render"]>[1]
  ): Promise<ReturnType<GoFishNode["render"]>>;
};

/**
 * Attach .name / .label / .render chainable methods to a bare Mark, producing
 * a NameableMark. Each chained call returns a new mark that, when invoked,
 * applies the chained mutation (name/label) to the node produced by baseMark.
 */
function attachNameableMethods<T>(baseMark: Mark<T>): NameableMark<T> {
  const nameMethod = (layerName: string | Token): Mark<T> => {
    const wrapped: Mark<T> = async (input, keyParam, layerContext) => {
      const node = (await baseMark(input, keyParam, layerContext)) as GoFishAST;
      (node as GoFishNode).name(layerName);
      // layerContext is keyed by string name (v3 chart-layer selection);
      // tokens are hygienic handles and do not participate in that registry.
      // Tag here; the actual push into `layerContext[layerName]` happens in
      // ChartBuilder.resolve's post-resolve tree walk (chartBuilder.ts:
      // collectLayerRegistrations) so the order matches parent-iteration
      // order rather than which leg's async chain happened to finish first.
      if (layerContext && typeof layerName === "string" && layerName) {
        (node as { __layerRegistration?: string }).__layerRegistration =
          layerName;
      }
      return node;
    };
    return wrapped;
  };
  const nameMethodWithFields = (layerName: string | Token): Mark<T> => {
    const fn = nameMethod(layerName);
    if ((baseMark as any).__axisFields) {
      (fn as any).__axisFields = (baseMark as any).__axisFields;
    }
    return fn;
  };
  const labelMethod = (
    accessor: LabelAccessor,
    options?: LabelOptions
  ): Mark<T> => {
    const wrapped: Mark<T> = async (input, keyParam, layerContext) => {
      const node = (await baseMark(input, keyParam, layerContext)) as GoFishAST;
      (node as GoFishNode).label(accessor, options);
      return node;
    };
    return wrapped;
  };
  const renderMethod = async (
    container: Parameters<GoFishNode["render"]>[0],
    options: Parameters<GoFishNode["render"]>[1]
  ) => {
    const node = (await baseMark(undefined as any)) as GoFishNode;
    return node.render(container, options);
  };
  Object.defineProperty(baseMark, "name", {
    value: nameMethodWithFields,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(baseMark, "label", {
    value: labelMethod,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(baseMark, "render", {
    value: renderMethod,
    writable: true,
    configurable: true,
  });
  return baseMark as NameableMark<T>;
}

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
 * in a chart, each produced node is registered for `select("layerName")`.
 */
export function createMark<P extends Record<string, any>>(
  shapeFn: (props: P) => GoFishNode | PromiseLike<GoFishNode>
): (props: P) => NameableMark<P>;
export function createMark<
  ShapeProps extends Record<string, any>,
  C extends ChannelAnnotations<ShapeProps>,
>(
  shapeFn: (opts: ShapeProps) => GoFishNode | PromiseLike<GoFishNode>,
  channels: C
): <T extends Record<string, any>>(
  opts: DeriveMarkProps<ShapeProps, C, T>
) => NameableMark<T | T[] | { item: T | T[]; key: number | string }>;
export function createMark(
  shapeFn: any,
  channels: Record<string, any> = {}
): any {
  return (markOpts: Record<string, any>) => {
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

      // Build shape props by encoding each channel. Unannotated props (which
      // is everything when channels is omitted/empty) pass through.
      const shapeProps: Record<string, any> = {};
      for (const propName of Object.keys(markOpts)) {
        if (propName === "debug") continue;
        const channelType = channels[propName];
        const markValue = markOpts[propName];

        if (isValue(markValue)) {
          // Already a Value wrapper (e.g. v(...)) — pass through directly
          shapeProps[propName] = markValue;
        } else if (channelType === "size") {
          shapeProps[propName] = inferSize(markValue, data);
        } else if (channelType === "pos") {
          shapeProps[propName] = inferPos(markValue, data);
        } else if (channelType === "color") {
          shapeProps[propName] = inferColor(markValue, data);
        } else if (channelType === "raw") {
          // `inferRaw` is async so that callable accessors may return a
          // Promise — used by the Python wrapper to bridge `text(text=
          // lambda d: ...)` through the derive-server RPC.
          shapeProps[propName] = await inferRaw(markValue, data);
        } else {
          shapeProps[propName] = markValue;
        }
      }

      const result = shapeFn(shapeProps);
      const node: GoFishNode =
        result instanceof GoFishNode ? result : await result;
      node.name(key?.toString() ?? "");
      (node as any).datum = d;
      node.scope();
      // Mark as a component for string-name search bounding. Distinct from
      // _isScope so future operators that scope (for token reasons) don't
      // silently break ref("name") lookups across them.
      node._isComponent = true;
      return node;
    };

    // Infer axis field names from string-valued size/pos channels
    const axisFields: { x?: string; y?: string } = {};
    if (typeof markOpts.w === "string") axisFields.x = markOpts.w;
    else if (typeof markOpts.x === "string") axisFields.x = markOpts.x;
    if (typeof markOpts.h === "string") axisFields.y = markOpts.h;
    else if (typeof markOpts.y === "string") axisFields.y = markOpts.y;
    if (axisFields.x || axisFields.y) {
      (baseMark as any).__axisFields = axisFields;
    }

    return attachNameableMethods(baseMark);
  };
}
