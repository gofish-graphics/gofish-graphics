<script setup lang="ts">
// The running head at the top of every chapter of "Under the Sea": the
// book's name as a link back to the opening spread, the chapter's label, and
// a Contents button that opens the chapter list under it. The book has no
// sidebar, so this list is how a reader moves between chapters (besides the
// previous and next links at the foot). The list closes on Escape, on a click
// outside it, when focus leaves it and on choosing a chapter.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useData, useRoute, withBase } from "vitepress";
import { data as book } from "../../../data/book.data";
import { chapterSlug } from "./book";

const { page } = useData();
const route = useRoute();

const slug = computed(() => chapterSlug(page.value.relativePath));
const chapter = computed(() =>
  slug.value ? book.chapters.find((c) => c.slug === slug.value) : undefined
);

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const button = ref<HTMLButtonElement | null>(null);

function close(focusButton = false) {
  open.value = false;
  if (focusButton) button.value?.focus();
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") close(true);
}
function onPointer(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) close();
}
function onFocusOut(e: FocusEvent) {
  const next = e.relatedTarget as Node | null;
  if (next && !root.value?.contains(next)) close();
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
  } else {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("pointerdown", onPointer);
  }
});
watch(
  () => route.path,
  () => close()
);
onBeforeUnmount(() => close());
</script>

<template>
  <div v-if="chapter" class="book-running">
    <a class="book-running__book" :href="withBase('/under-the-sea/')"
      >Under the Sea</a
    >
    <span class="book-running__chapter">{{ chapter.label }}</span>
    <div ref="root" class="book-running__menu" @focusout="onFocusOut">
      <button
        ref="button"
        type="button"
        class="book-running__button"
        aria-controls="book-running-list"
        :aria-expanded="open"
        @click="open = !open"
      >
        Contents
      </button>
      <nav
        v-show="open"
        id="book-running-list"
        class="book-running__panel"
        aria-label="Chapters"
      >
        <ol>
          <li v-for="c in book.chapters" :key="c.slug">
            <a
              :href="withBase(c.link)"
              :aria-current="c.slug === slug ? 'page' : undefined"
              @click="close()"
              ><span class="book-label">{{ c.label }}:</span> {{ c.title }}</a
            >
          </li>
        </ol>
      </nav>
    </div>
  </div>
</template>
