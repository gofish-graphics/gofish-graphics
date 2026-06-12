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
 * The resolve/render logic lives in ./storyRender (shared with the museum
 * gallery's galleryRender.ts) and mirrors tests/harness/stories-runner.ts. It
 * runs only on the client (in `onMounted`) so VitePress SSR never executes
 * SolidJS code.
 */
import { onMounted, ref } from "vue";
import { resolveById, resolveByStoryId, renderStoryInto } from "./storyRender";

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
    await renderStoryInto(story, container.value);
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
