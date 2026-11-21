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
import { createRoot, createEffect, createSignal } from "solid-js";
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

/** The stroke of the tooltip box. Distinctive on purpose: `noPointer` finds
 *  the box's SVG element by it (see there). */
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
  const placed = ink
    ? Promise.resolve(content).then((n: any) => {
        n.inkOn = [true, true]; // PRIVATE HOOK (1)
        return n;
      })
    : content;
  return spread(
    { dir, spacing: gap, alignment: align },
    after ? [anchor, placed] : [placed, anchor]
  );
}

/* -------------------------------- focus --------------------------------- */

/**
 * The focus split. The pointer is read OUTSIDE the chart's resolve, in a
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

/**
 * Touch, story-side. The runtime listens to pointer events, so a tap is a
 * `pointerdown` that sets the pointer, but the browser ends every tap with a
 * `pointerleave`, which clears it, and the box would close at once. So after
 * a touch the last key is HELD until the next tap: a tap on a mark focuses
 * it, a tap on empty chart clears it. A mouse move drops back to plain hover.
 * The container's capture listener runs before the chart's own `<svg>`
 * listener, so `held` is reset before the pointer's signals change, and the
 * `taps` signal re-runs the read even when the pointer's signals do not
 * change (a tap on empty chart leaves `datum()` undefined, as it was).
 */
export function heldOnTouch<K>(container: HTMLElement, read: () => K | undefined) {
  let touch = false;
  let held: K | undefined;
  const [taps, setTaps] = createSignal(0);
  container.addEventListener(
    "pointerdown",
    (e) => {
      touch = e.pointerType !== "mouse";
      held = undefined;
      setTaps((n) => n + 1);
    },
    true
  );
  container.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "mouse") touch = false;
    },
    true
  );
  return (): K | undefined => {
    taps();
    const k = read();
    if (k !== undefined) held = k;
    return touch ? held : k;
  };
}

/**
 * PRIVATE HOOK (2), story-side CSS, no library edit: stop the tooltip from
 * taking the pointer's hit-test. GoFish sets no `pointer-events`, so a box
 * drawn under the cursor becomes the hit, `pointer().datum()` turns
 * undefined, the focus clears, the box goes, the bar is hit again: flicker.
 * The tooltip's SVG elements are found by their paint: the box's stroke, and
 * every element painted AFTER the box (paint is a flat list and the tooltip
 * layer is the last one, so that is the box's content, such as the bars of a
 * chart in a tooltip, then the anchors and the axes, none of which needs a
 * hit), and every `text`, since the stories' other texts are axis labels.
 */
export function noPointer(container: HTMLElement) {
  const style = document.createElement("style");
  style.textContent = `
    [data-tooltip-host] text,
    [data-tooltip-host] [stroke="${TOOLTIP_STROKE}"],
    [data-tooltip-host] [stroke="${TOOLTIP_STROKE}"] ~ * { pointer-events: none; }`;
  container.setAttribute("data-tooltip-host", "");
  // In <head>: a render replaces the container's children.
  if (!document.getElementById("tooltip-no-pointer")) {
    style.id = "tooltip-no-pointer";
    document.head.appendChild(style);
  }
}

/* ------------------------- nearest in the hull --------------------------- */

/** A box in svg px, the space of `pointer().pos()`. */
export type Box = { x0: number; y0: number; x1: number; y1: number };
/** A mark, or a group of marks (a stack), the focus can land on: its drawn
 *  box, and the SVG elements it is drawn as, each with its own box. */
export type Item = { box: Box; parts: { el: Element; box: Box }[] };
type Pt = { x: number; y: number };

const gap = (v: number, lo: number, hi: number) => Math.max(lo - v, 0, v - hi);
/** Distance from a point to a box, zero inside it. */
export const boxDistance = (p: Pt, b: Box) =>
  Math.hypot(gap(p.x, b.x0, b.x1), gap(p.y, b.y0, b.y1));

/** The convex hull of the items' box corners (Andrew's monotone chain),
 *  counterclockwise in y-down px. */
function hullOf(items: { box: Box }[]): Pt[] {
  const pts = items
    .flatMap(({ box: b }) => [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y0 },
      { x: b.x0, y: b.y1 },
      { x: b.x1, y: b.y1 },
    ])
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (ps: Pt[]) => {
    const h: Pt[] = [];
    for (const p of ps) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

function inHull(p: Pt, hull: Pt[]) {
  if (hull.length < 3) return false;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < 0) return false;
  }
  return true;
}

const hulls = new WeakMap<object, Pt[]>();

/**
 * The focus rule. Inside the convex hull of the items, the focus is the
 * nearest item, with no distance limit, so a gap between two bars picks the
 * nearer bar. Outside the hull, it is the nearest item within `radius` px, or
 * nothing. The distance is to the item's drawn box, zero inside it. The idea
 * is the declarative dragging criterion (#1294): the nearest reachable state
 * inside the hull of the states.
 *
 * `axis` measures the distance inside the hull along that axis only, ties
 * broken by the full distance: for a banded layout (bars spread in y), the
 * pointer's row decides, not the nearest end of a longer bar.
 */
