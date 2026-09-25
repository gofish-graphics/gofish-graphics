import { GoFishNode } from "../_node";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { type ColorConfig } from "../colorSchemes";
import type { AxesOptions } from "../gofish";
import { Mark, Operator } from "../types";
import { Frame } from "../graphicalOperators/frame";
import { layer as Layer } from "../graphicalOperators/layer";
import { GoFishRef, visibleNodes } from "../_ref";
import { ref } from "../shapes/ref";
import { isField } from "../data";
import {
  splitKeyFn,
  fieldNameOf,
  type SplitBy,
  type InferredRelational,
  type TimeTier,
} from "../datumProjection";
// The shared interactive render terminal lives in the interaction layer
// (renderTerminal.ts) so the low-level `gofish()` terminal can reach it too.
import {
  renderWithInteraction,
  type RenderPass,
} from "../../interaction/renderTerminal";
import {
  attachBuilderTerminals,
  type RenderOptions,
  type TerminalMethods,
} from "./terminals";
import { expandComposedOperator } from "./compose";
import {
  markDataTime,
  tweenTierFor,
  type MarkTransition,
} from "../../animation/transition";
import {
  installBuildIn,
  type BuildClockOptions,
} from "../../animation/install";

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
  raw: ReturnType<Mark<any>> | LayerBuilder,
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
  // A `.mark(<relational mark>)` chart elaborates to `.mark(anchor).layer(R)`,
  // i.e. a LayerBuilder — so a chart pipeline handed anywhere a mark is taken
  // (a `.layer(...)` tier, a `layer([...])` child) can be one. It resolves to
  // its own stacked node; its tiers share the ENCLOSING scope's layer context
  // (its own, when there is none), so a `.name(...)` inside it is findable from
  // outside — exactly as for a ChartBuilder tier.
  if (raw instanceof LayerBuilder)
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
  /**
   * Whether to render the color-scale legend for this chart. Default `true`:
   * a chart whose marks resolve a categorical or gradient color scale grows a
   * swatch column / colorbar beside its content. `false` suppresses it — the
   * colors still come from the scale, only the chrome is dropped (e.g. a
   * 72-species basemap where a swatch column would eat the canvas).
   */
  legend?: boolean;
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
 * from outside. Both this registry and string-name lookup
 * (`resolveScopedName`) ride the single bounded walk `visibleNodes` in
 * _ref.tsx, so the component boundary means the same thing for both — the
 * walk does not descend into a
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
    if (n instanceof GoFishNode) registerLayerNode(n, layerContext);
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
 * True when chart data is already a bag of refs — a single `GoFishRef`
 * (`ref(...)`/`selectAll(...)` used as chart data) or a non-empty array of
 * them (`LayerBuilder.resolve()`'s `withData(prevRefs)` shape: one resolved
 * ref per node the previous tier named). Names the "data is already refs,
 * nothing to anchor" concept for `mark()`'s blank-fusion guard. Any NEW
 * refs-bag shape `LayerBuilder` (or `selectAll`) starts producing must be
 * added HERE, not at call sites.
 */
