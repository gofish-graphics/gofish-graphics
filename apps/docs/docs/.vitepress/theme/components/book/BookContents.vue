<script setup lang="ts">
// The contents of "Under the Sea", the right page of the opening spread
// (BookSpread.vue), generated from each chapter's frontmatter (`label`,
// `title`, `order`, `topics`) and its stamp.
import { withBase } from "vitepress";
import { data as book } from "../../../data/book.data";
import { plural, stateLabel } from "./book";
</script>

<template>
  <ol class="book-toc">
    <li v-for="c in book.chapters" :key="c.slug" class="book-toc__item">
      <a class="book-toc__q" :href="withBase(c.link)"
        ><span class="book-label">{{ c.label }}:</span> {{ c.title }}</a
      >
      <div class="book-toc__topics">{{ c.topics.join(", ") }}</div>
      <div class="book-toc__state" :class="`is-${c.stamp.state}`">
        {{ stateLabel(c)
        }}<template v-if="c.checked.date">
          (checked {{ c.checked.date }})</template
        ><template v-if="c.stamp.state === 'out-of-date' && c.stamp.since"
          >: {{ plural(c.stamp.since.commits, "commit") }} since</template
        ><template v-if="c.stamp.churn"
          >. {{ c.stamp.churn.label[0].toUpperCase()
          }}{{ c.stamp.churn.label.slice(1) }}.</template
        >
      </div>
    </li>
  </ol>
  <p v-if="!book.chapters.length">No chapters yet.</p>
</template>
