import { GoFishNode } from "../_node";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { type ColorConfig } from "../colorSchemes";
import type { AxesOptions } from "../gofish";
import { Mark, Operator } from "../types";
import { Frame } from "../graphicalOperators/frame";
import { layer as Layer } from "../graphicalOperators/layer";
import { GoFishRef, visibleNodes } from "../_ref";
import { ref } from "../shapes/ref";

/** Per-chart registry of named layers for ref()/selectAll() lookup. */
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
  // Mark functions are typed as sync-returning, but async marks are a
  // valid pattern (e.g. the Python wrapper's mark-as-function bridges via
  // RPC and returns `Promise<ChartBuilder>`). Await any thenable upfront
  // so the instanceof/typeof checks below see the resolved value.
  if (raw && typeof (raw as any).then === "function") {
    raw = await (raw as unknown as Promise<ReturnType<Mark<any>>>);
  }
  if (raw instanceof ChartBuilder)
    return raw.withLayerContext(layerContext ?? {}).resolve();
  if (typeof raw === "function")
    return resolveMarkResult(
      // Pass layerContext through so mark wrappers (e.g. .name(...)) that
      // need to register into the layer context still see it when invoked
      // here. Their `d`/`key` args remain undefined since this resolution
      // path is for thunked / curried marks that don't take a datum.
      (raw as Mark<any>)(undefined as any, undefined, layerContext),
      layerContext
    );
  return raw as unknown as GoFishNode;
}

export type ChartOptions = {
  w?: number;
  h?: number;
  coord?: CoordinateTransform;
  color?: ColorConfig;
  /**
   * Whether to render axes for this chart.
   * - `true`  — auto-infer axes from underlying space (default inference rules apply).
   * - `false` — suppress all axis rendering for this chart.
   * - `{ x?, y? }` — control x and y independently.
   *
   * Manual `axis: true/false` overrides on individual operators within the chart
   * are still respected when `axes: true`.
   */
  axes?: AxesOptions;
  /** Extra padding (px) between the polar circle and the SVG edge. Default 30. */
  padding?: number;
};

/**
 * Walk the finished node tree in DFS order and push each node that the
 * `.name(...)` wrapper tagged with `__layerRegistration` into the
 * matching layerContext entry.
 *
 * Done as a post-resolve pass — rather than pushing inline inside the
 * named wrapper — so the entries appear in parent-iteration order, not
 * async-completion order. Each parent operator builds its `children`
 * array via `Promise.all(...)` whose return preserves input order, so a
 * DFS over the resulting tree is the same canonical order we'd get from
 * sequential rendering, without paying for serialized awaits.
 *
 * Layer names follow the same component-boundary hygiene as ref/selectAll:
 * names registered *inside* a `createMark` component (a child with
 * `_isComponent === true`) are internal to that component and not selectable
 * from outside. Both this registry and `findInComponent` ride the single
 * bounded walk `visibleNodes` in _ref.tsx, so a name is registerable here
 * exactly when it's findable by ref — the walk does not descend into a
 * component child's subtree, but the component child's OWN
 * `__layerRegistration` is still registered (a leaf component, e.g. a `rect`
 * produced by createMark, can itself carry a name).
 */
function registerLayerNode(node: GoFishNode, layerContext: LayerContext): void {
  const layerName = (node as { __layerRegistration?: string })
    .__layerRegistration;
  if (layerName) {
    if (!layerContext[layerName]) {
      layerContext[layerName] = { data: [], nodes: [] };
    }
    layerContext[layerName].nodes.push(node);
    layerContext[layerName].data.push((node as { datum?: unknown }).datum);
    // One-shot — repeat resolves (e.g. embedded Layer renders) would
    // otherwise re-push the same node.
    (node as { __layerRegistration?: string }).__layerRegistration = undefined;
  }
}

function collectLayerRegistrations(
  node: GoFishNode,
  layerContext: LayerContext
): void {
  for (const n of visibleNodes(node)) {
    registerLayerNode(n, layerContext);
  }
}

/**
 * Resolve a `GoFishRef` used as chart data against the layer registry, the
 * node-unit way: NO flattening of array data, NO datum spreading, NO `__ref`
 * on plain objects.
 *
 * - A non-string selection (token / path-array / node-backed ref) is a direct
 *   reference: it passes through unchanged as a single ref (and `selectAll`
 *   over one is an error — it requires a string layer name).
 * - A string selection looks up the named layer. `multiplicity === "all"`
 *   (from `selectAll`) yields the full `GoFishRef[]`; the singular form yields
 *   the one matching `GoFishRef`, throwing if the layer matched zero or more
 *   than one node.
 */
