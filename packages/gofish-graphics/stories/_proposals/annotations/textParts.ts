/**
 * PROTOTYPE (throwaway, story-local): selecting parts of ONE text mark.
 *
 * Stands in for the proposed `ref("eq").part("E")` / `ref("eq").parts(/X/)`
 * (see proposals/annotations/research/span-selection.md). The library has no
 * part refs yet, so this helper does what the real one would do when the ref
 * is read: it finds the selector's character range in the string, measures
 * the prefix and the match with the same canvas `measureText` the `text`
 * mark uses, and lays an invisible `rect` over the match, inside the text's
 * box. The rect is named, so `enclose`, `Constraint.align`, `arrow` and
 * `paint` can target it like any node.
 *
 * Approximations (declared):
 *  - a part's x interval is `width(prefix)` to `width(prefix + match)`, so
 *    kerning across the cut is ignored (sub-pixel for these fonts);
 *  - a part's y interval is the whole line box (font ascent to descent), not
 *    the glyphs' ink box;
 *  - selectors are resolved when the spec is built, not when the ref is read,
 *    so the parts are listed up front, beside the text.
 */
import { layer, rect, text } from "../../../src/lib";
import { estimateTextDimensions } from "../../../src/ast/shapes/text";

export type PartSelector =
  | string
  | RegExp
  | [start: number, end: number]
  | { match: string | RegExp; nth: number };

export type PartMatch = { match: string; start: number; end: number };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every non-overlapping match, left to right (the plural `parts`). */
export function findAll(s: string, match: string | RegExp): PartMatch[] {
  const re =
    typeof match === "string"
      ? new RegExp(escape(match), "gu")
      : new RegExp(
          match.source,
          match.flags.includes("g") ? match.flags : match.flags + "g"
        );
  return [...s.matchAll(re)].map((m) => ({
    match: m[0],
    start: m.index!,
    end: m.index! + m[0].length,
  }));
}

/** The character range a selector picks in `s`. A string or regex must match
 *  exactly once unless `nth` says which match (the singular `ref` rule). */
export function findPart(s: string, sel: PartSelector): PartMatch {
  if (Array.isArray(sel)) {
    const [start, end] = sel;
    return { match: s.slice(start, end), start, end };
  }
  const { match, nth } =
    typeof sel === "object" && !(sel instanceof RegExp)
      ? sel
      : { match: sel, nth: undefined as number | undefined };
  const all = findAll(s, match);
  if (nth === undefined && all.length !== 1)
    throw new Error(
      `[prototype] part(${String(match)}) matched ${all.length} times in ` +
        `"${s}"; a singular part must match once (give { nth })`
    );
  const m = all[nth ?? 0];
  if (m === undefined)
    throw new Error(`[prototype] part(${String(match)}) has no match ${nth}`);
  return m;
}

export type TextOpts = {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  fontWeight?: number | string;
  fill?: string;
};

/** The box of a character range inside a text set at x = 0, y = 0. */
export function partBox(opts: TextOpts, m: PartMatch) {
  const size = opts.fontSize ?? 12;
  const family = opts.fontFamily ?? "sans-serif";
  const w = (t: string) =>
    estimateTextDimensions(t, size, family, opts.fontStyle, opts.fontWeight);
  const x0 = w(opts.text.slice(0, m.start)).width;
  const x1 = w(opts.text.slice(0, m.end)).width;
  return { x: x0, w: x1 - x0, h: w(opts.text).height };
}

/** An invisible stand-in over one part, at the part's box. */
export function partStandIn(
  opts: TextOpts,
  sel: PartSelector,
  fill = "none"
) {
  const b = partBox(opts, findPart(opts.text, sel));
  return rect({ x: b.x, y: 0, w: b.w, h: b.h, fill });
}

/** A colored copy of a part's characters, set at the part's x: the overlay
 *  stand-in for a per-part fill (the `text` mark draws one <text> with one
 *  fill and no tspans). */
export function partOverlay(opts: TextOpts, sel: PartSelector, fill: string) {
  const m = findPart(opts.text, sel);
  const b = partBox(opts, m);
  return text({ ...opts, x: b.x, y: 0, text: m.match, fill });
}
