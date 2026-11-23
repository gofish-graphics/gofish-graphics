/**
 * PROTOTYPE(#1395): what the runtime would have to provide so that a focus
 * behavior (focus.ts) is user code.
 *
 * Everything below is done by hand, reading the drawn DOM and the chart's
 * private state. Each piece carries a "STANDS IN FOR" comment naming the
 * public API that would replace it. Together they are the concrete meaning
 * of "improve the interaction API": with them public, this file is
 * `pointer().snap(selectAll(name), focus)`, and nothing else is needed.
 * Version 1 (draft PR #1401) builds these pieces inside the runtime for
 * `.tooltip()` (`src/interaction/tooltipFocus.ts`); none of them is public.
 */
import { signal, pointer, type Signal } from "../../../src/lib";
import { TOOLTIP_STROKE } from "./helpers";
import {
  defaultFocus,
  type Box,
  type Candidate,
  type FocusBehavior,
  type Frame,
  type Outline,
  type Point,
  type Segment,
} from "./focus";

export type Axis = "x" | "y";

/** What a tool such as the region overlay can read about a snap input. */
export type Inspector = {
  /** The behavior the input runs. */
  behavior: () => FocusBehavior;
  /** The candidates of the drawn chart, the current focus, and the last
   *  pointer and choice (which may belong to the drawing before; match it
   *  by key). Coordinates are the drawn `<svg>`'s user units. */
  frame: () =>
    | {
        svg: SVGSVGElement;
        candidates: Candidate[];
        current: Candidate | undefined;
        pointer: Point | undefined;
        choice: Candidate | undefined;
      }
    | undefined;
  /** After every frame the behavior runs on. Returns an unsubscribe. */
  listen: (l: () => void) => () => void;
};
const inspectors = new WeakMap<HTMLElement, Inspector>();
/** The snap input mounted in `container`, if any. */
export const inspect = (container: HTMLElement) => inspectors.get(container);

/** Which drawn marks are candidates, and the facts about them that the
 *  stories pass by hand. */
export type Marks<K> = {
  /** The marks' SVG elements: the first `count` that `selector` picks. A
   *  `rect` is a box, an `ellipse` a circle, a `path` with no fill the
   *  segments of its stroke, and a filled `path` a region. */
  selector: string;
  count: number;
  /** The axes that place the mark (a `spread` slot, a `stack` place, a
   *  position channel). An axis where the mark only has a size is left out,
   *  and a line, drawn across its rows, has none. */
  position: Axis[];
  /** The key of a row. Marks whose rows share a key are one candidate (a
   *  stack). */
  key: (row: any) => K;
  /** For a line drawn through rows: the elements drawn at its rows' points
   *  (the first `count` that `selector` picks), each a point candidate
   *  keyed by `key` and joined to the line whose key is `line(row)`. */
  points?: { selector: string; count: number; key: (row: any) => K; line: (row: any) => K };
};

/**
 * STANDS IN FOR `pointer().snap(selectAll(name), focus)`: a dataset of zero
 * or one mark, read by any layer, whose value changes only when the chosen
 * key changes. Returns that key as a `signal`, and `ping`, which a story
 * reads once in a `live()` channel (see `registerPointer`).
 */
export function snap<K>(container: HTMLElement, marks: Marks<K>, focus: FocusBehavior = defaultFocus) {
  floatingOutOfTheWay(container);
  const ping = registerPointer();
  const chosen = signal<K | undefined>(undefined);
  let drawn: { svg: SVGSVGElement; candidates: Candidate[] } | undefined;
  const held = touchHold();

  // STANDS IN FOR candidates with the frame: read again per drawn <svg>, as
  // every re-render draws a new one. They are in the svg's user units, so
  // they hold when the page scrolls; the screen-to-svg matrix does not, so
  // it is read again every time.
  const read = () => {
    const svg = container.querySelector("svg");
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return undefined;
    const inv = ctm.inverse();
    if (drawn?.svg !== svg) {
      const candidates = candidatesOf(container, svg, inv, marks);
      // Not yet: the chart has not built its id-to-item map for this drawing.
      if (!candidates) return undefined;
      drawn = { svg, candidates };
    }
    return { ...drawn, inv };
  };
  // STANDS IN FOR the runtime remembering `current` by key (#673): a line,
  // or the point of a line that a snap chose.
  const byKey = (candidates: Candidate[], key: unknown) => {
    if (key === undefined) return undefined;
    for (const c of candidates) {
      if (c.key === key) return c;
      const p = c.points?.find((q) => q.key === key);
      if (p) return p;
    }
    return undefined;
  };
  let last: { pointer: Point | undefined; choice: Candidate | undefined } | undefined;
  const run = (e: PointerEvent | MouseEvent, clicked: boolean) => {
    const d = read();
    if (!d) return;
    const pointerAt = held(e, d.svg, d.inv);
    const current = byKey(d.candidates, chosen());
    const frame: Frame = { pointer: pointerAt, candidates: d.candidates, current, clicked };
    const choice = focus(frame);
    last = { pointer: pointerAt, choice };
    const key = choice?.key as K | undefined;
    // STANDS IN FOR snap's re-run rule: the spec re-runs only when the key
    // changes, not on every pointer move.
    if (key !== chosen()) chosen.set(key);
    listeners.forEach((l) => l());
  };
  const listeners = new Set<() => void>();
  // STANDS IN FOR reading the snap input's frame as data: with `pointer().snap`
  // public, its last frame and choice would be readable like any other
  // dataset, which is all focusDebug.ts needs.
  inspectors.set(container, {
    behavior: () => focus,
    frame: () => {
      const d = read();
      if (!d) return undefined;
      return { svg: d.svg, candidates: d.candidates, current: byKey(d.candidates, chosen()), pointer: last?.pointer, choice: last?.choice };
    },
    listen: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  });
  container.addEventListener("pointermove", (e) => run(e, false));
  container.addEventListener("pointerdown", (e) => run(e, false));
  // STANDS IN FOR a click in the frame. `click()` today counts only clicks
  // on a mark, released on the same mark, and is not part of any frame.
  container.addEventListener("click", (e) => run(e, true));
  container.addEventListener("pointerleave", (e) => {
    if (e.target === container) run(e, false);
  });
  return { focus: chosen as Signal<K | undefined>, ping };
}

