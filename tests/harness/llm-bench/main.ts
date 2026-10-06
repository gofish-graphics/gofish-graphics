/**
 * Harness page for the LLM authoring benchmark (tests/scripts/llm-bench.ts).
 *
 * The runner opens this page in a fresh browser context per render and calls
 * one of the `window.llmBench` functions below, then `extract()`.
 *
 *   renderModule — gofish / d3 / plot: a JS module whose default export is
 *                  `render(container, data)`; it may return a promise.
 *   renderReact  — recharts: a module (already compiled from JSX to JS by the
 *                  runner) whose default export is a React component
 *                  `Chart({ data })`.
 *   renderSvg    — script arms (matplotlib, ggplot2, altair): the SVG file
 *                  the script saved, shown at the size the prompt asked for
 *                  (see renderSvg).
 *
 * For gofish and plot the runner calls `trackCreation()` before the render
 * and `provenance(arm)` after it; for recharts, `provenance("recharts")`.
 * These are the arm contract (tests/scripts/llm-bench/contract.ts).
 */

import {
  rechartsProvenance,
  stackProvenance,
  trackCreation,
} from "../../scripts/llm-bench/contract";
import { extractRecord } from "../../scripts/llm-bench/extract";
import { prewarm } from "./prewarm";

const root = document.getElementById("root") as HTMLElement;

function describe(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const head = `${e.name}: ${e.message}`;
  // V8 stacks start with the message; don't repeat it.
  return e.stack?.startsWith(head) ? e.stack : `${head}\n${e.stack ?? ""}`;
}

async function importModule(url: string): Promise<any> {
  try {
    return await import(/* @vite-ignore */ url);
  } catch (e) {
    // A failed dynamic import says only "Failed to fetch dynamically imported
    // module"; Vite's own error (unresolved import, transform error) is in the
    // error page it serves for the module, so fetch it for the real message.
    let detail = "";
    try {
      const body = await (await fetch(url)).text();
      const m = /const error = (\{.*\})\s*\n/.exec(body);
      if (m) detail = JSON.parse(m[1]).message ?? "";
    } catch {
      // keep the browser's message
    }
    if (detail) throw new Error(`Could not load the program: ${detail}`);
    throw e;
  }
}

async function renderModule(url: string, data: unknown): Promise<void> {
  const mod = await importModule(url);
  if (typeof mod.default !== "function")
    throw new Error(
      "The module has no default export function render(container, data)."
    );
  await mod.default(root, data);
}

async function renderReact(url: string, data: unknown): Promise<void> {
  const [mod, React, ReactDOM, { flushSync }] = await Promise.all([
    importModule(url),
    import("react"),
    import("react-dom/client"),
    import("react-dom"),
  ]);
  if (typeof mod.default !== "function")
    throw new Error(
      "The module has no default export component Chart({ data })."
    );
  const reactRoot = ReactDOM.createRoot(root);
  let error: unknown = null;
  class Boundary extends React.Component<
    { children: any },
    { failed: boolean }
  > {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    componentDidCatch(e: unknown) {
      error = e;
    }
    render() {
      return this.state.failed ? null : this.props.children;
    }
  }
  flushSync(() => {
    reactRoot.render(
      React.createElement(
        Boundary,
        null,
        React.createElement(mod.default, { data })
      )
    );
  });
  if (error) throw error;
}

/** Show a saved SVG at the size the prompt asked for. matplotlib and
 *  svglite (ggplot2) write the figure size in points (72 per inch) whatever
 *  the dpi, while their prompts define size in inches at 100 px each
 *  (figsize at dpi 100, ggsave's width and height in inches); rewrite a
 *  width/height in pt to inches * 100 px, keeping the viewBox, so every arm
 *  is measured in the same CSS pixels. Vega (altair) writes px, which is
 *  left as it is. */
function renderSvg(svgText: string): void {
  root.innerHTML = svgText;
  const svg = root.querySelector("svg");
  if (!svg) throw new Error("The saved file contains no <svg> element.");
  for (const attr of ["width", "height"]) {
    const v = svg.getAttribute(attr) ?? "";
    const m = /^([\d.]+)pt$/.exec(v);
    if (m) svg.setAttribute(attr, `${(parseFloat(m[1]) / 72) * 100}px`);
  }
}

/** Why this render is not a usable picture, or null if it is. */
function problem(): string | null {
  if (root.querySelector("canvas"))
    return "The output contains a <canvas>; the benchmark needs SVG output.";
  const svg = root.querySelector("svg");
  if (!svg) return "No <svg> element was rendered into the container.";
  const box = svg.getBoundingClientRect();
  if (box.width === 0 || box.height === 0)
    return "The rendered <svg> has zero size.";
  if (
    !root.querySelector(
      "svg rect, svg circle, svg ellipse, svg line, svg polyline, svg polygon, svg path, svg text, svg use"
    )
  )
    return "The rendered <svg> is empty.";
  return null;
}

/** Why the picture breaks the arm contract, or null. Runs before
 *  `extract()`, which rewrites <use> elements. */
function provenance(lib: "gofish" | "plot" | "recharts"): string | null {
  return lib === "recharts"
    ? rechartsProvenance(root)
    : stackProvenance(lib, root);
}

/** Resolves once every image in the container (SVG `<image>`, HTML `<img>`)
 *  has loaded and decoded, or failed to, so the screenshot shows them.
 *  Image loads are network work that the fake clock does not drive. */
async function imagesReady(): Promise<void> {
  const hrefs = new Set<string>();
  for (const el of Array.from(root.querySelectorAll("image, img"))) {
    const href =
      el instanceof HTMLImageElement
        ? el.currentSrc || el.src
        : (el.getAttribute("href") ?? el.getAttribute("xlink:href"));
    if (href) hrefs.add(new URL(href, document.baseURI).href);
  }
  await Promise.all(
    Array.from(hrefs).map((href) => {
      const img = new Image();
      img.src = href;
      return img.decode().catch(() => {});
    })
  );
}

/** Snapshot of the largest <svg> in the container, as a standalone file. */
function svgMarkup(): string {
  const svgs = Array.from(root.querySelectorAll("svg")).filter(
    (s) => !s.parentElement?.closest("svg")
  );
  const area = (s: SVGSVGElement) => {
    const b = s.getBoundingClientRect();
    return b.width * b.height;
  };
  const svg = svgs.sort((a, b) => area(b) - area(a))[0];
  if (!svg) return "";
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(copy);
}

declare global {
  interface Window {
    llmBench: typeof api;
  }
}

const api = {
  prewarm,
  renderModule,
  renderReact,
  renderSvg,
  problem,
  trackCreation,
  provenance,
  svgMarkup,
  imagesReady,
  extract: () => extractRecord(root),
  describe,
};
window.llmBench = api;
