// VitePress data loader exposing the gallery story examples to pages and
// components at build time. Mirrors the conventions in examples.data.js.
//
// The transform/scan logic lives in ./storyExamples.ts (Node-side, dependency
// light) so it can be shared by markdown-it plugins and verification scripts.
import { loadStoryExamples } from "./storyExamples.ts";

export default {
  // Re-run the loader when any story file changes during dev.
  watch: [
    "../../../../../packages/gofish-graphics/stories/**/*.stories.tsx",
    "../../../../../packages/gofish-gotree/stories/**/*.stories.tsx",
    "../../../../../packages/gofish-neo/stories/**/*.stories.tsx",
  ],
  load() {
    const examples = loadStoryExamples();
    const byId = Object.fromEntries(examples.map((ex) => [ex.id, ex]));
    return {
      examples,
      byId,
    };
  },
};
