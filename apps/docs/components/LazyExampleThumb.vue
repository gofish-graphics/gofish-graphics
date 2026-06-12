<script setup lang="ts">
/**
 * LazyExampleThumb — a viewport-gated thumbnail for the gallery grid/list.
 *
 * Renders the live story (<GoFishExample>) only once the card scrolls near the
 * viewport, so 62 SolidJS charts don't all execute on first paint. Falls back
 * to a plain title card if the story errors. Scaled down with a top-left
 * origin and cropped by the parent's overflow:hidden.
 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import GoFishExample from "./GoFishExample.vue";

const props = defineProps<{
  id: string;
  title: string;
  scale?: number;
}>();

const root = ref<HTMLElement | null>(null);
const scaler = ref<HTMLElement | null>(null);
const show = ref(false);
const failed = ref(false);
// Computed transform that fits the rendered chart inside the thumb box.
const fitStyle = ref<Record<string, string>>({ visibility: "hidden" });
let observer: IntersectionObserver | null = null;
let contentObserver: MutationObserver | null = null;

// The story SVGs have fixed width/height and NO viewBox, so they cannot be
// rescaled with CSS width/height alone. After the chart mounts (Solid renders
// asynchronously under Suspense), measure its natural size and apply a single
// uniform transform: scale() that fits it into the thumb box, centered. A fixed
// scale + top-left origin (the previous approach) cropped every chart to its
// empty top-left corner, so the gallery looked blank even though the charts had
// rendered.
function fit() {
  const box = root.value;
  const inner = scaler.value;
  if (!box || !inner) return;
  // getBoundingClientRect reflects any transform already applied; clear it first
  // so we measure the chart's natural (unscaled) size.
  const prev = inner.style.transform;
  inner.style.transform = "none";
  const natW = inner.offsetWidth;
  const natH = inner.offsetHeight;
  inner.style.transform = prev;
  if (!natW || !natH) return; // chart not laid out yet
  const pad = 10; // breathing room inside the crop
  const s = Math.min(
    (box.clientWidth - pad * 2) / natW,
    (box.clientHeight - pad * 2) / natH,
    1
  );
  fitStyle.value = {
    transform: `scale(${s > 0 ? s : 1})`,
    transformOrigin: "center center",
    visibility: "visible",
  };
}

onMounted(() => {
  if (typeof IntersectionObserver === "undefined") {
    show.value = true;
    return;
  }
  // Watch the (always-present) root for the async-rendered SVG and refit when
  // it lands. The scaler div is created by v-if only after `show` flips, so it
  // isn't available synchronously when intersection fires — observe root, which
  // exists from mount, with subtree:true to catch the chart wherever it appears.
  if (root.value) {
    contentObserver = new MutationObserver(() => requestAnimationFrame(fit));
    contentObserver.observe(root.value, { childList: true, subtree: true });
  }

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          show.value = true;
          observer?.disconnect();
          break;
        }
      }
    },
    { rootMargin: "300px" }
  );
  if (root.value) observer.observe(root.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  contentObserver?.disconnect();
});

// GoFishExample swallows render errors internally and shows its own message;
// we additionally watch for a thrown error event to flip to the title card.
function onError() {
  failed.value = true;
}
</script>

<template>
  <div ref="root" class="lazy-thumb">
    <ClientOnly>
      <div
        v-if="show && !failed"
        ref="scaler"
        class="lazy-thumb__scaler"
        :style="fitStyle"
      >
        <GoFishExample :id="id" @vue:errorCaptured="onError" />
      </div>
    </ClientOnly>
    <div v-if="failed || !show" class="lazy-thumb__fallback">
      <span>{{ title }}</span>
    </div>
  </div>
</template>

<style scoped>
.lazy-thumb {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.lazy-thumb__scaler {
  /* Sized to the chart's natural dimensions; the inline transform scales it to
     fit the thumb box. flex-centering on .lazy-thumb keeps it centered. */
  flex: none;
}
.lazy-thumb :deep(.gofish-example) {
  padding-bottom: 0;
}
.lazy-thumb :deep(.gofish-example-canvas) {
  transform: none !important;
}
.lazy-thumb__fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}
</style>