/**
 * STANDS IN FOR candidates from the layout: each mark's key, rows, drawn
 * box and outline, its placed position, and a line's points. The prototype
 * reads the drawn elements and each element's rows from the chart's PRIVATE
 * runtime (its id-to-item map). The axes that place a mark are passed by
 * hand; the layout knows them (the kind of space, #849). A line's points are
 * read off a layer the story draws at its rows, a circle per row placed by
 * the same `scatter` of the same fields: the layout knows where the line
 * drew each row, and version 1 records it (`drawnRowPoints.ts`).
 */
function candidatesOf<K>(
  container: HTMLElement,
  svg: SVGSVGElement,
  inv: DOMMatrix,
  marks: Marks<K>
): Candidate[] | undefined {
  const items: Map<string, { datum: unknown }> | undefined = (container as any).__gofishState?.runtime?.itemsById;
  const pick = (selector: string, count: number) => [...svg.querySelectorAll(selector)].slice(0, count);
  const els = pick(marks.selector, marks.count);
  const pts = marks.points ? pick(marks.points.selector, marks.points.count) : [];
  if (!items || [...els, ...pts].some((el) => !items.has(el.getAttribute("data-gf-id") ?? ""))) return undefined;
  const rowsOf = (el: Element) => {
    const d = items.get(el.getAttribute("data-gf-id") ?? "")?.datum;
    return Array.isArray(d) ? d : [d];
  };
  const groups = new Map<unknown, Candidate>();
  for (const el of els) {
    const rows = rowsOf(el);
    const key = marks.key(rows[0]);
    const parts = outlineOf(el, svg, inv);
    const box = drawnBox(el, inv);
    const c = groups.get(key);
    if (!c) groups.set(key, { key, datum: rows, box, position: {}, outline: parts });
    else {
      c.datum.push(...rows);
      c.outline.push(...parts);
      c.box = union(c.box, box);
    }
  }
  for (const c of groups.values()) {
    const [x, y] = [(c.box.x0 + c.box.x1) / 2, (c.box.y0 + c.box.y1) / 2];
    c.position = { x: marks.position.includes("x") ? x : undefined, y: marks.position.includes("y") ? y : undefined };
  }
  if (marks.points)
    for (const el of pts) {
      const rows = rowsOf(el);
      const line = groups.get(marks.points.line(rows[0]));
      if (!line) continue;
      const box = drawnBox(el, inv);
      const at = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      (line.points ??= []).push({ key: marks.points.key(rows[0]), datum: rows, box, position: at, outline: [{ box, round: true }] });
    }
  return [...groups.values()];
}

/** STANDS IN FOR the display item's outline, which the runtime already has
 *  (`nodeBox`, and a path's `d`). Here it is read off the drawn element. */
function outlineOf(el: Element, svg: SVGSVGElement, inv: DOMMatrix): Outline {
  const box = drawnBox(el, inv);
  if (el.tagName !== "path") return [{ box, round: el.tagName === "ellipse" }];
  const segments = pathSegments(el as SVGPathElement, svg);
  const fill = el.getAttribute("fill");
  const filled = fill !== null && fill !== "none" && fill !== "transparent" && el.getAttribute("fill-opacity") !== "0";
  // A stroked path is its segments, each bounded by its own box.
  if (!filled)
    return segments.map((segment) => ({
      box: { x0: Math.min(segment[0].x, segment[1].x), y0: Math.min(segment[0].y, segment[1].y), x1: Math.max(segment[0].x, segment[1].x), y1: Math.max(segment[0].y, segment[1].y) },
      round: false,
      segment,
    }));
  // A filled path is a region: close it, as SVG fills it closed.
  const first = segments[0]?.[0];
  const end = segments[segments.length - 1]?.[1];
  if (first && end && (first.x !== end.x || first.y !== end.y)) segments.push([end, first]);
  return [{ box, round: false, region: segments }];
}

