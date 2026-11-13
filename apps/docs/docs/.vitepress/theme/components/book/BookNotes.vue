<script setup lang="ts">
// "Leave a note" on the pages of "Under the Surface". Each paragraph, list
// item, heading, rule and figure of the page gets a small link, shown on hover
// and on keyboard focus, that opens a prefilled new GitHub issue in a new tab.
// One always-visible link at the end of the page covers touch screens. No
// server and no tracking: the link is all there is.
//
// The links are added to the rendered page after it mounts (and after each
// page change), so the markdown never carries them.
import { computed, onMounted, ref } from "vue";
import { onContentUpdated, useData } from "vitepress";
import { REPO, isBookPage } from "./book";

const { page, frontmatter } = useData();

const onBook = computed(() => isBookPage(page.value.relativePath));
const question = computed(() =>
  String(frontmatter.value.title ?? page.value.title ?? "Under the Surface")
);
const sourcePath = computed(() => `apps/docs/docs/${page.value.relativePath}`);

const BLOCKS = "p, li, h2, h3, figure, .book-rule";
const PROMPT = "What lost you, or what is wrong?";

function issueUrl(anchorUrl: string, quote?: string): string {
  const lines = [
    `**Chapter:** ${question.value}`,
    `**Page:** \`${sourcePath.value}\``,
    `**Where:** ${anchorUrl}`,
    "",
  ];
  if (quote) lines.push(...quote.split("\n").map((l) => `> ${l}`), "");
  lines.push(PROMPT, "", "");
  const q = new URLSearchParams({
    title: `Note on "${question.value}"`,
    labels: "book-note",
    body: lines.join("\n"),
  });
  return `${REPO}/issues/new?${q.toString()}`;
}

function pageUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function textOf(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone
    .querySelectorAll(".book-note, .header-anchor, svg, .ts-controls")
    .forEach((n) => n.remove());
  const cap = el.matches("figure") ? clone.querySelector("figcaption") : null;
  const t = ((cap ?? clone).textContent ?? "").replace(/\s+/g, " ").trim();
  return t.length > 200 ? t.slice(0, 200).trimEnd() + "…" : t;
}

const chapterUrl = ref("#");

function attach() {
  if (!onBook.value) return;
  chapterUrl.value = issueUrl(pageUrl());
  const root = document.querySelector(".VPDoc .vp-doc");
  if (!root) return;
  root.querySelectorAll(".book-note").forEach((n) => n.remove());

  const all = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS));
  // Only the outermost blocks: a paragraph inside a list item or a figure
  // shares its note with that item or figure.
  const blocks = all.filter((el) => {
    for (let p = el.parentElement; p && p !== root; p = p.parentElement)
      if (p.matches(BLOCKS)) return false;
    return true;
  });

  let anchor = pageUrl();
  const headings = new Set(root.querySelectorAll("h2[id], h3[id]"));
  // Walk in document order so each block links to the heading above it.
  const inOrder = Array.from(
    root.querySelectorAll<HTMLElement>(`${BLOCKS}, h2[id], h3[id]`)
  );
  const anchorOf = new Map<HTMLElement, string>();
  for (const el of inOrder) {
    if (headings.has(el)) anchor = `${pageUrl()}#${el.id}`;
    anchorOf.set(el, anchor);
  }

  for (const el of blocks) {
    const text = textOf(el);
    if (!text && !el.matches("figure")) continue;
    const a = document.createElement("a");
    a.className = "book-note ignore-header";
    a.href = issueUrl(anchorOf.get(el) ?? pageUrl(), text);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Note";
    a.title = "Leave a note on this part (opens a GitHub issue)";
    a.setAttribute(
      "aria-label",
      `Leave a note on this ${el.matches("h2, h3") ? "heading" : el.matches("figure") ? "figure" : el.matches("li") ? "item" : "paragraph"}`
    );
    el.classList.add("book-noted");
    el.appendChild(a);
  }
}

onMounted(attach);
onContentUpdated(attach);
</script>

<template>
  <!-- The opening spread uses the `page` layout, which has no doc-after
       slot, so this only ever shows on a chapter. -->
  <p v-if="onBook" class="book-note-chapter">
    <a :href="chapterUrl" target="_blank" rel="noopener noreferrer"
      >Leave a note on this chapter</a
    >
    <span> It opens a GitHub issue. Say what lost you, or what is wrong.</span>
  </p>
</template>
