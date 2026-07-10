import { GoFishNode } from "../_node";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { type ColorConfig } from "../colorSchemes";
import type { AxesOptions } from "../gofish";
import { Mark, Operator } from "../types";
import { Frame } from "../graphicalOperators/frame";
import { layer as Layer } from "../graphicalOperators/layer";
import { GoFishRef, visibleNodes } from "../_ref";
import { ref } from "../shapes/ref";
// The shared interactive render terminal now lives in the interaction layer
// (renderTerminal.ts) so the low-level `gofish()` terminal can reach it too —
// component thunks get the same two-regime treatment as ChartBuilder/
// LayerBuilder.render. See its doc-comment for the machinery.
import { renderWithInteraction } from "../../interaction/renderTerminal";

/**
 * Sentinel chart-data for an empty `Chart()` scope used inside `.layer(...)`:
 * "inherit the previous tier's marks". `LayerBuilder` wires it by naming the
 * previous tier's mark and pointing this tier's data at `selectAll(thatName)`.
 */
export const PREVIOUS_LAYER_MARKS = Symbol("gofish-previous-layer-marks");

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
export function resolveRefData(
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
 * Stash the chained `.name(...)` value directly on a mark function, so a
 * user-chained name can be detected without relying on the `__serialize` tag
 * (absent on untagged custom marks, and it omits Tokens). Every `.name()`
 * implementation calls this.
 */
export function stashLayerName(mark: object, layerName: unknown): void {
  (mark as any).__layerName = layerName;
}

export class ChartBuilder<TInput, TOutput = TInput> {
  private readonly data: TInput;
  private readonly options?: ChartOptions;
  private readonly operators: Operator<any, any>[] = [];
  private readonly finalMark?: Mark<TOutput>;
  private readonly layerContext: LayerContext;
  private readonly nodeZOrder?: number;
  private readonly nodeName?: string;

  constructor(
    data: TInput,
    options?: ChartOptions,
    operators: Operator<any, any>[] = [],
    finalMark?: Mark<TOutput>,
    layerContext: LayerContext = {},
    nodeZOrder?: number,
    nodeName?: string
  ) {
    this.data = data;
    this.options = options;
    this.operators = operators;
    this.finalMark = finalMark;
    this.layerContext = layerContext;
    this.nodeZOrder = nodeZOrder;
    this.nodeName = nodeName;
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
      this.nodeName
    );
  }

  // mark stores the mark and returns a new builder for chaining. A nested
  // `ChartBuilder` may be passed directly instead of a `(data) => Chart(...)`
  // callback (issue #243): an empty-scope child (`chart()` / `chart(options)`)
  // inherits the incoming partition datum; a child with its own data is drawn
  // as-is per partition.
  //
  // Blank-fusion sugar: a relational mark (`line()`/`ribbon()`) placed
  // directly here elaborates to an invisible anchor tier plus a connector
  // tier —
  //
  //   .mark(R(opts))  ⇒  .mark(blank(anchor(opts))).layer(R(opts))
  //
  // `createRelationalMark` (chart.ts) tags every bag-form / by-split-form
  // mark it produces with `__relationalFusable = { opts, makeAnchor }` —
  // never the pairwise `{from, to}` form, which already consumes ref-bearing
  // rows directly in `.mark()` position and keeps its existing (unfused)
  // meaning. `makeAnchor()` is a pre-bound `blank({w, h, emX, emY})` call (the
  // anchor-key subset of `opts`); the connector tier is simply `mark` AS
  // GIVEN — the factory's `produce` only reads the fields it knows about, so
  // the leftover spatial keys are inert there. Any `.name()`/`.label()`/
  // `.zOrder()` already chained onto `mark` rides along unchanged and applies
  // to the CONNECTOR; the anchor tier gets `LayerBuilder`'s usual
  // auto-naming. This returns a `LayerBuilder`, not a `ChartBuilder` — like
  // the explicit two-tier form it desugars to, the result supports further
  // `.layer(...)` chaining and the render/toSVG/... terminals, but not
  // `ChartBuilder`-only methods (`.name()` on the chart itself, further
  // `.mark()`/`.flow()`) or use as a nested `.layer(...)` tier.
  mark(
    mark: Mark<TOutput> | ChartBuilder<any, any>
  ): ChartBuilder<TInput, TOutput> | LayerBuilder {
    if (mark instanceof ChartBuilder) {
      const finalMark = ((d: TOutput, _key, layerContext) =>
        (mark.usesPreviousLayerMarks()
          ? mark.withData(d)
          : mark
        ).withLayerContext(layerContext ?? {})) as Mark<TOutput>;
      return new ChartBuilder(
        this.data,
        this.options,
        this.operators,
        finalMark,
        this.layerContext,
        this.nodeZOrder,
        this.nodeName
      );
    }

    // Only fuse when this chart's data is genuine per-row data that still
    // needs anchors drawn for it. The OTHER well-established bag-form usage —
    // a relational mark applied directly to a bag of ALREADY-drawn refs, e.g.
    // `chart(selectAll("bars")).flow(group({by})).mark(ribbon(opts))` (the
    // ribbon connects the existing bars) or an empty-scope `chart()` tier
    // inheriting the previous tier's marks inside `.layer(...)` — has nothing
    // to anchor: the incoming data already IS (or will become) the refs bag
    // the connector reads. `usesPreviousLayerMarks()` catches the empty-scope
    // case; `this.data instanceof GoFishRef` catches the explicit
    // `selectAll(...)`/`ref(...)` case.
    const fusable = (mark as any)?.__relationalFusable as
      | { opts: Record<string, any>; makeAnchor: () => Mark<any> }
      | undefined;
    const dataNeedsAnchors =
      !this.usesPreviousLayerMarks() && !(this.data instanceof GoFishRef);
    if (fusable && dataNeedsAnchors) {
      return this.mark(fusable.makeAnchor() as unknown as Mark<TOutput>).layer(
        mark as Mark<any>
      );
    }

    return new ChartBuilder(
      this.data,
      this.options,
      this.operators,
      mark,
      this.layerContext,
      this.nodeZOrder,
      this.nodeName
    );
  }

  /**
   * Name this chart's resolved node so it can be referenced — both by a
   * `.constrain(...)` callback on an enclosing `layer([...])` (which looks up
   * children by `_name` via `collectConstraintRefs`) and by a cross-chart
   * `selectAll(name)` / `ref(name)`. Mirrors the `.name(...)` wrapper on marks.
   */
  name(layerName: string): ChartBuilder<TInput, TOutput> {
    return new ChartBuilder(
      this.data,
      this.options,
      this.operators,
      this.finalMark,
      this.layerContext,
      this.nodeZOrder,
      layerName
    );
  }

  /**
   * Stack another tier over this one. `child` is usually its own `Chart(...)`
   * pipeline; an empty `Chart()` scope (no data) inherits *this* tier's marks (so
   * `.layer(Chart().flow(group({by})).mark(ribbon()))` connects what you just
   * drew), while `Chart(table)` drives the tier from another dataset (resolve
   * back into the chart with `resolve(..., { from: selectAll(...) })`).
   *
   * `child` may instead be a bare `Mark` (e.g. `text({...})`, `rect({...})`) — a
   * *component-level annotation tier*: a datumless overlay resolved against the
   * shared layer context (so a `.name(...)`-tagged annotation still registers)
   * with no data pipeline of its own. Use it for threshold rules, captions, and
   * other chrome that doesn't map over data.
   *
   * Returns a `LayerBuilder` so tiers keep chaining: `.layer(a).layer(b)`. Sugar
   * for the manual `layer([this, child])` + `selectAll` wiring.
   */
  layer(child: LayerTier): LayerBuilder {
    return new LayerBuilder([this, child]);
  }

  /** True when this builder is an empty `Chart()` scope (its data defers to the
   *  previous tier's marks). Used by `LayerBuilder` to wire the chain. */
  usesPreviousLayerMarks(): boolean {
    return (this.data as unknown) === PREVIOUS_LAYER_MARKS;
  }

  /** A copy of this builder with its data replaced — used by `LayerBuilder` to
   *  bind an empty `Chart()` scope to `selectAll(previousTierMarkName)`. */
  withData(data: TInput): ChartBuilder<TInput, TOutput> {
    return new ChartBuilder(
      data,
      this.options,
      this.operators,
      this.finalMark,
      this.layerContext,
      this.nodeZOrder,
      this.nodeName
    );
  }

  /** Ensure this tier's mark carries a name so a later tier can `selectAll` its
   *  nodes. Returns the (possibly renamed) builder and the effective name — an
   *  existing `.name(...)` wins; otherwise `autoName` is applied to the mark. */
  ensureNamedMark(autoName: string): {
    builder: ChartBuilder<TInput, TOutput>;
    name: string;
  } {
    if (this.finalMark === undefined) {
      throw new Error(
        ".layer(Chart()): the previous tier has no .mark() to inherit — add a " +
          "mark to the previous tier, or give the layer's Chart() its own data."
      );
    }
    const existing = (this.finalMark as any)?.__layerName;
    if (typeof existing === "string" && existing.length > 0) {
      return { builder: this, name: existing };
    }
    const named = (this.finalMark as any).name(autoName) as Mark<TOutput>;
    // `this.finalMark` was already stored by a prior `.mark()` call, so it's
    // never itself a fusable relational mark (fusion resolves at `.mark()`
    // call time into an anchor `ChartBuilder` + connector tier — see
    // `mark()`'s doc-comment) — `.name(...)` on it can't reintroduce the
    // `__relationalFusable` tag, so `this.mark(named)` always takes the
    // plain-mark branch and stays a `ChartBuilder`.
    return {
      builder: this.mark(named) as ChartBuilder<TInput, TOutput>,
      name: autoName,
    };
  }

  /** The render-time metadata threaded from the root tier: resolved axes/color
   *  config. `LayerBuilder` uses this so a `.layer()` chart inherits the root
   *  axes/color config. Axis titles are inferred downstream from each resolved
   *  space's `measure` (see `gofish`), so no field-name hint is threaded here. */
  renderMeta(): {
    axes?: AxesOptions;
    colorConfig?: ColorConfig;
  } {
    return {
      axes: this.options?.axes,
      colorConfig: this.options?.color,
    };
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

    // y-up is no longer a chart-vs-not flag: orientation is a PER-SCOPE property
    // resolved at bake time (issue #629). Each topmost continuous-y node (a value
    // axis) is mirrored about its own placed band, while an ordinal category axis
    // stays y-down — so a vertical bar chart flips, a horizontal one reads
    // top-down, and a chart composed inside a `gofish([...])`/`.layer()` gets the
    // same per-scope treatment for free. See `bake`'s `declaredYUp` and #629.

    if (this.nodeZOrder !== undefined) {
      result.zOrder(this.nodeZOrder);
    }

    // A user-chained `.name(...)` names the resolved node so it's a valid
    // `.constrain(...)` target on an enclosing layer (looked up by `_name`)
    // and resolvable via cross-chart `selectAll`/`ref`. `stashLayerName` keeps
    // serialize detection consistent with named marks.
    if (this.nodeName !== undefined) {
      result.name(this.nodeName);
      stashLayerName(this, this.nodeName);
      const entry = (this.layerContext[this.nodeName] ??= {
        data: [],
        nodes: [],
      });
      // One-shot per resolved node: a re-resolve against the same shared
      // layerContext (e.g. an embedded Layer render) must not re-register the
      // same node, or selectAll/ref(name) would see duplicates.
      if (!entry.nodes.includes(result)) {
        entry.nodes.push(result);
        entry.data.push((result as { datum?: unknown }).datum);
      }
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
      this.nodeName
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
      this.nodeName
    );
  }

  // The chart-level options every terminal threads through to the node:
  // resolved axes/color config. Axis titles are inferred downstream from each
  // resolved space's `measure` (see `gofish`) — both continuous (channel field)
  // and ordinal (grouping field) spaces carry one — so no field-name hint is
  // threaded from the builder anymore.
  private async resolveForRender<T extends Record<string, unknown>>(
    options: T
  ): Promise<{ node: GoFishNode; options: T & Record<string, unknown> }> {
    const node = await this.resolve();
    return {
      node,
      options: {
        // y-up is decided by the root render from the resolved y space (a
        // CONTINUOUS value axis flips, an ORDINAL category axis reads
        // top-down) — not forced here. See issue #143/#16.
        ...options,
        axes: this.options?.axes,
        colorConfig: this.options?.color,
      },
    };
  }

  // render calls resolve and then renders. Resolution always runs under the
  // ambient interactive context so the reactive surface (live() channels, input
  // reads in derive()) can register during resolve; a chart where nothing
  // registers renders down the static path untouched.
  async render(
    container: Parameters<GoFishNode["render"]>[0],
    options: Omit<Parameters<GoFishNode["render"]>[1], "axes">
  ): Promise<ReturnType<GoFishNode["render"]>> {
    return renderWithInteraction(
      () => this.resolveForRender(options),
      container
    );
  }

  /** Resolve and render to a standalone SVG markup string. */
  async toSVG(
    options: Omit<Parameters<GoFishNode["toSVG"]>[0], "axes"> = {}
  ): Promise<string> {
    const { node, options: opts } = await this.resolveForRender(options);
    return node.toSVG(opts);
  }

  /**
   * Resolve and emit the post-layout display list (render IR) at `options`'s
   * viewport — the analogue of {@link toJSON} (frontend IR) for the solved,
   * positioned output. See {@link toDisplayList}.
   */
  async toDisplayList(
    options: Omit<Parameters<GoFishNode["toDisplayList"]>[0], "axes"> = {}
  ): ReturnType<GoFishNode["toDisplayList"]> {
    const { node, options: opts } = await this.resolveForRender(options);
    return node.toDisplayList(opts);
  }

  /** Resolve and render to a detached `<svg>` element. */
  async toSVGElement(
    options: Omit<Parameters<GoFishNode["toSVGElement"]>[0], "axes"> = {}
  ): Promise<SVGSVGElement> {
    const { node, options: opts } = await this.resolveForRender(options);
    return node.toSVGElement(opts);
  }

  /**
   * Resolve, render, and save to `filename` (format inferred from the
   * extension — `.svg` today). Browser downloads; Node writes the file.
   */
  async save(
    filename: string,
    options: Omit<Parameters<GoFishNode["save"]>[1], "axes"> = {}
  ): Promise<void> {
    const { node, options: opts } = await this.resolveForRender(options);
    return node.save(filename, opts);
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
// Empty scope: `Chart()` / `Chart(options)` (no data) inherits its data from the
// enclosing context — the previous tier's marks inside `.layer(...)`, or the
// incoming partition datum when used directly as a `.mark(...)` (issue #243).
export function chart(options?: ChartOptions): ChartBuilder<any, any>;
export function chart<T>(
  dataOrOptions?: T | ChartOptions,
  options?: ChartOptions
): ChartBuilder<any, any> {
  // Disambiguate `chart(options)` from `chart(data)`: chart data is always an
  // array or a ref, never a bare options-shaped object, so a lone first arg
  // whose keys are all ChartOptions keys is options for an empty scope. (No
  // real call passes a single plain datum object as data.)
  const emptyScope =
    arguments.length === 0 ||
    (options === undefined && isChartOptions(dataOrOptions));
  const resolvedData = emptyScope ? PREVIOUS_LAYER_MARKS : (dataOrOptions as T);
  const resolvedOptions = emptyScope
    ? (dataOrOptions as ChartOptions | undefined)
    : options;
  return new ChartBuilder<any, any>(
    resolvedData,
    resolvedOptions,
    [],
    undefined,
    {}
  );
}

const CHART_OPTION_KEYS = new Set([
  "w",
  "h",
  "coord",
  "color",
  "axes",
  "padding",
]);

/** True when `x` is an options-shaped object (used to tell `chart(options)`
 *  from `chart(data)` — see the disambiguation note in `chart`). An empty
 *  object reads as (empty) options. */
function isChartOptions(x: unknown): x is ChartOptions {
  if (x === null || typeof x !== "object") return false;
  if (Array.isArray(x) || x instanceof GoFishRef) return false;
  return Object.keys(x).every((k) => CHART_OPTION_KEYS.has(k));
}

/**
 * A tier in a `.layer(...)` chain. Usually a full `Chart(...)` pipeline, but a
 * bare `Mark` (or an already-resolved `GoFishNode`) is a *mark tier* — a
 * component-level, datumless annotation overlay.
 */
export type LayerTier = ChartBuilder<any, any> | Mark<any> | GoFishNode;

/**
 * A stack of chart tiers built by chaining `.layer(...)`. The previous tier's
 * marks are provided as UNIFORM scope to every tier: a `GoFishRef[]` bag of
 * the refs `.name(...)`-registered against the previous tier's produced
 * nodes. Consumption is decided entirely by what a tier's mark does with that
 * input — there is no dispatch on tier kind here:
 *   - an empty `Chart()` scope binds it as chart DATA (so its `.flow()`/
 *     `.mark()` pipeline runs over the bag, e.g. a nested `group()`);
 *   - a bare *relational* mark (`Mark<GoFishRef[]>`, e.g. `ribbon()`/`line()`
 *     used without `.mark()`) consumes it directly as the bag it connects;
 *   - a bare *leaf* mark (`rect`, `text`, …) ignores its datum argument for a
 *     literal-valued annotation, so receiving the bag instead of `undefined`
 *     is inert — it behaves exactly as before.
 * Tiers share one `layerContext` and resolve in order, so each tier's name
 * registrations land before the next tier's scope is read (mirrors the
 * manual `layer([...])` form).
 */
export class LayerBuilder {
  constructor(private readonly tiers: LayerTier[]) {}

  /** Stack another tier; every tier is offered the previous tier's marks as
   *  scope (see the class doc for how consumption is decided). */
  layer(child: LayerTier): LayerBuilder {
    return new LayerBuilder([...this.tiers, child]);
  }

  /** The root tier is always a `ChartBuilder` (`.layer` is a method on one), but
   *  IR deserialization also constructs `LayerBuilder`s, so assert it. */
  private rootChart(): ChartBuilder<any, any> {
    const first = this.tiers[0];
    if (!(first instanceof ChartBuilder)) {
      throw new Error(
        "the first .layer(...) tier must be a chart(...) pipeline (a builder " +
          "chain starts on a ChartBuilder); a bare mark tier can't be the root."
      );
    }
    return first;
  }

  async resolve(): Promise<GoFishNode> {
    const sharedContext: LayerContext = {};
    const nodes: GoFishNode[] = [];
    // The previous tier's marks, as a `GoFishRef[]` bag — offered uniformly to
    // every tier (see class doc). `undefined` before any tier has produced
    // named nodes (the root tier, or after a producer with no name).
    let prevRefs: GoFishRef[] | undefined;
    let autoIdx = 0;
    // Sequential so each tier's name registrations (and the bag built from
    // them) are visible to the next tier.
    for (let i = 0; i < this.tiers.length; i++) {
      let tier = this.tiers[i];
      const hasNext = i < this.tiers.length - 1;

      if (tier instanceof ChartBuilder) {
        if (tier.usesPreviousLayerMarks()) {
          if (prevRefs === undefined) {
            throw new Error(
              ".layer(Chart()) with an empty scope has no previous tier's " +
                "marks to draw from — give the first tier real data, or make " +
                "sure the previous tier actually produced nodes."
            );
          }
          tier = tier.withData(prevRefs as any);
        }
        // Auto-name this tier's mark (unless already named) whenever a later
        // tier exists, so its produced nodes are addressable as the next
        // tier's scope — uniformly, regardless of whether the next tier is an
        // empty `Chart()` scope, a relational mark, or a leaf annotation.
        let autoName: string | undefined;
        if (hasNext) {
          const named = tier.ensureNamedMark(`__gofish_layer_${autoIdx}`);
          if (named.name === `__gofish_layer_${autoIdx}`) autoIdx++;
          tier = named.builder;
          autoName = named.name;
        }
        nodes.push(await tier.withLayerContext(sharedContext).resolve());
        prevRefs = autoName
          ? (sharedContext[autoName]?.nodes ?? []).map((n) => ref({ __ref: n }))
          : undefined;
      } else {
        // Mark tier: resolve the bare mark against the shared layer context
        // (so a `.name(...)`-tagged annotation still registers) and pass the
        // previous tier's bag as its datum, uniformly. A relational mark
        // (e.g. `ribbon()`) reads it as the refs it connects; a leaf mark
        // (e.g. `rect({...})`) ignores its datum argument and renders exactly
        // as before.
        nodes.push(
          await resolveMarkResult(
            typeof tier === "function"
              ? (tier as Mark<any>)(prevRefs as any, undefined, sharedContext)
              : tier,
            sharedContext
          )
        );
        // A bare mark tier isn't auto-named, so it never becomes the next
        // tier's producer.
        prevRefs = undefined;
      }
    }
    const result = await Layer({}, nodes);
    const { colorConfig } = this.rootChart().renderMeta();
    if (colorConfig) {
      (result as any).colorConfig = colorConfig;
    }
    return result;
  }

  private async resolveForRender<T extends Record<string, unknown>>(
    options: T
  ): Promise<{ node: GoFishNode; options: T & Record<string, unknown> }> {
    const node = await this.resolve();
    const meta = this.rootChart().renderMeta();
    // Thread axes/color from the root tier so a `.layer()` chart inherits the
    // root config. Axis titles derive downstream from each resolved space's
    // `measure`, so no field-name hint is threaded here.
    return {
      node,
      options: {
        // y-up is decided by the root render from the resolved y space — see
        // the sibling resolveForRender and issue #143/#16.
        ...options,
        axes: (options as any).axes ?? meta.axes,
        colorConfig: meta.colorConfig,
      },
    };
  }

  async render(
    container: Parameters<GoFishNode["render"]>[0],
    options: Parameters<GoFishNode["render"]>[1]
  ): Promise<ReturnType<GoFishNode["render"]>> {
    return renderWithInteraction(
      () => this.resolveForRender(options ?? {}),
      container
    );
  }

  async toSVG(
    options: Parameters<GoFishNode["toSVG"]>[0] = {}
  ): Promise<string> {
    const { node, options: opts } = await this.resolveForRender(options);
    return node.toSVG(opts);
  }

  async toSVGElement(
    options: Parameters<GoFishNode["toSVGElement"]>[0] = {}
  ): Promise<SVGSVGElement> {
    const { node, options: opts } = await this.resolveForRender(options);
    return node.toSVGElement(opts);
  }

  async save(
    filename: string,
    options: Parameters<GoFishNode["save"]>[1] = {}
  ): Promise<void> {
    const { node, options: opts } = await this.resolveForRender(options);
    return node.save(filename, opts);
  }
}
