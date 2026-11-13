<script setup lang="ts">
// The top of every chapter of "Under the Surface": the stamp (which commit the
// chapter was checked against, the files it reads, whether they have changed
// since, how fast they are changing) and the chapter's question as its title.
// The stamp comes from the build-time data loader, never from the markdown.
import { computed } from "vue";
import { useData } from "vitepress";
import { data as book } from "../../../data/book.data";
import { REPO, chapterSlug, fmt, plural, shortPath } from "./book";

const { page } = useData();

const chapter = computed(() => {
  const slug = chapterSlug(page.value.relativePath);
  return slug ? book.chapters.find((c) => c.slug === slug) : undefined;
});

const short = computed(() => chapter.value?.checked.commit?.slice(0, 7) ?? "");
const commitUrl = computed(
  () => `${REPO}/commit/${chapter.value?.checked.commit}`
);
const fileUrl = (p: string) =>
  `${REPO}/blob/${chapter.value?.checked.commit ?? "main"}/${p}`;
</script>

<template>
  <header v-if="chapter" class="book-head">
    <div class="book-stamp" :class="`is-${chapter.stamp.state}`">
      <div>
        <span class="book-stamp__k"
          >Checked against the code on {{ chapter.checked.date }}, commit
          <a :href="commitUrl" target="_blank" rel="noreferrer"
            ><code>{{ short }}</code></a
          >.</span
        >
      </div>
      <div
        v-if="chapter.stamp.state === 'out-of-date' && chapter.stamp.since"
        class="book-stamp__warn"
      >
        <strong>Out of date.</strong>
        {{ plural(chapter.stamp.since.commits, "commit") }}
        {{ chapter.stamp.since.commits === 1 ? "has" : "have" }} changed the
        files it reads since then ({{
          plural(chapter.stamp.since.lines, "line")
        }}). Some of what it says may no longer match the code.
      </div>
      <div v-else-if="chapter.stamp.state === 'current'">
        Up to date: no commit since then has changed the files it reads.
      </div>
      <div v-else>
        This build cannot see that commit, so it cannot tell whether the files
        have changed since.
      </div>
      <div>
        Reads:
        <template v-for="(p, i) in chapter.reads" :key="p"
          ><a :href="fileUrl(p)" :title="p" target="_blank" rel="noreferrer"
            ><code>{{ shortPath(p) }}</code></a
          ><template v-if="i < chapter.reads.length - 1">, </template></template
        >
      </div>
      <div v-if="chapter.stamp.churn">
        Stability: {{ chapter.stamp.churn.label }}.
        {{ plural(chapter.stamp.churn.commits, "commit") }} and
        {{ fmt(chapter.stamp.churn.lines) }} changed lines in these files in the
        last {{ chapter.stamp.churn.days }} days.
      </div>
    </div>
    <h1 class="book-title">{{ chapter.title }}</h1>
  </header>
</template>
