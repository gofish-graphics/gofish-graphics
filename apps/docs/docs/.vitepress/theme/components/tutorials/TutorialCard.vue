<script setup lang="ts">
/**
 * TutorialCard — one cell of the tutorials index grid, modelled on the TikZ
 * manual's tutorial index: a thin bordered box that is almost entirely picture,
 * with a compact title bar under it. The whole cell is one link.
 *
 * The pictures come in through the default slot, so the markdown page can write
 *
 *   <TutorialCard title="Charts" href="/js/tutorials/charts">
 *
 *   ::: gofish example:polar-ribbon-chart image hidden
 *   :::
 *
 *   </TutorialCard>
 *
 * and the container plugin renders a <GoFishImage> inside the card: a PNG of
 * the story captured at docs-build time, already cropped to its drawing (see
 * capture-docs-images.ts). A card may hold SEVERAL such containers; they share
 * the preview frame as a grid (one row up to three, two by two for four) and
 * each picture is fitted to its own cell with `object-fit: contain`.
 *
 * Previews are pictures, not live stories: a live `::: gofish` container here
 * would render at its own size, unfitted.
 */
import { computed } from "vue";

const props = defineProps<{
  /** Tutorial name, e.g. "Charts". */
  title: string;
  /** Route the card links to. */
  href: string;
  /**
   * Position of a mouse-pointer glyph drawn over the preview, as two CSS
   * lengths/percentages, e.g. "58% 42%". Used to show that a preview is
   * something you drag.
   */
  pointer?: string;
}>();

const pointerStyle = computed(() => {
  if (!props.pointer) return undefined;
  const [left, top] = props.pointer.trim().split(/\s+/);
  return { left, top: top ?? left };
});
</script>

<template>
  <a class="tutorial-card" :href="href">
    <div class="tutorial-card__frame">
      <div class="tutorial-card__stage">
        <slot />
      </div>
      <svg
        v-if="pointer"
        class="tutorial-card__pointer"
        :style="pointerStyle"
        viewBox="0 0 12 18"
        width="18"
        height="27"
        aria-hidden="true"
      >
        <path
          d="M1 1 L1 15.2 L4.5 11.8 L6.9 16.9 L9.1 15.9 L6.8 11 L11 11 Z"
          fill="#000"
          stroke="#fff"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
      </svg>
    </div>
    <div class="tutorial-card__bar">{{ title }}</div>
  </a>
</template>

<style scoped>
.tutorial-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  transition: border-color 0.2s;
}
.tutorial-card:hover {
  border-color: var(--vp-c-brand-1);
}

/* Picture area: the page background, edge to edge, ~3:2. */
.tutorial-card__frame {
  position: relative;
  aspect-ratio: 3 / 2;
  padding: 7px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

/* Grid of previews, one cell per `::: gofish` container: a single row of equal
   columns, or two by two once there are four (which reads better than four
   slivers). */
.tutorial-card__stage {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-rows: minmax(0, 1fr);
  gap: 6px;
  width: 100%;
  height: 100%;
  /* The preview is decoration: clicks belong to the card's link. */
  pointer-events: none;
}
.tutorial-card__stage:has(> :nth-child(4)) {
  grid-auto-flow: row;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.tutorial-card__stage > * {
  min-width: 0;
  min-height: 0;
}
.tutorial-card__stage :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.tutorial-card__pointer {
  position: absolute;
  margin: -2px 0 0 -2px;
  pointer-events: none;
}

.tutorial-card__bar {
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-brand-1);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.3;
  text-align: center;
  padding: 7px 8px;
}
</style>