function resolveRefData(
  r: GoFishRef,
  layerContext: LayerContext
): GoFishRef | GoFishRef[] {
  if (typeof r.selection !== "string") {
    if (r.multiplicity === "all") {
      throw new Error("selectAll requires a string layer name");
    }
    return r;
  }

  const layer = layerContext[r.selection];
  if (!layer) {
    throw new Error(
      `Layer "${r.selection}" not found. Make sure to call .name("${r.selection}") on the mark first.`
    );
  }

  const refs = layer.nodes.map((node) => ref({ __ref: node }));

  if (r.multiplicity === "all") return refs;

  // Singular: exactly one node expected.
  if (refs.length === 0) {
    throw new Error(`ref("${r.selection}") matched no nodes.`);
  }
  if (refs.length > 1) {
    throw new Error(
      `ref("${r.selection}") matched ${refs.length} nodes; use selectAll("${r.selection}").`
    );
  }
  return refs[0];
}

/**
 * Stash the chained `.name(...)` value directly on a mark function.
 * `ChartBuilder.connect()` reads this to detect a user-chained name without
 * relying on the `__serialize` tag, which is absent on untagged custom marks
 * and omits Tokens. Every `.name()` implementation calls this.
 */
export function stashLayerName(mark: object, layerName: unknown): void {
  (mark as any).__layerName = layerName;
}

/**
 * Tag every node a mark produces with a per-resolve marker so `.connect()`
 * can find its targets without minting a registry name. Unlike a string
 * layer name, a Symbol key can't collide with — or leak to — sibling charts
 * sharing the layerContext: hygiene by construction.
 */
function withConnectMarker<T>(base: Mark<T>, marker: symbol): Mark<T> {
  return async (d, key, layerContext) => {
    const node = await resolveMarkResult(
      base(d, key, layerContext),
      layerContext
    );
    (node as any)[marker] = true;
    return node;
  };
}

export class ChartBuilder<TInput, TOutput = TInput> {
  private readonly data: TInput;
  private readonly options?: ChartOptions;
  private readonly operators: Operator<any, any>[] = [];
  private readonly finalMark?: Mark<TOutput>;
  private readonly layerContext: LayerContext;
  private readonly nodeZOrder?: number;
  private readonly connector?: Mark<GoFishRef[]>;

