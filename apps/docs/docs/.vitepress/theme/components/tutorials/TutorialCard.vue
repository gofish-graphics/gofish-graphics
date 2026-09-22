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
 *   ::: gofish example:polar-ribbon-chart hidden
 *   :::
 *
 *   </TutorialCard>
 *
 * and the container plugin renders a real <GoFishExample> inside the card. A
 * card may hold SEVERAL such containers; they share the preview frame as a grid
 * (one row up to three, two by two for four) and each is fitted to its own cell
 * by measure() below.
 *
 * Stories render at their own size (500x300, or much larger for a diagram) and
 * with their own margins, so fitting is not just a scale: see measure(). The
 * chart arrives asynchronously (the layout pipeline is rAF-driven), hence the
 * MutationObserver; the ResizeObserver re-fits when the grid reflows.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

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

const frame = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);

const pointerStyle = computed(() => {
  if (!props.pointer) return undefined;
  const [left, top] = props.pointer.trim().split(/\s+/);
  return { left, top: top ?? left };
});

let raf = 0;
let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;

/**
 * Write an inline style only when it actually changes: the MutationObserver
 * below watches `style`, so blind writes would spin a rAF loop.
 */
function setStyle(node: HTMLElement, prop: string, value: string) {
  if (node.style.getPropertyValue(prop) !== value)
    node.style.setProperty(prop, value);
}

function stretch(node: HTMLElement) {
  setStyle(node, "width", "100%");
  setStyle(node, "height", "100%");
  setStyle(node, "display", "block");
  // Story containers carry their own margin/padding; in a thumbnail that only
  // pushes the drawing out of its cell.
  setStyle(node, "margin", "0");
  setStyle(node, "padding", "0");
}

/**
 * Fit every preview into its own cell. Each `::: gofish` container becomes one
 * cell of the preview grid.
 *
 * Preferred fit: give the story's `<svg>` a viewBox tight around its drawn
 * content (stories render without one) and let it stretch to the cell. That
 * fills the cell with the drawing itself rather than with the story's own
 * padding, which is what makes the thumbnails readable at this size. Writes are
 * idempotent — getBBox() is in user units, so it does not move when the viewBox
 * changes — which matters because the MutationObserver watches these very
 * attributes.
 *
 * Fallback (no svg yet, or an empty bbox): lay the preview out at its natural
 * size and scale it about the center of the cell.
 */
function measure() {
  const st = stage.value;
  if (!st) return;
  // One row for up to three previews; four go two by two, which reads better
  // than four slivers.
  const n = st.children.length;
  st.style.gridTemplateColumns = `repeat(${
    n > 3 ? 2 : Math.max(n, 1)
  }, minmax(0, 1fr))`;
  for (const cell of Array.from(st.children) as HTMLElement[]) {
    const el = (cell.querySelector(".gofish-example") ??
      cell.firstElementChild ??
      cell) as HTMLElement;
    const svg = cell.querySelector("svg");
    if (svg) {
      let box: DOMRect | null = null;
      try {
        box = (svg as SVGGraphicsElement).getBBox();
      } catch {
        box = null;
      }
      if (box && box.width > 0 && box.height > 0) {
        // A hair of slack so strokes on the outermost marks are not clipped.
        const pad = 0.02 * Math.max(box.width, box.height);
        const viewBox = [
          box.x - pad,
          box.y - pad,
          box.width + 2 * pad,
          box.height + 2 * pad,
        ]
          .map((v) => Math.round(v * 100) / 100)
          .join(" ");
        if (!el.classList.contains("is-fitted")) el.classList.add("is-fitted");
        setStyle(el, "transform", "");
        // Stories size their own wrapper with inline styles, which beat any
        // stylesheet rule, so stretch the chain from the example down to the
        // svg inline too.
        for (
          let node: HTMLElement | null = svg.parentElement;
          node && node !== cell;
          node = node.parentElement
        ) {
          stretch(node);
        }
        stretch(svg as unknown as HTMLElement);
        if (svg.getAttribute("viewBox") !== viewBox)
          svg.setAttribute("viewBox", viewBox);
        // Stories render with preserveAspectRatio="none"; the thumbnail must
        // keep the drawing's proportions.
        if (svg.getAttribute("preserveAspectRatio") !== "xMidYMid meet")
          svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        continue;
      }
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const cw = cell.clientWidth;
    const ch = cell.clientHeight;
    if (!w || !h || !cw || !ch) continue;
    const scale = Math.min(cw / w, ch / h);
    setStyle(el, "transform", `translate(-50%, -50%) scale(${scale})`);
  }
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
    // Every attribute, not a filtered set: a mark that merely MOVES during
    // layout (its x/y change) changes the drawing's bounding box, and the fit
    // has to follow. The writes measure() makes are idempotent, so watching its
    // own output does not spin.
    mutationObserver.observe(stage.value, {
      childList: true,
      subtree: true,
      attributes: true,
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
      <div class="tutorial-card__stage" ref="stage">
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

/* Grid of previews; each child cell holds one rendered example. The column
   count is set in measure() from the number of previews. */
.tutorial-card__stage {
  display: grid;
  gap: 6px;
  width: 100%;
  height: 100%;
  /* The preview is decoration: clicks belong to the card's link, and the
     interactive stories should not capture drags here. */
  pointer-events: none;
}
.tutorial-card__stage > * {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
/* Each example is laid out at its natural size, then scaled about the center
   of its cell. */
.tutorial-card__stage :deep(.gofish-example) {
  position: absolute;
  top: 50%;
  left: 50%;
  width: max-content;
  padding-bottom: 0;
  transform-origin: center center;
}
/* Fitted previews stretch to the cell and let the viewBox do the scaling. */
.tutorial-card__stage :deep(.gofish-example.is-fitted) {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
.tutorial-card__stage :deep(.gofish-example.is-fitted .gofish-example-canvas),
.tutorial-card__stage
  :deep(.gofish-example.is-fitted .gofish-example-canvas > *) {
  display: block;
  width: 100%;
  height: 100%;
}
.tutorial-card__stage :deep(.gofish-example.is-fitted svg) {
  display: block;
  width: 100%;
  height: 100%;
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
