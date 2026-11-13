// Shared helpers for the "Under the Sea" theme components.
import type { BookChapter } from "../../../data/book.data";

/** The repo the site links to (also in config.mts `socialLinks`). */
export const REPO = "https://github.com/gofish-graphics/gofish-graphics";

export const BOOK_PREFIX = "under-the-sea/";

/** The chapter slug of a page, or undefined off the book or on its contents
 *  page. `relativePath` is VitePress's `page.relativePath`. */
export function chapterSlug(relativePath: string): string | undefined {
  if (!relativePath.startsWith(BOOK_PREFIX)) return undefined;
  const rest = relativePath.slice(BOOK_PREFIX.length).replace(/\.md$/, "");
  return rest === "index" || rest.includes("/") ? undefined : rest;
}

export const isBookPage = (relativePath: string) =>
  relativePath.startsWith(BOOK_PREFIX);

/** A chapter as it is listed and titled: "Layout: How does ...?". */
export const fullTitle = (c: Pick<BookChapter, "label" | "title">) =>
  c.label ? `${c.label}: ${c.title}` : c.title;

export const fmt = (n: number) => n.toLocaleString("en-US");

export const plural = (n: number, one: string, many = one + "s") =>
  `${fmt(n)} ${n === 1 ? one : many}`;

export function stateLabel(c: BookChapter): string {
  switch (c.stamp.state) {
    case "current":
      return "Up to date";
    case "out-of-date":
      return "Out of date";
    default:
      return "Not checked in this build";
  }
}
