/**
 * GoFish Python Widget — self-contained ESM bundle entry point.
 *
 * Trait-based protocol (Altair / Plotly pattern):
 *   - JS reads `doc` (the IR document, its tables as base64 Arrow) and the
 *     render options on mount and renders.
 *   - For every Python callback the IR names (a `derive` operator, an
 *     accessor, a mark function), JS sets `call_request` and awaits a
 *     `call_response` change. Python's `@traitlets.observe` answers it.
 *     Sequential — at most one call in flight per widget.
 *   - On success/failure, JS sets `render_result` so Python can read
 *     `widget.result` / `widget.error` / `widget.done`.
 *
 * The deserializer lives in `gofish-graphics/serialize` (`Serialize.renderIR`)
 * and the Arrow codec in `arrowBridge.ts`, both shared with the parity
 * harness. This file holds only the widget's transport (the traitlets) and
 * the render entry points.
 */

import { Serialize, serializeSVG, type View } from "gofish-graphics";
import type { Frontend } from "gofish-ir";
import {
  arrowBridge,
  decodeDocument,
  type SendCall,
  type ShippedCall,
  type ShippedDocument,
} from "./arrowBridge";

interface WidgetModel {
  get(key: "doc"): ShippedDocument<Frontend.FrontendIRDocument>;
  get(key: "width"): number;
  get(key: "height"): number;
  get(key: "axes"): Serialize.RenderIROptions["axes"] | null;
  get(key: "legend"): boolean | null;
  get(key: "debug"): boolean;
  get(key: "container_id"): string;
  get(key: "call_response"): {
    request_id: string;
    reply?: ShippedDocument<Serialize.BridgeReply>;
    error?: string;
  } | null;
  set(key: string, value: unknown): void;
  save_changes(): void;
  on(event: string, callback: () => void): void;
}

// ---------------------------------------------------------------------------
// Transport: the one bridge call over anywidget traitlets
// ---------------------------------------------------------------------------

/**
 * The widget's transport for the bridge's one call: assigns request ids,
 * sets `call_request`, and resolves the matching promise when
 * `call_response` arrives.
 */
function traitTransport(model: WidgetModel): SendCall {
  let nextId = 0;
  type Reply = ShippedDocument<Serialize.BridgeReply>;
  const pending = new Map<
    string,
    { resolve: (v: Reply) => void; reject: (e: Error) => void }
  >();

  if (typeof (model as any).on === "function") {
    model.on("change:call_response", () => {
      const response = model.get("call_response");
      if (!response || !response.request_id) return;
      const entry = pending.get(response.request_id);
      if (!entry) return;
      pending.delete(response.request_id);
      if (typeof response.error === "string") {
        entry.reject(new Error(response.error));
      } else if (response.reply) {
        entry.resolve(response.reply);
      } else {
        entry.reject(new Error("Invalid call_response payload"));
      }
    });
  }

  // Serialize requests onto a single in-flight queue. Writing the
  // `call_request` trait many times in a tick gets coalesced by the
  // ipykernel / marimo comm — only the latest value reaches Python. By
  // chaining each request after the previous response resolves, every
  // `call_request` write happens in its own comm tick.
  let chain: Promise<unknown> = Promise.resolve();

  function sendOne(lambdaId: string, call: ShippedCall): Promise<Reply> {
    if (
      typeof (model as any).set !== "function" ||
      typeof (model as any).save_changes !== "function"
    ) {
      return Promise.reject(
        new Error(
          "GoFish bridge: model.set/save_changes is not available; " +
            "trait sync is not supported in this environment"
        )
      );
    }
    const requestId = `r-${nextId++}`;
    return new Promise<Reply>((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      model.set("call_request", {
        request_id: requestId,
        lambda_id: lambdaId,
        ...call,
      });
      model.save_changes();
    });
  }

  return (lambdaId, call) => {
    // Recover from a previous failure so one bad call doesn't block the
    // queue.
    const next = chain.then(
      () => sendOne(lambdaId, call),
      () => sendOne(lambdaId, call)
    );
    chain = next.catch(() => undefined);
    return next;
  };
}

/** The bridge for a widget instance. */
function makeBridge(model: WidgetModel): Serialize.DeriveBridge {
  return arrowBridge(traitTransport(model));
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

/** Render the widget's document into `container` through the library's one
 *  IR renderer (`Serialize.renderIR`, which the parity harness uses too),
 *  with its tables decoded from Arrow. Building the chart throws
 *  synchronously on a bad document; the returned promise settles with the
 *  chart's {@link View} once it has resolved. */
function renderChart(
  model: WidgetModel,
  container: HTMLElement,
  bridge: Serialize.DeriveBridge
): Promise<View> {
  const debug = model.get("debug");
  const log = debug
    ? (...args: any[]) => console.log("[GoFish Widget]", ...args)
    : () => {};
  log("Decoding Arrow tables...");
  const doc = decodeDocument<Frontend.FrontendIRDocument>(model.get("doc"));
  const renderOptions: Serialize.RenderIROptions = {
    w: model.get("width"),
    h: model.get("height"),
    // Each is null unless the Python render call passed it, so the chart's
    // own option (or the default) decides.
    axes: model.get("axes") ?? undefined,
    legend: model.get("legend") ?? undefined,
    debug,
  };
  log("Rendering with options:", renderOptions);
  return Serialize.renderIR(doc, container, renderOptions, bridge);
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
  log: (...args: any[]) => void,
  view: Promise<{ warnings: readonly unknown[] }>
): Promise<void> {
  try {
    const svg = await waitForSVG(container);
    if (!svg) return;
    const markup = serializeSVG(svg);
    model.set("svg_result", { value: markup });
    // The layout's warnings (fixed parts larger than their slot, a drawing
    // past the canvas), for Python's `widget.warnings`.
    model.set("layout_warnings", [...(await view).warnings]);
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
    (model as any).__gofishBridge = makeBridge(model);
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
      bridge = makeBridge(model);
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
      void captureSVG(model, container, log, view);
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
