/**
 * PROTOTYPE(#1395): what the runtime would have to provide so that a focus
 * behavior (focus.ts) is user code.
 *
 * Every piece below is done by hand today, reading the drawn DOM and the
 * chart's private state. Each carries a "STANDS IN FOR" comment naming the
 * public API that would replace it. Together they are the concrete meaning
 * of "improve the interaction API": with them public, this file is
 * `pointer().snap(selectAll(name), focus)`, and nothing else is needed.
 */
import { signal, pointer, type Signal } from "../../../src/lib";
import { TOOLTIP_STROKE } from "./helpers";
import {
  defaultFocus,
  type Box,
  type Candidate,
  type FocusBehavior,
  type Frame,
  type Point,
  type Result,
} from "./focus";

export type Axis = "x" | "y";

/** What a tool such as the region overlay can read about a snap input. */
export type Inspector = {
  /** The behavior the input runs. */
  behavior: () => FocusBehavior;
  /** The candidates of the drawn chart, the current focus, and the last
   *  pointer and result (whose choice may belong to the drawing before;
   *  match it by key). Coordinates are the drawn `<svg>`'s user units. */
  frame: () =>
    | {
        svg: SVGSVGElement;
        candidates: Candidate[];
        current: Candidate | undefined;
        pointer: Point | undefined;
        result: Result | undefined;
      }
    | undefined;
  /** Called after every frame the behavior runs on. Returns an unsubscribe. */
  listen: (l: () => void) => () => void;
};
const inspectors = new WeakMap<HTMLElement, Inspector>();
/** The snap input mounted in `container`, if any. */
export const inspect = (container: HTMLElement) => inspectors.get(container);

/** Which drawn marks are candidates, and the facts about them that the
 *  stories pass by hand. */
export type Marks<K> = {
  /** The marks' SVG elements: the first `count` that `selector` picks. */
  selector: string;
  count: number;
  /** The axes that place the mark (a `spread` slot, a `stack` place, a
   *  position channel). An axis where the mark only has a size is left out. */
  position: Axis[];
  /** The key of a row. Marks whose rows share a key are one candidate
   *  (a stack, a year). */
  key: (row: any) => K;
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

  // STANDS IN FOR candidates published with the frame: re-read once per
  // drawn <svg>, as every re-render draws a new one. They are in the svg's
  // user units, so they hold when the page scrolls; the screen-to-svg
  // matrix does not, so it is read again every time.
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
  let last: { frame: Frame; result: Result } | undefined;
  const run = (e: PointerEvent | MouseEvent, clicked: boolean) => {
    const d = read();
    if (!d) return;
    const pointerAt = held(e, d.svg, d.inv);
    // STANDS IN FOR the runtime remembering `current` by key (#673).
    const current = d.candidates.find((c) => c.key === chosen());
    const frame: Frame = { pointer: pointerAt, candidates: d.candidates, current, clicked };
    const result = focus(frame);
    last = { frame, result };
    const key = result.choice?.key as K | undefined;
    // STANDS IN FOR snap's re-run rule: the spec re-runs only when the key
    // changes, not on every pointer move.
    if (key !== chosen()) chosen.set(key);
    listeners.forEach((l) => l());
  };
  const listeners = new Set<() => void>();
  // STANDS IN FOR reading the snap input's frame as data: with `pointer().snap`
  // public, its last frame and result (pointer, candidates, current, choice)
  // would be readable like any other dataset, which is all focusDebug.ts needs.
  inspectors.set(container, {
    behavior: () => focus,
    frame: () => {
      const d = read();
      if (!d) return undefined;
      const current = d.candidates.find((c) => c.key === chosen());
      return { svg: d.svg, candidates: d.candidates, current, pointer: last?.frame.pointer, result: last?.result };
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
 * box and outline, and its placed position. The prototype reads the drawn
 * elements and gets each element's rows from the chart's PRIVATE runtime
 * (its id-to-item map). The axes that place a mark are passed by hand; the
 * layout knows them (the kind of space, #849).
 */
function candidatesOf<K>(
  container: HTMLElement,
  svg: SVGSVGElement,
  inv: DOMMatrix,
  marks: Marks<K>
): Candidate[] | undefined {
  const items: Map<string, { datum: unknown }> | undefined = (container as any).__gofishState?.runtime?.itemsById;
  const els = [...svg.querySelectorAll(marks.selector)].slice(0, marks.count);
  if (!items || els.some((el) => !items.has(el.getAttribute("data-gf-id") ?? ""))) return undefined;
  const groups = new Map<unknown, Candidate>();
  for (const el of els) {
    const d = items.get(el.getAttribute("data-gf-id") ?? "")?.datum;
    const rows = Array.isArray(d) ? d : [d];
    const key = marks.key(rows[0]);
    const part = { box: drawnBox(el, inv), round: el.tagName === "ellipse" };
    const c = groups.get(key);
    if (!c) groups.set(key, { key, datum: rows, box: part.box, position: {}, outline: [part] });
    else {
      c.datum.push(...rows);
      c.outline.push(part);
      c.box = union(c.box, part.box);
    }
  }
  for (const c of groups.values()) {
    const [x, y] = [(c.box.x0 + c.box.x1) / 2, (c.box.y0 + c.box.y1) / 2];
    c.position = { x: marks.position.includes("x") ? x : undefined, y: marks.position.includes("y") ? y : undefined };
  }
  return [...groups.values()];
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
 * GoFish sets no `pointer-events`. The focus no longer depends on the DOM
 * hit, so this now only keeps the text cursor and native hit off the box.
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
