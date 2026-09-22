<script setup lang="ts">
/**
 * TutorialGrid — the card grid on the tutorials index page.
 *
 * It is only a layout container: each child is a <TutorialCard> whose default
 * slot holds the live previews (`::: gofish story:<id> hidden` containers that
 * the markdown plugin turns into <GoFishExample>s). `cols` is the desktop
 * column count; the grid drops to two columns on tablets and one on phones.
 * Styling tokens come from VitePress' own theme variables so the grid follows
 * light/dark mode.
 */
withDefaults(defineProps<{ cols?: number | string }>(), { cols: 3 });
</script>

<template>
  <div class="tutorial-grid" :style="{ '--tutorial-cols': String(cols) }">
    <slot />
  </div>
</template>

<style scoped>
.tutorial-grid {
  display: grid;
  grid-template-columns: repeat(var(--tutorial-cols), minmax(0, 1fr));
  gap: 16px;
  margin: 20px 0 32px;
}

@media (max-width: 959px) {
  .tutorial-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .tutorial-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
}
</style>
