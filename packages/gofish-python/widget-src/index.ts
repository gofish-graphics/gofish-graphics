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
  type ChartBuilder,
  type Operator,
  type Mark,
} from "gofish-graphics";

interface WidgetModel {
  get(key: "spec"): ChartSpec | LayerSpec;
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

interface MarkSpec {
  type:
    | "rect"
    | "circle"
    | "line"
    | "area"
    | "blank"
    | "ellipse"
    | "petal"
    | "text"
    | "image";
  name?: string;
  label?: LabelSpec;
  [key: string]: any;
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

function mapMark(markSpec: MarkSpec): Mark<any> {
  const { type, name: layerName, label: labelSpec, ...opts } = markSpec;
  const factory = MARK_MAP[type];
  if (!factory) {
    throw new Error(`Unknown mark type: ${type}`);
  }
  let mark = factory(opts);
  if (layerName && typeof (mark as any).name === "function") {
    mark = (mark as any).name(layerName);
  }
  if (labelSpec && typeof (mark as any).label === "function") {
    const { accessor, ...labelOpts } = labelSpec;
    mark = (mark as any).label(
      accessor,
      Object.keys(labelOpts).length > 0 ? labelOpts : undefined
    );
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
  bridge: DeriveBridge
): ChartBuilder {
  const operators: Operator<any, any>[] = [];
  for (const opSpec of chartSpec.operators || []) {
    const op = mapOperator(opSpec, bridge);
    if (op) operators.push(op);
  }
  const markSpec = chartSpec.mark || { type: "rect" };
  const mark = mapMark(markSpec);
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

  const childCharts: ChartBuilder[] = spec.charts.map(
    (chartSpec: ChartSpec, i: number) => {
      const b64 = arrowDict[String(i)] || "";
      const data = decodeArrowB64(b64);
      log(`Building chart ${i}: ${data.length} rows`);
      return buildChart(chartSpec, data, bridge);
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
  const node = buildChart(chartSpec, data, bridge);

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
