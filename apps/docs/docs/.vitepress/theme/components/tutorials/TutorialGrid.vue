<script setup lang="ts">
/**
 * TutorialGrid — the card grid on the tutorials index page.
 *
 * It is only a layout container: each child is a <TutorialCard> whose default
 * slot holds the live preview (a `::: gofish story:<id> hidden` container that
 * the markdown plugin turns into a <GoFishExample>). Styling tokens come from
 * VitePress' own theme variables so the grid follows light/dark mode.
 */
</script>

<template>
  <div class="tutorial-grid">
    <slot />
  </div>
</template>

<style scoped>
.tutorial-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
  margin: 28px 0;
}

@media (max-width: 480px) {
  .tutorial-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
