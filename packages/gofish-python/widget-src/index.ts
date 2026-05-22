/**
 * GoFish Python Widget — self-contained ESM bundle entry point.
 *
 * Trait-based protocol (Altair / Plotly pattern):
 *   - JS reads `spec`, `arrow_data`, render options on mount and renders.
 *   - For `derive` operators, JS sets `derive_request` and awaits a
 *     `derive_response` change. Python's `@traitlets.observe` runs the
 *     callback. Sequential — at most one in-flight derive per widget.
 *   - On success/failure, JS sets `render_result` so Python can read
 *     `widget.result` / `widget.error` / `widget.done`.
 */

import * as Arrow from "apache-arrow";
import {
  Chart as chart,
  Layer,
  clock,
  spread,
  stack,
  scatter,
  group,
  table,
  derive,
  log,
  select,
  palette,
  gradient,
  rect,
  circle,
  line,
  blank,
  area,
  ellipse,
  petal,
  text,
  image,
  v,
  layer,
  Constraint,
  ref,
  arrow,
  over,
  inside,
  xor,
  out,
  atop,
  mask,
  createName,
  Treemap,
  type ChartBuilder,
  type Operator,
  type Mark,
  type Token,
} from "gofish-graphics";

// Combinator-form factory map. Mirrors tests/harness/main.ts.
const COMBINATOR_FACTORIES: Record<
  string,
  (opts: Record<string, any>, marks: Mark<any>[]) => Mark<any>
> = {
  spread: (opts, marks) => spread(opts, marks) as unknown as Mark<any>,
  layer: (opts, marks) => layer(opts, marks) as unknown as Mark<any>,
  arrow: (opts, marks) => arrow(opts, marks) as unknown as Mark<any>,
  treemap: (opts, marks) => Treemap(opts, marks) as unknown as Mark<any>,
  over: (opts, marks) => over(opts, marks) as unknown as Mark<any>,
  inside: (opts, marks) => inside(opts, marks) as unknown as Mark<any>,
  xor: (opts, marks) => xor(opts, marks) as unknown as Mark<any>,
  out: (opts, marks) => out(opts, marks) as unknown as Mark<any>,
  atop: (opts, marks) => atop(opts, marks) as unknown as Mark<any>,
  mask: (opts, marks) => mask(opts, marks) as unknown as Mark<any>,
};

interface WidgetModel {
  get(key: "spec"): ChartSpec | LayerSpec | RawMarkSpec;
  get(key: "arrow_data"): string;
  get(key: "width"): number;
  get(key: "height"): number;
  get(key: "axes"): boolean;
  get(key: "debug"): boolean;
  get(key: "container_id"): string;
  get(
    key: "derive_response"
  ): { request_id: string; result_b64?: string; error?: string } | null;
  set(key: string, value: unknown): void;
  save_changes(): void;
  on(event: string, callback: () => void): void;
}

interface DeriveBridge {
  request(lambdaId: string, arrowB64: string): Promise<string>;
}

interface SelectSpec {
  type: "select";
  layer: string;
}

interface ChartSpec {
  type?: string;
  data?: SelectSpec | null;
  operators?: OperatorSpec[];
  mark: MarkSpec;
  options?: Record<string, any>;
  zOrder?: number;
}

interface LayerSpec {
  type: "layer";
  charts: ChartSpec[];
  options?: Record<string, any>;
}

interface RawMarkSpec {
  type: "raw-mark";
  mark: MarkSpec;
  options?: Record<string, any>;
}

interface OperatorSpec {
  type: "derive" | "spread" | "stack" | "group" | "scatter" | "table" | "log";
  lambdaId?: string;
  [key: string]: any;
}

interface LabelSpec {
  accessor: string;
  position?: string;
  fontSize?: number;
  color?: string;
  offset?: number;
  minSpace?: number;
  rotate?: number;
}

interface ConstraintSpec {
  type: "align" | "distribute";
  options: Record<string, any>;
  refs: string[];
}

