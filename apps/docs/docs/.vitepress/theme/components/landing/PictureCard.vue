<script setup lang="ts">
/**
 * One taped, tilted picture card of the landing page (a hero collage card or a
 * spectrum card): the picture of a gallery example, captured at docs-build
 * time, with a handwritten caption, linking to the example's page in the
 * reader's language. Sizes that differ between the two places are set in
 * landing.css by context (.collage / .specimens).
 */
import { computed } from "vue";
import GoFishImage from "../../../../../components/GoFishImage.vue";
import { docsLang, exampleHref } from "../../docsLang";
import { exampleImagePath } from "../../../storyImages";
import type { LandingCard } from "./landingCards";

const props = defineProps<{
  card: LandingCard;
  /** Lift the card on hover. */
  lift?: boolean;
}>();

const href = computed(() => exampleHref(docsLang.value, props.card.id));
</script>

<template>
  <!-- The tilted root is the element a layout places (a collage grid cell, a
       spectrum snap target); the link fills it. -->
  <div
    class="pic"
    :style="{ '--tilt': `${card.tilt}deg`, '--tape-angle': `${card.tape}deg` }"
  >
    <a :href="href">
      <span class="card" :class="{ lift }">
        <span class="tape" aria-hidden="true"></span>
        <!-- lazy: the collage is display:none on wide screens, and Chrome
             does not fetch a lazy image inside a display:none ancestor -->
        <GoFishImage
          :src="exampleImagePath(card.id)"
          :alt="card.alt"
          :style="{ aspectRatio: card.aspect }"
          loading="lazy"
        />
      </span>
      <span class="cap">{{ card.caption }}</span>
    </a>
  </div>
</template>
