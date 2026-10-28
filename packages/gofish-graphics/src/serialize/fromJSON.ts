// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * Frontend-IR deserializer: turns a {@link Frontend.FrontendIRDocument} into
 * a live `ChartBuilder` / `Mark`. Used by the Python widget today and by
 * any JS consumer that wants to reconstruct a chart from JSON.
 *
 * The deserializer is bridge-aware but transport-agnostic. Python callbacks
 * (`derive` operators, `{ __gofish_lambda: id }` accessors, mark functions)
 * are called through the caller-supplied {@link DeriveBridge}.
 */

// Source-module imports — see the note in registry.ts.
import {
  chart,
  selectAll,
  LayerBuilder,
  PREVIOUS_LAYER_MARKS,
} from "../ast/marks/chart";
import type { AxesOptions, View } from "../ast/gofish";
import { createName, type Token } from "../ast/createName";
import { Constraint, RelateOperand } from "../ast/constraints";
import { palette, gradient } from "../families/color";
import { ref } from "../ast/shapes/ref";
import { sealComponent } from "../ast/withGoFish";
import {
  forwardInputsResolver,
  getMarkKind,
  nameableMark,
  withMarkKind,
} from "../ast/marks/createOperator";
import { Frontend } from "gofish-ir";
import { RESOLVE_ROWS } from "../ast/channels";
import { applySchema } from "../ast/schema";
import {
  callBridge,
  callForRows,
  rebuild,
  cutSlices,
  cutMark,
  offsetOp,
  type ChartBuilder,
  type DeriveBridge,
  type Mark,
  type Operator,
} from "./registry";

export type ChartSpec = Frontend.ChartIR;
export type MarkSpec = Frontend.MarkIR;
export type OperatorSpec = Frontend.OperatorIR;
/** One entry of a `label` wire array — see `Frontend.LabelSpecIR`. Named
 *  `LabelSpec` here (rather than the wire field's full `Frontend.LabelIR`
 *  union) because every reapplication site below works entry-by-entry. */
export type LabelSpec = Frontend.LabelSpecIR;
export type ConstraintSpec = Frontend.ConstraintIR;
type RelateClauseIR = Frontend.RelateClauseIR;

/**
 * What rebuilding any part of a document needs besides the part itself.
 * One object is threaded through every rebuild below, so a chart rebuilds by
 * one rule wherever it sits (the root, a mark position, a tier of a
 * `.layer(...)` chain). A mark function's reply is a document of its own,
 * so the subtree it rebuilds gets its own `tables` and `inputRefs`.
 */
export interface IRContext {
  /** Runs the Python callbacks the IR names. */
  bridge?: DeriveBridge;
  /** Mints one JS token per hygienic-name sentinel, per render. */
  resolveToken: TokenResolver;
  /** The rows of the document's charts, by the id a `{type: "table", id}`
   *  data field names. */
  tables: Frontend.Tables;
  /** The live `GoFishRef`s a mark function's input held (see
   *  `encodeInputRefs`), which an `{__inputRef: i}` sentinel in its reply
   *  resolves back to. */
  inputRefs?: any[];
}

/**
 * Rebuild one constraint clause of a `.relate()` from its IR. The wire
 * carries operand NAMES; each becomes a `RelateOperand`, which the layer
 * resolves at layout like any other, so a name that matches no node inside
 * the layer is reported there, by name.
 */
export function constraintFromIR(c: Frontend.ConstraintIR): unknown {
  const operands = c.refs.map((name) => new RelateOperand(name));
  if (c.type === "zAbove" || c.type === "zBelow") {
    return (Constraint as any)[c.type](...operands);
  }
  return (Constraint as any)[c.type](c.options, operands);
}

// ---------------------------------------------------------------------------
// Token sentinels (hygienic-name encoding from the Python wrapper)
// ---------------------------------------------------------------------------

export type TokenSentinel = { __gofish_token: string; __tag: string };
export type TokenResolver = (s: TokenSentinel) => Token;

/**
 * Build a per-render token resolver. The Python wrapper emits hygienic-name
 * sentinels of the form `{ __gofish_token, __tag }`; the first sighting
 * mints a JS `createName(tag)` Token, subsequent sightings reuse it within
 * a single render so cross-references inside a spec resolve to the same
 * runtime Token.
 */
