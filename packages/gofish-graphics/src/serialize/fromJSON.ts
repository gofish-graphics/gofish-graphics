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
import { chart, selectAll, PREVIOUS_LAYER_MARKS } from "../ast/marks/chart";
import { clock } from "../ast/coordinateTransforms/clock";
import { polar } from "../ast/coordinateTransforms/polar";
import { wavy } from "../ast/coordinateTransforms/wavy";
import { createName, type Token } from "../ast/createName";
import { Constraint } from "../ast/constraints";
import { palette, gradient } from "../ast/colorSchemes";
import { ref } from "../ast/shapes/ref";
import { GoFishRef } from "../ast/_ref";
import type { Frontend } from "gofish-ir";
import {
  COMBINATOR_FACTORIES,
  MARK_MAP,
  OPERATOR_MAP,
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
 * Build the async arrow for a `{ __gofish_lambda: id }` sentinel. The arrow
 * is what JS-side `inferRaw` (and equivalents) calls per row. The body
 * issues a one-row RPC through the bridge; if the lambda returned a
 * single-key object, the value is unwrapped so callers see the scalar
 * directly (a quirk of the Python rows-fn protocol).
 */
function makeLambdaAccessor(lambdaId: string, bridge: DeriveBridge) {
  return async (d: any) => {
    const [result] = await bridge.applyLambda(lambdaId, [d]);
    if (result && typeof result === "object") {
      const keys = Object.keys(result);
      if (keys.length === 1) return result[keys[0]];
    }
    return result;
  };
}

/**
 * Walk an arbitrary value and resolve Python-emitted lambda sentinels.
 *
 *  - `{ __gofish_lambda: id }` becomes an `async (d) => …` arrow that
 *    RPCs into Python via the supplied bridge.
 *
 * Python's `datum(x)` emits the canonical `{type: "datum", datum: x}`
 * directly, so no unwrap step is needed for it. If no bridge is
 * supplied, lambda sentinels throw — a pure-JS consumer should never
 * emit one.
 */
export function unwrapMarkOpts(value: any, bridge?: DeriveBridge): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => unwrapMarkOpts(item, bridge));
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
    out[k] = unwrapMarkOpts(val, bridge);
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
 * Mark's IR. Forwards `.name` / `.label` / `.render` / `.constrain` so the
 * scoped mark still behaves as a `NameableMark` for the raw-mark render path.
 */