  constructor(
    data: TInput,
    options?: ChartOptions,
    operators: Operator<any, any>[] = [],
    finalMark?: Mark<TOutput>,
    layerContext: LayerContext = {},
    nodeZOrder?: number,
    connector?: Mark<GoFishRef[]>
  ) {
    this.data = data;
    this.options = options;
    this.operators = operators;
    this.finalMark = finalMark;
    this.layerContext = layerContext;
    this.nodeZOrder = nodeZOrder;
    this.connector = connector;
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
      this.nodeZOrder,
      this.connector
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
      this.nodeZOrder,
      this.connector
    );
  }

  /**
   * Overlay a connector mark (e.g. `line()`, `area()`) under the nodes this
   * chart's mark produces — sugar for the two-chart layer([...]) + selectAll
   * pattern. If the mark has a string `.name(...)`, its registered nodes are
   * the targets (exactly the manual selectAll(name) semantics); otherwise the
   * produced nodes are tagged directly at resolve time — no name is minted or
   * serialized. The connector renders beneath the marks (zOrder -1), matching
   * the manual form's `.zOrder(-1)`.
   */
  connect(connector: Mark<GoFishRef[]>): ChartBuilder<TInput, TOutput> {
    if (this.connector !== undefined) {
      throw new Error(
        ".connect() was already called on this chart; only one connector is " +
          "supported. For additional overlays, use " +
          "layer([Chart(...).mark(m.name('pts')), Chart(selectAll('pts')).mark(...)])."
      );
    }
    return new ChartBuilder(
      this.data,
      this.options,
      this.operators,
      this.finalMark,
      this.layerContext,
      this.nodeZOrder,
      connector
    );
  }

  // resolve creates the node; named marks register their nodes into layerContext when invoked
  async resolve(): Promise<GoFishNode> {
    if (!this.finalMark) {
      throw new Error("Cannot resolve: no mark specified. Call .mark() first.");
    }

    // .connect() targets: a user-chained string `.name(...)` means "the nodes
    // registered under that name" (exactly the manual selectAll(name) form,
    // including any same-named siblings). An unnamed mark is wrapped
    // pre-composition so each leaf node it produces carries a per-resolve
    // marker instead — no registry name exists to collide or leak.
    let connectName: string | undefined;
    let connectMarker: symbol | undefined;
    let baseMark = this.finalMark as Mark<any>;
    if (this.connector) {
      const userName = (this.finalMark as any).__layerName;
      if (typeof userName === "string" && userName.length > 0) {
        connectName = userName;
      } else if (userName !== undefined) {
        throw new Error(
          ".connect() requires the mark's .name(...) to be a string; Token " +
            "names are not supported. Use the manual layer([...]) form."
        );
      } else {
        connectMarker = Symbol("gofish-connect-target");
        baseMark = withConnectMarker(baseMark, connectMarker);
      }
    }

    // Apply all operators to the mark
    let composedMark = baseMark;
    for (const op of this.operators.toReversed()) {
      composedMark = await op(composedMark);
    }

    // Resolve a ref/selectAll used as chart data just before calling mark
    let data = this.data;
    if (data instanceof GoFishRef) {
      data = resolveRefData(data, this.layerContext) as any;
    }

    // Create the node; named marks tag themselves for the post-resolve
    // collection pass below.
    const node = await Frame(this.options ?? {}, [
      (
        await resolveMarkResult(
          composedMark(data as any, undefined, this.layerContext),
          this.layerContext
        )
      ).setShared([true, true]),
    ]);

    // Populate layerContext by walking the finished tree in DFS order.
    // Tree order = parent-iteration order (because every parent operator's
    // Promise.all preserves child order in its return array), so this is
    // deterministic regardless of how individual async legs (e.g. a Python
    // `derive` RPC) interleaved at resolution time.
    collectLayerRegistrations(node, this.layerContext);

    // Embed colorConfig on the node so it survives .resolve() inside Layer
    if (this.options?.color) {
      (node as any).colorConfig = this.options.color;
    }

    let result: GoFishNode = node;
    if (this.connector) {
      // Collect the targets: the registered layer for a named mark, or the
      // marker-tagged nodes for an unnamed one. Both ride the same bounded
      // DFS walk as registration, so ordering and component-boundary hygiene
      // match what selectAll(name) yields.
      const targets = connectName
        ? (this.layerContext[connectName]?.nodes ?? [])
        : [...visibleNodes(node)].filter((n) => (n as any)[connectMarker!]);
      if (targets.length === 0) {
        throw new Error(
          `.connect(): ${
            connectName
              ? `no nodes are registered under "${connectName}"`
              : "the chart's mark produced no nodes"
          } — nothing to connect (is the data empty?).`
        );
      }
      // Elaborate as the literal desugaring: resolve the sibling
      // Chart(refs).mark(connector).zOrder(-1) through this same method —
      // one canonical Frame/setShared/registration/zOrder path — then layer
      // it over the chart.
      const refs = targets.map((n) => ref({ __ref: n }));
      const connectFrame = await new ChartBuilder<GoFishRef[], GoFishRef[]>(
        refs,
        undefined,
        [],
        this.connector,
        this.layerContext,
        -1
      ).resolve();
      result = await Layer({}, [node, connectFrame]);
    }

    if (this.nodeZOrder !== undefined) {
      result.zOrder(this.nodeZOrder);
    }

    return result;
  }

  withLayerContext(layerContext: LayerContext): ChartBuilder<TInput, TOutput> {
    return new ChartBuilder(
      this.data,
      this.options,
      this.operators,
      this.finalMark,
      layerContext,
      this.nodeZOrder,
      this.connector
    );
  }

  zOrder(value: number): ChartBuilder<TInput, TOutput> {
    return new ChartBuilder(
      this.data,
      this.options,
      this.operators,
      this.finalMark,
      this.layerContext,
      value,
      this.connector
    );
  }

  // render calls resolve and then renders
  async render(
    container: Parameters<GoFishNode["render"]>[0],
    options: Omit<Parameters<GoFishNode["render"]>[1], "axes">
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
      axes: this.options?.axes,
      colorConfig: this.options?.color,
      axisFields,
    });
  }
}

// `selectAll(...)` is typed as a single `GoFishRef` but resolves, as chart
// data, to the full `GoFishRef[]` (one ref per matching named node). This
// overload teaches the builder that plural-ref data flows downstream as an
// array, so `Chart(selectAll("bars"))` typechecks without a cast.
export function chart(
  data: GoFishRef & { multiplicity: "all" },
  options?: ChartOptions
): ChartBuilder<GoFishRef[], GoFishRef[]>;
export function chart<T>(data: T, options?: ChartOptions): ChartBuilder<T, T>;
export function chart<T>(data: T, options?: ChartOptions): ChartBuilder<T, T> {
  return new ChartBuilder<T, T>(data, options, [], undefined, {});
}
