<script setup lang="ts">
import { onMounted, ref } from "vue";

const props = defineProps<{
  // A function (Plot, d3) => HTMLElement | SVGElement that returns the figure.
  // Passed as a function so the page doesn't have to import Plot itself.
  build: (
    Plot: typeof import("@observablehq/plot"),
    d3: typeof import("d3")
  ) => Node;
  caption?: string;
}>();

const container = ref<HTMLElement | null>(null);

onMounted(async () => {
  if (!container.value) return;
  try {
    const [Plot, d3] = await Promise.all([
      import("@observablehq/plot"),
      import("d3"),
    ]);
    const figure = props.build(Plot, d3);
    container.value.append(figure);
  } catch (err) {
    container.value.textContent = `(plot error: ${
      err instanceof Error ? err.message : String(err)
    })`;
  }
});
</script>

<template>
  <figure class="failing-embed">
    <div ref="container" class="failing-embed-canvas" />
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.failing-embed {
  margin: 1.25rem 0;
  padding: 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
}
.failing-embed-canvas {
  display: flex;
  justify-content: center;
  min-height: 80px;
}
.failing-embed figcaption {
  margin-top: 0.5rem;
  font-size: 0.85em;
  color: var(--vp-c-text-2);
  text-align: center;
}
</style>
