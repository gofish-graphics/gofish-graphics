<script setup lang="ts">
/**
 * GoFishExample — renders an example by executing the REAL Storybook story
 * module (not the generated code string).
 *
 * Two ways to target a story:
 *
 *   - `id`      — a gallery StoryExample id (kebab of the gallery title). The
 *                 story's source file + export name are resolved via the
 *                 build-time data loader (storyExamples.data.js).
 *   - `storyId` — any story's harness story id (kebab of `meta.title--export`),
 *                 including untagged stories not in the gallery. Resolved by
 *                 scanning the story modules for a matching export.
 *
 * Either way it dynamically imports the matching `*.stories.tsx` module, runs
 * the story's loaders (if any), invokes `story.render(args, { loaded })`, and
 * appends the returned HTMLElement.
 *
 * The render logic mirrors tests/harness/stories-runner.ts. It runs only on the
 * client (in `onMounted`) so VitePress SSR never executes SolidJS code.
 */
import { onMounted, ref } from "vue";
import { data as storyData } from "../docs/.vitepress/data/storyExamples.data.js";

const props = defineProps<{
  /** StoryExample id (kebab of the gallery title) */
  id?: string;
  /** harness story id (kebab of `meta.title--export`); targets ANY story */
  storyId?: string;
  /** optional CSS scale applied to the rendered chart */
  scale?: number;
}>();

const container = ref<HTMLElement | null>(null);
const error = ref<string | null>(null);

// Lazy glob of every story module — only the matched one is actually imported.
// Guarded by `!import.meta.env.SSR` so the SolidJS story chunks are tree-shaken
// out of the VitePress server bundle entirely (these only ever execute in
// `onMounted`, client-side). Without this guard rollup SSR-compiles every story
// and the Solid SSR codegen fails on browser-only constructs (e.g. `use:`).
const storyModules: Record<string, () => Promise<unknown>> = import.meta.env.SSR
  ? {}
  : import.meta.glob(
      "../../../packages/gofish-graphics/stories/**/*.stories.tsx"
    );

/** Harness story id — mirrors tests/harness + storyExamples.ts. */
function harnessStoryId(title: string, exportName: string): string {
  return `${title}--${exportName}`.toLowerCase().replace(/[\s/]+/g, "-");
}

/** Render a resolved story object into the mount point. */
async function renderStory(story: any) {
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
    container.value!.appendChild(element);
  }
}

/** Resolve a gallery example `id` → its story object via the data loader. */
async function resolveById(id: string): Promise<any> {
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
async function resolveByStoryId(storyId: string): Promise<any> {
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

onMounted(async () => {
  if (!container.value) return;
  if (!props.id && !props.storyId) {
    error.value = "GoFishExample requires an `id` or `storyId`";
    return;
  }
  try {
    const story = props.storyId
      ? await resolveByStoryId(props.storyId)
      : await resolveById(props.id!);
    await renderStory(story);
  } catch (err: any) {
    console.error("GoFishExample render failed:", err);
    error.value = err?.message ?? String(err);
  }
});
</script>

<template>
  <div class="gofish-example">
    <div v-if="error" class="gofish-example-error">
      ⚠️ Failed to render example "{{ id ?? storyId }}": {{ error }}
    </div>
    <div
      ref="container"
      class="gofish-example-canvas"
      :style="
        scale
          ? { transform: `scale(${scale})`, transformOrigin: 'top left' }
          : undefined
      "
    />
  </div>
</template>

<style scoped>
.gofish-example {
  padding-bottom: 1rem;
}
.gofish-example-canvas {
  display: inline-block;
}
.gofish-example-error {
  color: var(--vp-c-danger-1, #d33);
  font-size: 0.875rem;
  padding: 0.5rem 0;
}
</style>
