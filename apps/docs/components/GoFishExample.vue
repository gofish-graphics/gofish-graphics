<script setup lang="ts">
/**
 * GoFishExample — renders a gallery example by executing the REAL Storybook
 * story module (not the generated code string).
 *
 * Given a StoryExample `id`, it resolves the story's source file + export name
 * via the build-time data loader, dynamically imports the matching
 * `*.stories.tsx` module, runs the story's loaders (if any), invokes
 * `story.render(args, { loaded })`, and appends the returned HTMLElement.
 *
 * The render logic mirrors tests/harness/stories-runner.ts. It runs only on the
 * client (in `onMounted`) so VitePress SSR never executes SolidJS code.
 */
import { onMounted, ref } from "vue";
import { data as storyData } from "../docs/.vitepress/data/storyExamples.data.js";

const props = defineProps<{
  /** StoryExample id (kebab of the gallery title) */
  id: string;
  /** optional CSS scale applied to the rendered chart */
  scale?: number;
}>();

const container = ref<HTMLElement | null>(null);
const error = ref<string | null>(null);

// Lazy glob of every story module — only the matched one is actually imported.
const storyModules = import.meta.glob(
  "../../../packages/gofish-graphics/stories/**/*.stories.tsx"
);

onMounted(async () => {
  if (!container.value) return;

  const example = (storyData.examples as any[]).find(
    (ex) => ex.id === props.id
  );
  if (!example) {
    error.value = `Unknown example id: ${props.id}`;
    return;
  }

  // Find the glob key whose path ends with the example's repo-relative storyFile.
  const moduleKey = Object.keys(storyModules).find((key) =>
    key.endsWith(example.storyFile.replace(/^.*?packages\//, "packages/"))
  );
  if (!moduleKey) {
    error.value = `Could not locate story module for ${example.storyFile}`;
    return;
  }

  try {
    const mod: any = await storyModules[moduleKey]();
    const story = mod[example.exportName];
    if (!story || typeof story.render !== "function") {
      throw new Error(`Story export "${example.exportName}" has no render()`);
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
      container.value.appendChild(element);
    }
  } catch (err: any) {
    console.error("GoFishExample render failed:", err);
    error.value = err?.message ?? String(err);
  }
});
</script>

<template>
  <div class="gofish-example">
    <div v-if="error" class="gofish-example-error">
      ⚠️ Failed to render example "{{ id }}": {{ error }}
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
