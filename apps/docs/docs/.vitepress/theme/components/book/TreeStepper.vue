<script setup lang="ts">
// A figure that steps through how a node tree grows, built on <BookStepper>
// (which draws the step controls, the note, the legend and the caption): the
// tree as an indented outline on the left, and an optional picture (the
// default slot, an <svg>) on the right. Nothing moves between steps: items
// not yet added are shown faint, items gone away faint and struck through,
// picture pieces not shown are hidden, and all keep their place. Hovering or
// focusing a tree item outlines the picture pieces with the same `data-id`,
// and hovering a piece marks its tree item, both ways. A ref item outlines
// its targets, dashed.
//
// Picture contract: any element with `data-id="<item id>"` is a piece of that
// item. It is shown from the item's step, or its own `data-step`, through
// the item's `until`, or its own `data-until`. Give a piece class
// `fig-region` to make it an invisible box used only for outlining (a
// layer's extent), and put a `fig-hit` rect inside a thin piece to make it
// easier to hover. Styles: theme/book-stepper.css.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import BookStepper from "./BookStepper.vue";
import type { TreeFigure, TreeItem } from "./treeStepper";

// `still` shows the last step as a plain picture with no controls, no
// caption and nothing to focus or hover. The book cover uses it.
const props = defineProps<{
  /** The anchor, "fig-<name>". */
  id: string;
  figure: TreeFigure;
  start?: number;
  still?: boolean;
}>();

const SVG_NS = "http://www.w3.org/2000/svg";

/** The current step, mirrored from BookStepper for the picture code. */
const step = ref(1);

const rows = computed(() =>
  props.figure.lines.map((l) => ({
    depth: l.depth,
    items: [
      {
        id: l.id,
        text: l.text,
        kind: l.kind,
        step: l.step,
        until: l.until,
        targets: l.targets,
      },
      ...(l.more ?? []),
    ] as TreeItem[],
  }))
);
const order = computed(() => rows.value.flatMap((r) => r.items));
const byId = computed(() => new Map(order.value.map((i) => [i.id, i])));
const kinds = computed(() => [...new Set(order.value.map((i) => i.kind))]);

const isShown = (it: { step: number; until?: number }, s = step.value) =>
  it.step <= s && (it.until === undefined || s <= it.until);
const visible = computed(() => order.value.filter((i) => isShown(i)));

/** "layer  frame" → type "layer", rest "frame". */
function split(text: string): [string, string] {
  const at = text.indexOf("  ");
  return at > 0 ? [text.slice(0, at), text.slice(at)] : ["", text];
}

// ---- highlight state --------------------------------------------------
const hlTree = ref<string | null>(null); // a tree item hovered or focused
const hlPic = ref<string | null>(null); // a picture piece hovered
const roving = ref<string>("");

function itemClass(
  it: TreeItem,
  stepClass: (from: number, until?: number) => Record<string, boolean>
) {
  const pic = hlPic.value;
  return {
    [`k-${it.kind}`]: true,
    ...stepClass(it.step, it.until),
    "is-hl": hlTree.value === it.id || pic === it.id,
    "is-hl-ref": !!pic && !!it.targets?.includes(pic) && isShown(it),
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

function pieceShown(el: Element): boolean {
  const it = byId.value.get(el.getAttribute("data-id") ?? "");
  const own = el.getAttribute("data-step");
  const until = el.getAttribute("data-until");
  return isShown({
    step: own ? Number(own) : (it?.step ?? 1),
    until: until ? Number(until) : it?.until,
  });
}

function syncPicture() {
  for (const el of pieces()) el.classList.toggle("is-hidden", !pieceShown(el));
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
    if (!pieceShown(el)) continue;
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
  if (el && svg?.contains(el) && pieceShown(el)) {
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
  if (!isShown(it)) return;
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

/** The one shown item that is in the tab order. */
const tabStop = computed(() =>
  visible.value.some((v) => v.id === roving.value)
    ? roving.value
    : (visible.value[0]?.id ?? "")
);

watch(step, () => {
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
  <BookStepper
    :id="id"
    class="tree-stepper"
    :steps="figure.steps"
    :label="figure.label"
    :start="start"
    :still="still"
    :kinds="kinds"
    @update:step="(s: number) => (step = s)"
  >
    <template #default="{ step: s, stepClass }">
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
                  :class="itemClass(it, stepClass)"
                  :data-item="it.id"
                  :tabindex="
                    !still && isShown(it, s)
                      ? it.id === tabStop
                        ? 0
                        : -1
                      : undefined
                  "
                  :aria-hidden="isShown(it, s) ? undefined : 'true'"
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
        </div>
      </div>
    </template>
    <template v-if="$slots.caption" #caption><slot name="caption" /></template>
  </BookStepper>
</template>
