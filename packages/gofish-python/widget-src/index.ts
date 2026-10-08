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
 * concerns: WidgetModel I/O, the Arrow transport (encoding in
 * `arrowTransport.ts`, decoding in `arrowDecode.ts`, which the parity
 * harness shares), and the render entry points.
 */

import * as Arrow from "apache-arrow";
import { Serialize, serializeSVG, type View } from "gofish-graphics";
import type { Frontend } from "gofish-ir";
import { buildArrowTable } from "./arrowTransport";
import { arrowBytesToRows } from "./arrowDecode";

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
  get(key: "axes"): Serialize.RenderIROptions["axes"] | null;
  get(key: "legend"): boolean | null;
  get(key: "padding"): number | null;
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

// ---------------------------------------------------------------------------
// Arrow utilities (widget transport)
// ---------------------------------------------------------------------------

function arrayToArrow(rows: Record<string, any>[]): Uint8Array {
  if (!rows || rows.length === 0) {
    throw new Error("Cannot serialize empty data to Arrow");
  }
  // Explicit-schema construction (issue #783) — see `arrowTransport.ts` for
  // why `Arrow.tableFromJSON`'s inference isn't used here: it can't handle a
  // `list<struct>` column at all (e.g. the `datum` field of an
  // `{__inputRef, datum}` mark-fn sentinel when the ref's bound datum is a
  // multi-row bag — a `group(...)`'d ref, as in the BarWithLabels/
  // FlowerChart shape).
  const table = buildArrowTable(rows);

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
  return arrowBytesToRows(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
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
      return arrowBytesToRows(resultBuffer);
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
  // Build with DOM APIs and `.textContent` so error text (which often echoes
  // user data) is never parsed as HTML.
  const panel = document.createElement("div");
  panel.style.cssText =
    "color: red; padding: 20px; border: 2px solid red; background: #ffe0e0;";
  const title = document.createElement("h2");
  title.style.cssText = "margin-top: 0;";
  title.textContent = "GoFish Widget Error";
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = message;
  paragraph.append(strong);
  panel.append(title, paragraph);
  if (stack) {
    const pre = document.createElement("pre");
    pre.style.cssText =
      "background: #fff; padding: 10px; overflow: auto; white-space: pre-wrap;";
    pre.textContent = stack;
    panel.append(pre);
  }
  container.replaceChildren(panel);
}

/**
 * Decode the Arrow sidecar into the rows of each chart tier. A single chart
 * ships one base64 Arrow stream; a layer ships a JSON object mapping tier
 * index to that same encoding (see `GoFishChartWidget` in widget.py).
 */
function decodeTierRows(
  spec: ChartSpec | LayerSpec | RawMarkSpec,
  arrowData: string
): Record<string, any>[][] {
  if (spec.type === "layer") {
    let arrowDict: Record<string, string> = {};
    try {
      arrowDict = JSON.parse(arrowData);
    } catch (e) {
      throw new Error(`Failed to parse layer arrow_data JSON: ${e}`);
    }
    return spec.charts.map((_, i) =>
      decodeArrowB64(arrowDict[String(i)] || "")
    );
  }
  if (spec.type === "raw-mark") return [];
  return [decodeArrowB64(arrowData)];
}

/** Render the widget's spec into `container` through the library's one IR
 *  renderer (`Serialize.renderIR`, which the parity harness uses too).
 *  Building the chart throws synchronously on a bad spec; the returned
 *  promise settles with the chart's {@link View} once it has resolved. */
function renderChart(
  model: WidgetModel,
  container: HTMLElement,
  bridge: Serialize.DeriveBridge
): Promise<View> {
  const spec = model.get("spec");
  const debug = model.get("debug");
  const log = debug
    ? (...args: any[]) => console.log("[GoFish Widget]", ...args)
    : () => {};
  log("Decoding Arrow data...");
  const tierRows = decodeTierRows(spec, model.get("arrow_data"));
  const renderOptions: Serialize.RenderIROptions = {
    w: model.get("width"),
    h: model.get("height"),
    // Each is null unless the Python render call passed it, so the chart's
    // own option (or the default) decides.
    axes: model.get("axes") ?? undefined,
    legend: model.get("legend") ?? undefined,
    padding: model.get("padding") ?? undefined,
    debug,
  };
  log("Rendering with options:", renderOptions);
  return Serialize.renderIR(spec, container, renderOptions, {
    bridge,
    tierRows,
  });
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
 * widget instance. `render` paints the chart into the cell DOM and returns
 * the cleanup anywidget runs when that DOM goes away.
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
    const container = document.createElement("div");
    container.id = containerId;
    el.replaceChildren(container);

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
      const view = renderChart(model, container, bridge);
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
      // anywidget calls the function `render` returns when the cell's view is
      // removed (the output cleared, the cell re-run): the chart goes with it,
      // detaching it from every input it read.
      return () => void view.then((v) => v.unmount());
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
      return undefined;
    }
  },
};
