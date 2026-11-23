/**
 * PROTOTYPE(#1395): the expansion of `.tooltip()` written with the public API.
 *
 * `.tooltip()` is proposed as sugar for ONE more layer of the same chart:
 *
 *   chart(data).flow(...).mark(m.name("bars"))
 *     .layer(chart(<the focused mark of selectAll("bars")>).mark(<box beside it>))
 *
 * Everything here is ordinary GoFish: the box is an `enclose` around a two-
 * column `spread` of `text` marks, placed beside the focused mark's `ref` by
 * one more `spread`. The two places it reaches past the public API are marked
 * PRIVATE HOOK below and listed in NOTES.md.
 */
import { createRoot, createEffect } from "solid-js";
import {
  enclose,
  spread,
  text,
  signal,
  type Signal,
  type Pointer,
} from "../../../src/lib";

/* ------------------------------ formatting ------------------------------ */

/** GoFish formats nothing beyond String() (a wall, see NOTES.md), so the
 *  tooltip formats its own cells. */
export type Format = (v: unknown) => string;

export const thousands: Format = (v) =>
  typeof v === "number" ? Math.round(v).toLocaleString("en-US") : String(v);
export const percent1: Format = (v) =>
  typeof v === "number" ? `${(v * 100).toFixed(1)}%` : String(v);
export const auto: Format = (v) =>
  typeof v === "number"
    ? Number.isInteger(v)
      ? v.toLocaleString("en-US")
      : v.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : v === null || v === undefined
      ? "–"
      : String(v);

/* --------------------------------- table -------------------------------- */

export type Row = Record<string, unknown>;

export type TableOptions = {
  /** Which fields, in order. Default: every own field of the row. */
  fields?: string[];
  /** Per-field formatter. Default: `auto`. */
  format?: Record<string, Format>;
  fontSize?: number;
};

/** The `[name, value]` pairs of one row, formatted. */
export function entries(row: Row, opts: TableOptions = {}): [string, string][] {
  const fields = opts.fields ?? Object.keys(row);
  return fields.map((f) => [f, (opts.format?.[f] ?? auto)(row[f])]);
}

const FONT = 12;
const NAME_FILL = "#6b7280";
const VALUE_FILL = "#111827";

/**
 * A two-column table of `text` marks: names right-aligned and gray, values
 * left-aligned and dark. Two `spread`s in y (one per column) side by side in
 * x; every text has the same font size, so the rows line up without a table
 * operator. `title` adds a bold first line spanning both columns.
 */
export function table(
  pairs: [string, string][],
  opts: { fontSize?: number; title?: string } = {}
) {
  const fontSize = opts.fontSize ?? FONT;
  const rowGap = Math.round(fontSize * 0.35);
  const columns = spread({ dir: "x", spacing: 10, alignment: "start" }, [
    spread(
      { dir: "y", spacing: rowGap, alignment: "end" },
      pairs.map(([k]) => text({ text: k, fontSize, fill: NAME_FILL }))
    ),
    spread(
      { dir: "y", spacing: rowGap, alignment: "start" },
      pairs.map(([, v]) =>
        text({ text: v, fontSize, fill: VALUE_FILL, fontWeight: 600 })
      )
    ),
  ]);
  if (opts.title === undefined) return columns;
  return spread({ dir: "y", spacing: rowGap + 2, alignment: "start" }, [
    text({ text: opts.title, fontSize, fill: VALUE_FILL, fontWeight: 700 }),
    columns,
  ]);
}

/** The box: a white, lightly bordered `enclose` around any content. A soft
 *  shadow is NOT drawn: GoFish has a `filter` option but no drop shadow
 *  among its filters, and faking one with a second offset rect read badly. */
export function box(content: any, padding = 8) {
  return enclose(
    {
      padding,
      fill: "white",
      stroke: TOOLTIP_STROKE,
      strokeWidth: 1,
      rx: 4,
    } as any,
    [content]
  );
}

/** The stroke of the tooltip box. Distinctive on purpose:
 *  `floatingOutOfTheWay` (focusRuntime.ts) finds the box's SVG element by it. */
