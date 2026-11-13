<script setup lang="ts">
// A figure that steps through how a node tree grows: step buttons and a note
// above, the tree as an indented outline on the left, and an optional picture
// (the default slot, an <svg>) on the right. Nothing moves between steps:
// items not yet added are shown faint, picture pieces not yet added are
// hidden, and both keep their place. Hovering or focusing a tree item
// outlines the picture pieces with the same `data-id`, and hovering a piece
// marks its tree item, both ways. A ref item outlines its targets, dashed.
//
// Picture contract: any element with `data-id="<item id>"` is a piece of that
// item. It is hidden until the item's step, or until its own `data-step`.
// Give a piece class `fig-region` to make it an invisible box used only for
// outlining (a layer's extent), and put a `fig-hit` rect inside a thin piece
// to make it easier to hover. Styles: theme/book.css.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { TreeFigure, TreeItem, TreeKind } from "./treeStepper";

// `still` shows the last step as a plain picture with no controls, no
// caption and nothing to focus or hover. The book cover uses it.
const props = defineProps<{
  figure: TreeFigure;
  start?: number;
  still?: boolean;
}>();

const SVG_NS = "http://www.w3.org/2000/svg";
const KIND_LABEL: Record<TreeKind, string> = {
  user: "from your code",
  added: "added by the rewrite",
  ref: "ref",
  constraint: "constraint",
};

const nSteps = computed(() => props.figure.steps.length);
const step = ref(
  props.still
    ? nSteps.value
    : Math.min(Math.max(props.start ?? 1, 1), nSteps.value)
);

const rows = computed(() =>
  props.figure.lines.map((l) => ({
    depth: l.depth,
    items: [
      {
        id: l.id,
        text: l.text,
        kind: l.kind,
        step: l.step,
        targets: l.targets,
      },
      ...(l.more ?? []),
    ] as TreeItem[],
  }))
);
const order = computed(() => rows.value.flatMap((r) => r.items));
const byId = computed(() => new Map(order.value.map((i) => [i.id, i])));
const kinds = computed(() =>
  (Object.keys(KIND_LABEL) as TreeKind[]).filter((k) =>
    order.value.some((i) => i.kind === k)
  )
);
const visible = computed(() => order.value.filter((i) => i.step <= step.value));

/** "layer  frame" → type "layer", rest "frame". */
function split(text: string): [string, string] {
  const at = text.indexOf("  ");
  return at > 0 ? [text.slice(0, at), text.slice(at)] : ["", text];
}

// ---- highlight state --------------------------------------------------
const hlTree = ref<string | null>(null); // a tree item hovered or focused
const hlPic = ref<string | null>(null); // a picture piece hovered
const roving = ref<string>(visible.value[0]?.id ?? "");

function itemClass(it: TreeItem) {
  const pic = hlPic.value;
  return {
    [`k-${it.kind}`]: true,
    "is-future": it.step > step.value,
    "is-new": !props.still && it.step === step.value && step.value > 1,
    "is-hl": hlTree.value === it.id || pic === it.id,
    "is-hl-ref": !!pic && !!it.targets?.includes(pic) && it.step <= step.value,
  };
}

// ---- picture ----------------------------------------------------------
const picEl = ref<HTMLElement | null>(null);
let svg: SVGSVGElement | null = null;
let hlLayer: SVGGElement | null = null;

function pieces(id?: string): SVGGraphicsElement[] {
  if (!svg) return [];
  const sel = id ? `[data-id="${CSS.escape(id)}"]` : "[data-id]";
  return Array.from(svg.querySelectorAll<SVGGraphicsElement>(sel)).filter(
    (el) => el !== (hlLayer as unknown)
  );
}

function pieceStep(el: Element): number {
  const own = el.getAttribute("data-step");
  if (own) return Number(own);
  return byId.value.get(el.getAttribute("data-id") ?? "")?.step ?? 1;
}

function syncPicture() {
  for (const el of pieces())
    el.classList.toggle("is-future", pieceStep(el) > step.value);
}