interface MarkSpec {
  // Mark types include the leaf shapes, combinator-form operators
  // (`spread`, `layer`, `arrow`, Porter-Duff) used as marks via the
  // `__combinator` flag, and the bare `ref` leaf for selection-by-name.
  type:
    | "rect"
    | "circle"
    | "line"
    | "area"
    | "blank"
    | "ellipse"
    | "petal"
    | "text"
    | "image"
    | "spread"
    | "layer"
    | "arrow"
    | "over"
    | "inside"
    | "xor"
    | "out"
    | "atop"
    | "mask"
    | "ref";
  name?: string;
  label?: LabelSpec;
  __combinator?: boolean;
  options?: Record<string, any>;
  children?: MarkSpec[];
  constraints?: ConstraintSpec[];
  selection?: string;
  [key: string]: any;
}

/**
 * Build the async arrow for a `{__gofish_lambda: id}` sentinel. The arrow
 * is what JS-side `inferRaw` (and equivalents) calls per row; the body
 * RPCs into Python via the existing `DeriveBridge` (Arrow-encoded over
 * traitlets). Same registry as `derive()` operators — the lambda was
 * registered on the Python side when the widget spec was built.
 */
function makeLambdaAccessor(lambdaId: string, bridge: DeriveBridge) {
  return async (d: any) => {
    const arrowBuffer = arrayToArrow([d]);
    const arrowB64 = btoa(String.fromCharCode(...arrowBuffer));
    const resultB64 = await bridge.request(lambdaId, arrowB64);
    const resultBuffer = Uint8Array.from(atob(resultB64), (c) =>
      c.charCodeAt(0)
    );
    const [result] = arrowTableToArray(Arrow.tableFromIPC(resultBuffer));
    // The Python rows_fn returns `[value]` for a single-row input; the
    // Arrow round-trip puts it under the first column. Surface the value
    // directly so JS sees a scalar, not a one-key object.
    if (result && typeof result === "object") {
      const keys = Object.keys(result);
      if (keys.length === 1) return result[keys[0]];
    }
    return result;
  };
}

/**
 * Walk an arbitrary value and resolve Python-emitted sentinels:
 * - `{__gofish_v: value}` → `v(value)` call (embedded-value wrapper).
 * - `{__gofish_lambda: id}` → an `async (d) => ...` arrow that RPCs into
 *   Python via the trait bridge.
 */
function unwrapMarkOpts(value: any, bridge: DeriveBridge): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => unwrapMarkOpts(v, bridge));
  if ("__gofish_v" in value) return v(value.__gofish_v);
  if (typeof value.__gofish_lambda === "string") {
    return makeLambdaAccessor(value.__gofish_lambda, bridge);
  }
  const out: Record<string, any> = {};
  for (const [k, val] of Object.entries(value)) {
    out[k] = unwrapMarkOpts(val, bridge);
  }
  return out;
}

/** Backwards-compatible alias for callsites without bridge access. */
function unwrapValues(value: any): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(unwrapValues);
  if ("__gofish_v" in value) return v(value.__gofish_v);
  const out: Record<string, any> = {};
  for (const [k, val] of Object.entries(value)) {
    out[k] = unwrapValues(val);
  }
  return out;
}

// Per-render Token resolver — mirrors `tests/harness/main.ts`. Python
// emits `{__gofish_token: <uuid>, __tag: <tag>}` sentinels for hygienic
// names; first sighting mints a JS `createName(tag)` Token, subsequent
// sightings reuse it within a single render.
type TokenSentinel = { __gofish_token: string; __tag: string };
type TokenResolver = (s: TokenSentinel) => Token;

function makeTokenResolver(): TokenResolver {
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

function isTokenSentinel(v: any): v is TokenSentinel {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof v.__gofish_token === "string" &&
    typeof v.__tag === "string"
  );
}

/** Wrap a Mark so its resolved GoFishNode gets `.scope()` called — matches
 *  what JS `createMark` does internally. Triggered by the `__scope: true`
 *  flag the Python `@mark` decorator stamps on a Mark's IR. Forwards
 *  `.name`/`.label`/`.render`/`.constrain` so the scoped mark still
 *  behaves as a NameableMark for the raw-mark render path. */
