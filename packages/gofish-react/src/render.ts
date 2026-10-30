/**
 * THROWAWAY PROTOTYPE (#1266). Root rendering: element -> GoFish -> display
 * list -> React `<svg>`.
 *
 * Layout is async (`toDisplayList` returns a promise), so the root component
 * suspends with `use()`. That works with React 19's `prerender` /
 * `renderToReadableStream` (they wait for Suspense) and with a client root.
 * `renderToString` does NOT wait: there, compute the display list first with
 * `displayListOf(element)` and render `<DisplayListSVG doc={...}/>`.
 *
 * Text is measured with a canvas when `document` exists; in Node it falls back
 * to a 0.6em-per-character estimate (gofish-graphics src/ast/shapes/text.tsx),
 * so server and browser layouts of a chart with text differ (a hydration
 * mismatch). Not solved here.
 */
import {
  createElement,
  isValidElement,
  use,
  type ReactElement,
  type ReactNode,
} from "react";
import type { DisplayList } from "gofish-ir";
import { toGoFish } from "./convert";
import { DisplayListSVG } from "./DisplayListSVG";

/** The GoFish value (builder or mark) a JSX element converts to. */
export const toGoFishValue = (element: ReactNode) => toGoFish(element);

/** Run layout and return the display list for a GoFish JSX element. */
export async function displayListOf(
  element: ReactElement<any>
): Promise<DisplayList.DisplayListDocument> {
  const g = toGoFish(element);
  // <GoFish spec w h axes .../>: the props other than `spec` are render options.
  const isSpec =
    isValidElement(element) && (element.type as any)?.gofish?.kind === "spec";
  let renderOptions: Record<string, unknown> = {};
  if (isSpec) {
    const {
      spec: _s,
      children: _c,
      ...rest
    } = element.props as Record<string, unknown>;
    renderOptions = rest;
  }
  return g.toDisplayList(renderOptions);
}

// Keyed on the props object React hands the root component, which is stable
// across the retries of one render. A shortcut: a parent re-render builds new
// props and so relays out.
const cache = new WeakMap<object, Promise<DisplayList.DisplayListDocument>>();

export function GoFishRoot({
  type,
  props,
}: {
  type: any;
  props: Record<string, any>;
}) {
  let p = cache.get(props);
  if (!p) {
    p = displayListOf(createElement(type, props));
    cache.set(props, p);
  }
  return createElement(DisplayListSVG, { doc: use(p) });
}
