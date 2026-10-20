// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * Frontend-IR deserializer: turns a {@link Frontend.FrontendIRDocument} into
 * a live `ChartBuilder` / `Mark`. Used by the Python widget today and by
 * any JS consumer that wants to reconstruct a chart from JSON.
 *
 * The deserializer is bridge-aware but transport-agnostic. Python lambdas
 * (`{ __gofish_lambda: id }` sentinels and `derive` operators) are resolved
 * via the caller-supplied {@link DeriveBridge}.
 */

// Source-module imports — see the note in registry.ts.
import {
  chart,
  layer,
  selectAll,
  LayerBuilder,
  PREVIOUS_LAYER_MARKS,
} from "../ast/marks/chart";
import type { AxesOptions, View } from "../ast/gofish";
import { createName, type Token } from "../ast/createName";
import { Constraint, RelateOperand } from "../ast/constraints";
import { palette, gradient } from "../families/color";
import { ref } from "../ast/shapes/ref";
import { GoFishRef } from "../ast/_ref";
import { sealComponent } from "../ast/withGoFish";
import { resolveMarkResult } from "../ast/marks/markResult";
import { Frontend } from "gofish-ir";
import { RESOLVE_ROWS } from "../ast/channels";
import {
  applyLambdaTyped,
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
export type LayerSpec = Frontend.LayerIR;
export type RawMarkSpec = Frontend.RawMarkIR;
export type MarkSpec = Frontend.MarkIR;
export type OperatorSpec = Frontend.OperatorIR;
/** One entry of a `label` wire array — see `Frontend.LabelSpecIR`. Named
 *  `LabelSpec` here (rather than the wire field's full `Frontend.LabelIR`
 *  union) because every reapplication site below works entry-by-entry. */
export type LabelSpec = Frontend.LabelSpecIR;
export type ConstraintSpec = Frontend.ConstraintIR;
type RelateClauseIR = Frontend.RelateClauseIR;

/**
 * What rebuilding any part of an IR payload needs besides the part itself.
 * One object is threaded through every rebuild below, so a chart rebuilds by
 * one rule wherever it sits (the root, a mark position, a tier of a
 * `.layer(...)` chain).
 */
export interface IRContext {
  /** Runs the Python callbacks the IR names. */
  bridge?: DeriveBridge;
  /** Mints one JS token per hygienic-name sentinel, per render. */
  resolveToken: TokenResolver;
  /** The rows of the payload's charts, by the id a `{type: "table", id}`
   *  data field names. A mark function's reply is a payload of its own, so
   *  the subtree it rebuilds reads the reply's tables. */
  tables: Frontend.Tables;
  /** The live `GoFishRef`s a mark function was called with, which an
   *  `{__inputRef: i}` sentinel in its reply resolves back to. */
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
 * Build the accessor for a `{ __gofish_lambda: id }` sentinel. It has only a
 * batch form ({@link RESOLVE_ROWS}): the mark and operator factories resolve
 * it before channel inference (`resolveChannelAccessors` in channels.ts) with
 * one `applyLambdaTyped(bridge, id, rows)` call for all of its rows, typed
 * like any other callback result (a time comes back as epoch milliseconds).
 * That call is the one place a Python accessor crosses the bridge. Called per row, it throws: a
 * Python accessor works only in a channel.
 */
function makeLambdaAccessor(lambdaId: string, bridge: DeriveBridge) {
  const accessor = () => {
    throw new Error(
      "a Python accessor was called per row; it is resolved only in a channel"
    );
  };
  return Object.assign(accessor, {
    [RESOLVE_ROWS]: (rows: readonly unknown[]) =>
      applyLambdaTyped(bridge, lambdaId, [...rows]),
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

/** Bridge-free variant for callsites that never see lambda sentinels. */
export function unwrapValues(value: any): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(unwrapValues);
  const out: Record<string, any> = {};
  for (const [k, val] of Object.entries(value)) {
    out[k] = unwrapValues(val);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mark wrappers and field resolution
// ---------------------------------------------------------------------------

/**
 * Wrap a Mark so its resolved GoFishNode gets `.scope()` called. Triggered
 * by the `__scope: true` flag the Python `@mark` decorator stamps on a
 * Mark's IR. Forwards `.name` / `.label` / `.render` / `.relate` so the
 * scoped mark still behaves as a `NameableMark` for the raw-mark render path.
 */
export function wrapWithScope(inner: any): any {
  // The same closing step a JS `createMark` component gets. (`createMark` no
  // longer names its node after the data key, since #923, so neither side
  // names here: `mapMark` chains `.name(spec.name)` when the IR has one.)
  const wrapped: any = async (data: any, key: any, layerContext: any) =>
    sealComponent(await inner(data, key, layerContext), data);
  const define = (key: string, value: any) =>
    Object.defineProperty(wrapped, key, {
      value,
      writable: true,
      configurable: true,
    });
  if (typeof inner.render === "function") {
    define("render", async (container: any, options: any) => {
      const node: any = await resolveMarkResult(wrapped);
      return node.render(container, options);
    });
  }
  for (const key of ["name", "label", "relate"] as const) {
    if (typeof inner[key] === "function") {
      define(key, (...args: any[]) => wrapWithScope(inner[key](...args)));
    }
  }
  return wrapped;
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
  bridge?: DeriveBridge
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
        Object.keys(labelOpts).length > 0 ? labelOpts : undefined
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
 * that draws like any other mark. Shared by the `layer` combinator mark and
 * the `LayerIR` root (see {@link renderIR}).
 */
function relateClauses(clauses: RelateClauseIR[], ctx: IRContext): unknown[] {
  return clauses.map((c) =>
    Frontend.isConstraintIR(c)
      ? constraintFromIR(c)
      : mapMark(c as MarkSpec, ctx)
  );
}

/**
 * Serialize a mark-fn's input array for the RPC bridge. Each `GoFishRef` (the
 * shape `.flow(group(...)).mark((refs) => ...)` hands the callback — see
 * `createRelationalMark`'s `by`-split bag form and `createOperator.ts`'s
 * per-item `applyMark`) can't cross JSON as-is (it's a live class instance
 * over the render's layer registry), so it's replaced with an
 * `{__inputRef: i, datum}` sentinel carrying just its bound datum. The
 * Python wrapper reconstructs an `_InputRef` Mark from the sentinel so
 * `d[0].datum` reads naturally, and can round-trip `d[0]` itself back into a
 * returned mark tree (`resolveInputRefs` below undoes the substitution using
 * the same index against the original `GoFishRef` array). Plain data rows
 * (the pre-#591 mark-fn contract, e.g. Scatter's pie-glyph story) pass
 * through unchanged.
 */
function serializeMarkFnInput(items: any[]): {
  rows: any[];
  inputRefs?: any[];
} {
  if (!items.some((item) => item instanceof GoFishRef)) {
    return { rows: items };
  }
  const rows = items.map((item, i) =>
    item instanceof GoFishRef ? { __inputRef: i, datum: item.datum } : item
  );
  return { rows, inputRefs: items };
}

/** Build a single mark from its IR spec. Recurses into combinator children.
 *  `ctx.inputRefs`, when supplied, is the array of real `GoFishRef`s a mark-fn
 *  was invoked with — an `{__inputRef: i}` sentinel anywhere in the (possibly
 *  Python-returned) mark tree resolves back to `inputRefs[i]`, letting a
 *  Python mark-fn embed the ref it was handed directly in its returned
 *  layout (mirrors JS `spread({...}, [d[0], text(...)])`). */
export function mapMark(markSpec: MarkSpec, ctx: IRContext): Mark<any> {
  const { bridge, resolveToken, inputRefs } = ctx;
  const spec = markSpec as any;
  const applyTranslate = <T>(mark: T): T =>
    spec.translate && typeof (mark as any).translate === "function"
      ? ((mark as any).translate(spec.translate) as T)
      : mark;

  // `{__inputRef: i}` sentinel — round-trip back to the real `GoFishRef` a
  // mark-fn was invoked with (see `serializeMarkFnInput`), rather than
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

  // Mark-as-function: Python registered a `(data) -> mark | chart` callback.
  // The JS Mark calls it through the bridge per invocation. The reply is a
  // payload like the top-level one: the mark-position IR of what the callback
  // returned (a mark or a chart; a layer of charts is a mark) and the tables
  // its charts name, by ids of the reply's own. So it rebuilds here like any
  // other mark position, reading the reply's tables. Like a JS mark
  // function's result, it is returned unresolved: the caller,
  // `resolveMarkResult`, resolves a Mark, a ChartBuilder or a LayerBuilder.
  if (spec.type === "mark-fn") {
    const lambdaId = spec.lambdaId as string;
    if (!bridge) {
      throw new Error(
        "mark-fn spec encountered but no DeriveBridge was supplied"
      );
    }
    return (async (data: any, _key: any, _layerContext: any) => {
      const { rows, inputRefs: newInputRefs } = serializeMarkFnInput(data);
      const reply = await bridge.applyMark(lambdaId, rows);
      return mapMark(reply.ir, {
        ...ctx,
        tables: reply.tables,
        inputRefs: newInputRefs,
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
    return applyTranslate(refNode as unknown as Mark<any>);
  }

  // `offset` node: shift a single child by (x, y) render-pixels. Maps to the
  // public `offset` operator, which accepts a Mark child and resolves it.
  if (spec.type === "offset") {
    const childSpecs = (spec.children ?? []) as MarkSpec[];
    const [childMark] = mapMarkChildren(childSpecs, ctx);
    return applyTranslate(
      offsetOp({ x: spec.x, y: spec.y }, [
        childMark as any,
      ]) as unknown as Mark<any>
    );
  }

  // `cut` mark in a chart `.mark(...)` position → the expand-mark form
  // (`cutMark`). The data-bound expand path treats it as an expand mark; the
  // field-name-string `size` sugar resolves per-row here. (A `cut` used as a
  // combinator CHILD is instead expanded into its N slice nodes IN PLACE — see
  // `mapMarkChildren` — so extent resolution lives in ONE place, JS-side.)
  if (spec.type === "cut") {
    const sourceMark = mapMark(spec.source as MarkSpec, ctx);
    let mark = cutMark({
      source: sourceMark as any,
      dir: spec.dir,
      size: unwrapOpts(spec.size, bridge),
      inset: spec.inset,
    });
    mark = applyTranslate(mark);
    const nameVal = resolveNameField(spec.name, resolveToken);
    if (nameVal != null && typeof (mark as any).name === "function") {
      mark = (mark as any).name(nameVal);
    }
    if (
      typeof spec.zOrder === "number" &&
      typeof (mark as any).zOrder === "function"
    ) {
      mark = (mark as any).zOrder(spec.zOrder);
    }
    return mark;
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
    const opts = resolveOptions(unwrapOpts(spec.options ?? {}, bridge));
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
    mark = applyTranslate(mark);
    const nameVal = resolveNameField(spec.name, resolveToken);
    if (nameVal != null && typeof (mark as any).name === "function") {
      mark = (mark as any).name(nameVal);
    }
    if (
      typeof spec.zOrder === "number" &&
      typeof (mark as any).zOrder === "function"
    ) {
      mark = (mark as any).zOrder(spec.zOrder);
    }
    return mark;
  }

  const { type, name: layerName, ...rest } = spec as any;
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

  let mark = rebuild("leaf-mark", type as string, unwrapOpts(opts, bridge));
  if (mark === undefined) {
    throw new Error(`Unknown mark type: ${String(type)}`);
  }
  if (labelSpecs && typeof (mark as any).label === "function") {
    for (const labelObj of labelSpecs) {
      const { accessor, ...labelOpts } = labelObj;
      mark = (mark as any).label(
        accessor,
        Object.keys(labelOpts).length > 0 ? labelOpts : undefined
      );
    }
  }
  if (spec.__scope) {
    mark = wrapWithScope(mark);
  }
  mark = applyTranslate(mark);
  const nameVal = resolveNameField(layerName, resolveToken);
  if (nameVal != null && typeof (mark as any).name === "function") {
    mark = (mark as any).name(nameVal);
  }
  if (
    typeof spec.zOrder === "number" &&
    typeof (mark as any).zOrder === "function"
  ) {
    mark = (mark as any).zOrder(spec.zOrder);
  }
  if ("__datum" in spec) {
    const boundDatum = spec.__datum;
    const boundKey = spec.__key ?? undefined;
    const inner = mark as any;
    mark = (async (_data: any, _key: any, layerContext: any) =>
      inner(boundDatum, boundKey, layerContext)) as Mark<any>;
  }
  return mark;
}

/**
 * Read an IR document (or any part of one, such as a derive response) as it
 * arrives: parse it if it is JSON text, and turn its tagged non-finite
 * numbers (`{ "$numberDouble": "Infinity" }`, written by `toJSON` and Python's
 * `to_ir()`) back into numbers. Each entry point decodes once: `renderIR` its
 * root, `buildChart` its arguments, and a JSON bridge its replies. The
 * builders below take what this returns.
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
      // `mode` discriminates the plural selectAll() (array of refs) from the
      // singular ref() (a single ref). Missing/"one" → ref(layer).
      return data.mode === "all" ? selectAll(data.layer) : ref(data.layer);
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
    const op = mapOperator(opSpec, ctx.bridge);
    if (op) operators.push(op);
  }
  // A mark function's `inputRefs` belong to the mark tree it returned, not to
  // a chart nested in it, whose marks get rows of their own.
  const mark = mapMark(chartSpec.mark, { ...ctx, inputRefs: undefined });
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

/** Where the parts of a render that are not in the IR root come from. */
export interface IRHost {
  /** Runs the Python callbacks the IR names (derive operators, lambda
   *  accessors, mark functions). */
  bridge?: DeriveBridge;
  /** The rows of every chart in the IR that has rows of its own, by the id
   *  its `{type: "table", id}` data names: a document's `tables`, or the
   *  Python hosts' Arrow tables, decoded. A table may carry column types
   *  (`setColumnTypes`), which the chart reads as it reads its own
   *  `schema`'s, and its `schema` wins. */
  tables?: Frontend.Tables;
}

/** Drop undefined fields, so a render option the host left unset is absent
 *  rather than present-and-undefined. */
function definedFields<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

/**
 * Rebuild a whole frontend-IR root (a chart, a layer, or a bare mark), as it
 * arrives (it is decoded here), into the object a JS author would have
 * written: a `ChartBuilder`, a `LayerBuilder`, or a mark. Building throws
 * synchronously on a bad spec.
 */
export function buildIR(
  encodedRoot: Frontend.FrontendIR,
  host: IRHost = {}
): any {
  const root = readIR(encodedRoot);
  const ctx: IRContext = {
    bridge: host.bridge,
    resolveToken: makeTokenResolver(),
    tables: readIR(host.tables ?? {}),
  };
  if (root.type === "raw-mark") return mapMark(root.mark, ctx);
  if (root.type === "layer") return buildLayer(root, ctx);
  return chartFromIR(root, ctx);
}

/**
 * Render a whole frontend-IR root into `container` ({@link buildIR}, then
 * its `.render`). This is the one entry point both hosts use: the Python
 * widget (Arrow tables, anywidget RPC) and the parity harness (the same
 * Arrow tables, HTTP RPC). The returned promise settles with the
 * {@link View} once the chart has rendered.
 */
export function renderIR(
  encodedRoot: Frontend.FrontendIR,
  container: HTMLElement,
  renderOptions: RenderIROptions,
  host: IRHost = {}
): Promise<View> {
  const options: any = definedFields({ ...renderOptions });
  return buildIR(encodedRoot, host).render(container, options);
}

/** Build a `LayerIR` root: the `chart(...).layer(...)` builder chain, or the
 *  `layer(options, tiers)` combinator with its `.relate(...)` clauses. */
function buildLayer(spec: LayerSpec, ctx: IRContext): any {
  // A tier is a chart (ChartBuilder) or a component-level annotation
  // (raw-mark → a Mark).
  const tiers: any[] = spec.charts.map((tier) =>
    tier.type === "raw-mark" ? mapMark(tier.mark, ctx) : chartFromIR(tier, ctx)
  );
  if (spec.builder) {
    // Fluent `chart(...).layer(...)` chain: reconstruct through the real
    // LayerBuilder so JS owns the builder's render logic (inferred axis
    // titles, the root tier's `axes`, etc.). The first tier is always a
    // chart; later tiers may be mark tiers (`.layer(text({...}))`).
    return tiers.slice(1).reduce((acc, tier) => acc.layer(tier), tiers[0]);
  }
  const combined = (layer as any)(
    resolveOptions((spec.options ?? {}) as Record<string, any>),
    tiers
  );
  if (spec.relate === undefined || spec.relate.length === 0) return combined;
  // Rebuilt per call, as in `mapMark`'s combinator branch.
  const clauses = spec.relate;
  return combined.relate(() => relateClauses(clauses, ctx));
}
