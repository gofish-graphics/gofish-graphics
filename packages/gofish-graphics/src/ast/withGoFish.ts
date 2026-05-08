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
  inferEntrySize,
} from "./channels";
import { withMarkKind, type MarkKind } from "./marks/createOperator";
import { isValue } from "./data";
import { Mark } from "./types";
import type { ConstraintSpec, ConstraintRef } from "./constraints";
import type { LabelAccessor, LabelOptions } from "./labels/labelPlacement";

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
  name(name: string): PromiseWithRender<T>;
  label(accessor: LabelAccessor, options?: LabelOptions): PromiseWithRender<T>;
  setKey(key: string): PromiseWithRender<T>;
  setShared(shared: [boolean, boolean]): PromiseWithRender<T>;
  constrain(
    fn: (refs: Record<string, ConstraintRef>) => ConstraintSpec[]
  ): PromiseWithRender<T>;
  zOrder(value: number): PromiseWithRender<T>;
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
  (promise as any).name = function (name: string): PromiseWithRender<T> {
    return addRenderMethod(
      promise.then((result) => {
        if (result instanceof GoFishNode) {
          return result.name(name) as T;
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
  (opts?: T, children?: GoFishChildrenInput): PromiseWithRender<R>;
  (children: GoFishChildrenInput): PromiseWithRender<R>;
} {
  return function (...args: any[]): PromiseWithRender<R> {
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
    return addRenderMethod(promise);
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
  (opts?: T, children?: GoFishChildrenInputWithThunks): PromiseWithRender<R>;
  (children: GoFishChildrenInputWithThunks): PromiseWithRender<R>;
} {
  return function (...args: any[]): PromiseWithRender<R> {
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
    return addRenderMethod(promise);
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
  name(layerName: string): NameableMark<T>;
  label(accessor: LabelAccessor, options?: LabelOptions): NameableMark<T>;
  render(
    container: Parameters<GoFishNode["render"]>[0],
    options: Parameters<GoFishNode["render"]>[1]
  ): Promise<ReturnType<GoFishNode["render"]>>;
};

/**
 * Creates a high-level mark function from a low-level shape function
 * and channel annotations.
 *
 * Channel annotations describe how each prop encodes data:
 * - "size": mark accepts `number | keyof T`, uses inferSize to convert
 * - "color": mark accepts `string | keyof T`, uses inferColor to convert
 * - unannotated props are passed through unchanged
 *
 * The returned mark supports .name("layerName") so that when used in a chart,
 * each produced node is registered for select("layerName").
 */
export function createMark<
  ShapeProps extends Record<string, any>,
  C extends ChannelAnnotations<ShapeProps>,
>(
  shapeFn: (
    opts: ShapeProps,
    data?: any[]
  ) => GoFishNode | GoFishNode[] | Promise<GoFishNode> | Promise<GoFishNode[]>,
  channels: C,
  cfg?: { kind?: MarkKind }
): <T extends Record<string, any>>(
  opts: DeriveMarkProps<ShapeProps, C, T>
) => NameableMark<T | T[] | { item: T | T[]; key: number | string }> {
  const kind: MarkKind = cfg?.kind ?? "per-item";
  return <T extends Record<string, any>>(
    markOpts: DeriveMarkProps<ShapeProps, C, T>
  ): NameableMark<T | T[] | { item: T | T[]; key: number | string }> => {
    const baseMark: Mark<
      T | T[] | { item: T | T[]; key: number | string }
    > = async (
      input: T | T[] | { item: T | T[]; key: number | string },
      keyParam?: string | number,
      layerContext?: LayerContext
    ) => {
      // Unwrap input: handles T, T[], or { item, key } patterns
      let d: T | T[], key: number | string | undefined;
      if (typeof input === "object" && input !== null && "item" in input) {
        d = (input as { item: T | T[]; key: number | string }).item;
        key = (input as { item: T | T[]; key: number | string }).key;
      } else {
        d = input as T | T[];
        key = keyParam;
      }

      if ((markOpts as any).debug) {
        console.log("mark", key, d);
      }

      const data = Array.isArray(d) ? d : [d];

      // Build shape props by encoding each channel. The plain string spec
      // ("size"/"pos"/"color"/"raw") aggregates over `data` and produces a
      // single value. The object form `{type, entry: true}` produces a
      // per-row array — used by expand-kind marks.
      const shapeProps: Record<string, any> = {};
      for (const propName of Object.keys(markOpts as any)) {
        if (propName === "debug") continue;
        const channelSpec = channels[propName as keyof C];
        const markValue = (markOpts as any)[propName];

        const channelType =
          typeof channelSpec === "string" ? channelSpec : channelSpec?.type;
        const isEntry =
          typeof channelSpec === "object" && channelSpec?.entry === true;

        if (isValue(markValue)) {
          // Already a Value wrapper (e.g. v(...)) — pass through directly
          shapeProps[propName] = markValue;
        } else if (isEntry && channelType === "size") {
          shapeProps[propName] = inferEntrySize(markValue, data);
        } else if (channelType === "size") {
          shapeProps[propName] = inferSize(markValue, data);
        } else if (channelType === "pos") {
          shapeProps[propName] = inferPos(markValue, data);
        } else if (channelType === "color") {
          shapeProps[propName] = inferColor(markValue, data);
        } else if (channelType === "raw") {
          shapeProps[propName] = inferRaw(markValue, data);
        } else {
          shapeProps[propName] = markValue;
        }
      }

      // For expand-kind marks, hand the data array to shapeFn so it can
      // build N output nodes 1:1 with input rows. shapeFn may be async.
      const result = await shapeFn(
        shapeProps as ShapeProps,
        kind === "expand" ? data : undefined
      );
      if (Array.isArray(result)) {
        // Expand path: stamp each slice with its own datum.
        for (let i = 0; i < result.length; i++) {
          const node = result[i];
          node.name(key?.toString() ?? "");
          (node as any).datum = data[i] ?? d;
        }
        return result as unknown as GoFishNode;
      }
      const node = result as GoFishNode;
      node.name(key?.toString() ?? "");
      (node as any).datum = d;
      return node;
    };
    withMarkKind(baseMark, kind);

    // Infer axis field names from string-valued size/pos channels
    const axisFields: { x?: string; y?: string } = {};
    const o = markOpts as any;
    if (typeof o.w === "string") axisFields.x = o.w;
    else if (typeof o.x === "string") axisFields.x = o.x;
    if (typeof o.h === "string") axisFields.y = o.h;
    else if (typeof o.y === "string") axisFields.y = o.y;
    if (axisFields.x || axisFields.y) {
      (baseMark as any).__axisFields = axisFields;
    }

    const nameMethod = (
      layerName: string
    ): Mark<T | T[] | { item: T | T[]; key: number | string }> => {
      const wrapped: Mark<
        T | T[] | { item: T | T[]; key: number | string }
      > = async (
        input: T | T[] | { item: T | T[]; key: number | string },
        keyParam?: string | number,
        layerContext?: LayerContext
      ) => {
        const result = await baseMark(input, keyParam, layerContext);
        // Expand-kind marks return arrays — name + register every slice.
        if (Array.isArray(result)) {
          for (const node of result as unknown as GoFishNode[]) {
            (node as GoFishNode).name(layerName);
            if (layerContext && layerName) {
              if (!layerContext[layerName]) {
                layerContext[layerName] = { data: [], nodes: [] };
              }
              layerContext[layerName].nodes.push(node);
              layerContext[layerName].data.push((node as any).datum);
            }
          }
          return result as unknown as GoFishNode;
        }
        const node = result as GoFishNode;
        node.name(layerName);
        if (layerContext && layerName) {
          if (!layerContext[layerName]) {
            layerContext[layerName] = { data: [], nodes: [] };
          }
          layerContext[layerName].nodes.push(node);
          layerContext[layerName].data.push((node as any).datum);
        }
        return node;
      };
      withMarkKind(wrapped, kind);
      return wrapped;
    };
    const nameMethodWithFields = (layerName: string) => {
      const fn = nameMethod(layerName);
      if ((baseMark as any).__axisFields) {
        (fn as any).__axisFields = (baseMark as any).__axisFields;
      }
      return fn;
    };
    const labelMethod = (
      accessor: LabelAccessor,
      options?: LabelOptions
    ): Mark<T | T[] | { item: T | T[]; key: number | string }> => {
      const wrapped: Mark<
        T | T[] | { item: T | T[]; key: number | string }
      > = async (
        input: T | T[] | { item: T | T[]; key: number | string },
        keyParam?: string | number,
        layerContext?: LayerContext
      ) => {
        const result = await baseMark(input, keyParam, layerContext);
        if (Array.isArray(result)) {
          for (const node of result as unknown as GoFishNode[]) {
            (node as GoFishNode).label(accessor, options);
          }
          return result as unknown as GoFishNode;
        }
        const node = result as GoFishNode;
        node.label(accessor, options);
        return node;
      };
      withMarkKind(wrapped, kind);
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

    return baseMark as NameableMark<
      T | T[] | { item: T | T[]; key: number | string }
    >;
  };
}
