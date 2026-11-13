// Build-time data for "Under the Surface": every chapter with its stamp
// (checked commit, state, changes since, 30-day churn), computed from git by
// scripts/book-stamps.mjs. The chapter header (theme/components/book/
// BookChapterHead.vue), the contents page (BookContents.vue) and the cover
// (BookCover.vue) read it, so a stamp is never typed into a chapter's
// markdown.
import { defineLoader } from "vitepress";
// @ts-ignore -- plain .mjs script, no type declarations
import { loadBook } from "../../../scripts/book-stamps.mjs";

export type BookStamp = {
  state: "current" | "out-of-date" | "unknown";
  since: { commits: number; lines: number } | null;
  churn: {
    commits: number;
    lines: number;
    days: number;
    label: "settled" | "changing" | "changing fast";
  } | null;
};

export type BookChapter = {
  slug: string;
  link: string;
  title: string;
  order: number;
  topics: string[];
  reads: string[];
  checked: { commit?: string; date?: string };
  /** Cover tiles: figure <slug>.<figure>.vue, size in wall cells. */
  cover: { figure: string; rows: number; cols: number }[];
  stamp: BookStamp;
};

export type BookData = { churnDays: number; chapters: BookChapter[] };

declare const data: BookData;
export { data };

export default defineLoader({
  watch: ["../../under-the-surface/*.md"],
  load(): BookData {
    return loadBook() as BookData;
  },
});
