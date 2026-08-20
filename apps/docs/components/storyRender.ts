/**
 * storyRender — shared client-only logic for resolving and rendering a Storybook
 * story module into a DOM node. Used by GoFishExample.vue (a single embedded
 * example) and galleryRender.ts (the museum-hall gallery), so the two share one
 * implementation rather than duplicating the resolve/render surface.
 *
 * It mirrors tests/harness/stories-runner.ts: dynamically import the matching
 * `*.stories.tsx` module, run the story's loaders (if any), invoke
 * `story.render(args, { loaded })`, and append the returned HTMLElement.
 *
 * Everything here is client-only — the glob is SSR-guarded and the render path
 * executes SolidJS, so callers must only invoke it in `onMounted`.
 */
import { data as storyData } from "../docs/.vitepress/data/storyExamples.data.js";

// Lazy glob of every story module — only the matched one is actually imported.
// Guarded by `!import.meta.env.SSR` so the SolidJS story chunks are tree-shaken
// out of the VitePress server bundle entirely (these only ever execute
// client-side). Without this guard rollup SSR-compiles every story and the
// Solid SSR codegen fails on browser-only constructs (e.g. `use:`).
const storyModules: Record<string, () => Promise<unknown>> = import.meta.env.SSR
  ? {}
  : {
      ...import.meta.glob(
        "../../../packages/gofish-graphics/stories/**/*.stories.tsx"
      ),
      ...import.meta.glob(
        "../../../packages/gofish-gotree/stories/**/*.stories.tsx"
      ),
      ...import.meta.glob(
        "../../../packages/gofish-neo/stories/**/*.stories.tsx"
      ),
    };

/** Harness story id — mirrors tests/harness + storyExamples.ts. */
export function harnessStoryId(title: string, exportName: string): string {
  return `${title}--${exportName}`.toLowerCase().replace(/[\s/]+/g, "-");
}

/** Resolve a gallery example `id` → its story object via the data loader. */
export async function resolveById(id: string): Promise<any> {
  const example = (storyData.examples as any[]).find((ex) => ex.id === id);
  if (!example) throw new Error(`Unknown example id: ${id}`);
  const moduleKey = Object.keys(storyModules).find((key) =>
    key.endsWith(example.storyFile.replace(/^.*?packages\//, "packages/"))
  );
  if (!moduleKey) {
    throw new Error(`Could not locate story module for ${example.storyFile}`);
  }
  const mod: any = await storyModules[moduleKey]();
  const story = mod[example.exportName];
  if (!story) {
    throw new Error(`Story export "${example.exportName}" not found`);
  }
  return story;
}

/** Resolve any story by harness `storyId` by scanning the story modules. */
export async function resolveByStoryId(storyId: string): Promise<any> {
  for (const key of Object.keys(storyModules)) {
    let mod: any;
    try {
      mod = await storyModules[key]();
    } catch {
      continue; // skip modules that fail to import
    }
    const title = mod.default?.title;
    if (typeof title !== "string") continue;
    for (const exportName of Object.keys(mod)) {
      if (exportName === "default") continue;
      const story = mod[exportName];
      if (
        story &&
        typeof story.render === "function" &&
        harnessStoryId(title, exportName) === storyId
      ) {
        return story;
      }
    }
  }
  throw new Error(`Unknown story id: ${storyId}`);
}

/**
 * Render a resolved story object into `container`. Runs the story's loaders
 * (vega-lite stories that fetch datasets), invokes `story.render(args, {
 * loaded })`, and appends the returned HTMLElement.
 *
 * Returns the appended element (or null if render produced no element). NOTE:
 * gofish renders through an async, rAF-driven layout pipeline, so the chart
 * `<svg>` is generally NOT present synchronously after this promise resolves —
 * callers that measure the result must wait for the svg to appear.
 */
export async function renderStoryInto(
  story: any,
  container: HTMLElement
): Promise<HTMLElement | null> {
  if (!story || typeof story.render !== "function") {
    throw new Error("Story has no render()");
  }
  // Run loaders (vega-lite stories that fetch datasets), mirroring the harness.
  let context: any = {};
  if (story.loaders?.length) {
    const loaded: Record<string, any> = {};
    for (const loader of story.loaders) {
      Object.assign(loaded, await loader());
    }
    context = { loaded };
  }
  const args = { ...story.args };
  const element = await story.render(args, context);
  if (element instanceof HTMLElement) {
    // Stories append their container to document.body via initializeContainer;
    // move it into our mount point instead.
    container.appendChild(element);
    return element;
  }
  return null;
}
