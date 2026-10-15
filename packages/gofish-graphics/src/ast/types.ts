import { ChartBuilder } from "../lib";
import type { LayerBuilder } from "./marks/chartBuilder";
import { GoFishAST } from "./_ast";
import { GoFishNode } from "./_node";

/** Optional third argument: when provided by ChartBuilder.resolve(), named marks register each produced node/datum here. */
export type Mark<T> = (
  d: T,
  key?: string | number,
  layerContext?: { [name: string]: { data: any[]; nodes: GoFishNode[] } }
) =>
  | GoFishAST
  | Promise<GoFishAST>
  | (() => GoFishAST | Promise<GoFishAST>)
  | ChartBuilder<any, any>;

/**
 * One child of a combinator (`spread(opts, [...])`, `layer([...])`,
 * `intersect([a, b])`, ...) or the body a `createMark` component returns: a
 * mark, or anything a mark can produce (a built node such as `ref(...)`, a
 * promise of one, a chart or layer builder). Every such child is reified by
 * the one `resolveMarkResult` path.
 */
export type MarkChild =
  | Mark<any>
  | ReturnType<Mark<any>>
  | PromiseLike<GoFishAST>
  | LayerBuilder;

export type Operator<T, U> = (_: Mark<U>) => Promise<Mark<T>>;