export function makeTokenResolver(): TokenResolver {
  const cache = new Map<string, Token>();
  return (sentinel: TokenSentinel) => {
    let t = cache.get(sentinel.__gofish_token);
    if (!t) {
      t = createName(sentinel.__tag);
      cache.set(sentinel.__gofish_token, t);
    }
    return t;
  };
}

export function isTokenSentinel(v: any): v is TokenSentinel {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof v.__gofish_token === "string" &&
    typeof v.__tag === "string"
  );
}

// ---------------------------------------------------------------------------
// Bridge-sentinel unwrapping
// ---------------------------------------------------------------------------

/**
 * Build the accessor for a `{ __gofish_lambda: id }` sentinel: a Python
 * function, called through the bridge. It has only a batch form
 * ({@link RESOLVE_ROWS}): one bridge call for every input it is resolved
 * over. A channel resolves it over its rows before inference
 * (`resolveChannelAccessors` in channels.ts); a mark's `zOrder` over the
 * inputs the mark is applied to (`inputsResolver` in createOperator.ts).
 * The reply's list has one value per input, typed by `applySchema` like a
 * chart's rows (a time comes back as epoch milliseconds). Called per row, it
 * throws.
 */
function makeLambdaAccessor(lambdaId: string, bridge: DeriveBridge) {
  const accessor = () => {
    throw new Error(
      "a Python accessor was called per row; it is resolved only over a " +
        "list of inputs (a channel's rows, a zOrder's mark inputs)"
    );
  };
  return Object.assign(accessor, {
    [RESOLVE_ROWS]: async (rows: readonly unknown[]) =>
      applySchema(await callForRows(bridge, lambdaId, rows)),
  });
}

/**
 * Walk a mark's or operator's options and resolve Python-emitted lambda
 * sentinels at any depth (a top-level channel, or nested as in
 * `dims: { r: { size: … } }`).
 *
 *  - `{ __gofish_lambda: id }` becomes an `async (d) => …` arrow that
 *    RPCs into Python via the supplied bridge.
 *
 * Python's `datum(x)` emits the canonical `{type: "datum", datum: x}`
 * directly, so no unwrap step is needed for it. If no bridge is
 * supplied, lambda sentinels throw — a pure-JS consumer should never
 * emit one.
 */
