<script setup lang="ts">
// The cover of "Under the Sea", the left page of the opening spread
// (BookSpread.vue). It is a wall of tiles, one per figure that a chapter
// offers in its `cover:` frontmatter, with the title as one cell of the wall.
// Each tile renders the chapter's own figure component
// (docs/under-the-sea/<slug>.<figure>.vue) with `still` set, scaled to fit
// and inert, so the cover always matches the chapters.
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
  "../../../../under-the-sea/*.vue"
);
const figureFor = (slug: string, figure: string) => {
  const load = modules[`../../../../under-the-sea/${slug}.${figure}.vue`];
  return load ? defineAsyncComponent(load) : undefined;
};

// The wall is 6 cells wide and fills the page's height (book.css). A tile
// spans `cols` cells across and `rows` cells down.
const tiles = book.chapters.flatMap((c) =>
  c.cover.map((t) => ({
    key: `${c.slug}.${t.figure}`,
    title: fullTitle(c),
    href: withBase(`${c.link}#fig-${t.figure}`),
    component: figureFor(c.slug, t.figure),
    style: { gridColumn: `span ${t.cols}`, gridRow: `span ${t.rows}` },
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
  const pad = 4;
  const s = Math.min(
    (tile.clientWidth - 2 * pad) / w,
    (tile.clientHeight - 2 * pad) / h
  );
  const x = (tile.clientWidth - w * s) / 2;
  const y = (tile.clientHeight - h * s) / 2;
  stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  stage.classList.add("is-fit");
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
  wall.value?.querySelectorAll<HTMLElement>(".book-cover__tile").forEach(fit);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="wall" class="book-cover">
    <div class="book-cover__title">
      <img
        class="book-cover__logo"
        :src="withBase('/gofish-logo.png')"
        alt=""
        width="56"
        height="56"
      />
      <h1 id="book-cover-title">Under the Sea</h1>
      <p class="book-cover__sub">How GoFish Works</p>
    </div>
    <a
      v-for="t in tiles"
      :key="t.key"
      class="book-cover__tile"
      :href="t.href"
      :aria-label="t.title"
      :style="t.style"
    >
      <!-- The figure sits in a .vp-doc, as it does in its chapter, so it
           gets the same styles. The <section> keeps it out of the
           `.vp-doc > div > *` column rules. -->
      <div class="book-cover__stage" inert aria-hidden="true">
        <div class="vp-doc">
          <section>
            <component :is="t.component" v-if="t.component" still />
          </section>
        </div>
      </div>
    </a>
  </div>
</template>