function dataIsRefs(data: unknown): boolean {
  return (
    data instanceof GoFishRef ||
    (Array.isArray(data) && data.length > 0 && data[0] instanceof GoFishRef)
  );
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

/* ---- Default grouping for relational marks in a flow (issue #752) ----
 *
 * See `notes/design/relational-mark-default-split.md` for the full rule.
 * Summary: a fused relational mark (`line`/`ribbon`) with no explicit `by`
 * gets a default split computed from the flow it fuses over, and its
 * `Connect` direction gets the computed travel axis. The computation lives
 * here (not in chart.ts, which this module is imported FROM) because it needs
 * the flow tiers, which only `ChartBuilder` has in hand.
 *
 * `InferredRelational` (the cell this computation writes into) lives in
 * `datumProjection.ts` so both modules that need the shape (chart.ts tags
 * every relational mark with a cell of it; this module computes into it)
 * import the same declaration — a type-only import creates no runtime cycle.
 */

/** The `__relationalFusable` descriptor shape this module reads/writes —
 *  see `tagRelationalFusable` in chart.ts, which builds and tags every
 *  instance and imports this type back (type-only, no runtime cycle: chart.ts
 *  already depends on this module at runtime) so the two sides can't drift. */
export type RelationalFusable = {
  type: string;
  opts: Record<string, any>;
  inferred: InferredRelational;
  anchorKeys: string[];
  makeAnchor: () => Mark<any>;
  /** A temporal connector (`time.transition()`) — see `applyDefaultRelational`. */
  temporal?: boolean;
};

/** The flow's temporal tier: the last `time.sequence(...)` in it. A sequence
 *  tags its operator with the tier (field plus clock) it contributes — the
 *  temporal counterpart of the `__arrangement` tag every spatial operator
 *  declares, and read here for the same reason: only `ChartBuilder` has the
 *  flow tiers in hand. */
function findTimeTier(operators: Operator<any, any>[]): TimeTier | undefined {
  for (let i = operators.length - 1; i >= 0; i--) {
    const tier = (operators[i] as any).__timeTier as TimeTier | undefined;
    if (tier !== undefined) return tier;
  }
  return undefined;
}

/** How one flow tier (`spread`/`stack`/`scatter`/`group`/other) relates to
 *  the travel-axis rule. Each operator DECLARES its own class through
 *  `createOperator`'s `arrangement` config, which tags the built operator with
 *  `__arrangement`; a tier that declares nothing is "none".
 *   - "arrangement" (spread/stack): `dir` is the axis the tier LAYS ITS
 *     GROUPS OUT ALONG — walking that sequence IS a natural path, so a
 *     connector traveling along `dir` reads as "connect consecutive groups
 *     of this spread". A bare fallback (no h/w, no explicit dir anywhere)
 *     resolves to this SAME axis. NOT the design note's general "one axis
 *     positioned -> travel the OTHER axis" rule, which holds for scatter's
 *     continuous x/y (see "value" below) but would send the layered-area
 *     ribbon travelling vertically through a single horizontally-spread
 *     tier — rejected by that note's own worked example.
 *   - "value" (scatter): `x`/`y` are literal per-item coordinates, i.e. a
 *     continuous VALUE channel exactly like an anchor's `h`/`w` — so the
 *     travel axis is the axis it does NOT position (mirrors step 2's h/w
 *     rule: a value on one axis puts travel on the other).
 *   - "none" (group, derive, anything unrecognized): positions nothing, and
 *     — for group specifically — may still carry a `by` that's eligible to
 *     split.
 */
export type OperatorClass = {
  kind: "arrangement" | "value" | "none";
  positions: { x: boolean; y: boolean };
  by?: SplitBy;
};

function classifyOperator(op: Operator<any, any>): OperatorClass {
  return (
    ((op as any).__arrangement as OperatorClass | undefined) ?? {
      kind: "none",
      positions: { x: false, y: false },
    }
  );
}

/** A field name or `field(...)` accessor — a data-driven h/w — as opposed to
 *  a literal number, a `Value`, or `undefined`. Step 2 of the travel-axis
 *  rule: only a data-driven h/w carries a value-channel signal. */
function isDataDrivenSize(v: unknown): boolean {
  return typeof v === "string" || isField(v);
}

/** Innermost (last in flow order) tier that positions anchors on either
 *  axis, skipping non-positioning tiers (group, derive, ...). `classified` is
 *  each flow tier's `classifyOperator(...)` result, precomputed once by
 *  `applyDefaultRelational` and threaded through — this whole file's helpers
 *  only ever need the classification, never the raw operator. */
function innermostPositioning(
  classified: OperatorClass[]
): { index: number; cls: OperatorClass } | undefined {
  for (let i = classified.length - 1; i >= 0; i--) {
    const cls = classified[i];
    if (cls.positions.x || cls.positions.y) return { index: i, cls };
  }
  return undefined;
}

/** Step 3 of the travel-axis rule: the innermost positioning tier decides.
 *  Positions both axes -> "flow order" (no concrete axis — `undefined`, so
 *  the caller leaves `dir` unset and line/ribbon's own `?? "x"` applies).
 *  Otherwise see `OperatorClass`'s doc comment for the arrangement/value
 *  split. */
function flowOrderTravelAxis(
  classified: OperatorClass[]
): "x" | "y" | undefined {
  const found = innermostPositioning(classified);
  if (!found) return undefined;
  const { cls } = found;
  if (cls.positions.x && cls.positions.y) return undefined;
  if (cls.kind === "arrangement") return cls.positions.x ? "x" : "y";
  // "value" (scatter) positioning exactly one axis: travel is the other.
  return cls.positions.x ? "y" : "x";
}

/** The path tier: the innermost flow tier that positions along the travel
 *  axis; if none does, the innermost positioning tier of ANY axis (mirrors
 *  the "flow order" fallback). `undefined` only when nothing in the flow
 *  positions anything. */
function findPathTierIndex(
  classified: OperatorClass[],
  travelAxis: "x" | "y" | undefined
): number | undefined {
  if (travelAxis !== undefined) {
    for (let i = classified.length - 1; i >= 0; i--) {
      if (classified[i].positions[travelAxis]) return i;
    }
  }
  return innermostPositioning(classified)?.index;
}

/** Explicit `along`: pin the path tier to the flow tier whose `by` names the
 *  given field, instead of inferring it. A function-form `by` names no field
 *  and so never matches (the design note's "Matching" clause — a function
 *  receives the raw bag element, not a field). Throws a loud error naming the
 *  field and the flow's available keys when no tier matches — `along` never
 *  silently falls back to inference. */
function findTierIndexByAlong(
  classified: OperatorClass[],
  along: string,
  markType: string
): number {
  for (let i = classified.length - 1; i >= 0; i--) {
    if (fieldNameOf(classified[i].by) === along) return i;
  }
  const available = Array.from(
    new Set(
      classified
        .map((cls) => fieldNameOf(cls.by))
        .filter((n): n is string => n !== undefined)
    )
  );
  throw new Error(
    `${markType}({ along: "${along}" }): no flow tier groups by "${along}" ` +
      (available.length > 0
        ? `— this flow's tiers group by: ${available.map((n) => `"${n}"`).join(", ")}.`
        : `— this flow has no grouping tiers to name.`)
  );
}

/** The travel axis an explicitly-`along`-named tier implies, mirroring
 *  `classifyOperator`'s arrangement/value split: an arrangement tier
 *  (`spread`/`stack`) travels its own `dir`; a scatter (or any non-
 *  arrangement) tier travels flow order — leave `dir` unset so line/ribbon's
 *  own `?? "x"` applies. */
function alongTravelAxis(cls: OperatorClass): "x" | "y" | undefined {
  if (cls.kind !== "arrangement") return undefined;
  return cls.positions.x ? "x" : "y";
}

/** Resolve the travel axis (steps 1-3 of the rule) and the path tier index
 *  it implies. `markOpts` is the connector's own opts; `anchorOpts` is the
 *  previous tier's mark opts when fusing via `.layer()` sugar (undefined at
 *  `.mark()`-position fusion time, where the anchor hasn't been split off
 *  yet and `markOpts` itself still carries `h`/`w`). */
function resolveTravelAxis(
  markOpts: Record<string, any>,
  anchorOpts: Record<string, any> | undefined,
  classified: OperatorClass[]
): "x" | "y" | undefined {
  // Step 1: an explicit `dir` on the mark names the travel axis directly.
  if (markOpts.dir === "x" || markOpts.dir === "y") return markOpts.dir;

  // Step 2: a data-driven h/w on the mark or the anchor tier. h -> travel x
  // (the value lives in y); w -> travel y. Both driven -> fall through.
  const hDriven =
    isDataDrivenSize(markOpts.h) ||
    (anchorOpts !== undefined && isDataDrivenSize(anchorOpts.h));
  const wDriven =
    isDataDrivenSize(markOpts.w) ||
    (anchorOpts !== undefined && isDataDrivenSize(anchorOpts.w));
  if (hDriven && !wDriven) return "x";
  if (wDriven && !hDriven) return "y";

  // Step 3: the innermost positioning flow tier.
  return flowOrderTravelAxis(classified);
}

/** The default split key: the combination of every flow tier's `by` EXCEPT
 *  the path tier's (which orders the path and never splits). `undefined`
 *  when there's nothing to split on (no other grouping tier). Reuses
 *  `splitKeyFn` (same one `splitEntries` uses) so string/field/function `by`
 *  forms all project through `GoFishRef.datum` identically to a real
 *  operator `by` — including the function-form trap: a function `by`
 *  receives the raw bag element (a `GoFishRef`), not a datum, matching
 *  today's function-form semantics. */
function computeDefaultBy(
  classified: OperatorClass[],
  pathTierIndex: number | undefined
): SplitBy | undefined {
  const tierBys: SplitBy[] = [];
  classified.forEach((cls, i) => {
    if (i === pathTierIndex) return;
    if (cls.by !== undefined) tierBys.push(cls.by);
  });
  if (tierBys.length === 0) return undefined;
  const keyFns = tierBys.map((by) => splitKeyFn(by));
  // Unit-separator join: a bare `join("")` would collide composite keys like
  // ("ab","c") and ("a","bc").
  return (r: any) => keyFns.map((fn) => fn(r)).join("\u001f");
}

/**
 * Compute the default split/travel-direction for a fused relational mark and
 * write it into `fusable.inferred` — NEVER into `fusable.opts` (the record
 * of what the user wrote; see `tagRelationalFusable`'s doc comment in
 * chart.ts). A no-op when a default was already computed for this connector
 * (`inferred.resolved` — set so the `.mark()` fusion rewrite's internal
 * `.layer(...)` call, which re-enters `ChartBuilder.layer()` below, doesn't
 * recompute).
 *
 * An explicit `along` beats inference entirely: it pins the path tier
 * (`findTierIndexByAlong`, throwing if no tier matches) instead of running
 * the travel-axis/path-tier inference (steps 1-3). `dir` still composes
 * independently — an explicit `dir` still wins for the travel axis even when
 * `along` picks the path tier (mirrored by checking `fusable.opts.dir` first
 * below, same as step 1 of the inferred path).
 *
 * Classifies every flow tier once and threads that array through the rest of
 * the resolution: the helpers below all take the precomputed classification,
 * never the raw operators.
 */
function applyDefaultRelational(
  fusable: RelationalFusable,
  operators: Operator<any, any>[],
  anchorOpts: Record<string, any> | undefined
): void {
  if (fusable.inferred.resolved) return;
  // A TEMPORAL connector threads the flow's time tier, which is the one thing
  // it cannot infer from the spatial arrangement: the sequence positions
  // nothing in x or y. So the time tier names the path tier — the same job
  // `along` does for a spatial connector, which is why it resolves into the
  // same variable and the rest of the rule (split = the complement of the
  // path tier) runs unchanged.
  const timeTier = fusable.temporal ? findTimeTier(operators) : undefined;
  if (fusable.temporal) {
    // A written-out `at` (a raw clock) replaces the sequence's own, and a
    // written-out `along` replaces the field it names, so a flow of plain
    // `group(...)` tiers is enough once both are spelled. Unless BOTH halves
    // are written out, the transition needs a sequence to read: with only
    // `at` written, nothing would name the path tier.
    const spelledOut =
      fusable.opts.at !== undefined && fusable.opts.along !== undefined;
    if (timeTier === undefined && !spelledOut) {
      throw new Error(
        `${fusable.type}(): this chart's flow has no time.sequence(...), so ` +
          `there are no keyframes to move between. Add one — ` +
          `\`.flow(time.sequence({ by: "year" }), ...)\` — or write the two ` +
          `halves out yourself with ` +
          `\`${fusable.type}({ along: "year", at: clock })\` — or use ` +
          `line({ along: "year" }) for a static path through the marks.`
      );
    }
    if (timeTier !== undefined) fusable.inferred.time = timeTier;
  }
  const along =
    ((fusable.opts as any).along as string | undefined) ?? timeTier?.by;
  const classified = operators.map(classifyOperator);

  let travelAxis: "x" | "y" | undefined;
  let pathTierIndex: number | undefined;
  if (along !== undefined) {
    pathTierIndex = findTierIndexByAlong(classified, along, fusable.type);
    travelAxis =
      fusable.opts.dir === "x" || fusable.opts.dir === "y"
        ? fusable.opts.dir
        : alongTravelAxis(classified[pathTierIndex]);
  } else {
    travelAxis = resolveTravelAxis(fusable.opts, anchorOpts, classified);
    pathTierIndex = findPathTierIndex(classified, travelAxis);
  }

  const defaultBy = computeDefaultBy(classified, pathTierIndex);
  if (defaultBy !== undefined) fusable.inferred.by = defaultBy;
  if (travelAxis !== undefined && fusable.opts.dir === undefined) {
    fusable.inferred.dir = travelAxis;
  }
  fusable.inferred.resolved = true;
}

/** Loud guard for `along` used where the mark does not fuse over this
 *  chart's own flow (a refs-bag chart, or the `{from,to}` pairwise form —
 *  see the design note's "Matching" clause). `applyDefaultRelational` is
 *  never reached on these paths, so `along` would otherwise silently no-op;
 *  call this wherever fusion is skipped but the mark could still carry
 *  `along`.
 *
 *  A TEMPORAL connector is exempt, and that is a difference in what the word
 *  names rather than an exception to the rule. On a spatial connector `along`
 *  names a tier of the flow, which a refs-bag chart does not have. On
 *  `time.transition()` it names the field each keyframe's own datum carries
 *  its time in, which the refs carry with them, so it still does exactly its
 *  job over a bag of already-placed marks. */
function rejectAlongWithoutFlow(
  fusable:
    | { type: string; opts: Record<string, any>; temporal?: boolean }
    | undefined
): void {
  if (fusable?.temporal) return;
  if (fusable && fusable.opts.along !== undefined) {
    throw new Error(
      `${fusable.type}({ along: "${fusable.opts.along}" }): along names a ` +
        `tier of this chart's flow; this chart has no flow / is over refs — ` +
        `use flow(group({ by })) instead.`
    );
  }
}

/* ---- END default grouping for relational marks ---- */

/** The chart-level config a builder threads through to every terminal. */
type RenderMeta = {
  axes?: AxesOptions;
  legend?: boolean;
  colorConfig?: ColorConfig;
  /** The root tier's coordinate space, read by `LayerBuilder.resolve` so it can
   *  HOIST it over every tier rather than let the root tier keep it. */
  coord?: CoordinateTransform;
  padding?: number;
};

/**
 * The base both builder surfaces extend: it supplies the export terminals
 * (`render`, `toSVG`, `toSVGElement`, `save`, `toDisplayList`) from the shared
 * registry, attached once to this prototype and inherited by each subclass. A
 * subclass provides only the two pieces `resolveForRender` needs — how to
 * resolve itself to a node, and the chart-level config to render it with.
 *
 * The methods are `declare`d (their bodies come from `attachBuilderTerminals`
 * below) so the terminal list stays defined in exactly one place. Their
 * options also take the build-in clock's (`BuildClockOptions`), which
 * `resolveForRender` reads.
 */
abstract class RenderableBuilder {
  abstract resolve(): Promise<GoFishNode>;
  abstract renderMeta(): RenderMeta;

  declare render: TerminalMethods<BuildClockOptions>["render"];
  declare toSVG: TerminalMethods<BuildClockOptions>["toSVG"];
  declare toSVGElement: TerminalMethods<BuildClockOptions>["toSVGElement"];
  declare save: TerminalMethods<BuildClockOptions>["save"];
  declare toDisplayList: TerminalMethods<BuildClockOptions>["toDisplayList"];
}

/** Everything a `ChartBuilder` carries. The builder is immutable: every
 *  chaining method copies this state with one field changed (`with`). */
type ChartBuilderState<TInput, TOutput> = {
  data: TInput;
  options?: ChartOptions;
  operators: Operator<any, any>[];
  finalMark?: Mark<TOutput>;
  layerContext: LayerContext;
  nodeZOrder?: number;
  nodeName?: string;
};

export class ChartBuilder<TInput, TOutput = TInput> extends RenderableBuilder {
  private readonly state: ChartBuilderState<TInput, TOutput>;

  constructor(state: ChartBuilderState<TInput, TOutput>) {
    super();
    this.state = state;
  }

  /** A copy of this builder with some state replaced. */
  private with(
    patch: Partial<ChartBuilderState<TInput, TOutput>>
  ): ChartBuilder<TInput, TOutput> {
    return new ChartBuilder({ ...this.state, ...patch });
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
    return this.with({
      operators: [
        ...this.state.operators,
        ...ops.flatMap(expandComposedOperator),
      ],
    });
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
    // A mark's `.transition()` under a `time.sequence`: the mark enters,
    // moves and leaves with the data, which is `time.transition()`'s job, so
    // this is the chained spelling of `.mark(m).layer(time.transition(...))`
    // (see `tweenTierFor`). With no sequence the spec stays on the mark's
    // nodes for the build-in (`src/animation/install.ts`).
    const transition = (mark as any)?.__transition as
      | MarkTransition
      | undefined;
    if (
      transition !== undefined &&
      !(mark instanceof ChartBuilder) &&
      findTimeTier(this.state.operators) !== undefined
    ) {
      const tier = tweenTierFor(transition) as Mark<any>;
      return this.with({ finalMark: mark as Mark<TOutput> }).layer(tier);
    }
    if (mark instanceof ChartBuilder) {
      const finalMark = ((d: TOutput, _key, layerContext) =>
        (mark.usesPreviousLayerMarks()
          ? mark.withData(d)
          : mark
        ).withLayerContext(layerContext ?? {})) as Mark<TOutput>;
      return this.with({ finalMark });
    }

    // Only fuse when this chart's data is genuine per-row data that still
    // needs anchors drawn for it. The OTHER well-established bag-form usage —
    // a relational mark applied directly to a bag of ALREADY-drawn refs, e.g.
    // `chart(selectAll("bars")).flow(group({by})).mark(ribbon(opts))` (the
    // ribbon connects the existing bars) or an empty-scope `chart()` tier
    // inheriting the previous tier's marks inside `.layer(...)` — has nothing
    // to anchor: the incoming data already IS (or will become) the refs bag
    // the connector reads. `hasOwnFlow()` is exactly "this chart was built
    // from genuine row data flowing through its own operators" — see its doc
    // comment, shared with the `.layer()` fusion guard below.
    const fusable = (mark as any)?.__relationalFusable as
      | RelationalFusable
      | undefined;
    if (fusable && this.hasOwnFlow()) {
      // Default grouping (issue #752): this mark fuses over THIS chart's own
      // flow, so a default split/travel-direction can be computed from its
      // operators. The mark's own opts still carry `h`/`w` here — the anchor
      // tier `fusable.makeAnchor()` below hasn't split them off yet — so no
      // separate anchor-opts argument is needed (they're the same object).
      applyDefaultRelational(fusable, this.state.operators, undefined);
      return this.mark(fusable.makeAnchor() as unknown as Mark<TOutput>).layer(
        mark as Mark<any>
      );
    }

    // Fusion was skipped — this mark connects existing marks (an empty-scope
    // `chart()` tier, or a chart whose data is already refs), so `along`
    // (which names a tier of a flow that doesn't apply here) and any anchor
    // keys it's still carrying (`w`/`h`/`emX`/`emY`, which have nothing to
    // anchor) would otherwise silently do nothing. That's exactly the kind
    // of user-wrote-X/system-did-Y disagreement that should be a loud error
    // rather than a quiet no-op.
    rejectAlongWithoutFlow(fusable);
    if (fusable && fusable.anchorKeys.length > 0) {
      const keys = fusable.anchorKeys;
      const plural = keys.length > 1;
      throw new Error(
        `${fusable.type}({ ${keys.join(", ")} }): anchor channel${plural ? "s" : ""} ` +
          `(${keys.join(", ")}) ${plural ? "have" : "has"} no effect here — this ` +
          `${fusable.type} connects EXISTING marks (an empty-scope chart() tier, ` +
          `or a chart over refs), so there's nothing to anchor. Remove ${
            plural ? "them" : "it"
          }, or chart() over raw rows so ${fusable.type} can synthesize its own anchor tier.`
      );
    }

    return this.with({ finalMark: mark });
  }

  /**
   * Name this chart's resolved node so it can be referenced — both by a
   * `.constrain(...)` callback on an enclosing `layer([...])` (which resolves
   * names with the same lookup as `ref`) and by a cross-chart
   * `selectAll(name)` / `ref(name)`. Mirrors the `.name(...)` wrapper on marks.
   */
  name(layerName: string): ChartBuilder<TInput, TOutput> {
    return this.with({ nodeName: layerName });
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
   *
   * Default grouping (issue #752): a bare relational-mark tier (`child` is a
   * `Mark` tagged `__relationalFusable` by `createRelationalMark` — e.g.
   * `.mark(blank({h})).layer(ribbon({}))`) always consumes THIS tier's
   * produced marks as the bag it connects (see the class doc on
   * `LayerBuilder`), so a default split/travel-direction is computed from
   * this tier's flow here too — the SAME computation `.mark()`'s fusion
   * rewrite runs, just over the explicit two-tier form instead of the
   * `.mark(R(...))` sugar that elaborates to it. `anchorOpts` is the
   * `__serialize.opts` of this tier's own mark (e.g. `blank({h:"count"})`) so
   * step 2 of the travel-axis rule can see a data-driven `h`/`w` that lives
   * on the anchor rather than on the connector.
   *
   * Guarded to THIS tier's own flow, not a nested one (`hasOwnFlow()`, the
   * same boundary `.mark()`'s fusion guard uses). A
   * `chart().flow(group({by})).mark(line())` tier passed as `child` is a
   * `ChartBuilder`, not a bare `Mark`, so the `typeof child === "function"`
   * check already excludes it — that nested idiom stays untouched.
   */
  layer(child: LayerTier): LayerBuilder {
    if (
      typeof child === "function" &&
      (child as any).__relationalFusable !== undefined &&
      this.hasOwnFlow()
    ) {
      const fusable = (child as any).__relationalFusable as RelationalFusable;
      const anchorOpts = (this.state.finalMark as any)?.__serialize?.opts as
        | Record<string, any>
        | undefined;
      applyDefaultRelational(fusable, this.state.operators, anchorOpts);
    } else if (
      typeof child === "function" &&
      (child as any).__relationalFusable !== undefined
    ) {
      // Fusion is out of scope here (this tier has no flow of its own to
      // name — see `rejectAlongWithoutFlow`'s doc comment).
      rejectAlongWithoutFlow(
        (child as any).__relationalFusable as RelationalFusable
      );
    }
    return new LayerBuilder([this, child]);
  }

  /**
   * Offer this tier the temporal tier of `root`, the enclosing chart's root
   * tier: the last `time.sequence(...)` in its flow, if any.
   *
   * A layered tier already sees the previous tier's MARKS as its scope; the
   * clock those marks are keyframes of is part of the same scope, and a tier
   * written as `chart(selectAll("kf")).flow(group({by})).mark(time.transition())`
   * has no flow of its own to find it in. So `LayerBuilder` hands it down, the
   * same way it hands down the refs bag. A tier that owns a sequence of its
   * own keeps it (`applyDefaultRelational` sets the tier's own sequence over
   * whatever was adopted), and a transition given an explicit `at` ignores
   * this anyway (see `time.transition`), so an inherited tier never overrides
   * something written down.
   */
  adoptTimeTier(root: ChartBuilder<any, any>): void {
    const tier = findTimeTier(root.state.operators);
    if (tier === undefined) return;
    const fusable = (this.state.finalMark as any)?.__relationalFusable as
      | RelationalFusable
      | undefined;
    if (fusable?.temporal && fusable.inferred.time === undefined) {
      fusable.inferred.time = tier;
    }
  }

  /** True when this builder is an empty `Chart()` scope (its data defers to the
   *  previous tier's marks). Used by `LayerBuilder` to wire the chain. */
  usesPreviousLayerMarks(): boolean {
    return (this.state.data as unknown) === PREVIOUS_LAYER_MARKS;
  }

  /** True when this builder was built from genuine row data flowing through
   *  its own operators — i.e. NOT an empty-scope `Chart()` tier
   *  (`usesPreviousLayerMarks()`) and NOT already a refs bag (`dataIsRefs`,
   *  e.g. `chart(selectAll(...))` or
   *  `LayerBuilder.resolve()`'s `withData(prevRefs)`). This is the "current
   *  chart's own flow" boundary shared by both relational-mark default-
   *  grouping fusion guards (issue #752): `.mark()`'s (fuse a bare relational
   *  mark into an anchor + connector) and `.layer()`'s (compute the default
   *  split/travel-direction for a bare relational-mark tier). */
  private hasOwnFlow(): boolean {
    return !this.usesPreviousLayerMarks() && !dataIsRefs(this.state.data);
  }

  /** A copy of this builder with its data replaced — used by `LayerBuilder` to
   *  bind an empty `Chart()` scope to `selectAll(previousTierMarkName)`. */
  withData(data: TInput): ChartBuilder<TInput, TOutput> {
    return this.with({ data });
  }

  /** Ensure this tier's mark carries a name so a later tier can `selectAll` its
   *  nodes. Returns the (possibly renamed) builder and the effective name — an
   *  existing `.name(...)` wins; otherwise `autoName` is applied to the mark. */
  ensureNamedMark(autoName: string): {
    builder: ChartBuilder<TInput, TOutput>;
    name: string;
  } {
    if (this.state.finalMark === undefined) {
      throw new Error(
        ".layer(Chart()): the previous tier has no .mark() to inherit — add a " +
          "mark to the previous tier, or give the layer's Chart() its own data."
      );
    }
    const existing = (this.state.finalMark as any)?.__layerName;
    if (typeof existing === "string" && existing.length > 0) {
      return { builder: this, name: existing };
    }
    const named = (this.state.finalMark as any).name(autoName) as Mark<TOutput>;
    // Swap the mark in directly instead of re-entering `mark()`: `named` can
    // still carry `__relationalFusable`, and fusion was already decided (and
    // skipped) when this mark was first attached.
    return { builder: this.with({ finalMark: named }), name: autoName };
  }

  /** The chart-level config every terminal threads through to the node.
   *  `LayerBuilder` delegates to the root tier's, so a `.layer()` chain
   *  inherits it. */
  renderMeta(): RenderMeta {
    return {
      axes: this.state.options?.axes,
      legend: this.state.options?.legend,
      colorConfig: this.state.options?.color,
      coord: this.state.options?.coord,
      padding: this.state.options?.padding,
    };
  }

  /** The chart options to hand `Frame`. `Frame` picks out what it needs
   *  (`coord`/`axes`/`padding`, plus the dims when there is no `coord` and it
   *  falls through to `layer`), so this is the whole bag rather than a
   *  hand-copied key list — a list the layered path used to keep separately and
   *  would silently drop a newly added chart option from. Both the single-tier
   *  path and `LayerBuilder`'s hoisted frame read it. */
  frameOptions(): ChartOptions {
    return this.state.options ?? {};
  }

  /** A copy without the `coord` option. `LayerBuilder` uses this to HOIST the
   *  root tier's coordinate space over EVERY tier (see `LayerBuilder.resolve`),
   *  so the root tier itself must not build a second one around its own mark. */
  withoutCoord(): ChartBuilder<TInput, TOutput> {
    if (this.state.options?.coord === undefined) return this;
    const { coord: _coord, ...rest } = this.state.options;
    return this.with({ options: rest });
  }

  /** Build this chart's node. Named marks tag themselves during resolution
   *  and are collected into `layerContext` by the post-resolve walk below. */
  async resolve(): Promise<GoFishNode> {
    if (!this.state.finalMark) {
      throw new Error("Cannot resolve: no mark specified. Call .mark() first.");
    }

    let composedMark = this.state.finalMark as Mark<any>;
    for (const op of this.state.operators.toReversed()) {
      composedMark = await op(composedMark);
    }

    // Resolve a ref/selectAll used as chart data just before calling mark
    let data = this.state.data;
    if (data instanceof GoFishRef) {
      data = resolveRefData(data, this.state.layerContext) as any;
    }

    const node = await Frame(this.frameOptions(), [
      (
        await resolveMarkResult(
          composedMark(data as any, undefined, this.state.layerContext),
          this.state.layerContext
        )
      ).setShared([true, true]),
    ]);

    // Populate layerContext by walking the finished tree in DFS order.
    // Tree order = parent-iteration order (because every parent operator's
    // Promise.all preserves child order in its return array), so this is
    // deterministic regardless of how individual async legs (e.g. a Python
    // `derive` RPC) interleaved at resolution time.
    collectLayerRegistrations(node, this.state.layerContext);

    // A flow with a `time.sequence` plays DATA time: its marks enter and
    // leave with the data, so the build-in only checks this tier's
    // transitions against that clock (`src/animation/install.ts`).
    if (findTimeTier(this.state.operators) !== undefined) markDataTime(node);

    // Embed colorConfig on the node so it survives .resolve() inside Layer
    if (this.state.options?.color) {
      (node as any).colorConfig = this.state.options.color;
    }

    const result: GoFishNode = node;

    if (this.state.nodeZOrder !== undefined) {
      result.zOrder(this.state.nodeZOrder);
    }

    // A user-chained `.name(...)` names the resolved node so it's a valid
    // `.constrain(...)` target on an enclosing layer (looked up by `_name`)
    // and resolvable via cross-chart `selectAll`/`ref`. `stashLayerName` keeps
    // serialize detection consistent with named marks.
    if (this.state.nodeName !== undefined) {
      result.name(this.state.nodeName);
      stashLayerName(this, this.state.nodeName);
      const entry = (this.state.layerContext[this.state.nodeName] ??= {
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
    return this.with({ layerContext });
  }

  zOrder(value: number): ChartBuilder<TInput, TOutput> {
    return this.with({ nodeZOrder: value });
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
  return new ChartBuilder<any, any>({
    data: resolvedData,
    options: resolvedOptions,
    operators: [],
    layerContext: {},
  });
}

const CHART_OPTION_KEYS = new Set([
  "w",
  "h",
  "coord",
  "color",
  "axes",
  "legend",
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
export type LayerTier =
  | ChartBuilder<any, any>
  | LayerBuilder
  | Mark<any>
  | GoFishNode;

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
export class LayerBuilder extends RenderableBuilder {
  constructor(
    private readonly tiers: LayerTier[],
    /** The registry this builder's tiers register their names into. Empty (its
     *  own) unless an enclosing scope handed one down — see
     *  {@link withLayerContext}. */
    private readonly layerContext?: LayerContext
  ) {
    super();
  }

  /**
   * Resolve into an ENCLOSING scope's registry, the same way a `ChartBuilder`
   * tier does: the tiers still share ONE context (that is what makes each
   * tier's names visible to the next), but it is the caller's, so a
   * `.name(...)` inside this builder is findable from outside it — by a
   * sibling's `ref`/`selectAll`, or by the operator that took this builder as a
   * child. Without it a `LayerBuilder` used where a mark is taken would drop
   * its registrations on the floor.
   */
  withLayerContext(layerContext: LayerContext): LayerBuilder {
    return new LayerBuilder(this.tiers, layerContext);
  }

  /** Stack another tier; every tier is offered the previous tier's marks as
   *  scope (see the class doc for how consumption is decided). */
  layer(child: LayerTier): LayerBuilder {
    return new LayerBuilder([...this.tiers, child], this.layerContext);
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
    const sharedContext: LayerContext = this.layerContext ?? {};
    const nodes: GoFishNode[] = [];
    // The root tier's coordinate space is the CHART's space, not that one
    // tier's: a basemap under `geo(...)` and the paths layered over it must
    // share one projection, or the layer would be positioned in pixels against
    // a map it knows nothing about. So it is hoisted here — stripped from the
    // root tier and wrapped around every tier's nodes — and the coord's domain
    // inference then sees all the tiers' positions at once.
    const root = this.rootChart();
    const rootMeta = root.renderMeta();
    const hoistedCoord = rootMeta.coord;
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
        if (i === 0 && hoistedCoord !== undefined) tier = tier.withoutCoord();
        // The root tier's clock, offered to every later tier the way the
        // previous tier's marks are (see `ChartBuilder.adoptTimeTier`): a
        // transition layered over a sequence's keyframes is inside that
        // sequence's chart, even when it is written as a nested
        // `chart(selectAll(...))` pipeline.
        if (i > 0) tier.adoptTimeTier(root);
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
    const stack = await Layer({}, nodes);
    // The hoisted coordinate space wraps the whole stack, so every tier is laid
    // out in it and its domain inference sees all of their positions at once.
    const result =
      hoistedCoord !== undefined
        ? await Frame(this.rootChart().frameOptions(), [stack])
        : stack;
    const { colorConfig } = rootMeta;
    if (colorConfig) {
      (result as any).colorConfig = colorConfig;
    }
    return result;
  }

  /** The render-time config threaded from the root tier, so a `.layer()`
   *  chart inherits the root chart's axes/color options. */
  renderMeta(): RenderMeta {
    return this.rootChart().renderMeta();
  }
}

/**
 * Resolve a builder surface and prepare its render options: `axes` passed to a
 * terminal wins, falling back to the chart's own `axes` option (see
 * apps/docs/docs/js/api/core/render.md). Axis titles are inferred downstream
 * from each resolved space's `measure` (see `gofish`) — both continuous
 * (channel field) and ordinal (grouping field) spaces carry one — so no
 * field-name hint is threaded from the builder. y-up is likewise decided by
 * the root render from the resolved y space (a CONTINUOUS value axis flips, an
 * ORDINAL category axis reads top-down), not forced here (issue #143/#16).
 */
async function resolveForRender(
  this: RenderableBuilder,
  options: RenderOptions & BuildClockOptions,
  pass?: RenderPass
) {
  const node = await this.resolve();
  // The build-in: marks with enter transitions enter once, on one clock for
  // the whole chart, which the render options `playing` / `at` can hold (see
  // `src/animation/install.ts`). A chart with none is untouched. It plays on
  // the chart's first render only: a re-render (an input changed) draws the
  // marks at rest, which is the build's final frame, and the render loop
  // stops the first render's clock.
  // DECLARED SHORTCUT: marks that genuinely enter or exit on a re-render just
  // appear or vanish. The right fix is a keyed enter/update/exit join against
  // the previous render (#914).
  if (!pass?.rerender) {
    const stop = installBuildIn(node, options);
    if (stop !== undefined) pass?.onCleanup(stop);
  }
  const meta = this.renderMeta();
  return {
    node,
    options: {
      ...options,
      axes: (options.axes as AxesOptions | undefined) ?? meta.axes,
      legend: (options.legend as boolean | undefined) ?? meta.legend,
      colorConfig: meta.colorConfig,
    },
  };
}

// Define the export terminals declared on `RenderableBuilder`, once, from the
// shared registry, so both builder surfaces expose the same set. `render` goes
// through `renderWithInteraction` so resolution runs under the ambient
// interactive context and the reactive surface (live() channels, input reads in
// derive()) can register; a chart where nothing registers renders down the
// static path untouched. See terminals.ts.
attachBuilderTerminals(
  RenderableBuilder.prototype,
  resolveForRender,
  renderWithInteraction
);
