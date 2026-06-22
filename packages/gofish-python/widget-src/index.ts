/**
 * GoFish Python Widget — self-contained ESM bundle entry point.
 *
 * Trait-based protocol (Altair / Plotly pattern):
 *   - JS reads `spec`, `arrow_data`, render options on mount and renders.
 *   - For `derive` operators and lambda accessors, JS sets `derive_request`
 *     and awaits a `derive_response` change. Python's `@traitlets.observe`
 *     runs the callback. Sequential — at most one in-flight derive per widget.
 *   - On success/failure, JS sets `render_result` so Python can read
 *     `widget.result` / `widget.error` / `widget.done`.
 *
 * The deserializer (mapMark/mapOperator/buildChart and friends) lives in
 * `gofish-graphics/serialize`. This file retains only the widget-bridge
 * concerns: WidgetModel I/O, Arrow encoding for the bridge transport,
 * and the render entry points.
 */

import * as Arrow from "apache-arrow";
import {
  Layer,
  Serialize,
  serializeSVG,
  type ChartBuilder,
} from "gofish-graphics";
import type { Frontend } from "gofish-ir";

// Type aliases pointing at the canonical IR schema. Internal usages below
// keep the legacy `…Spec` names for readability.
type ChartSpec = Frontend.ChartIR;
type LayerSpec = Frontend.LayerIR;
type RawMarkSpec = Frontend.RawMarkIR;

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

/**
 * The raw RPC layer underneath the widget bridge: a `request(lambdaId,
 * arrowB64)` channel built on top of anywidget traitlets. The
 * Serialize.DeriveBridge interface (which the deserializer uses) is
 * derived from this — see {@link makeDeriveBridge}.
 */
interface RawDeriveBridge {
  request(lambdaId: string, arrowB64: string): Promise<string>;
}

interface RenderOptions {
  w: number;
  h: number;
  axes: boolean;
  debug: boolean;
}

// ---------------------------------------------------------------------------
// Arrow utilities (widget transport)
// ---------------------------------------------------------------------------

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

function decodeArrowB64(b64: string): Record<string, any>[] {
  if (!b64) return [];
  const arrowBuffer = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const table = Arrow.tableFromIPC(arrowBuffer);
  return arrowTableToArray(table);
}

// ---------------------------------------------------------------------------
// Bridge: low-level RPC and the typed DeriveBridge the deserializer expects
// ---------------------------------------------------------------------------

/**
 * Build a typed `Serialize.DeriveBridge` on top of a raw RPC bridge.
 * Translates a rows-in / rows-out `applyLambda` call into the
 * arrow-base64 transport the Python side speaks.
 */
function makeDeriveBridgeFromRaw(raw: RawDeriveBridge): Serialize.DeriveBridge {
  return {
    async applyLambda(lambdaId: string, rows: any[]): Promise<any[]> {
      if (rows.length === 0) return [];
      const arrowBuffer = arrayToArrow(rows);
      const arrowB64 = btoa(String.fromCharCode(...arrowBuffer));
      const resultB64 = await raw.request(lambdaId, arrowB64);
      const resultBuffer = Uint8Array.from(atob(resultB64), (c) =>
        c.charCodeAt(0)
      );
      return arrowTableToArray(Arrow.tableFromIPC(resultBuffer));
    },
  };
}

/**
 * Per-widget raw RPC bridge: assigns request_ids, sets `derive_request`,
 * resolves the matching promise when `derive_response` arrives.
 */