export function nearestInHull<I extends { box: Box }>(
  p: Pt,
  items: I[],
  { radius, axis }: { radius: number; axis?: "x" | "y" }
): I | undefined {
  if (items.length === 0) return undefined;
  let hull = hulls.get(items);
  if (!hull) hulls.set(items, (hull = hullOf(items)));
  const inside = inHull(p, hull);
  const along = (b: Box) =>
    axis === "x" ? gap(p.x, b.x0, b.x1) : axis === "y" ? gap(p.y, b.y0, b.y1) : 0;
  let best: I | undefined;
  let bestKey: [number, number] = [Infinity, Infinity];
  for (const it of items) {
    const key: [number, number] = [inside ? along(it.box) : 0, boxDistance(p, it.box)];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      best = it;
      bestKey = key;
    }
  }
  return inside || bestKey[1] <= radius ? best : undefined;
}

/** An element's drawn box in svg px. */
function drawnBox(el: Element, inv: DOMMatrix): Box {
  const r = el.getBoundingClientRect();
  const a = new DOMPoint(r.left, r.top).matrixTransform(inv);
  const b = new DOMPoint(r.right, r.bottom).matrixTransform(inv);
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/**
 * The items, read off the drawn chart: the first `count` elements `selector`
 * picks (the marks are painted first, before the tooltip layer, the axes and
 * the legend), one item each, or grouped by `groupBy` of their box into one
 * item per group, whose box is the union of its parts.
 */
export function drawnMarks(selector: string, count: number, groupBy?: (b: Box) => number) {
  return (svg: SVGSVGElement, inv: DOMMatrix): Item[] => {
    const parts = [...svg.querySelectorAll(selector)]
      .slice(0, count)
      .map((el) => ({ el, box: drawnBox(el, inv) }));
    if (!groupBy) return parts.map((p) => ({ box: p.box, parts: [p] }));
    const groups = new Map<number, Item>();
    for (const p of parts) {
      const k = groupBy(p.box);
      const g = groups.get(k);
      if (!g) groups.set(k, { box: { ...p.box }, parts: [p] });
      else {
        g.parts.push(p);
        g.box = {
          x0: Math.min(g.box.x0, p.box.x0),
          y0: Math.min(g.box.y0, p.box.y0),
          x1: Math.max(g.box.x1, p.box.x1),
          y1: Math.max(g.box.y1, p.box.y1),
        };
      }
    }
    return [...groups.values()];
  };
}

/** The drawn bars of the stories: interactive rects that are not axis ticks. */
export const BARS = 'rect[data-gf-id]:not([fill="gray"])';

/** Group key: marks in the same column (a stack, a year). */
export const column = (b: Box) => Math.round((b.x0 + b.x1) / 2);

/**
 * PRIVATE HOOK (3), story-side: the runtime's hit-test is "the mark under
 * the pointer". This re-targets each real `pointermove` and `pointerdown`
 * on the chart to the mark `nearestInHull` picks (to the `<svg>` itself when
 * it picks nothing), by stopping the event and dispatching a copy at the same
 * client position on that mark's element. So `pointer().datum()` is the
 * nearest mark's datum and `pointer().pos()` is still the real position, and
 * nothing else in the stories changes. In the library this rule is the
 * runtime's hit-test. Items are read once per drawn `<svg>`.
 */
export function snapToNearest(
  container: HTMLElement,
  items: (svg: SVGSVGElement, inv: DOMMatrix) => Item[],
  opts: { radius: number; axis?: "x" | "y" }
) {
  let drawn: { svg: SVGSVGElement; items: Item[] } | undefined;
  const retarget = (e: PointerEvent) => {
    if (!e.isTrusted) return;
    const svg = container.querySelector("svg");
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm || !svg.contains(e.target as Node)) return;
    const inv = ctm.inverse();
    if (drawn?.svg !== svg) drawn = { svg, items: items(svg, inv) };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(inv);
    const item = nearestInHull(p, drawn.items, opts);
    const target: Element = item
      ? item.parts.reduce((a, b) => (boxDistance(p, b.box) < boxDistance(p, a.box) ? b : a)).el
      : svg;
    const hit = (e.target as Element).closest("[data-gf-id]");
    if (hit === target || (!item && !hit)) return;
    e.stopPropagation();
    target.dispatchEvent(
      new PointerEvent(e.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        isPrimary: e.isPrimary,
        button: e.button,
        buttons: e.buttons,
      })
    );
  };
  container.addEventListener("pointermove", retarget, true);
  container.addEventListener("pointerdown", retarget, true);
}

/** A mark's datum is its row, or (for a mark drawn per group) its rows. */
export const rowOf = <T>(d: unknown): T | undefined =>
  (Array.isArray(d) ? d[0] : d) as T | undefined;

/** Pointer helpers shared by the interactive stories. */
export const hitRow = <T>(p: Pointer): T | undefined => rowOf<T>(p.datum());