function wrapWithScope(inner: any): any {
  const wrapped: any = async (data: any, key: any, layerContext: any) => {
    const node: any = await Promise.resolve(inner(data, key, layerContext));
    // Match JS `createMark`'s post-resolve sequence: datum, then scope.
    // We skip the `node.name(key)` step because the widget's mapMark
    // already chains `.name(spec.name)` when set, and an empty-string
    // name on a nested combinator child disrupts layer-context registration.
    if (node) {
      node.datum = data;
      if (typeof node.scope === "function") {
        node.scope();
      }
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

function resolveNameField(
  rawName: any,
  resolveToken: TokenResolver
): string | Token | undefined {
  if (rawName == null) return undefined;
  if (isTokenSentinel(rawName)) return resolveToken(rawName);
  return rawName;
}

function resolveRefSelection(selection: any, resolveToken: TokenResolver): any {
  if (typeof selection === "string") return selection;
  if (Array.isArray(selection)) {
    return selection.map((seg) =>
      isTokenSentinel(seg) ? resolveToken(seg) : seg
    );
  }
  return selection;
}

interface RenderOptions {
  w: number;
  h: number;
  axes: boolean;
  debug: boolean;
}

function arrowTableToArray(table: Arrow.Table): Record<string, any>[] {
  const numRows = table.numRows;
  const columns = table.schema.fields.map((field, i) => {
    const column = table.getChildAt(i);
    const values = column.toArray();
    return { name: field.name, type: field.type, values };
  });

  const data: Record<string, any>[] = [];
  for (let i = 0; i < numRows; i++) {
    const row: Record<string, any> = {};
    columns.forEach((col) => {
      let value = col.values[i];
      if (typeof value === "bigint") {
        value = Number(value);
      } else if (value !== null && value !== undefined) {
        const typeStr = col.type ? col.type.toString() : "";
        if (
          typeStr.includes("Int64") ||
          typeStr.includes("UInt64") ||
          typeStr.includes("Int32") ||
          typeStr.includes("UInt32")
        ) {
          value = Number(value);
        }
      }
      row[col.name] = value;
    });
    data.push(row);
  }
  return data;
}

function normalizeToArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function arrayToArrow(rows: Record<string, any>[]): Uint8Array {
  if (!rows || rows.length === 0) {
    throw new Error("Cannot serialize empty data to Arrow");
  }
  const table = Arrow.tableFromJSON(rows);

  if (
    (Arrow as any).tableToIPC &&
    typeof (Arrow as any).tableToIPC === "function"
  ) {
    const buffer = (Arrow as any).tableToIPC(table);
    if (buffer && buffer.byteLength > 0) {
      return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    }
  }

  const writer = (Arrow as any).RecordBatchStreamWriter;
  if (!writer || typeof writer.writeAll !== "function") {
    throw new Error("RecordBatchStreamWriter.writeAll is not available");
  }
  const stream = writer.writeAll(table);
  const buffer =
    typeof stream.toUint8Array === "function"
      ? stream.toUint8Array(true)
      : stream.finish();
  if (!buffer || buffer.byteLength === 0) {
    throw new Error("Serialized Arrow buffer is empty");
  }
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
}

const OPERATOR_MAP: Record<
  string,
  (opts: Record<string, any>, bridge: DeriveBridge) => Operator<any, any> | null
> = {
  derive: (opts, bridge) => {
    const lambdaId = opts.lambdaId;
    if (!lambdaId) {
      throw new Error("derive operator missing lambdaId");
    }
    return derive(async (d: any) => {
      const rows = normalizeToArray(d);
      if (rows.length === 0) {
        return Array.isArray(d) ? d : (d ?? null);
      }
      const arrowBuffer = arrayToArrow(rows);
      const arrowB64 = btoa(String.fromCharCode(...arrowBuffer));
      const resultB64 = await bridge.request(lambdaId, arrowB64);
      const resultBuffer = Uint8Array.from(atob(resultB64), (c) =>
        c.charCodeAt(0)
      );
      const resultTable = Arrow.tableFromIPC(resultBuffer);
      const resultArray = arrowTableToArray(resultTable);
      return Array.isArray(d) ? resultArray : (resultArray[0] ?? null);
    });
  },
  spread: (opts) => spread(opts as any),
  stack: (opts) => stack(opts as any),
  group: (opts) => group(opts as any),
  scatter: (opts) => scatter(opts as any),
  table: (opts) => table(opts as any),
  log: (opts) => log(opts.label),
};

function mapOperator(
  op: OperatorSpec,
  bridge: DeriveBridge
): Operator<any, any> | null {
  const { type, ...opts } = op;
  const factory = OPERATOR_MAP[type];
  if (!factory) return null;
  return factory(opts, bridge);
}

const MARK_MAP: Record<string, (opts: Record<string, any>) => Mark<any>> = {
  rect: (opts) => rect(opts),
  circle: (opts) => circle(opts),
  line: (opts) => line(opts),
  area: (opts) => area(opts),
  blank: (opts) => blank(opts),
  ellipse: (opts) => ellipse(opts),
  petal: (opts) => petal(opts),
  text: (opts) => text(opts),
  image: (opts) => image(opts),
};

function mapMark(
  markSpec: MarkSpec,
  bridge: DeriveBridge,
  resolveToken: TokenResolver
): Mark<any> {
  // Mark-as-function: Python registered a `(data) -> ChartBuilder` lambda.
  // The JS Mark fetches a chart IR per invocation (via the trait bridge —
  // Arrow-encoded) and rebuilds a ChartBuilder JS-side.
  if (markSpec.type === "mark-fn") {
    const lambdaId = markSpec.lambdaId as string;
    return (async (data: any, _key: any, _layerContext: any) => {
      const rows = Array.isArray(data) ? data : [data];
      const arrowBuffer = arrayToArrow(rows);
      const arrowB64 = btoa(String.fromCharCode(...arrowBuffer));
      const resultB64 = await bridge.request(lambdaId, arrowB64);
      const resultBuffer = Uint8Array.from(atob(resultB64), (c) =>
        c.charCodeAt(0)
      );
      const resultArr = arrowTableToArray(Arrow.tableFromIPC(resultBuffer));
      // mark-fn returns a one-element list; row[0] is the chart-spec dict.
      // Widget's Arrow round-trip wraps it under the first column.
      const first = resultArr[0];
      const chartSpec =
        first && typeof first === "object" && Object.keys(first).length === 1
          ? first[Object.keys(first)[0]]
          : first;
      // Inner chart's data may need decoding from Arrow b64 if the
      // serializer wrapped it; for the current widget path we receive
      // record-shape data directly via the chart spec.
      const cs = chartSpec as ChartSpec;
      const data2 = Array.isArray(cs.data)
        ? (cs.data as unknown as Record<string, any>[])
        : [];
      return buildChart(cs, data2, bridge, resolveToken);
    }) as Mark<any>;
  }

  // Leaf-form `ref(name)` — not a combinator, not a mark factory.
  // Selection may be string, array, or contain token sentinels.
  if (markSpec.type === "ref" && !markSpec.__combinator) {
    return ref(
      resolveRefSelection(markSpec.selection, resolveToken)
    ) as unknown as Mark<any>;
  }

  // Combinator-form marks: a layout operator (`spread`, `layer`, or
  // `arrow`) used as a mark, with explicit nested children. Python emits
  // `{type, __combinator: true, options, children, name?, label?,
  // constraints?}`; rebuild it by calling the JS operator's `(opts, marks)`
  // overload, then chain `.constrain(...)` if present.
  if (markSpec.__combinator) {
    const childMarks = (markSpec.children ?? []).map((c) =>
      mapMark(c, bridge, resolveToken)
    );
    const opts = unwrapMarkOpts(markSpec.options ?? {}, bridge);
    const factory = COMBINATOR_FACTORIES[markSpec.type];
    if (!factory) {
      throw new Error(`Unknown combinator mark type: ${markSpec.type}`);
    }
    let mark = factory(opts, childMarks);
    // Constraint chain. The Python side serializes refs by name; reify the
    // JS-side ConstraintRef objects from those names by looking them up in
    // the `refs` map the JS callback receives.
    if (markSpec.constraints && typeof (mark as any).constrain === "function") {
      const constraints = markSpec.constraints;
      mark = (mark as any).constrain((refs: Record<string, any>) =>
        constraints.map((c) =>
          (Constraint as any)[c.type](
            c.options,
            c.refs.map((name) => refs[name])
          )
        )
      );
    }
    if (markSpec.__scope) {
      mark = wrapWithScope(mark);
    }
    const nameVal = resolveNameField(markSpec.name, resolveToken);
    if (nameVal != null && typeof (mark as any).name === "function") {
      mark = (mark as any).name(nameVal);
    }
    return mark;
  }

  const { type, name: layerName, label: labelSpec, ...opts } = markSpec;
  const factory =
    MARK_MAP[
      type as Exclude<
        MarkSpec["type"],
        | "spread"
        | "layer"
        | "arrow"
        | "ref"
        | "over"
        | "inside"
        | "xor"
        | "out"
        | "atop"
        | "mask"
      >
    ];
  if (!factory) {
    throw new Error(`Unknown mark type: ${type}`);
  }
  let mark = factory(unwrapMarkOpts(opts, bridge));
  if (labelSpec && typeof (mark as any).label === "function") {
    const { accessor, ...labelOpts } = labelSpec;
    mark = (mark as any).label(
      accessor,
      Object.keys(labelOpts).length > 0 ? labelOpts : undefined
    );
  }
  if (markSpec.__scope) {
    mark = wrapWithScope(mark);
  }
  const nameVal = resolveNameField(layerName, resolveToken);
  if (nameVal != null && typeof (mark as any).name === "function") {
    mark = (mark as any).name(nameVal);
  }
  if ("__datum" in markSpec) {
    const boundDatum = markSpec.__datum;
    const boundKey = markSpec.__key ?? undefined;
    const inner = mark as any;
    mark = (async (_data: any, _key: any, layerContext: any) =>
      inner(boundDatum, boundKey, layerContext)) as Mark<any>;
  }
  return mark;
}

function resolveColorConfig(colorSpec: Record<string, any>): any {
  if (colorSpec._tag === "palette") return palette(colorSpec.values);
  if (colorSpec._tag === "gradient") return gradient(colorSpec.stops);
  return colorSpec;
}

function resolveCoordConfig(coordSpec: Record<string, any>): any {
  if (coordSpec.type === "clock") return clock();
  return coordSpec;
}

function resolveOptions(raw: Record<string, any>): Record<string, any> {
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

function renderError(
  container: HTMLElement,
  error: Error,
  debug: boolean
): void {
  const message = error.message || String(error);
  const stack = debug && error.stack ? error.stack : "";
  container.innerHTML = `
    <div style="color: red; padding: 20px; border: 2px solid red; background: #ffe0e0;">
      <h2 style="margin-top: 0;">GoFish Widget Error</h2>
      <p><strong>${message}</strong></p>
      ${stack ? `<pre style="background: #fff; padding: 10px; overflow: auto; white-space: pre-wrap;">${stack}</pre>` : ""}
    </div>
  `;
}

function decodeArrowB64(b64: string): Record<string, any>[] {
  if (!b64) return [];
  const arrowBuffer = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const table = Arrow.tableFromIPC(arrowBuffer);
  return arrowTableToArray(table);
}

function buildChart(
  chartSpec: ChartSpec,
  data: Record<string, any>[],
  bridge: DeriveBridge,
  resolveToken: TokenResolver
): ChartBuilder {
  const operators: Operator<any, any>[] = [];
  for (const opSpec of chartSpec.operators || []) {
    const op = mapOperator(opSpec, bridge);
    if (op) operators.push(op);
  }
  const markSpec = chartSpec.mark || { type: "rect" };
  const mark = mapMark(markSpec, bridge, resolveToken);
  const resolvedOptions = resolveOptions(chartSpec.options || {});

  let chartData: any = data;
  if (
    chartSpec.data &&
    typeof chartSpec.data === "object" &&
    chartSpec.data.type === "select"
  ) {
    chartData = select(chartSpec.data.layer);
  }

  let builder = chart(chartData, resolvedOptions)
    .flow(...operators)
    .mark(mark);
  if (chartSpec.zOrder !== undefined) {
    builder = builder.zOrder(chartSpec.zOrder);
  }
  return builder;
}

function renderLayer(
  model: WidgetModel,
  container: HTMLElement,
  bridge: DeriveBridge
): void {
  const debug = model.get("debug");
  const log = debug
    ? (...args: any[]) => console.log("[GoFish Widget]", ...args)
    : () => {};

  log("Rendering layer...");

  const spec = model.get("spec") as LayerSpec;
  const arrowDataRaw = model.get("arrow_data");

  let arrowDict: Record<string, string> = {};
  try {
    arrowDict = JSON.parse(arrowDataRaw);
  } catch (e) {
    throw new Error(`Failed to parse layer arrow_data JSON: ${e}`);
  }

  const resolveToken = makeTokenResolver();
  const childCharts: ChartBuilder[] = spec.charts.map(
    (chartSpec: ChartSpec, i: number) => {
      const b64 = arrowDict[String(i)] || "";
      const data = decodeArrowB64(b64);
      log(`Building chart ${i}: ${data.length} rows`);
      return buildChart(chartSpec, data, bridge, resolveToken);
    }
  );

  const resolvedLayerOptions = resolveOptions(spec.options || {});
  const renderOptions: RenderOptions = {
    w: model.get("width"),
    h: model.get("height"),
    axes: model.get("axes"),
    debug,
  };

  if (Object.keys(resolvedLayerOptions).length > 0) {
    Layer(resolvedLayerOptions, childCharts).render(container, renderOptions);
  } else {
    Layer(childCharts).render(container, renderOptions);
  }
  log("Layer rendered successfully!");
}

function renderRawMark(
  model: WidgetModel,
  container: HTMLElement,
  bridge: DeriveBridge
): void {
  const spec = model.get("spec") as unknown as RawMarkSpec;
  const debug = model.get("debug");
  const log = debug
    ? (...args: any[]) => console.log("[GoFish Widget]", ...args)
    : () => {};

  log("Building raw mark...");
  const resolveToken = makeTokenResolver();
  const mark = mapMark(spec.mark, bridge, resolveToken) as any;
  const renderOptions: RenderOptions = {
    w: model.get("width"),
    h: model.get("height"),
    axes: model.get("axes"),
    debug,
  };
  log("Rendering raw mark with options:", renderOptions);
  mark.render(container, renderOptions);
  log("Raw mark rendered successfully!");
}

function renderChart(
  model: WidgetModel,
  container: HTMLElement,
  bridge: DeriveBridge
): void {
  const spec = model.get("spec");
  if ((spec as any).type === "layer") {
    renderLayer(model, container, bridge);
    return;
  }
  if ((spec as any).type === "raw-mark") {
    renderRawMark(model, container, bridge);
    return;
  }

  const chartSpec = spec as ChartSpec;
  const debug = model.get("debug");
  const log = debug
    ? (...args: any[]) => console.log("[GoFish Widget]", ...args)
    : () => {};

  let data: Record<string, any>[] = [];
  const arrowDataB64 = model.get("arrow_data");
  if (arrowDataB64) {
    log("Decoding Arrow data...");
    data = decodeArrowB64(arrowDataB64);
    log(`Converted to ${data.length} data objects`);
  }

  log("Building chart...");
  const resolveToken = makeTokenResolver();
  const node = buildChart(chartSpec, data, bridge, resolveToken);

  const renderOptions: RenderOptions = {
    w: model.get("width"),
    h: model.get("height"),
    axes: model.get("axes"),
    debug,
  };
  log("Rendering with options:", renderOptions);
  node.render(container, renderOptions);
  log("Chart rendered successfully!");
}

/**
 * Per-widget derive bridge: assigns request_ids, sets `derive_request`,
 * resolves the matching promise when `derive_response` arrives.
 */
function makeDeriveBridge(model: WidgetModel): DeriveBridge {
  let nextId = 0;
  const pending = new Map<
    string,
    { resolve: (v: string) => void; reject: (e: Error) => void }
  >();

  if (typeof (model as any).on === "function") {
    model.on("change:derive_response", () => {
      const response = model.get("derive_response");
      if (!response || !response.request_id) return;
      const entry = pending.get(response.request_id);
      if (!entry) return;
      pending.delete(response.request_id);
      if (typeof response.error === "string") {
        entry.reject(new Error(response.error));
      } else if (typeof response.result_b64 === "string") {
        entry.resolve(response.result_b64);
      } else {
        entry.reject(new Error("Invalid derive_response payload"));
      }
    });
  }

  // Serialize requests onto a single in-flight queue. Writing the
  // `derive_request` trait many times in a tick gets coalesced by the
  // ipykernel / marimo comm — only the latest value reaches Python. By
  // chaining each request after the previous response resolves, every
  // `derive_request` write happens in its own comm tick.
  let chain: Promise<unknown> = Promise.resolve();

  function sendOne(lambdaId: string, arrowB64: string): Promise<string> {
    if (
      typeof (model as any).set !== "function" ||
      typeof (model as any).save_changes !== "function"
    ) {
      return Promise.reject(
        new Error(
          "GoFish derive: model.set/save_changes is not available; " +
            "trait sync is not supported in this environment"
        )
      );
    }
    const requestId = `r-${nextId++}`;
    return new Promise<string>((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      model.set("derive_request", {
        request_id: requestId,
        lambda_id: lambdaId,
        arrow_b64: arrowB64,
      });
      model.save_changes();
    });
  }

  return {
    request(lambdaId: string, arrowB64: string): Promise<string> {
      // Recover from a previous failure so one bad derive doesn't block
      // the queue.
      const next = chain.then(
        () => sendOne(lambdaId, arrowB64),
        () => sendOne(lambdaId, arrowB64)
      );
      chain = next.catch(() => undefined);
      return next;
    },
  };
}

/**
 * AnyWidget entry point.
 *
 * `initialize` runs once per widget on mount: that's where we wire up
 * the derive bridge so its listener and pending map are scoped to this
 * widget instance. `render` paints the chart into the cell DOM.
 */
export default {
  initialize({ model }: { model: WidgetModel }) {
    // Stash the bridge on the model so render() can reuse it without
    // re-wiring listeners on each re-render.
    (model as any).__gofishBridge = makeDeriveBridge(model);
  },

  async render({ model, el }: { model: WidgetModel; el: HTMLElement }) {
    const debug = model.get("debug");
    const log = debug
      ? (...args: any[]) => console.log("[GoFish Widget]", ...args)
      : () => {};
    log("render() called");

    const containerId = model.get("container_id");
    el.innerHTML = `<div id="${containerId}"></div>`;
    const container = el.querySelector(`#${containerId}`) as HTMLElement;
    if (!container) {
      const error = new Error(
        `Container with id "${containerId}" not found after creation`
      );
      renderError(el, error, debug);
      try {
        model.set("render_result", { error: error.message });
        model.save_changes();
      } catch {
        /* ignore */
      }
      return;
    }

    let bridge = (model as any).__gofishBridge as DeriveBridge | undefined;
    if (!bridge) {
      // Fallback if initialize() didn't run for some reason (e.g. older
      // anywidget environment that only calls render).
      bridge = makeDeriveBridge(model);
      (model as any).__gofishBridge = bridge;
    }

    try {
      renderChart(model, container, bridge);
      try {
        model.set("render_result", { value: true });
        model.save_changes();
      } catch {
        /* ignore */
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log("Error in render():", err);
      renderError(container, err, debug);
      try {
        model.set("render_result", { error: err.message });
        model.save_changes();
      } catch {
        /* ignore */
      }
    }
  },
};