export function wrapWithScope(inner: any): any {
  const wrapped: any = async (data: any, key: any, layerContext: any) => {
    const node: any = await Promise.resolve(inner(data, key, layerContext));
    if (node) {
      node.datum = data;
      if (typeof node.scope === "function") {
        node.scope();
      }
      node._isComponent = true;
    }
    return node;
  };
  const define = (key: string, value: any) =>
    Object.defineProperty(wrapped, key, {
      value,
      writable: true,
      configurable: true,
    });
  if (typeof inner.render === "function") {
    define("render", async (container: any, options: any) => {
      const node: any = await wrapped(undefined, undefined, undefined);
      return node.render(container, options);
    });
  }
  for (const key of ["name", "label", "constrain"] as const) {
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
  // polar/clock options (innerRadius, centralAngle, startAngle, direction,
  // center) ride along in the spec; pass them through (PolarOptions is all
  // optional and ignores the extra `type` key).
  if (coordSpec.type === "clock") return clock(coordSpec);
  if (coordSpec.type === "polar") return polar(coordSpec);
  if (coordSpec.type === "wavy") return wavy();
  return coordSpec;
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
  const factory = OPERATOR_MAP[type as string];
  if (!factory) return null;
  let operator = factory(opts, bridge);
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
export function mapMarkChildren(
  specs: MarkSpec[],
  bridge: DeriveBridge | undefined,
  resolveToken: TokenResolver,
  inputRefs?: any[]
): any[] {
  const out: any[] = [];
  for (const child of specs as any[]) {
    if (child && child.type === "cut") {
      const sourceMark = mapMark(child.source, bridge, resolveToken, inputRefs);
      // Pure cut requires an array `size`; the field-name-string sugar is only
      // valid in the chart `.mark(cut(...))` (data-bound expand) form.
      const slices = cutSlices(sourceMark as any, {
        dir: child.dir,
        size: unwrapMarkOpts(child.size, bridge),
        inset: child.inset,
      });
      out.push(...slices);
    } else {
      out.push(mapMark(child as MarkSpec, bridge, resolveToken, inputRefs));
    }
  }
  return out;
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
function serializeMarkFnInput(data: any): { rows: any[]; inputRefs?: any[] } {
  const items = Array.isArray(data) ? data : [data];
  if (!items.some((item) => item instanceof GoFishRef)) {
    return { rows: items };
  }
  const rows = items.map((item, i) =>
    item instanceof GoFishRef ? { __inputRef: i, datum: item.datum } : item
  );
  return { rows, inputRefs: items };
}

/** Build a single mark from its IR spec. Recurses into combinator children.
 *  `inputRefs`, when supplied, is the array of real `GoFishRef`s a mark-fn was
 *  invoked with — an `{__inputRef: i}` sentinel anywhere in the (possibly
 *  Python-returned) mark tree resolves back to `inputRefs[i]`, letting a
 *  Python mark-fn embed the ref it was handed directly in its returned
 *  layout (mirrors JS `spread({...}, [d[0], text(...)])`). */
export function mapMark(
  markSpec: MarkSpec,
  bridge: DeriveBridge | undefined,
  resolveToken: TokenResolver,
  inputRefs?: any[]
): Mark<any> {
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
    // points at), letting an enclosing `.layer([...]).constrain(...)` target
    // it by name.
    if (spec.name != null && typeof (inputRef as any)?.name === "function") {
      (inputRef as any).name(resolveNameField(spec.name, resolveToken));
    }
    return inputRef;
  }

  // Mark-as-function: Python registered a `(data) -> ChartBuilder | Mark`
  // lambda. The JS Mark fetches a chart (or raw-mark) IR per invocation (via
  // the bridge) and rebuilds it JS-side.
  if (spec.type === "mark-fn") {
    const lambdaId = spec.lambdaId as string;
    if (!bridge) {
      throw new Error(
        "mark-fn spec encountered but no DeriveBridge was supplied"
      );
    }
    return (async (data: any, _key: any, _layerContext: any) => {
      const { rows, inputRefs: newInputRefs } = serializeMarkFnInput(data);
      const result = await bridge.applyLambda(lambdaId, rows);
      // Returns a ChartBuilder or a raw Mark, both of which behave as a Mark
      // in the deserialization pipeline; cast through `unknown` to express
      // that the deserializer is honoring the existing widget contract.
      // mark-fn returns a one-element list; row[0] is the chart/mark-spec dict.
      // Round-trip transport may wrap it under the first column.
      const first = result[0];
      const resultSpec =
        first && typeof first === "object" && Object.keys(first).length === 1
          ? first[Object.keys(first)[0]]
          : first;
      // A bare Mark returned by the Python mark-fn (e.g. `spread([...])`)
      // serializes as `{type: "raw-mark", mark: ...}` — mirrors the
      // top-level raw-mark IR (`Mark.to_ir()`), reused here since a mark-fn
      // result is structurally the same "just a mark tree" shape.
      if (
        resultSpec &&
        typeof resultSpec === "object" &&
        (resultSpec as any).type === "raw-mark"
      ) {
        // Returned un-invoked: `resolveMarkResult` (the caller, one level up)
        // already knows how to call a function-shaped Mark with
        // `(undefined, undefined, layerContext)` — mirrors the ChartBuilder
        // branch below, which is likewise returned rather than resolved here.
        return mapMark(
          (resultSpec as any).mark as MarkSpec,
          bridge,
          resolveToken,
          newInputRefs
        );
      }
      const cs = resultSpec as ChartSpec;
      const data2 = Array.isArray((cs as any).data)
        ? ((cs as any).data as Record<string, any>[])
        : [];
      return buildChart(cs, data2, bridge, resolveToken);
    }) as unknown as Mark<any>;
  }

  // Leaf-form `ref(name)` — not a combinator, not a mark factory.
  if (spec.type === "ref" && !spec.__combinator) {
    const refNode = ref(resolveRefSelection(spec.selection, resolveToken));
    // `ref(name).name(name)` — the cross-tier name proxy. GoFishRef's
    // `.name()` mutates in place and returns `this`, making the ref a
    // constraint target of the enclosing layer (RefMarkIR carries `name`;
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
    const [childMark] = mapMarkChildren(
      childSpecs,
      bridge,
      resolveToken,
      inputRefs
    );
    return applyTranslate(
      offsetOp({ x: spec.x, y: spec.y }, [
        childMark as any,
      ]) as unknown as Mark<any>
    );
  }

  // `cut` mark in a chart `.mark(...)` position → the v3 expand-mark form
  // (`cutMark`). The data-bound expand path treats it as an expand mark; the
  // field-name-string `size` sugar resolves per-row here. (A `cut` used as a
  // combinator CHILD is instead expanded into its N slice nodes IN PLACE — see
  // `mapMarkChildren` — so extent resolution lives in ONE place, JS-side.)
  if (spec.type === "cut") {
    const sourceMark = mapMark(
      spec.source as MarkSpec,
      bridge,
      resolveToken,
      inputRefs
    );
    let mark = cutMark({
      source: sourceMark as any,
      dir: spec.dir,
      size: unwrapMarkOpts(spec.size, bridge),
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
      bridge,
      resolveToken,
      inputRefs
    );
    // Resolve color/coord configs (e.g. a `layer({coord: polar()})` carries
    // its coord transform in the combinator options, not chart options).
    const opts = resolveOptions(unwrapMarkOpts(spec.options ?? {}, bridge));
    const factory = COMBINATOR_FACTORIES[spec.type];
    if (!factory) {
      throw new Error(`Unknown combinator mark type: ${spec.type}`);
    }
    let mark = factory(opts, childMarks);
    if (spec.constraints && typeof (mark as any).constrain === "function") {
      const constraints = spec.constraints as ConstraintSpec[];
      mark = (mark as any).constrain((refs: Record<string, any>) =>
        constraints.map((c: any) => {
          if (c.type === "zAbove" || c.type === "zBelow") {
            return (Constraint as any)[c.type](
              ...c.refs.map((name: string) => refs[name])
            );
          }
          return (Constraint as any)[c.type](
            c.options,
            c.refs.map((name: string) => refs[name])
          );
        })
      );
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

  const factory = MARK_MAP[type as string];
  if (!factory) {
    throw new Error(`Unknown mark type: ${String(type)}`);
  }
  let mark = factory(unwrapMarkOpts(opts, bridge));
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
 * Build a full chart from its IR. Data is supplied separately (the IR's
 * `data` field may be a `select` reference; row data comes from the
 * caller — either an inline `rows` from the IR or external Arrow data
 * from the Python bridge).
 */
export function buildChart(
  chartSpec: ChartSpec,
  data: Record<string, any>[],
  bridge: DeriveBridge | undefined,
  resolveToken: TokenResolver
): ChartBuilder<any> {
  const operators: Operator<any, any>[] = [];
  for (const opSpec of (chartSpec.operators ?? []) as OperatorSpec[]) {
    const op = mapOperator(opSpec, bridge);
    if (op) operators.push(op);
  }
  const markSpec = (chartSpec.mark ?? { type: "rect" }) as MarkSpec;
  const mark = mapMark(markSpec, bridge, resolveToken);
  const resolvedOptions = resolveOptions(
    ((chartSpec as any).options ?? {}) as Record<string, any>
  );

  // Resolve chartSpec.data. The canonical shapes are:
  //   - { type: "inline", rows: [...] }  — inline rows live on the spec
  //   - { type: "select", layer }        — late-bound layer reference
  //   - { type: "previous-tier" }        — empty chart() scope inside a
  //                                        .layer(...) builder chain; maps to
  //                                        the PREVIOUS_LAYER_MARKS sentinel
  //                                        so LayerBuilder's own wireTiers()
  //                                        does the auto-naming/selectAll
  //                                        wiring (see chartBuilder.ts)
  //   - null / undefined                 — data was shipped via the bridge's
  //                                        arrow_data sidecar; use the
  //                                        `data` argument the caller passed
  let chartData: any = data;
  const dataField = (chartSpec as any).data;
  if (dataField && typeof dataField === "object") {
    if (dataField.type === "select") {
      // `mode` discriminates the plural selectAll() (array of refs) from the
      // singular ref() (a single ref). Missing/"one" → ref(layer).
      chartData =
        dataField.mode === "all"
          ? selectAll(dataField.layer)
          : ref(dataField.layer);
    } else if (dataField.type === "inline" && Array.isArray(dataField.rows)) {
      chartData = dataField.rows;
    } else if (dataField.type === "previous-tier") {
      chartData = PREVIOUS_LAYER_MARKS;
    }
  }

  // Cast the flow chain: `chart(...).flow(...).mark(...)` is typed with
  // operator-/mark-input/output relationships the runtime deserializer
  // can't statically reconstruct. The widget did the same.
  let builder = (chart as any)(chartData, resolvedOptions)
    .flow(...operators)
    .mark(mark);
  if ((chartSpec as any).zOrder !== undefined) {
    builder = builder.zOrder((chartSpec as any).zOrder);
  }
  return builder;
}
