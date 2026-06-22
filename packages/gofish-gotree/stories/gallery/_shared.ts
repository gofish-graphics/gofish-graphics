// Shared scaffolding for the GoTree gallery ports. Each gallery story maps one
// example from https://github.com/BIT-VIS/gotree (gallery/<Name>/dsl.json) onto
// a GoFish `combine({ x, y })` spec. Relation → combine kind:
//   include → nest, juxtapose/flatten → distribute, within/align → align.
//
// The gallery-published stories (tags: ["gallery"]) instead import the grammar
// from "../../src", data/colors from "../data", and `initializeContainer` from
// "../helper" directly, so the docs example scanner can synthesize a clean
// standalone snippet. This module remains for the not-yet-published stories: it
// re-exports those pieces and keeps the `mount` convenience wrapper.
import { tree, combine, alternate, perDepth } from "../../src";
import { sampleTree, depthBlues, byDepth } from "../data";
import { initializeContainer } from "../helper";

export { tree, combine, alternate, perDepth };
export { sampleTree, depthBlues, byDepth };
export { fitToContent } from "../helper";
export type { CombineAxis } from "../../src";

// Render a GoTreeSpec into a fresh container and fit it. Returns the container.
export const mount = (
  spec: any,
  size: { w: number; h: number } = { w: 640, h: 420 },
  data: any = sampleTree
) => {
  const c = initializeContainer(size);
  try {
    tree(spec, data).render(c, size);
  } catch (e) {
    c.textContent = `render error: ${String(e)}`;
    c.style.color = "#c00";
  }
  return c;
};
