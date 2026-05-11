import { GoFishNode } from "../_node";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { type ColorConfig } from "../colorSchemes";
import { Mark, Operator } from "../types";
import { Frame } from "../graphicalOperators/frame";

/** Per-chart registry of named layers for select() lookup. */
export type LayerContext = {
  [name: string]: {
    data: any[];
    nodes: GoFishNode[];
  };
};

/**
 * Resolves whatever a Mark returns into a GoFishNode. Lives here (not in
 * createOperator.ts) so the dependency between the two files runs one-way:
 * createOperator imports from chartBuilder, never the other direction.
 */
export async function resolveMarkResult(
  raw: ReturnType<Mark<any>>,
  layerContext?: LayerContext
): Promise<GoFishNode> {
  if (raw instanceof ChartBuilder)
    return raw.withLayerContext(layerContext ?? {}).resolve();
  if (typeof raw === "function")
    return resolveMarkResult(
      (raw as () => ReturnType<Mark<any>>)(),
      layerContext
    );
  return raw as unknown as GoFishNode;
}

export type ChartOptions = {
  w?: number;
  h?: number;
  coord?: CoordinateTransform;
  color?: ColorConfig;
};

/**
 * Compare two dash-joined tree keys (e.g. `"0-1-2"`) by parsing each
 * segment as a number. Lexicographic sort would put `"0-10"` before
 * `"0-2"`; a numeric segment sort respects the tree position. Falls
 * back to string compare for any segment that isn't a clean integer.
 */
function compareTreeKey(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  const as = a.split("-");
  const bs = b.split("-");
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const ai = Number(as[i]);
    const bi = Number(bs[i]);
    if (Number.isFinite(ai) && Number.isFinite(bi)) {
      if (ai !== bi) return ai - bi;
    } else if (as[i] !== bs[i]) {
      return as[i] < bs[i] ? -1 : 1;
    }
  }
  return as.length - bs.length;
}

/** A lazy selector that defers layer lookup until actually needed. */
export class LayerSelector<T = any> {
  constructor(public readonly layerName: string) {}

  resolve(layerContext: LayerContext): Array<T & { __ref: GoFishNode }> {
    const layer = layerContext[this.layerName];

    if (!layer) {
      throw new Error(
        `Layer "${this.layerName}" not found. Make sure to call .name("${this.layerName}") on the mark first.`
      );
    }

    // `layer.nodes` is in the order the named marks resolved, which is
    // async-scheduling-dependent (e.g. when an upstream `derive` makes
    // an HTTP RPC the per-leaf latencies vary, so children of one parent
    // arrive interleaved). Sort by the tree-key the parent operator
    // stamped on each node so downstream readers always see a
    // deterministic, parent-iteration order.
    const resolvedNodes: GoFishNode[] = [...layer.nodes].sort((a, b) =>
      compareTreeKey(a.key, b.key)
    );

    // Return node-attached data enriched with refs to nodes.
    // Option 3: flatten arrays and duplicate __ref per underlying datum.
    const result = resolvedNodes.flatMap((node: GoFishNode) => {
      const datum: any = (node as any).datum;

      if (!Array.isArray(datum) && typeof datum !== "object") {
        throw new Error("datum must be an array or object");
      }
      const arr = Array.isArray(datum) ? datum : [datum];

      return arr.map((item: any) => ({
        ...(item as object),
        __ref: node,
      })) as Array<T & { __ref: GoFishNode }>;
    });
    return result;
  }
}

export class ChartBuilder<TInput, TOutput = TInput> {
  private readonly data: TInput;
  private readonly options?: ChartOptions;
  private readonly operators: Operator<any, any>[] = [];
  private readonly finalMark?: Mark<TOutput>;
  private readonly layerContext: LayerContext;
  private readonly nodeZOrder?: number;

  constructor(
    data: TInput,
    options?: ChartOptions,
    operators: Operator<any, any>[] = [],
    finalMark?: Mark<TOutput>,
    layerContext: LayerContext = {},
    nodeZOrder?: number
  ) {
    this.data = data;
    this.options = options;
    this.operators = operators;
    this.finalMark = finalMark;
    this.layerContext = layerContext;
    this.nodeZOrder = nodeZOrder;
  }

