<script setup lang="ts">
// The cover of "Under the Surface": a wall of tiles, one per figure that a
// chapter offers in its `cover:` frontmatter, with the title as one cell of
// the wall. Each tile renders the chapter's own figure component
// (docs/under-the-surface/<slug>.<figure>.vue) with `still` set, scaled to fit
// and inert, so the cover always matches the chapters. Used on
// docs/under-the-surface/index.md.
import {
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  type Component,
} from "vue";
import { withBase } from "vitepress";
import { data as book } from "../../../data/book.data";
import { fullTitle } from "./book";

const modules = import.meta.glob<{ default: Component }>(
  "../../../../under-the-surface/*.vue"
);
const figureFor = (slug: string, figure: string) => {
  const load = modules[`../../../../under-the-surface/${slug}.${figure}.vue`];
  return load ? defineAsyncComponent(load) : undefined;
};

// The wall has 6 columns on a wide screen and 2 on a phone. A tile keeps its
// shape when the columns change: its row span shrinks with its column span.
const spans = (rows: number, cols: number) => {
  const vars: Record<string, string> = {};
  for (const n of [6, 2]) {
    const c = Math.min(cols, n);
    vars[`--c${n}`] = String(c);
    vars[`--r${n}`] = String(Math.max(1, Math.round((rows * c) / cols)));
  }
  return vars;
};

const tiles = book.chapters.flatMap((c) =>
  c.cover.map((t) => ({
    key: `${c.slug}.${t.figure}`,
    title: fullTitle(c),
    href: withBase(`${c.link}#fig-${t.figure}`),
    component: figureFor(c.slug, t.figure),
    style: spans(t.rows, t.cols),
  }))
);

// Scale each figure to fit its tile. The figure is laid out at a fixed width
// so its own layout never changes with the tile size.
const wall = ref<HTMLElement | null>(null);
let observer: ResizeObserver | undefined;
function fit(tile: HTMLElement) {
  const stage = tile.querySelector<HTMLElement>(".book-cover__stage");
  const fig = stage?.firstElementChild as HTMLElement | null;
  if (!stage || !fig) return;
  const w = fig.offsetWidth;
  const h = fig.offsetHeight;
  if (!w || !h) return;
  const pad = 8;
  const s = Math.min(
    (tile.clientWidth - 2 * pad) / w,
    (tile.clientHeight - 2 * pad) / h
  );
  const x = (tile.clientWidth - w * s) / 2;
  const y = (tile.clientHeight - h * s) / 2;
  stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  stage.classList.add("is-fit");
}
function fitAll() {
  wall.value?.querySelectorAll<HTMLElement>(".book-cover__tile").forEach(fit);
}
onMounted(async () => {
  observer = new ResizeObserver((entries) =>
    entries.forEach((e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>(
        ".book-cover__tile"
      );
      if (tile) fit(tile);
    })
  );
  wall.value
    ?.querySelectorAll<HTMLElement>(".book-cover__tile, .book-cover__stage")
    .forEach((el) => observer!.observe(el));
  await nextTick();
  fitAll();
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <section class="book-cover book-wide" aria-labelledby="book-cover-title">
    <div ref="wall" class="book-cover__wall">
      <div class="book-cover__title">
        <img
          class="book-cover__logo"
          :src="withBase('/gofish-logo.png')"
          alt=""
          width="56"
          height="56"
        />
        <div>
          <h1 id="book-cover-title">Under the Surface</h1>
          <p class="book-cover__sub">How GoFish Works</p>
        </div>
      </div>
      <a
        v-for="t in tiles"
        :key="t.key"
        class="book-cover__tile"
        :href="t.href"
        :aria-label="t.title"
        :style="t.style"
      >
        <div class="book-cover__stage" inert aria-hidden="true">
          <component :is="t.component" v-if="t.component" still />
        </div>
      </a>
    </div>
  </section>
</template>