/** The piece's box in the svg's own coordinates. */
function boxOf(el: SVGGraphicsElement) {
  if (!svg) return null;
  const b = el.getBBox();
  const root = svg.getScreenCTM();
  const own = el.getScreenCTM();
  if (!root || !own) return b;
  const m = root.inverse().multiply(own);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x, b.y + b.height],
    [b.x + b.width, b.y + b.height],
  ]) {
    xs.push(m.a * x + m.c * y + m.e);
    ys.push(m.b * x + m.d * y + m.f);
  }
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return {
    x: x0,
    y: y0,
    width: Math.max(...xs) - x0,
    height: Math.max(...ys) - y0,
  };
}

function clearOutlines() {
  while (hlLayer?.firstChild) hlLayer.removeChild(hlLayer.firstChild);
}

function outline(id: string, dashed: boolean) {
  if (!hlLayer) return;
  for (const el of pieces(id)) {
    if (pieceStep(el) > step.value) continue;
    const b = boxOf(el);
    if (!b) continue;
    const o = dashed ? 2.5 : 1.5;
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(b.x - o));
    r.setAttribute("y", String(b.y - o));
    r.setAttribute("width", String(b.width + 2 * o));
    r.setAttribute("height", String(b.height + 2 * o));
    r.setAttribute("rx", "2");
    r.setAttribute("class", dashed ? "fig-outline is-ref" : "fig-outline");
    hlLayer.appendChild(r);
  }
}

function drawOutlines() {
  clearOutlines();
  const id = hlTree.value ?? hlPic.value;
  if (!id) return;
  const it = byId.value.get(id);
  if (hlTree.value && it?.targets?.length)
    for (const t of it.targets) outline(t, true);
  else outline(id, false);
}

function onPicOver(ev: PointerEvent) {
  const el = (ev.target as Element | null)?.closest?.("[data-id]");
  if (el && svg?.contains(el) && pieceStep(el) <= step.value) {
    hlTree.value = null;
    hlPic.value = el.getAttribute("data-id");
  } else hlPic.value = null;
}
function onPicLeave() {
  hlPic.value = null;
}

// ---- tree -------------------------------------------------------------
const treeEl = ref<HTMLElement | null>(null);

function focusItem(id: string) {
  roving.value = id;
  treeEl.value
    ?.querySelector<HTMLElement>(`[data-item="${CSS.escape(id)}"]`)
    ?.focus();
}

function onTreeKey(ev: KeyboardEvent) {
  const vis = visible.value;
  const i = vis.findIndex((v) => v.id === roving.value);
  let n: TreeItem | undefined;
  if (ev.key === "ArrowDown" || ev.key === "ArrowRight")
    n = vis[Math.min(vis.length - 1, i + 1)];
  else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft")
    n = vis[Math.max(0, i - 1)];
  else if (ev.key === "Home") n = vis[0];
  else if (ev.key === "End") n = vis[vis.length - 1];
  if (n) {
    ev.preventDefault();
    focusItem(n.id);
  }
}

function onItemEnter(it: TreeItem) {
  if (it.step > step.value) return;
  hlPic.value = null;
  hlTree.value = it.id;
}
function onItemLeave(it: TreeItem) {
  const active = document.activeElement as HTMLElement | null;
  if (active?.dataset?.item === it.id) return;
  if (hlTree.value === it.id) hlTree.value = null;
}
function onItemFocus(it: TreeItem) {
  roving.value = it.id;
  hlPic.value = null;
  hlTree.value = it.id;
}
function onItemBlur() {
  hlTree.value = null;
}

// ---- steps ------------------------------------------------------------
function setStep(n: number) {
  step.value = Math.max(1, Math.min(nSteps.value, n));
}
function onControlsKey(ev: KeyboardEvent) {
  if (ev.key === "ArrowLeft") {
    ev.preventDefault();
    setStep(step.value - 1);
  } else if (ev.key === "ArrowRight") {
    ev.preventDefault();
    setStep(step.value + 1);
  }
}

watch(step, () => {
  if ((byId.value.get(roving.value)?.step ?? 1) > step.value)
    roving.value = visible.value[0]?.id ?? "";
  hlTree.value = null;
  hlPic.value = null;
  syncPicture();
});
watch([hlTree, hlPic, step], drawOutlines, { flush: "post" });

