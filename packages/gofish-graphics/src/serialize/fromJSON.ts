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
import { chart, selectAll } from "../ast/marks/chart";
import { clock } from "../ast/coordinateTransforms/clock";
import { polar } from "../ast/coordinateTransforms/polar";
import { wavy } from "../ast/coordinateTransforms/wavy";
import { createName, type Token } from "../ast/createName";
import { Constraint } from "../ast/constraints";
import { palette, gradient } from "../ast/colorSchemes";
import { ref } from "../ast/shapes/ref";
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
export type LabelSpec = Frontend.LabelIR;
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
  if (coordSpec.type === "clock") return clock();
  if (coordSpec.type === "polar") return polar();
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

/** Build a single operator from its IR spec. */
export function mapOperator(
  op: OperatorSpec,
  bridge?: DeriveBridge
): Operator<any, any> | null {
  const { type, ...opts } = op as Record<string, any>;
  const factory = OPERATOR_MAP[type as string];
  if (!factory) return null;
  return factory(opts, bridge);
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
  resolveToken: TokenResolver
): any[] {
  const out: any[] = [];
  for (const child of specs as any[]) {
    if (child && child.type === "cut") {
      const sourceMark = mapMark(child.source, bridge, resolveToken);
      // Pure cut requires an array `size`; the field-name-string sugar is only
      // valid in the chart `.mark(cut(...))` (data-bound expand) form.
      const slices = cutSlices(sourceMark as any, {
        dir: child.dir,
        size: unwrapMarkOpts(child.size, bridge),
        inset: child.inset,
      });
      out.push(...slices);
    } else {
      out.push(mapMark(child as MarkSpec, bridge, resolveToken));
    }
  }
  return out;
}

/** Build a single mark from its IR spec. Recurses into combinator children. */
export function mapMark(
  markSpec: MarkSpec,
  bridge: DeriveBridge | undefined,
  resolveToken: TokenResolver
): Mark<any> {
  const spec = markSpec as any;

  // Mark-as-function: Python registered a `(data) -> ChartBuilder` lambda.
  // The JS Mark fetches a chart IR per invocation (via the bridge) and
  // rebuilds a ChartBuilder JS-side.
  if (spec.type === "mark-fn") {
    const lambdaId = spec.lambdaId as string;
    if (!bridge) {
      throw new Error(
        "mark-fn spec encountered but no DeriveBridge was supplied"
      );
    }
    return (async (data: any, _key: any, _layerContext: any) => {
      const rows = Array.isArray(data) ? data : [data];
      const result = await bridge.applyLambda(lambdaId, rows);
      // Returns a ChartBuilder which functionally behaves as a Mark in
      // the deserialization pipeline; cast through `unknown` to express
      // that the deserializer is honoring the existing widget contract.
      // mark-fn returns a one-element list; row[0] is the chart-spec dict.
      // Round-trip transport may wrap it under the first column.
      const first = result[0];
      const chartSpec =
        first && typeof first === "object" && Object.keys(first).length === 1
          ? first[Object.keys(first)[0]]
          : first;
      const cs = chartSpec as ChartSpec;
      const data2 = Array.isArray((cs as any).data)
        ? ((cs as any).data as Record<string, any>[])
        : [];
      return buildChart(cs, data2, bridge, resolveToken);
    }) as unknown as Mark<any>;
  }

  // Leaf-form `ref(name)` — not a combinator, not a mark factory.
  if (spec.type === "ref" && !spec.__combinator) {
    return ref(
      resolveRefSelection(spec.selection, resolveToken)
    ) as unknown as Mark<any>;
  }

  // `offset` node: shift a single child by (x, y) render-pixels. Maps to the
  // public `offset` operator, which accepts a Mark child and resolves it.
  if (spec.type === "offset") {
    const childSpecs = (spec.children ?? []) as MarkSpec[];
    const [childMark] = mapMarkChildren(childSpecs, bridge, resolveToken);
    return offsetOp({ x: spec.x, y: spec.y }, [
      childMark as any,
    ]) as unknown as Mark<any>;
  }

  // `cut` mark in a chart `.mark(...)` position → the v3 expand-mark form
  // (`cutMark`). The data-bound expand path treats it as an expand mark; the
  // field-name-string `size` sugar resolves per-row here. (A `cut` used as a
  // combinator CHILD is instead expanded into its N slice nodes IN PLACE — see
  // `mapMarkChildren` — so extent resolution lives in ONE place, JS-side.)
  if (spec.type === "cut") {
    const sourceMark = mapMark(spec.source as MarkSpec, bridge, resolveToken);
    let mark = cutMark({
      source: sourceMark as any,
      dir: spec.dir,
      size: unwrapMarkOpts(spec.size, bridge),
      inset: spec.inset,
    });
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
      resolveToken
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

  const { type, name: layerName, ...rest } = spec;
  // Label has two shapes:
  //   - Object `{accessor, ...opts}` — pull out and call the chained
  //     `.label(accessor, opts)` method (adds an external label layer).
  //   - Boolean / string shorthand — keep in opts so the mark *shape*
  //     interprets it directly (e.g. rect's `label?: boolean` prop).
  let labelObj: LabelSpec | undefined;
  let opts: Record<string, any>;
  if (
    rest.label !== undefined &&
    rest.label !== null &&
    typeof rest.label === "object" &&
    !Array.isArray(rest.label)
  ) {
    const { label: lbl, ...rest2 } = rest;
    labelObj = lbl as LabelSpec;
    opts = rest2;
  } else {
    opts = rest;
  }

  const factory = MARK_MAP[type as string];
  if (!factory) {
    throw new Error(`Unknown mark type: ${String(type)}`);
  }
  let mark = factory(unwrapMarkOpts(opts, bridge));
  if (labelObj && typeof (mark as any).label === "function") {
    const { accessor, ...labelOpts } = labelObj as Exclude<
      LabelSpec,
      true | string
    >;
    mark = (mark as any).label(
      accessor,
      Object.keys(labelOpts).length > 0 ? labelOpts : undefined
    );
  }
  if (spec.__scope) {
    mark = wrapWithScope(mark);
  }
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
  //   - { type: "inline", rows: [...] } — inline rows live on the spec
  //   - { type: "select", layer }       — late-bound layer reference
  //   - null / undefined                — data was shipped via the bridge's
  //                                       arrow_data sidecar; use the
  //                                       `data` argument the caller passed
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
  if (chartSpec.connect) {
    builder = builder.connect(
      mapMark(chartSpec.connect as MarkSpec, bridge, resolveToken)
    );
  }
  return builder;
}