function makeRawDeriveBridge(model: WidgetModel): RawDeriveBridge {
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

/** Build the full Serialize.DeriveBridge for a widget instance. */
function makeDeriveBridge(model: WidgetModel): Serialize.DeriveBridge {
  return makeDeriveBridgeFromRaw(makeRawDeriveBridge(model));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

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

function renderLayer(
  model: WidgetModel,
  container: HTMLElement,
  bridge: Serialize.DeriveBridge
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

  const resolveToken = Serialize.makeTokenResolver();
  const childCharts: ChartBuilder<any>[] = spec.charts.map(
    (chartSpec: ChartSpec, i: number) => {
      const b64 = arrowDict[String(i)] || "";
      const data = decodeArrowB64(b64);
      log(`Building chart ${i}: ${data.length} rows`);
      return Serialize.buildChart(chartSpec, data, bridge, resolveToken);
    }
  );

  const resolvedLayerOptions = Serialize.resolveOptions(
    (spec.options ?? {}) as Record<string, any>
  );
  const renderOptions: RenderOptions = {
    w: model.get("width"),
    h: model.get("height"),
    axes: model.get("axes"),
    debug,
  };

  if ((spec as any).builder) {
    // v3 `chart(...).layer(...)` chain: reconstruct through the real
    // LayerBuilder so JS owns the builder's render logic (inferred axis
    // titles, etc.) instead of the wrapper re-deriving it. The child charts
    // are already wired (the producer mark is named, the consumer reads
    // selectAll), so chaining `.layer()` just stacks them.
    const layerBuilder = childCharts
      .slice(1)
      .reduce((acc: any, c) => acc.layer(c), childCharts[0] as any);
    layerBuilder.render(container, renderOptions);
  } else if (Object.keys(resolvedLayerOptions).length > 0) {
    (Layer as any)(resolvedLayerOptions, childCharts).render(
      container,
      renderOptions
    );
  } else {
    (Layer as any)(childCharts).render(container, renderOptions);
  }
  log("Layer rendered successfully!");
}

function renderRawMark(
  model: WidgetModel,
  container: HTMLElement,
  bridge: Serialize.DeriveBridge
): void {
  const spec = model.get("spec") as unknown as RawMarkSpec;
  const debug = model.get("debug");
  const log = debug
    ? (...args: any[]) => console.log("[GoFish Widget]", ...args)
    : () => {};

  log("Building raw mark...");
  const resolveToken = Serialize.makeTokenResolver();
  const mark = Serialize.mapMark(spec.mark, bridge, resolveToken) as any;
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
  bridge: Serialize.DeriveBridge
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
  const resolveToken = Serialize.makeTokenResolver();
  const node = Serialize.buildChart(chartSpec, data, bridge, resolveToken);

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

// ---------------------------------------------------------------------------
// SVG export capture (#571)
// ---------------------------------------------------------------------------

/**
 * Resolve once an `<svg>` is present in `container`. The chart mounts
 * asynchronously (Solid Suspense + async layout/derives swap a "Loading…"
 * fallback for the `<svg>`), so we observe the container rather than reading
 * it synchronously. Resolves `null` if none appears within `timeoutMs`.
 */
function waitForSVG(
  container: HTMLElement,
  timeoutMs = 15_000
): Promise<SVGSVGElement | null> {
  const existing = container.querySelector("svg");
  if (existing) return Promise.resolve(existing as SVGSVGElement);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: SVGSVGElement | null) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(v);
    };
    const observer = new MutationObserver(() => {
      const svg = container.querySelector("svg");
      if (svg) finish(svg as SVGSVGElement);
    });
    observer.observe(container, { childList: true, subtree: true });
    const timer = setTimeout(
      () => finish(container.querySelector("svg") as SVGSVGElement | null),
      timeoutMs
    );
  });
}

/**
 * Wait for the rendered `<svg>`, serialize it, and report it to the kernel via
 * the `svg_result` trait so Python's `.save()` / `.to_svg()` can write it.
 * Best-effort: export is optional, so failures are swallowed.
 */
async function captureSVG(
  model: WidgetModel,
  container: HTMLElement,
  log: (...args: any[]) => void
): Promise<void> {
  try {
    const svg = await waitForSVG(container);
    if (!svg) return;
    const markup = serializeSVG(svg);
    model.set("svg_result", { value: markup });
    model.save_changes();
    log("Reported svg_result to kernel");
  } catch (e) {
    log("captureSVG failed (export unavailable):", e);
  }
}

// ---------------------------------------------------------------------------
// AnyWidget entry point
// ---------------------------------------------------------------------------

/**
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

    let bridge = (model as any).__gofishBridge as
      | Serialize.DeriveBridge
      | undefined;
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
      // Report the rendered SVG to the kernel for Python-side export (#571).
      // Fire-and-forget: it waits for the async mount, independent of the
      // synchronous render_result above.
      void captureSVG(model, container, log);
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
