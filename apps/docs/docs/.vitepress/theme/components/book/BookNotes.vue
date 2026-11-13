<script setup lang="ts">
// "Leave a note" on the pages of "Under the Surface". Each paragraph, list
// item, heading, rule and figure of the page gets a small "Note" button, shown
// on hover and on keyboard focus. One always-visible button at the end of the
// page covers touch screens and notes on the chapter as a whole. Either opens
// the note box (BookNoteBox.vue) beside its passage, so the reader writes in
// place. Where the note goes is up to the transport (bookNotes.ts): the
// chapter's brief on the local dev server, a prefilled GitHub issue elsewhere.
//
// The buttons are added to the rendered page after it mounts (and after each
// page change), so the markdown never carries them.
import { computed, onMounted, ref, shallowRef } from "vue";
import { onContentUpdated, useData } from "vitepress";
import { chapterSlug, isBookPage } from "./book";
import {
  chooseTransport,
  hash,
  isSent,
  markSent,
  type Note,
  type Transport,
} from "./bookNotes";
import BookNoteBox from "./BookNoteBox.vue";

const { page, frontmatter } = useData();

const onBook = computed(() => isBookPage(page.value.relativePath));
const slug = computed(() => chapterSlug(page.value.relativePath) ?? "");
const question = computed(() =>
  String(frontmatter.value.title ?? page.value.title ?? "Under the Surface")
);
const sourcePath = computed(() => `apps/docs/docs/${page.value.relativePath}`);

const BLOCKS = "p, li, h2, h3, figure, .book-rule";

/** The open box: the element it sits in, the button that opened it (focus
 *  goes back there), the draft's key and the note so far. */
interface OpenBox {
  host: HTMLElement;
  control: HTMLElement;
  key: string;
  note: Omit<Note, "text">;
}
const open = shallowRef<OpenBox | null>(null);
const transport = shallowRef<Transport>();
const chapterEnd = ref<HTMLElement>();
const chapterButton = ref<HTMLElement>();
const chapterNoted = ref(false);

function pageUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function textOf(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      ".book-note, .book-note-box, .header-anchor, svg, .ts-controls"
    )
    .forEach((n) => n.remove());
  const cap = el.matches("figure") ? clone.querySelector("figcaption") : null;
  const t = ((cap ?? clone).textContent ?? "").replace(/\s+/g, " ").trim();
  return t.length > 200 ? t.slice(0, 200).trimEnd() + "…" : t;
}

function noteAbout(anchor: string, quote: string): Omit<Note, "text"> {
  return {
    slug: slug.value,
    question: question.value,
    sourcePath: sourcePath.value,
    anchor,
    anchorUrl: anchor ? `${pageUrl()}#${anchor}` : pageUrl(),
    quote,
  };
}

async function toggle(box: OpenBox) {
  if (open.value?.control === box.control) return close(false);
  transport.value ??= await chooseTransport();
  open.value = box;
  box.control.setAttribute("aria-expanded", "true");
}

function close(delivered: boolean) {
  const box = open.value;
  if (!box) return;
  open.value = null;
  box.control.setAttribute("aria-expanded", "false");
  if (delivered) {
    markSent(box.key);
    markControl(box.control);
  }
  box.control.focus();
}

function markControl(control: HTMLElement) {
  if (control === chapterButton.value) {
    chapterNoted.value = true;
    return;
  }
  control.classList.add("is-noted");
  control.textContent = "Noted";
  control.title = "You left a note here. Leave another.";
}

function kindOf(el: Element): string {
  if (el.matches("h2, h3")) return "heading";
  if (el.matches("figure")) return "figure";
  if (el.matches("li")) return "item";
  return "paragraph";
}

function attach() {
  open.value?.control.setAttribute("aria-expanded", "false");
  open.value = null;
  if (!onBook.value) return;
  chapterNoted.value = isSent(`${slug.value}:chapter`);
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

  // Each block's anchor is its own id (a figure's) or the heading above it.
  let heading = "";
  const headings = new Set(root.querySelectorAll("h2[id], h3[id]"));
  const inOrder = Array.from(
    root.querySelectorAll<HTMLElement>(`${BLOCKS}, h2[id], h3[id]`)
  );
  const anchorOf = new Map<HTMLElement, string>();
  for (const el of inOrder) {
    if (headings.has(el)) heading = el.id;
    anchorOf.set(el, el.matches("figure") && el.id ? el.id : heading);
  }

  for (const el of blocks) {
    const quote = textOf(el);
    if (!quote && !el.matches("figure")) continue;
    const anchor = anchorOf.get(el) ?? "";
    const key = `${slug.value}:${anchor}:${hash(quote)}`;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "book-note ignore-header";
    b.textContent = "Note";
    b.title = "Leave a note on this part";
    b.setAttribute("aria-label", `Leave a note on this ${kindOf(el)}`);
    b.setAttribute("aria-expanded", "false");
    b.addEventListener("click", () =>
      toggle({ host: el, control: b, key, note: noteAbout(anchor, quote) })
    );
    if (isSent(key)) markControl(b);
    el.classList.add("book-noted");
    el.appendChild(b);
  }
}

function openChapter() {
  if (!chapterEnd.value || !chapterButton.value) return;
  toggle({
    host: chapterEnd.value,
    control: chapterButton.value,
    key: `${slug.value}:chapter`,
    note: noteAbout("", ""),
  });
}

onMounted(attach);
onContentUpdated(attach);
</script>

<template>
  <!-- The opening spread uses the `page` layout, which has no doc-after
       slot, so this only ever shows on a chapter. -->
  <p v-if="onBook" ref="chapterEnd" class="book-note-chapter">
    <button
      ref="chapterButton"
      type="button"
      class="book-note-chapter__open"
      aria-expanded="false"
      @click="openChapter"
    >
      Leave a note on this chapter</button
    ><span> Say what lost you, or what is wrong.</span>
    <span v-if="chapterNoted" class="book-note-chapter__noted">
      You left a note on this chapter.</span
    >
  </p>
  <Teleport v-if="open && transport" :to="open.host">
    <BookNoteBox
      :key="open.key"
      :note="open.note"
      :draft-key="open.key"
      :transport="transport"
      @close="close"
    />
  </Teleport>
</template>
