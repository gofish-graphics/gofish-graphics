/**
 * Python parity render harness: the page Playwright drives.
 *
 * It renders a Python story's IR through the library's own deserializer,
 * `Serialize.renderIR`, the same function the notebook widget calls. Only the
 * transport is the harness's own. Python callbacks (derive operators, lambda
 * accessors, mark functions) run in `tests/scripts/derive-server.py` and are
 * reached over HTTP POST to `<deriveServerUrl>/derive/<id>` instead of over
 * anywidget traitlets, and rows travel inline in the IR instead of in an Arrow
 * sidecar.
 *
 * The caller (Playwright) calls `__renderChart__(spec)` (or sets
 * `__GOFISH_SPEC__` before load) and waits for `__GOFISH_RENDER_COMPLETE__`.
 */

import { Serialize } from "gofish-graphics";
import type { Frontend } from "gofish-ir";

/**
 * What `capture-python-dom.ts` sends: a story's IR as the derive server
 * returns it (the builder's own `to_ir()`, rows inlined), the story's render
 * options, and the derive server's address.
 */
interface HarnessSpec {
  ir: Frontend.FrontendIR;
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

/** The derive bridge over HTTP: one POST of the rows per call. */
function httpBridge(
  deriveServerUrl: string | undefined
): Serialize.DeriveBridge | undefined {
  if (deriveServerUrl === undefined) return undefined;
  return {
    async applyLambda(lambdaId, rows) {
      const resp = await fetch(`${deriveServerUrl}/derive/${lambdaId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
      if (!resp.ok) {
        throw new Error(
          `derive ${lambdaId} failed: ${resp.status} ${await resp.text()}`
        );
      }
      return Serialize.readIR(await resp.json());
    },
  };
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
      await Serialize.renderIR(spec.ir, container, spec.render, {
        bridge: httpBridge(spec.deriveServerUrl),
      });
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
