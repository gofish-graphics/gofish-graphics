/**
 * THROWAWAY PROTOTYPE (#1266). Browser-only helper for the Storybook stories:
 * mount a GoFish JSX root with a React client root and resolve once its
 * `<svg>` is in the DOM (the root suspends on async layout first).
 */
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";

export async function mountJSX(
  container: HTMLElement,
  element: ReactElement
): Promise<void> {
  createRoot(container).render(element);
  const t0 = performance.now();
  while (!container.querySelector("svg")) {
    if (performance.now() - t0 > 10_000)
      throw new Error(
        "gofish-react: JSX root did not render an <svg> within 10s"
      );
    await new Promise((r) => setTimeout(r, 20));
  }
}
