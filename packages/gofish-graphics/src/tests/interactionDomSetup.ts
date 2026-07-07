/**
 * Headless DOM for the interaction tests (imported FIRST so happy-dom globals
 * exist before the built library and solid-js/web evaluate). Rendering the
 * live SVG backend and driving synthetic pointer/wheel events both need a DOM;
 * happy-dom is the lightest that supports `closest`, pointer capture, and
 * `requestAnimationFrame`.
 *
 * `requestAnimationFrame` is shimmed to a `setTimeout(0)` so the runtime's
 * rAF-coalesced re-renders flush deterministically under a `setTimeout(0)`
 * await in the tests.
 */
import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost/" });
const g = globalThis as unknown as Record<string, unknown>;

const copy = [
  "window",
  "document",
  "navigator",
  "Element",
  "Node",
  "HTMLElement",
  "SVGElement",
  "SVGSVGElement",
  "DocumentFragment",
  "Text",
  "Comment",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "PointerEvent",
  "WheelEvent",
  "customElements",
  "getComputedStyle",
] as const;

for (const key of copy) {
  if (g[key] === undefined) {
    const v = (win as unknown as Record<string, unknown>)[key];
    g[key] = typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(win) : v;
  }
}
g.window = win;
g.document = win.document;

// Deterministic rAF: a plain macrotask the tests flush with `setTimeout(0)`.
g.requestAnimationFrame = (cb: (t: number) => void): number =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number): void => clearTimeout(id);

/** Await one macrotask so scheduled re-renders (and their async layout) run. */
export const nextTick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/** Let a chain of scheduled re-renders + async layout settle. */
export async function settle(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) await nextTick();
}
