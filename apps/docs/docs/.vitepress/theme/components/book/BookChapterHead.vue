<script setup lang="ts">
// The top of every chapter of "Under the Sea": a one-line stamp for the
// reader (how settled the code behind the chapter is, and when the chapter was
// checked against it), a warning when that code has changed since, and the
// chapter's label and question as its title.
// The files a chapter reads and the commit it was checked against stay in its
// frontmatter, for the agent that rebuilds it. The page does not list them.
// The stamp comes from the build-time data loader, never from the markdown.
import { computed } from "vue";
import { useData } from "vitepress";
import { data as book } from "../../../data/book.data";
import { chapterSlug, plural } from "./book";

const { page } = useData();

const chapter = computed(() => {
  const slug = chapterSlug(page.value.relativePath);
  return slug ? book.chapters.find((c) => c.slug === slug) : undefined;
});

const stability = computed(() => chapter.value?.stamp.churn?.label ?? "");
</script>

<template>
  <header v-if="chapter" class="book-head">
    <div class="book-stamp" :class="`is-${chapter.stamp.state}`">
      <div>
        <template v-if="stability"
          ><span class="book-stamp__k">Stability: {{ stability }}.</span>
        </template>
        Checked against the code on {{ chapter.checked.date }}.
      </div>
      <div
        v-if="chapter.stamp.state === 'out-of-date' && chapter.stamp.since"
        class="book-stamp__warn"
      >
        <strong>Out of date.</strong>
        The code this chapter describes has changed since then ({{
          plural(chapter.stamp.since.commits, "commit")
        }}). Some of what it says may no longer match.
      </div>
    </div>
    <h1 class="book-title">
      <span class="book-label">{{ chapter.label }}:</span> {{ chapter.title }}
    </h1>
  </header>
</template>