/** A path's segments in svg user units: its vertices when its `d` is only
 *  absolute straight commands (GoFish draws lines and transformed shapes
 *  that way), else points sampled every 4 px along it. */
function pathSegments(el: SVGPathElement, svg: SVGSVGElement): Segment[] {
  const m = svg.getScreenCTM()!.inverse().multiply(el.getScreenCTM()!);
  const at = (x: number, y: number) => {
    const p = new DOMPoint(x, y).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const d = el.getAttribute("d") ?? "";
  const segs: Segment[] = [];
  if (/^[\sMLHVZ\d.,eE+-]*$/.test(d)) {
    let cur: Point | undefined;
    let start: Point | undefined;
    let cx = 0;
    let cy = 0;
    for (const [, cmd, args] of d.matchAll(/([MLHVZ])([^MLHVZ]*)/g)) {
      const n = (args.match(/[+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
      const step = cmd === "H" || cmd === "V" ? 1 : 2;
      if (cmd === "Z") {
        if (cur && start) segs.push([cur, start]);
        cur = start;
        continue;
      }
      for (let i = 0; i + step <= n.length; i += step) {
        if (cmd === "H") cx = n[i];
        else if (cmd === "V") cy = n[i];
        else [cx, cy] = [n[i], n[i + 1]];
        const p = at(cx, cy);
        if (cmd === "M" && i === 0) start = p;
        else if (cur) segs.push([cur, p]);
        cur = p;
      }
    }
    return segs;
  }
  const total = el.getTotalLength();
  const n = Math.max(2, Math.ceil(total / 4));
  let prev: Point | undefined;
  for (let i = 0; i <= n; i++) {
    const q = el.getPointAtLength((total * i) / n);
    const p = at(q.x, q.y);
    if (prev) segs.push([prev, p]);
    prev = p;
  }
  return segs;
}

const union = (a: Box, b: Box): Box => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

/** STANDS IN FOR the display item's box, which the runtime already records
 *  (`nodeBox`). Here it is measured off the drawn element. */
function drawnBox(el: Element, inv: DOMMatrix): Box {
  const r = el.getBoundingClientRect();
  const a = new DOMPoint(r.left, r.top).matrixTransform(inv);
  const b = new DOMPoint(r.right, r.bottom).matrixTransform(inv);
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/**
 * STANDS IN FOR `pointer().pos()` on touch. The pointer in svg px, as
 * `pos()` gives it, except that a tap HOLDS it until the next tap: the
 * browser ends every tap with a `pointerleave`, which would clear it and
 * close the box at once. A mouse move drops back to plain hover.
 */
function touchHold() {
  let touch = false;
  let last: Point | undefined;
  return (e: PointerEvent | MouseEvent, svg: SVGSVGElement, inv: DOMMatrix): Point | undefined => {
    const kind = (e as PointerEvent).pointerType;
    if (e.type === "pointerdown") touch = kind !== undefined && kind !== "mouse";
    else if (e.type === "pointermove" && kind === "mouse") touch = false;
    if (e.type === "pointerleave") return touch ? last : (last = undefined);
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(inv);
    const over = svg.contains(e.target as Node);
    last = over ? { x: p.x, y: p.y } : undefined;
    return last;
  };
}

/**
 * STANDS IN FOR a floating layer that is not a pointer target. The box's
 * SVG elements are found by their paint and given `pointer-events: none`:
 * the box (by its stroke), everything painted after it, and every `text`.
 * GoFish sets no `pointer-events`. The focus never reads the DOM hit, so a
 * pointer over the box is judged by the marks within reach, as if the box
 * were not there: this only keeps the text cursor and native hit off it.
 */
export function floatingOutOfTheWay(container: HTMLElement) {
  container.setAttribute("data-tooltip-host", "");
  if (document.getElementById("tooltip-no-pointer")) return;
  const style = document.createElement("style");
  style.id = "tooltip-no-pointer";
  style.textContent = `
    [data-tooltip-host] text,
    [data-tooltip-host] [stroke="${TOOLTIP_STROKE}"],
    [data-tooltip-host] [stroke="${TOOLTIP_STROKE}"] ~ * { pointer-events: none; }`;
  // In <head>: a render replaces the container's children.
  document.head.appendChild(style);
}

/**
 * STANDS IN FOR registering an input without reading it in the spec. The
 * chart builds its id-to-item map only when an input that needs the frame
 * is registered, and only a read during resolve registers one. So a story
 * reads `ping()` once inside a `live()` channel, which registers the
 * pointer without making it a pipeline dependency.
 */
function registerPointer() {
  const p = pointer();
  return () => p.pos();
}