onMounted(() => {
  svg = picEl.value?.querySelector("svg") ?? null;
  if (svg && !props.still) {
    hlLayer = document.createElementNS(SVG_NS, "g");
    hlLayer.setAttribute("class", "fig-highlights");
    hlLayer.setAttribute("aria-hidden", "true");
    svg.appendChild(hlLayer);
    svg.addEventListener("pointerover", onPicOver);
    svg.addEventListener("pointerleave", onPicLeave);
  }
  syncPicture();
});
onBeforeUnmount(() => {
  svg?.removeEventListener("pointerover", onPicOver);
  svg?.removeEventListener("pointerleave", onPicLeave);
  hlLayer?.remove();
});
</script>

<template>
  <figure class="tree-stepper book-wide" :class="{ 'is-still': still }">
    <div class="ts-body">
      <div v-if="!still" class="ts-controls" @keydown="onControlsKey">
        <div
          class="ts-steps"
          role="group"
          :aria-label="figure.label ?? 'Steps'"
        >
          <button
            v-for="(s, i) in figure.steps"
            :key="s.label"
            type="button"
            class="ts-btn"
            :aria-pressed="i + 1 === step ? 'true' : 'false'"
            @click="setStep(i + 1)"
          >
            {{ s.label }}
          </button>
        </div>
        <div class="ts-nav">
          <button
            type="button"
            class="ts-btn"
            :disabled="step === 1"
            @click="setStep(step - 1)"
          >
            Previous
          </button>
          <button
            type="button"
            class="ts-btn"
            :disabled="step === nSteps"
            @click="setStep(step + 1)"
          >
            Next
          </button>
        </div>
      </div>
      <p v-if="!still" class="ts-note" aria-live="polite">
        <span class="ts-count">Step {{ step }} of {{ nSteps }}.</span>
        {{ figure.steps[step - 1]?.note }}
      </p>
      <div class="ts-grid" :class="{ 'has-pic': !!$slots.default }">
        <div class="ts-tree-wrap">
          <div
            ref="treeEl"
            class="ts-tree"
            aria-label="The node tree after this step"
            @keydown="onTreeKey"
          >
            <span v-for="(row, r) in rows" :key="r" class="ts-line"
              ><span class="ts-indent">{{ "  ".repeat(row.depth) }}</span
              ><template v-for="(it, k) in row.items" :key="it.id"
                ><span v-if="k > 0">{{ "   " }}</span
                ><span
                  class="ts-item"
                  :class="itemClass(it)"
                  :data-item="it.id"
                  :tabindex="
                    !still && it.step <= step
                      ? it.id === roving
                        ? 0
                        : -1
                      : undefined
                  "
                  :aria-hidden="it.step > step ? 'true' : undefined"
                  @mouseenter="onItemEnter(it)"
                  @mouseleave="onItemLeave(it)"
                  @focus="onItemFocus(it)"
                  @blur="onItemBlur"
                  ><span v-if="split(it.text)[0]" class="ts-type">{{
                    split(it.text)[0]
                  }}</span
                  >{{ split(it.text)[1] }}</span
                ></template
              ></span
            >
          </div>
        </div>
        <div v-if="$slots.default" ref="picEl" class="ts-pic">
          <slot />
          <ul v-if="!still" class="ts-legend" aria-label="Legend">
            <li v-for="k in kinds" :key="k">
              <span class="ts-swatch" :class="`k-${k}`"></span
              >{{ KIND_LABEL[k] }}
            </li>
          </ul>
        </div>
      </div>
      <ul
        v-if="!still && !$slots.default"
        class="ts-legend"
        aria-label="Legend"
      >
        <li v-for="k in kinds" :key="k">
          <span class="ts-swatch" :class="`k-${k}`"></span>{{ KIND_LABEL[k] }}
        </li>
      </ul>
    </div>
    <figcaption v-if="!still && $slots.caption">
      <slot name="caption" />
    </figcaption>
  </figure>
</template>
