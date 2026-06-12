<script setup lang="ts">
import { onMounted, ref } from "vue";

const props = defineProps<{
  spec: object;
  caption?: string;
}>();

const container = ref<HTMLElement | null>(null);

onMounted(async () => {
  if (!container.value) return;
  // Dynamic import keeps the heavy Vega bundle out of pages that don't use it.
  const { default: vegaEmbed } = await import("vega-embed");
  try {
    await vegaEmbed(container.value, props.spec as object, {
      actions: false,
      renderer: "svg",
    });
  } catch (err) {
    container.value.textContent = `(vega-embed error: ${
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
