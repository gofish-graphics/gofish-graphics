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

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-11-13" as "November 13, 2026". Anything else is returned as is. The
 *  date is read as written, with no time zone, so it never shifts by a day. */
export function longDate(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return iso ?? "";
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : (iso ?? "");
}

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
