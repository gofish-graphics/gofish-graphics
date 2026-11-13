<script setup lang="ts">
// The frame of every figure in "Under the Sea": the wide figure
// container, its `id="fig-<name>"` anchor (the cover tiles link to it), the
// legend and the caption. The figure's content is the default slot and the
// caption the `caption` slot. With `still` (set by the book cover) only the
// content shows: no legend and no caption. <BookStepper> builds on it, so a
// stepping figure and a static one have the same frame. Styles:
// theme/book-stepper.css. See apps/docs/book/README.md, "Figures".
import { computed } from "vue";
import { KINDS, KIND_LABEL, type FigKind } from "./bookFigure";
import "../../book-stepper.css";

const props = defineProps<{
  /** The anchor, "fig-<name>", where <name> is the figure's file name part. */
  id: string;
  /** The palette kinds the figure uses, listed in the legend. */
  kinds?: FigKind[];
  still?: boolean;
}>();

const legend = computed(() => KINDS.filter((k) => props.kinds?.includes(k)));
</script>

<template>
  <figure :id="id" class="book-figure book-wide" :class="{ 'is-still': still }">
    <div class="bf-body">
      <slot />
      <ul v-if="!still && legend.length" class="bf-legend" aria-label="Legend">
        <li v-for="k in legend" :key="k">
          <span class="bf-swatch" :class="`k-${k}`"></span>{{ KIND_LABEL[k] }}
        </li>
      </ul>
    </div>
    <figcaption v-if="!still && $slots.caption">
      <slot name="caption" />
    </figcaption>
  </figure>
</template>