export function unwrapOpts(value: any, bridge?: DeriveBridge): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => unwrapOpts(item, bridge));
  }
  if (typeof value.__gofish_lambda === "string") {
    if (bridge === undefined) {
      throw new Error(
        "encountered { __gofish_lambda } sentinel but no DeriveBridge was supplied"
      );
    }
    return makeLambdaAccessor(value.__gofish_lambda, bridge);
  }
  const out: Record<string, any> = {};
  for (const [k, val] of Object.entries(value)) {
    out[k] = unwrapOpts(val, bridge);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mark wrappers and field resolution
// ---------------------------------------------------------------------------

/**
 * Wrap a Mark so its resolved GoFishNode gets `.scope()` called. Triggered
 * by the `__scope: true` flag the Python `@mark` decorator stamps on a
 * Mark's IR. It is the mark a JS `createMark` component is: the node closed
 * as a component, with the modifiers (`.name`, `.label`, `.zOrder`,
 * `.translate`, …) and terminals of every mark on the outside, wherever it
 * sits (a root renders it directly).
 */
export function wrapWithScope(inner: any): any {
  // The same closing step a JS `createMark` component gets. (`createMark` no
  // longer names its node after the data key, since #923, so neither side
  // names here: `mapMark` chains `.name(spec.name)` when the IR has one.)
  const scoped = (m: any): Mark<any> =>
    withMarkKind(
      (async (data: any, key: any, layerContext: any) =>
        sealComponent(await m(data, key, layerContext), data)) as Mark<any>,
      getMarkKind(inner)
    );
  return nameableMark(
    forwardInputsResolver(scoped(inner), [inner], ([m]) => scoped(m))
  );
}

export function resolveNameField(
  rawName: any,
  resolveToken: TokenResolver
): string | Token | undefined {
  if (rawName == null) return undefined;
  if (isTokenSentinel(rawName)) return resolveToken(rawName);
  return rawName;
}

export function resolveRefSelection(
  selection: any,
  resolveToken: TokenResolver
): any {
  if (typeof selection === "string") return selection;
  if (Array.isArray(selection)) {
    return selection.map((seg) =>
      isTokenSentinel(seg) ? resolveToken(seg) : seg
    );
  }
  return selection;
}

// ---------------------------------------------------------------------------
// Options resolution (color, coord, …)
// ---------------------------------------------------------------------------

function resolveColorConfig(colorSpec: Record<string, any>): any {
  if (colorSpec._tag === "palette") return palette(colorSpec.values);
  if (colorSpec._tag === "gradient") return gradient(colorSpec.stops);
  return colorSpec;
}

function resolveCoordConfig(coordSpec: Record<string, any>): any {
  const { type, ...opts } = coordSpec;
  const coord = rebuild("coord", type, opts);
  if (coord === undefined) {
    throw new Error(`Unknown coord type: ${String(type)}`);
  }
  return coord;
}

/** A `SelectRefIR` as the ref it stands for: `mode` "all" is
 *  `selectAll(layer)` (every node), "one" or absent is `ref(layer)` (one). */
export const refOfSelect = (spec: { layer: string; mode?: string }) =>
  spec.mode === "all" ? selectAll(spec.layer) : ref(spec.layer);

/**
 * The options of a construct with each field whose declared type names nodes
 * (`Frontend.NodeSelectionIR`, a blob's `avoiding` inside `shape`) rebuilt as
 * the refs it stands for: a list of `{ type: "ref", selection }` becomes a
 * list of `ref(selection)`, and a `{ type: "select", layer, mode: "all" }`
 * becomes `selectAll(layer)`. The walk follows the descriptor table
 * (`Frontend.mapHeldNodes`); other fields are as given.
 */
export function resolveNodeRefs(
  kind: Frontend.NodeKind,
  type: string,
  opts: Record<string, any>,
  resolveToken: TokenResolver
): Record<string, any> {
  const accepted = Frontend.acceptedFields(kind, type);
  if (accepted === undefined) return opts;
  return resolveHeldNodes(accepted, opts, resolveToken);
}

/** `opts` with the nodes held by the fields `accepted` declares rebuilt as
 *  refs: a construct's options ({@link resolveNodeRefs}), or one `.label()`
 *  call's (`Frontend.LABEL_OPTIONS`). */
function resolveHeldNodes(
  accepted: Readonly<Record<string, { type: Frontend.FieldType }>>,
  opts: Record<string, any>,
  resolveToken: TokenResolver
): Record<string, any> {
  const nodes = (v: any): any =>
    Array.isArray(v)
      ? v.map((r) => ref(resolveRefSelection(r.selection, resolveToken)))
      : refOfSelect(v);
  const out: Record<string, any> = { ...opts };
  for (const [key, value] of Object.entries(opts)) {
    const field = accepted[key];
    if (field !== undefined)
      out[key] = Frontend.mapHeldNodes(field.type, value, nodes);
  }
  return out;
}

export function resolveOptions(raw: Record<string, any>): Record<string, any> {
  const resolved: Record<string, any> = { ...raw };
  if (
    resolved.color &&
    typeof resolved.color === "object" &&
    "_tag" in resolved.color
  ) {
    resolved.color = resolveColorConfig(resolved.color);
  }
  if (
    resolved.coord &&
    typeof resolved.coord === "object" &&
    "type" in resolved.coord
  ) {
    resolved.coord = resolveCoordConfig(resolved.coord);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Deserializers
// ---------------------------------------------------------------------------

/** Build a single operator from its IR spec. `label` is either an array of
 *  label specs (one `.label(accessor, options?)` call per entry, applied in
 *  order so repeated calls round-trip) or the boolean suppression shorthand
 *  (`label: false`, e.g. Ribbon's `stack({..., label: false})`) — normalized
 *  to a one-element array here so both shapes share the same reapplication
 *  loop; destructuring `accessor`/options off a boolean primitive yields
 *  `undefined`/`{}`, reproducing the pre-array-form suppression behavior. */
export function mapOperator(
  op: OperatorSpec,
  bridge?: DeriveBridge,
  resolveToken: TokenResolver = makeTokenResolver()
): Operator<any, any> | null {
  const { type, translate, label, ...opts } = op as Record<string, any>;
  let operator = rebuild("operator", type as string, unwrapOpts(opts, bridge), {
    bridge,
  });
  if (operator === undefined) return null;
  if (
    operator &&
    label !== undefined &&
    typeof (operator as any).label === "function"
  ) {
    const specs = Array.isArray(label) ? label : [label];
    for (const spec of specs) {
      const { accessor, ...labelOpts } = spec as { accessor: any } & Record<
        string,
        any
      >;
      operator = (operator as any).label(
        accessor,
        Object.keys(labelOpts).length > 0
          ? resolveHeldNodes(Frontend.LABEL_OPTIONS, labelOpts, resolveToken)
          : undefined
      );
    }
  }
  if (
    operator &&
    translate &&
    typeof (operator as any).translate === "function"
  ) {
    return (operator as any).translate(translate);
  }
  return operator;
}

/**
 * Map an array of combinator-child mark specs to runtime children, expanding
 * any `cut` child into its N slice nodes IN PLACE. The pure `cut(source, opts)`
 * returns a `Promise<GoFishNode>[]`, which combinators (Spread/Stack/…) accept
 * directly as children — so the single source of truth for cut's extent
 * resolution (flexbox sizing, absolute-vs-weight mixing, measure-unit checks)
 * stays in JS and is never reimplemented Python-side. Non-`cut` children map
 * through `mapMark` unchanged.
 *
 * The returned array mixes `Mark` functions and resolved slice-node promises;
 * the combinator factories tolerate both (the pure-JS `Spread(opts, cut(...))`
 * spelling relies on the same tolerance).
 */
export function mapMarkChildren(specs: MarkSpec[], ctx: IRContext): any[] {
  const out: any[] = [];
  for (const child of specs as any[]) {
    if (child && child.type === "cut") {
      const sourceMark = mapMark(child.source, ctx);
      // Pure cut requires an array `size`; the field-name-string sugar is only
      // valid in the chart `.mark(cut(...))` (data-bound expand) form.
      const slices = cutSlices(sourceMark as any, {
        dir: child.dir,
        size: unwrapOpts(child.size, ctx.bridge),
        inset: child.inset,
      });
      out.push(...slices);
    } else {
      out.push(mapMark(child as MarkSpec, ctx));
    }
  }
  return out;
}

/**
 * Rebuild the clauses of a `.relate()` callback, in order: a constraint
 * (it carries `refs`, operand names) through {@link constraintFromIR}, a mark
 * that draws like any other mark.
 */
function relateClauses(clauses: RelateClauseIR[], ctx: IRContext): unknown[] {
  return clauses.map((c) =>
    Frontend.isConstraintIR(c)
      ? constraintFromIR(c)
      : mapMark(c as MarkSpec, ctx)
  );
}

/** Build a single mark from its IR spec. Recurses into combinator children.
 *  `ctx.inputRefs`, when supplied, is the array of real `GoFishRef`s a mark-fn's
 *  input held — an `{__inputRef: i}` sentinel anywhere in the (possibly
 *  Python-returned) mark tree resolves back to `inputRefs[i]`, letting a
 *  Python mark-fn embed the ref it was handed directly in its returned
 *  layout (mirrors JS `spread({...}, [d[0], text(...)])`). */
export function mapMark(markSpec: MarkSpec, ctx: IRContext): Mark<any> {
  const mark = buildMark(markSpec, ctx);
  if (!("__datum" in markSpec)) return mark;
  // A mark applied to its input, the JS `mark(d, key)` (Python
  // `mark(d, key)`, which writes `__datum` and `__key`): what it holds
  // is the node the mark builds from `d`, whatever rows the position it
  // sits in offers.
  const { __datum: datum, __key: key } =
    markSpec as Frontend.MarkBridgeFieldsIR;
  const appliedToDatum = (m: any): Mark<any> =>
    (async (_data: any, _key: any, layerContext: any) =>
      m(datum, key ?? undefined, layerContext)) as Mark<any>;
  // However many inputs it is applied to, the mark is applied to its `__datum` alone.
  return forwardInputsResolver(
    appliedToDatum(mark),
    [mark],
    ([m]) => appliedToDatum(m),
    () => [datum]
  );
}

/**
 * `mark` with the modifiers its IR carries, chained in the order a JS
 * author writes them: `.translate(...)`, `.name(...)`, `.zOrder(...)`. A
 * `zOrder` is a number, or a Python function (`{__gofish_lambda}`), which
 * the mark resolves over the inputs it is applied to (`inputsResolver`),
 * as it calls a JS `.zOrder((d) => ...)` per input.
 */
function withMarkMeta<M>(
  mark: M,
  spec: { translate?: unknown; name?: unknown; zOrder?: unknown },
  ctx: IRContext
): M {
  let out: any = mark;
  if (spec.translate && typeof out.translate === "function") {
    out = out.translate(spec.translate);
  }
  const name = resolveNameField(spec.name as any, ctx.resolveToken);
  if (name != null && typeof out.name === "function") out = out.name(name);
  if (spec.zOrder != null && typeof out.zOrder === "function") {
    out = out.zOrder(unwrapOpts(spec.zOrder, ctx.bridge));
  }
  return out;
}

/** {@link mapMark}, before a mark is applied to its input. */
function buildMark(markSpec: MarkSpec, ctx: IRContext): Mark<any> {
  const { bridge, resolveToken, inputRefs } = ctx;
  const spec = markSpec as any;

  // `{__inputRef: i}` sentinel — round-trip back to the real `GoFishRef` a
  // mark-fn's input held (see `encodeInputRefs` in registry.ts), rather than
  // reconstructing a new mark from the spec.
  if (typeof spec.__inputRef === "number") {
    if (!inputRefs) {
      throw new Error(
        "encountered an { __inputRef } sentinel but no input refs were supplied " +
          "— this mark tree must be returned from a mark-fn invocation"
      );
    }
    const inputRef = inputRefs[spec.__inputRef];
    // `.name(...)` on the Python `_InputRef` (issue #556) — `GoFishRef.name()`
    // mutates in place and returns `this`, so this renames the SAME live ref
    // the rest of the tree already shares (e.g. the stem/bar this ref also
    // points at), letting an enclosing `.layer([...]).relate(...)` target
    // it by name.
    if (spec.name != null && typeof (inputRef as any)?.name === "function") {
      (inputRef as any).name(resolveNameField(spec.name, resolveToken));
    }
    return inputRef;
  }

  // A whole chart in a mark position (`.mark(chart(...))`, a
  // `layer([rect(...), chart(...)])` child): rebuild the same `chart(...)`
  // object a JS author writes there, unresolved, so the mark machinery treats
  // it as it treats the JS one (an empty `chart()` scope inherits the rows of
  // the partition it sits in). A chart with rows of its own names its table,
  // as it does at the root. A layer of charts is the `layer` combinator below.
  if (Frontend.isChartIR(spec)) {
    return chartFromIR(spec, ctx) as unknown as Mark<any>;
  }

  // A `.layer(...)` chain, wherever it sits (#1181): rebuild it through the
  // real `LayerBuilder`, the way a JS author writes it, so JS owns the
  // chain's tier wiring and render logic (inferred axis titles, the root
  // tier's `axes`). Each tier is a mark position. In a mark position, the
  // mark machinery binds a first tier with `previous-tier` data to the rows
  // of the partition the chain sits in, as it does an empty `chart()`.
  if (Frontend.isLayerChainIR(spec)) {
    const [first, ...rest] = spec.tiers.map((tier) => mapMark(tier, ctx));
    return rest.reduce(
      (chain: any, tier) => chain.layer(tier),
      first
    ) as unknown as Mark<any>;
  }

  // Mark-as-function: Python registered a `(data) -> mark | chart` callback.
  // The JS Mark calls it through the bridge per invocation. The reply is a
  // document like the top-level one: its root is the mark-position IR of
  // what the callback returned (a mark, a chart or a layer), and its tables
  // are the ones that IR's charts name, by ids of the reply's own. So it
  // rebuilds here like any other mark position, with the reply's tables and
  // the refs this call was given. Like a JS mark function's result, it is
  // returned unresolved: the caller, `resolveMarkResult`, resolves a Mark, a
  // ChartBuilder or a LayerBuilder.
  if (spec.type === "mark-fn") {
    const lambdaId = spec.lambdaId as string;
    if (!bridge) {
      throw new Error(
        "mark-fn spec encountered but no DeriveBridge was supplied"
      );
    }
    return (async (data: any, _key: any, _layerContext: any) => {
      const { reply, inputRefs } = await callBridge(bridge, lambdaId, data);
      return mapMark(reply.root as MarkSpec, {
        ...ctx,
        // A drawn IR's tables are its charts' rows.
        tables: (reply.tables ?? {}) as Frontend.Tables,
        inputRefs,
      });
    }) as unknown as Mark<any>;
  }

  // Leaf-form `ref(name)` — not a combinator, not a mark factory.
  if (spec.type === "ref" && !spec.__combinator) {
    const refNode = ref(resolveRefSelection(spec.selection, resolveToken));
    // A named ref stand-in, `ref(token).name("a")`. GoFishRef's
    // `.name()` mutates in place and returns `this`, making the ref a
    // relate operand of the enclosing layer (RefMarkIR carries `name`;
    // mirrors the __inputRef rename branch above).
    if (spec.name != null) {
      (refNode as any).name(resolveNameField(spec.name, resolveToken));
    }
    // Named in place above, so only its translate is chained.
    return withMarkMeta(
      refNode as unknown as Mark<any>,
      {
        translate: spec.translate,
      },
      ctx
    );
  }

  // `offset` node: shift a single child by (x, y) render-pixels. Maps to the
  // public `offset` operator, which accepts a Mark child and resolves it.
  if (spec.type === "offset") {
    const childSpecs = (spec.children ?? []) as MarkSpec[];
    const [childMark] = mapMarkChildren(childSpecs, ctx);
    return withMarkMeta(
      offsetOp({ x: spec.x, y: spec.y }, [
        childMark as any,
      ]) as unknown as Mark<any>,
      spec,
      ctx
    );
  }

  // `cut` mark in a chart `.mark(...)` position → the expand-mark form
  // (`cutMark`). The data-bound expand path treats it as an expand mark; the
  // field-name-string `size` sugar resolves per-row here. (A `cut` used as a
  // combinator CHILD is instead expanded into its N slice nodes IN PLACE — see
  // `mapMarkChildren` — so extent resolution lives in ONE place, JS-side.)
  if (spec.type === "cut") {
    const sourceMark = mapMark(spec.source as MarkSpec, ctx);
    const mark = cutMark({
      source: sourceMark as any,
      dir: spec.dir,
      size: unwrapOpts(spec.size, bridge),
      inset: spec.inset,
    });
    return withMarkMeta(mark, spec, ctx);
  }

  // Combinator-form marks: a layout operator (`spread`, `layer`, `arrow`,
  // `treemap`, Porter-Duff) used as a mark, with explicit nested children.
  if (spec.__combinator) {
    const childMarks = mapMarkChildren(
      (spec.children ?? []) as MarkSpec[],
      ctx
    );
    // Resolve color/coord configs (e.g. a `layer({coord: polar()})` carries
    // its coord transform in the combinator options, not chart options).
    const opts = resolveNodeRefs(
      "combinator-mark",
      spec.type,
      resolveOptions(unwrapOpts(spec.options ?? {}, bridge)),
      resolveToken
    );
    let mark = rebuild("combinator-mark", spec.type, opts, {
      children: childMarks,
    });
    if (mark === undefined) {
      throw new Error(`Unknown combinator mark type: ${spec.type}`);
    }
    if (spec.relate && typeof (mark as any).relate === "function") {
      // Rebuilt per call: a `ref(...)` clause is a live GoFishRef that
      // `.name()` mutates in place, so calls must not share one.
      const clauses = spec.relate as RelateClauseIR[];
      mark = (mark as any).relate(() => relateClauses(clauses, ctx));
    }
    if (spec.__scope) {
      mark = wrapWithScope(mark);
    }
    return withMarkMeta(mark, spec, ctx);
  }

  // `name` and `zOrder` are not factory options: `withMarkMeta` applies them
  // below.
  const { type, name: _name, zOrder: _zOrder, ...rest } = spec as any;
  // Label is an array of `{accessor, ...opts}` specs — pull out and call the
  // chained `.label(accessor, opts)` method once per entry, in order, so
  // repeated `.label()` calls round-trip (adds one external label layer per
  // call). The legacy boolean shorthand (mark shapes interpreting `label:
  // true` themselves) was removed; `.label()` is the only surviving form
  // for marks. A non-array `label` (e.g. a stray boolean) is left inert in
  // `opts`, matching the pre-array-form fallback.
  let labelSpecs: LabelSpec[] | undefined;
  let opts: Record<string, any>;
  if (Array.isArray(rest.label)) {
    const { label: specs, ...rest2 } = rest;
    labelSpecs = specs as LabelSpec[];
    opts = rest2;
  } else {
    opts = rest;
  }

  let mark = rebuild(
    "leaf-mark",
    type as string,
    resolveNodeRefs(
      "leaf-mark",
      type as string,
      unwrapOpts(opts, bridge),
      resolveToken
    )
  );
  if (mark === undefined) {
    throw new Error(`Unknown mark type: ${String(type)}`);
  }
  if (labelSpecs && typeof (mark as any).label === "function") {
    for (const labelObj of labelSpecs) {
      const { accessor, ...labelOpts } = labelObj;
      mark = (mark as any).label(
        accessor,
        Object.keys(labelOpts).length > 0
          ? resolveHeldNodes(Frontend.LABEL_OPTIONS, labelOpts, resolveToken)
          : undefined
      );
    }
  }
  if (spec.__scope) {
    mark = wrapWithScope(mark);
  }
  return withMarkMeta(mark, spec, ctx);
}

/**
 * Read JSON IR as it arrives: parse it if it is JSON text, and turn its
 * tagged non-finite numbers (`{ "$numberDouble": "Infinity" }`, written by
 * `toJSON` and Python's `to_ir()`) back into numbers. It is the JSON codec's
 * read, so it applies where the JSON encoding put the tags: a whole JSON
 * document, or, in a document a Python host ships, every part but its
 * Arrow tables (`decodeDocument` in gofish-python's `arrowBridge.ts`, which
 * decodes a bridge call's reply the same way). `buildIR` takes a document
 * read this way.
 */
export function readIR<T = any>(json: T | string): T {
  return Frontend.decodeNonFinite(
    typeof json === "string" ? (JSON.parse(json) as T) : json
  );
}

/**
 * A chart's data, by its IR: the rows of the table it names (an array that
 * may carry column types, `setColumnTypes`, which the chart reads as it reads
 * its own `schema`'s, and its `schema` wins), a selection of named marks, or
 * the empty scope, which `LayerBuilder` (or the mark machinery, in a mark
 * position) binds to the rows of the enclosing scope.
 */
function dataFromIR(data: Frontend.DataIR, ctx: IRContext): unknown {
  switch (data.type) {
    case "table": {
      const rows = ctx.tables[data.id];
      if (rows === undefined) {
        throw new Error(
          `a chart names table "${data.id}", which its payload does not carry`
        );
      }
      return rows;
    }
    case "select":
      return refOfSelect(data);
    case "previous-tier":
      return PREVIOUS_LAYER_MARKS;
    default:
      throw new Error(
        `unknown chart data type ${JSON.stringify((data as any).type)}`
      );
  }
}

/** Rebuild a chart from its IR, wherever it sits: the same `chart(...)`
 *  builder a JS author writes there. */
function chartFromIR(chartSpec: ChartSpec, ctx: IRContext): ChartBuilder<any> {
  const operators: Operator<any, any>[] = [];
  for (const opSpec of (chartSpec.operators ?? []) as OperatorSpec[]) {
    const op = mapOperator(opSpec, ctx.bridge, ctx.resolveToken);
    if (op) operators.push(op);
  }
  const mark = mapMark(chartSpec.mark, ctx);
  const resolvedOptions = resolveOptions(
    ((chartSpec as any).options ?? {}) as Record<string, any>
  );
  const chartData = dataFromIR(chartSpec.data, ctx);

  // Cast the flow chain: `chart(...).flow(...).mark(...)` is typed with
  // operator-/mark-input/output relationships the runtime deserializer
  // can't statically reconstruct. The widget did the same.
  let builder = (chart as any)(chartData, resolvedOptions)
    .flow(...operators)
    .mark(mark);
  // The chart-level modifiers `.zOrder(n)` and `.name(n)` (the name lets a
  // sibling `layer([...]).relate(...)` or a cross-chart `selectAll(n)` refer
  // to this chart).
  const zOrder = (chartSpec as any).zOrder as number | undefined;
  const name = resolveNameField((chartSpec as any).name, ctx.resolveToken);
  if (zOrder === undefined && name == null) return builder;
  // A relational mark (line/ribbon) over row data fuses into an anchor tier
  // plus a connector tier, so `.mark()` returns a LayerBuilder, which has
  // neither modifier. JS cannot spell `chart(rows).mark(line()).name(...)`
  // either, so this is a gap in the language, reported the same way for both.
  if (builder instanceof LayerBuilder) {
    const used = [
      zOrder !== undefined && ".zOrder()",
      name != null && ".name()",
    ]
      .filter(Boolean)
      .join(" and ");
    throw new Error(
      `${used} on a chart whose relational mark (line/ribbon) fuses into a ` +
        `layer: the fused chart is a LayerBuilder, which has no ${used}, in ` +
        `JS as in Python.`
    );
  }
  if (zOrder !== undefined) builder = builder.zOrder(zOrder);
  if (name != null) builder = builder.name(name);
  return builder;
}

/**
 * Render options a host supplies beside the IR document: the arguments of
 * the Python `.render(...)` call. A field left undefined lets the document
 * decide (a chart's own `axes` option, the default padding). These are the
 * JS `.render(container, options)` options.
 */
export interface RenderIROptions {
  w?: number;
  h?: number;
  axes?: AxesOptions;
  legend?: boolean;
  padding?: number;
  debug?: boolean;
}

/** Drop undefined fields, so a render option the host left unset is absent
 *  rather than present-and-undefined. */
function definedFields<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

/**
 * Rebuild a frontend-IR document, as read ({@link readIR} for a JSON
 * document; a Python host's `decodeDocument`, which also decodes its Arrow
 * tables), into the object a JS author would have written for its root: a
 * `ChartBuilder`, a `LayerBuilder`, or a mark. A root holds anything a mark
 * position does, so it rebuilds as one ({@link mapMark}), reading the
 * document's `tables` (a table may carry column types, `setColumnTypes`,
 * which the chart reads as it reads its own `schema`'s, and its `schema`
 * wins). `bridge` runs the Python callbacks the IR names, and answers each
 * call with its reply read the same way. Building throws synchronously on a
 * bad document.
 */
export function buildIR(
  doc: Frontend.FrontendIRDocument,
  bridge?: DeriveBridge
): any {
  return mapMark(doc.root, {
    bridge,
    resolveToken: makeTokenResolver(),
    tables: doc.tables ?? {},
  });
}

/**
 * Render a frontend-IR document into `container` ({@link buildIR}, then its
 * root's `.render`). This is the one entry point both Python hosts use: the
 * notebook widget (anywidget traitlets) and the parity harness (HTTP), each
 * with its tables decoded from Arrow and a bridge over its own transport.
 * The returned promise settles with the {@link View} once the chart has
 * rendered.
 */
export function renderIR(
  doc: Frontend.FrontendIRDocument,
  container: HTMLElement,
  renderOptions: RenderIROptions,
  bridge?: DeriveBridge
): Promise<View> {
  const options: any = definedFields({ ...renderOptions });
  return buildIR(doc, bridge).render(container, options);
}
