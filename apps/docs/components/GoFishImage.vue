<script setup lang="ts">
/**
 * GoFishImage — the static counterpart of GoFishExample: a picture of a story,
 * captured at docs-build time, for `::: gofish story:<id> image` and
 * `::: gofish example:<id> image` containers (see markdown-it-gofish.ts).
 *
 * The markdown plugin passes the picture's site path (`/previews/<storyId>.png`).
 * It is a component rather than a plain <img> in the markdown for one reason:
 * Vue compiles a static `<img src="/…">` in a page into a build-time import of
 * that file, so a picture that has not been captured yet (e.g. `docs:dev`
 * before `pnpm --filter docs docs:images`) would break the whole page. Here the
 * URL is bound at runtime through `withBase`, as the gallery's thumbnails are,
 * so a missing picture is only a missing picture.
 */
import { withBase } from "vitepress";

defineProps<{
  /** Site path of the captured PNG, e.g. "/previews/tutorials-basics--basics.png". */
  src: string;
  /** The story's title. */
  alt: string;
}>();

function onError(event: Event) {
  console.warn(
    `gofish image not captured: ${(event.target as HTMLImageElement).src} — ` +
      "run `pnpm --filter docs docs:images` (the docs build does this automatically)."
  );
}
</script>

<template>
  <!-- Captured at deviceScaleFactor 2 (capture-docs-images.ts); the `2x`
       descriptor lays it out at the story's own CSS size. -->
  <img
    class="gofish-image"
    :src="withBase(src)"
    :srcset="`${withBase(src)} 2x`"
    :alt="alt"
    decoding="async"
    @error="onError"
  />
</template>

<style scoped>
.gofish-image {
  display: block;
  max-width: 100%;
  height: auto;
}
</style>
