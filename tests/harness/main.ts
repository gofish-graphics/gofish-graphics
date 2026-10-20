/**
 * Python parity render harness: the page Playwright drives.
 *
 * It renders a Python story's IR through the library's own deserializer,
 * `Serialize.renderIR`, the same function the notebook widget calls. Only the
 * callback transport is the harness's own: Python callbacks (derive
 * operators, lambda accessors, mark functions) run in
 * `tests/scripts/derive-server.py` and are reached over HTTP POST to
 * `<deriveServerUrl>/derive/<id>` instead of over anywidget traitlets. The
 * tables (the rows of every chart that has rows of its own) cross as the
 * widget's do: Arrow bytes by table id, from Python's `ir_payload`, decoded
 * by the widget's own decode (`decodeTables`), so parity covers that
 * transport too. A mark function's reply is a payload of the same shape.
 *
 * The caller (Playwright) calls `__renderChart__(spec)` (or sets
 * `__GOFISH_SPEC__` before load) and waits for `__GOFISH_RENDER_COMPLETE__`.
 */

import { Serialize } from "gofish-graphics";
import type { Frontend } from "gofish-ir";
import { decodeTables } from "gofish-python/arrowDecode";

/**
 * What `capture-python-dom.ts` sends: a story's payload as the derive server
 * returns it (the builder's own IR, and its tables as base64 Arrow by id),
 * the story's render options, and the derive server's address.
 */
interface HarnessSpec {
  ir: Frontend.FrontendIR;
  tables: Record<string, string>;
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

/** The derive bridge over HTTP: one POST of the rows per call. A derive or
 *  an accessor answers with rows, a mark function with a payload whose
 *  tables cross as Arrow, like the story's own. */
function httpBridge(
  deriveServerUrl: string | undefined
): Serialize.DeriveBridge | undefined {
  if (deriveServerUrl === undefined) return undefined;
  const post = async (lambdaId: string, rows: any[]) => {
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
  };
  return {
    applyLambda: post,
    async applyMark(lambdaId, rows) {
      const { ir, tables } = await post(lambdaId, rows);
      return { ir, tables: decodeTables(tables) };
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
        tables: decodeTables(spec.tables),
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
