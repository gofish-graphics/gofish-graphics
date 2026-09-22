<script setup lang="ts">
/**
 * TutorialCard — one cell of the tutorials index grid: a live preview of the
 * finished example, the tutorial's title, one sentence about what you build,
 * and what it depends on.
 *
 * The preview comes in through the default slot, so the markdown page can write
 *
 *   <TutorialCard title="Charts" href="/js/tutorials/charts" ...>
 *
 *   ::: gofish example:polar-ribbon-chart hidden
 *   :::
 *
 *   </TutorialCard>
 *
 * and the container plugin renders a real <GoFishExample> inside the card.
 *
 * Stories render at their own size (500x300, or much larger for a diagram), so
 * the card measures the slot's natural layout box and scales it down to fit the
 * preview frame. The chart arrives asynchronously (the layout pipeline is
 * rAF-driven), hence the MutationObserver; the ResizeObserver re-fits when the
 * grid reflows. Transforms are paint-only, so the measurement never has to undo
 * the scale it applied.
 */
import { onBeforeUnmount, onMounted, ref } from "vue";

defineProps<{
  /** Tutorial name, e.g. "Charts". */
  title: string;
  /** Route the card links to. */
  href: string;
  /** What you build, in one plain sentence. */
  blurb?: string;
  /** What it depends on, e.g. "Start here" or "Builds on Basics". */
  requires?: string;
  /** Extra caveat, e.g. "JavaScript only". */
  note?: string;
}>();

const frame = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const scale = ref(1);

let raf = 0;
let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;

function measure() {
  const st = stage.value;
  const fr = frame.value;
  if (!st || !fr) return;
  const w = st.offsetWidth;
  const h = st.offsetHeight;
  const fw = fr.clientWidth;
  const fh = fr.clientHeight;
  if (!w || !h || !fw || !fh) return;
  scale.value = Math.min(1, fw / w, fh / h);
}

function scheduleMeasure() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    measure();
  });
}

onMounted(() => {
  scheduleMeasure();
  if (stage.value && typeof MutationObserver !== "undefined") {
    mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(stage.value, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["width", "height", "style", "viewBox"],
    });
  }
  if (frame.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(frame.value);
  }
});

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
  mutationObserver?.disconnect();
  resizeObserver?.disconnect();
});
</script>

<template>
  <a class="tutorial-card" :href="href">
    <div class="tutorial-card__frame" ref="frame">
      <div
        class="tutorial-card__stage"
        ref="stage"
        :style="{ transform: `translate(-50%, -50%) scale(${scale})` }"
      >
        <slot />
      </div>
    </div>
    <div class="tutorial-card__body">
      <h3 class="tutorial-card__title">{{ title }}</h3>
      <p v-if="blurb" class="tutorial-card__blurb">{{ blurb }}</p>
      <p v-if="requires || note" class="tutorial-card__meta">
        <span v-if="requires">{{ requires }}</span>
        <span v-if="requires && note" class="tutorial-card__dot">·</span>
        <span v-if="note">{{ note }}</span>
      </p>
    </div>
  </a>
</template>

<style scoped>
.tutorial-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg);
  color: inherit;
  text-decoration: none;
  transition:
    border-color 0.2s,
    transform 0.2s;
}
.tutorial-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
}

.tutorial-card__frame {
  position: relative;
  height: 180px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
}

/* The story renders at its own size; the stage is laid out at that natural
   size (position: absolute + width: max-content) and then scaled to fit. */
.tutorial-card__stage {
  position: absolute;
  top: 50%;
  left: 50%;
  width: max-content;
  transform-origin: center center;
  /* The preview is decoration: clicks belong to the card's link, and the
     interactive stories should not capture drags here. */
  pointer-events: none;
}
/* The embedded example adds its own bottom padding; drop it inside a card. */
.tutorial-card__stage :deep(.gofish-example) {
  padding-bottom: 0;
}

.tutorial-card__body {
  padding: 14px 16px 16px;
}
.tutorial-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--vp-c-text-1);
  border-top: none;
  padding-top: 0;
}
.tutorial-card:hover .tutorial-card__title {
  color: var(--vp-c-brand-1);
}
.tutorial-card__blurb {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
.tutorial-card__meta {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--vp-c-text-3);
}
.tutorial-card__dot {
  margin: 0 5px;
}

@media (max-width: 480px) {
  .tutorial-card__frame {
    height: 150px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tutorial-card {
    transition: none;
  }
  .tutorial-card:hover {
    transform: none;
  }
}
</style>