export const TOOLTIP_STROKE = "#c9ced6";

/** The default tooltip body for one row: all its fields, in a box. */
export function rowTooltip(row: Row, opts: TableOptions & { title?: string } = {}) {
  return box(table(entries(row, opts), opts));
}

/* ------------------------------- placement ------------------------------ */

export type Side = "right" | "left" | "top" | "bottom";

/**
 * `content` placed beside `anchor` (a `ref`, or any node built from refs) on
 * `side`, centered on the other axis: one `spread` of the two, the anchor
 * first or second. That much is public API.
 *
 * PRIVATE HOOK (1): the result is marked ink on both axes
 * (`GoFishNode.inkOn`, the flag the label chooser and axis spans use), so it
 * takes no room in the chart's claim or box and the plot does not move or
 * shrink when a tooltip opens. Off (`ink: false`) the tooltip claims room
 * like any layer child; the "Layout Check" stories show both.
 *
 * `side` is chosen by the CALLER. Keeping the box inside the chart needs the
 * mark's placed position, which only exists after the solve, so a real
 * keep-inside rule is a post-solve chooser (the label chooser's job); the
 * edge story picks the side from the datum instead and says so.
 */
export function beside(
  anchor: any,
  content: any,
  {
    side = "right",
    align = "middle",
    gap = 8,
    ink = true,
  }: {
    side?: Side;
    /** Where on the other axis: centered, or flush with the anchor's
     *  start or end (left/right for a top/bottom box, bottom/top for a
     *  left/right one). */
    align?: "start" | "middle" | "end";
    gap?: number;
    ink?: boolean;
  } = {}
) {
  const dir = side === "left" || side === "right" ? "x" : "y";
  // A y spread lays its first child at the top.
  const after = side === "right" || side === "bottom";
  const placed = ink ? floating(content) : content;
  return spread(
    { dir, spacing: gap, alignment: align },
    after ? [anchor, placed] : [placed, anchor]
  );
}

/** `content` marked ink on both axes, so it takes no room: what
 *  `.floating()` would name. PRIVATE HOOK (1), see `beside`. */
export function floating(content: any) {
  return Promise.resolve(content).then((n: any) => {
    n.inkOn = [true, true]; // PRIVATE HOOK (1)
    return n;
  });
}

/* -------------------------------- focus --------------------------------- */

/*
 * The focus rule itself is `defaultFocus` in focus.ts, and everything the
 * runtime would have to provide for it is in focusRuntime.ts. `focusFrom` is
 * kept only for the Measure stories, which measure the first prototype.
 */

/**
 * The first prototype's focus split. The pointer is read OUTSIDE the chart's resolve, in a
 * Solid effect, which maps it to a KEY (which mark) and writes that key to a
 * `signal` only when the key changes. The spec reads only the signal, so
 * layout re-runs once per change of focused mark, not once per pointermove.
 *
 * The pointer must still be REGISTERED with the chart's runtime to receive
 * events at all, and only a read during resolve does that. A read inside a
 * `live()` channel registers it without making it a pipeline dependency, so
 * every interactive story reads the pointer once in a live channel (a hover
 * highlight, which a tooltip wants anyway).
 */
export function focusFrom<K>(
  read: () => K | undefined,
  init?: K
): Signal<K | undefined> {
  const focus = signal<K | undefined>(init);
  let last: K | undefined = init;
  createRoot(() =>
    createEffect(() => {
      const k = read();
      if (k !== last) {
        last = k;
        focus.set(k);
      }
    })
  );
  return focus;
}

/** The drawn bars of the stories: interactive rects that are not axis ticks. */
export const BARS = 'rect[data-gf-id]:not([fill="gray"])';

/** A mark's datum is its row, or (for a mark drawn per group) its rows. */
export const rowOf = <T>(d: unknown): T | undefined =>
  (Array.isArray(d) ? d[0] : d) as T | undefined;

/** Pointer helpers shared by the interactive stories. */
export const hitRow = <T>(p: Pointer): T | undefined => rowOf<T>(p.datum());