  // flow accumulates operators and returns a new builder for chaining
  flow<T1>(op1: Operator<TInput, T1>): ChartBuilder<TInput, T1>;
  flow<T1, T2>(
    op1: Operator<TInput, T1>,
    op2: Operator<T1, T2>
  ): ChartBuilder<TInput, T2>;
  flow<T1, T2, T3>(
    op1: Operator<TInput, T1>,
    op2: Operator<T1, T2>,
    op3: Operator<T2, T3>
  ): ChartBuilder<TInput, T3>;
  flow<T1, T2, T3, T4>(
    op1: Operator<TInput, T1>,
    op2: Operator<T1, T2>,
    op3: Operator<T2, T3>,
    op4: Operator<T3, T4>
  ): ChartBuilder<TInput, T4>;
  flow<T1, T2, T3, T4, T5>(
    op1: Operator<TInput, T1>,
    op2: Operator<T1, T2>,
    op3: Operator<T2, T3>,
    op4: Operator<T3, T4>,
    op5: Operator<T4, T5>
  ): ChartBuilder<TInput, T5>;
  flow<T1, T2, T3, T4, T5, T6>(
    op1: Operator<TInput, T1>,
    op2: Operator<T1, T2>,
    op3: Operator<T2, T3>,
    op4: Operator<T3, T4>,
    op5: Operator<T4, T5>,
    op6: Operator<T5, T6>
  ): ChartBuilder<TInput, T6>;
  flow<T1, T2, T3, T4, T5, T6, T7>(
    op1: Operator<TInput, T1>,
    op2: Operator<T1, T2>,
    op3: Operator<T2, T3>,
    op4: Operator<T3, T4>,
    op5: Operator<T4, T5>,
    op6: Operator<T5, T6>,
    op7: Operator<T6, T7>
  ): ChartBuilder<TInput, T7>;
  flow(...ops: Operator<any, any>[]): ChartBuilder<TInput, any> {
    return new ChartBuilder(
      this.data,
      this.options,
      [...this.operators, ...ops],
      this.finalMark,
      this.layerContext,
      this.nodeZOrder
    );
  }

  // mark stores the mark and returns a new builder for chaining
  mark(mark: Mark<TOutput>): ChartBuilder<TInput, TOutput> {
    return new ChartBuilder(
      this.data,
      this.options,
      this.operators,
      mark,
      this.layerContext,
      this.nodeZOrder
    );
  }

  // resolve creates the node; named marks register their nodes into layerContext when invoked
  async resolve(): Promise<GoFishNode> {
    if (!this.finalMark) {
      throw new Error("Cannot resolve: no mark specified. Call .mark() first.");
    }

    // Apply all operators to the mark
    let composedMark = this.finalMark as Mark<any>;
    for (const op of this.operators.toReversed()) {
      composedMark = await op(composedMark);
    }

    // Resolve LayerSelector just before calling mark
    let data = this.data;
    if (data instanceof LayerSelector) {
      data = data.resolve(this.layerContext) as any;
    }

    // Create the node; pass layerContext so named marks can register each produced node
    const node = await Frame(this.options ?? {}, [
      (
        await resolveMarkResult(
          composedMark(data as any, undefined, this.layerContext),
          this.layerContext
        )
      ).setShared([true, true]),
    ]);

    // Embed colorConfig on the node so it survives .resolve() inside Layer
    if (this.options?.color) {
      (node as any).colorConfig = this.options.color;
    }

    if (this.nodeZOrder !== undefined) {
      node.zOrder(this.nodeZOrder);
    }

    return node;
  }

  withLayerContext(layerContext: LayerContext): ChartBuilder<TInput, TOutput> {
    return new ChartBuilder(
      this.data,
      this.options,
      this.operators,
      this.finalMark,
      layerContext,
      this.nodeZOrder
    );
  }

  zOrder(value: number): ChartBuilder<TInput, TOutput> {
    return new ChartBuilder(
      this.data,
      this.options,
      this.operators,
      this.finalMark,
      this.layerContext,
      value
    );
  }

  // render calls resolve and then renders
  async render(
    container: Parameters<GoFishNode["render"]>[0],
    options: Parameters<GoFishNode["render"]>[1]
  ): Promise<ReturnType<GoFishNode["render"]>> {
    // Auto-infer axis titles from field encodings on the mark and operators.
    // Mark fields take priority (they encode measured values, e.g. h: "count");
    // operator fields fill remaining gaps (grouping/layout, e.g. spread by "lake").
    const axisFields: { x?: string; y?: string } = {};
    const markMeta = (this.finalMark as any)?.__axisFields as
      | { x?: string; y?: string }
      | undefined;
    if (markMeta?.x) axisFields.x ??= markMeta.x;
    if (markMeta?.y) axisFields.y ??= markMeta.y;
    for (const op of this.operators) {
      const meta = (op as any).__axisFields as
        | { x?: string; y?: string }
        | undefined;
      if (meta?.x) axisFields.x ??= meta.x;
      if (meta?.y) axisFields.y ??= meta.y;
    }

    const node = await this.resolve();
    return node.render(container, {
      ...options,
      colorConfig: this.options?.color,
      axisFields,
    });
  }
}

export function chart<T>(data: T, options?: ChartOptions): ChartBuilder<T, T> {
  return new ChartBuilder<T, T>(data, options, [], undefined, {});
}
