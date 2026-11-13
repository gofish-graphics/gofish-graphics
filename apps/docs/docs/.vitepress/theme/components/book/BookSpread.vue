<script setup lang="ts">
// The opening page of "Under the Sea": a book lying open. The left page is
// the cover (BookCover.vue) and the right page the contents
// (BookContents.vue), with the default slot (the short note about the book,
// written in docs/under-the-sea/index.md) at its foot. book.css sizes the
// spread to fit the window and stacks the pages on a narrow screen.
import BookContents from "./BookContents.vue";
import BookCover from "./BookCover.vue";
</script>

<template>
  <div class="book-spread">
    <div class="book-spread__book">
      <section
        class="book-spread__page book-spread__cover"
        aria-labelledby="book-cover-title"
      >
        <BookCover />
      </section>
      <section
        class="book-spread__page book-spread__contents"
        aria-labelledby="book-contents-title"
      >
        <h2 id="book-contents-title" class="book-spread__heading">Contents</h2>
        <div class="book-spread__list">
          <BookContents />
        </div>
        <div class="book-spread__about">
          <slot />
        </div>
      </section>
    </div>
  </div>
</template>
