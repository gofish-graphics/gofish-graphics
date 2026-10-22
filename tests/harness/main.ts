/**
 * Python parity render harness: the page Playwright drives.
 *
 * It renders a Python story's document through the library's own
 * deserializer, `Serialize.renderIR`, the same function the notebook widget
 * calls, with the widget's own Arrow codec (`gofish-python/arrowBridge`):
 * the document's tables arrive as base64 Arrow from Python's `ir_payload`
 * and are decoded before the render, and the bridge's one call sends rows as
 * Arrow and decodes the reply's tables, so parity covers that transport too.
 * Only the transport is the harness's own: Python callbacks (derive
 * operators, accessors, mark functions) run in `tests/scripts/derive-server.py`
 * and are reached over HTTP POST to `<deriveServerUrl>/call/<id>` instead of
 * over anywidget traitlets.
 *
 * The caller (Playwright) calls `__renderChart__(spec)` (or sets
 * `__GOFISH_SPEC__` before load) and waits for `__GOFISH_RENDER_COMPLETE__`.
 */

import { Serialize } from "gofish-graphics";
import type { Frontend } from "gofish-ir";
import {
  arrowBridge,
  decodeDocument,
  type ShippedDocument,
} from "gofish-python/arrowBridge";

/**
 * What `capture-python-dom.ts` sends: a story's document as the derive
 * server ships it (its tables as base64 Arrow by id), the story's render
 * options, and the derive server's address.
 */
interface HarnessSpec {
  doc: ShippedDocument<Frontend.FrontendIRDocument>;
  render: Serialize.RenderIROptions;
  deriveServerUrl?: string;
}

declare global {
  interface Window {
    __GOFISH_SPEC__: HarnessSpec | null;
    __GOFISH_RENDER_COMPLETE__: boolean;
    __GOFISH_RENDER_ERROR__: string | null;
    __renderChart__: (spec: HarnessSpec) => void;
  }
}

/** The bridge over HTTP: one POST per call of the rows (base64 Arrow) and
 *  the current values of the document's sources, answered by the reply's
 *  shipped document. */
function httpBridge(
  deriveServerUrl: string | undefined
): Serialize.DeriveBridge | undefined {
  if (deriveServerUrl === undefined) return undefined;
  return arrowBridge(async (lambdaId, rowsB64, sources) => {
    const resp = await fetch(`${deriveServerUrl}/call/${lambdaId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows_b64: rowsB64, sources }),
    });
    if (!resp.ok) {
      throw new Error(
        `call ${lambdaId} failed: ${resp.status} ${await resp.text()}`
      );
    }
    return resp.json();
  });
}

function renderChart(spec: HarnessSpec) {
  const container = document.getElementById("gofish-harness-root");
  if (!container) {
    window.__GOFISH_RENDER_ERROR__ = "Container not found";
    window.__GOFISH_RENDER_COMPLETE__ = true;
    return;
  }
  (async () => {
    try {
      await Serialize.renderIR(
        decodeDocument<Frontend.FrontendIRDocument>(spec.doc),
        container,
        spec.render,
        httpBridge(spec.deriveServerUrl)
      );
      // Allow a tick for SolidJS to flush renders.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      window.__GOFISH_RENDER_COMPLETE__ = true;
    } catch (err) {
      window.__GOFISH_RENDER_ERROR__ =
        err instanceof Error ? err.message : String(err);
      window.__GOFISH_RENDER_COMPLETE__ = true;
    }
  })();
}

// Expose globally so Playwright can call it.
window.__renderChart__ = renderChart;
window.__GOFISH_RENDER_COMPLETE__ = false;
window.__GOFISH_RENDER_ERROR__ = null;

// If the spec is already set (e.g. via an inline script), render immediately.
if (window.__GOFISH_SPEC__) {
  renderChart(window.__GOFISH_SPEC__);
}
