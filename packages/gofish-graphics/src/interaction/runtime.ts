// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * InteractionRuntime — owns the interaction side of a rendered chart. It has
 * exactly three jobs and never touches the layout pipeline:
 *
 *   1. an rAF-coalesced, latest-wins re-render scheduler (`invalidate` /
 *      `runRerender`), with a hidden-tab timeout fallback so headless drivers
 *      and backgrounded tabs don't freeze;
 *   2. delegated DOM event dispatch for the chart's <svg>
 *      (pointermove/down/up/leave/wheel), routed to registered inputs. The
 *      listeners sit on the chart's container, which outlives the re-runs
 *      that replace the svg (see `attachHost`);
 *   3. hit-testing: `publishFrame` keeps an id → item map (for
 *      `pointer().datum()`), an id → on-screen box map (for `drag().nodeBox`),
 *      plus the frame's data-space conversions.
 *
 * Inputs register themselves during resolve (with the registrar in scope, see
 * resolveContext.ts). At the
 * start of each resolve the runtime drops itself from every registered input's
 * `specReaders` sets, so an input read in one resolve but not the next stops
 * invalidating this chart (a shared input keeps its edges to OTHER charts).
 */
import type { DisplayList } from "gofish-ir";
import type {
  Hit,
  InputPrimitive,
  InteractionEventType,
  InteractionFrame,
  SpecInvalidator,
  SvgBox,
  SvgPoint,
} from "./types";
import type { Registrar } from "./resolveContext";
import { frameConversions, type FrameConversions } from "./frameScales";

/** Set equality by membership (small sets of event-type strings). */
function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** The accumulated affine of the `group` items enclosing a display item. Display
 *  items are absolute pixels EXCEPT inside a `group`, whose children are in its
 *  local space, so a walk that reports boxes has to carry the fold. */
export interface Affine {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
}

const IDENTITY: Affine = { tx: 0, ty: 0, sx: 1, sy: 1 };

/** Walk a display list depth-first, including composite/group/mask innards,
 *  handing each item to `visit` with the transform that maps it to svg px.
 *  A visitor rather than a generator: every caller wants every item, and a
 *  generator allocated a `{ item, at }` wrapper per item to say so. */
export function walkItems(
  items: DisplayList.DisplayItem[],
  visit: (item: DisplayList.DisplayItem, at: Affine) => void,
  at: Affine = IDENTITY
): void {
  for (const item of items) {
    visit(item, at);
    switch (item.kind) {
      case "group": {
        const [tx, ty] = item.transform.translate ?? [0, 0];
        const [sx, sy] = item.transform.scale ?? [1, 1];
        walkItems(item.children, visit, {
          tx: at.tx + at.sx * tx,
          ty: at.ty + at.sy * ty,
          sx: at.sx * sx,
          sy: at.sy * sy,
        });
        break;
      }
      case "composite": {
        // The operands' paint is what shows, so it has boxes; a hidden part,
        // and every operand of a painted result, has none.
        for (const o of item.operands) walkItems(o.paint, visit, at);
        break;
      }
    }
  }
}

/** The item's box in svg px, for the primitives that carry one. `path` and
 *  `text` carry no box in the display list (a path is an SVG `d` string, a text
 *  item only its anchor), and a `group` has no box of its own, so those come
 *  back `undefined` rather than being guessed at. */
export function itemBox(
  item: DisplayList.DisplayItem,
  at: Affine
): SvgBox | undefined {
  const local = (x: number, y: number, w: number, h: number): SvgBox => ({
    x: at.tx + at.sx * x,
    y: at.ty + at.sy * y,
    w: at.sx * w,
    h: at.sy * h,
  });
  switch (item.kind) {
    case "rect":
    case "image":
      return local(item.x, item.y, item.w, item.h);
    case "ellipse":
      return local(
        item.cx - item.rx,
        item.cy - item.ry,
        2 * item.rx,
        2 * item.ry
      );
    case "composite":
      return local(item.bbox.x, item.bbox.y, item.bbox.w, item.bbox.h);
    default:
      return undefined;
  }
}

export class InteractionRuntime implements Registrar, SpecInvalidator {
  private inputs: InputPrimitive[] = [];
  private registered = new Set<InputPrimitive>();
  /** node uid → first lowered item with that id, rebuilt each frame. */
  private itemsById = new Map<string, DisplayList.DisplayItem>();
  /** node uid → that node's box in svg px, rebuilt each frame from the same
   *  walk. Read off the frame exactly as the frame conversions are, so an input
   *  can map a pointer position onto a node layout placed. */
  private boxesById = new Map<string, SvgBox>();
  private conv?: FrameConversions;
  /** The svg the current frame painted (`attachSVG`). */
  private svg?: SVGSVGElement;
  /** The element the listeners sit on (`attachHost`). */
  private host?: HTMLElement;
  private detach?: () => void;
  /** The set of DOM event types currently attached to `host` — the union of
   *  registered inputs' `events` at attach time. Compared on re-attach so a
   *  later resolve that registered a new input kind grows the listener set. */
  private attachedEvents?: Set<InteractionEventType>;
  /** Whether the pointer was over the svg at the last event. */
  private pointerInside = false;

  /** Register an input (idempotent by identity: a re-resolve re-registers
   *  the same inputs). */
  registerInput(input: InputPrimitive): void {
    if (this.registered.has(input)) return;
    this.registered.add(input);
    this.inputs.push(input);
    input.attach?.(this);
  }

  /** True when any input registered — the render terminal reads this after
   *  resolve to decide whether to thread the runtime into paint (for
   *  `data-gf-id` hit-testing) and attach event listeners. */
  hasWork(): boolean {
    return this.inputs.length > 0;
  }

  /** Frame conversions of the CURRENT frame (data ↔ px), for inputs' data-space
   *  accessors. Undefined when the chart has no continuous axis. */
  getConversions(): FrameConversions | undefined {
    return this.conv;
  }

  /** The on-screen box (svg px) of the node with uid `id` in the CURRENT frame,
   *  or `undefined` when that node isn't in it or its primitive carries no box
   *  (a path, a text). Frame state, not a signal: it is replaced wholesale by
   *  every `publishFrame`, and it is what makes an absolute pixel → value map
   *  possible without reading a screen CTM back out of the DOM. Every attached
   *  input serves it (see `FrameBoxReader` in inputs.ts) — it is not drag state. */
  nodeBox(id: string): SvgBox | undefined {
    return this.boxesById.get(id);
  }

  /** Reset THIS runtime's dependency edges. Called at the start of every
   *  resolve: it removes only ITSELF from each registered input's
   *  `specReaders` sets, so a re-resolve of this chart doesn't drop another
   *  chart's dependency on a shared input. Reads during the coming resolve
   *  re-add this runtime if the input is still read outside `live()`. */
  beginResolve(): void {
    this.dropSpecEdges();
  }

  /** Remove this runtime from every reader set of every registered input. */
  private dropSpecEdges(): void {
    for (const input of this.inputs)
      for (const readers of input.specReaders) readers.delete(this);
  }

  /* ---- scheduler: re-resolve + re-render on spec changes ---- */

  private rerenderFn?: () => Promise<unknown>;
  private scheduled = false;
  private running = false;
  private dirty = false;

  /** Wired by the render terminal: the thunk that re-runs resolve → layout →
   *  paint into the same container (the pipeline is tree-consuming, so a fresh
   *  tree is rebuilt through the immutable builder each time). */
  setRerender(fn: () => Promise<unknown>): void {
    this.rerenderFn = fn;
  }

  /** Schedule a re-render (rAF-coalesced; latest-wins while one is running). */
  invalidate(): void {
    if (!this.rerenderFn) return;
    if (this.running) {
      this.dirty = true;
      return;
    }
    if (this.scheduled) return;
    this.scheduled = true;
    const run = (): void => {
      this.scheduled = false;
      void this.runRerender();
    };
    // rAF is the right cadence for visible interaction, but browsers throttle
    // it to zero in hidden tabs — which would freeze re-renders for headless
    // drivers and backgrounded views. Fall back to a timeout when the document
    // isn't visible.
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      setTimeout(run, 16);
    } else {
      requestAnimationFrame(run);
    }
  }

  private async runRerender(): Promise<void> {
    // A run scheduled before `dispose()` still fires; the chart is gone.
    const rerender = this.rerenderFn;
    if (!rerender) return;
    this.running = true;
    try {
      await rerender();
    } finally {
      this.running = false;
      if (this.dirty) {
        this.dirty = false;
        this.invalidate();
      }
    }
  }

  /**
   * Called by the render pass after lowering, before paint. Rebuilds the
   * id-keyed hit-test map and box map (fresh uids each resolve) and the
   * data-space conversions, then notifies inputs.
   */
  publishFrame(frame: InteractionFrame): void {
    // Build the id-keyed hit-test map + data-space conversions only when some
    // registered input needs them (pointer/drag). A wheel/timer/signal-only
    // chart never hit-tests, so skip the full item walk. A pointer that
    // registers on a LATER resolve flips `needsFrame` true, and that resolve's
    // publishFrame builds the map before any hit-test can read it.
    if (this.inputs.some((i) => i.needsFrame)) {
      this.conv = frameConversions(frame);
      this.itemsById = new Map();
      this.boxesById = new Map();
      walkItems(frame.items, (item, at) => {
        if (item.id !== undefined && !this.itemsById.has(item.id)) {
          this.itemsById.set(item.id, item);
          const box = itemBox(item, at);
          if (box) this.boxesById.set(item.id, box);
        }
      });
    }
    for (const input of this.inputs) input.onFrame?.(frame);
  }

  /** The union of `events` across registered inputs — the listener types to
   *  attach. Only these are wired, so a wheel/timer/signal-only chart never
   *  pays pointer-move hit-testing. */
  private neededEvents(): Set<InteractionEventType> {
    const set = new Set<InteractionEventType>();
    for (const input of this.inputs) {
      if (input.events) for (const e of input.events) set.add(e);
    }
    return set;
  }

  /** The svg a render painted, which events are read against: its
   *  elements are the hit targets, and its screen transform maps a pointer
   *  into svg px. A re-run paints a new one. */
  attachSVG(svg: SVGSVGElement): void {
    this.svg = svg;
  }

  /**
   * Attach delegated listeners to `host`, the element the chart renders into,
   * for exactly the event types the registered inputs consume. Idempotent per
   * (host, event-set): a re-render into the same host re-attaches only if the
   * needed set grew (a new input kind registered).
   *
   * The listeners are on the host, not the svg, because a re-run replaces the
   * svg, and the browser tracks the pointer by element: a pointer that was
   * over the old svg is over none of the new one's elements until it moves,
   * so when it then leaves the chart the browser fires `pointerleave` on the
   * host and its ancestors only. The host stays, so it hears every move and
   * every leave. An event counts when its target is in the current svg; the
   * pointer leaves the chart when a move lands in the host outside the svg
   * or the host's own `pointerleave` fires, and inputs that take
   * `pointerleave` get one then. While a re-run has taken the svg out of
   * the page, a move over the host says nothing about the chart, so it is
   * not read.
   */
  attachHost(host: HTMLElement): void {
    const needed = this.neededEvents();
    if (
      this.host === host &&
      this.attachedEvents !== undefined &&
      sameSet(this.attachedEvents, needed)
    ) {
      return;
    }
    this.detach?.();
    this.host = host;
    this.attachedEvents = needed;

    const hitFor = (event: Event): Hit | undefined => {
      const target = event.target as Element | null;
      const el = target?.closest?.("[data-gf-id]");
      if (!el) return undefined;
      const id = el.getAttribute("data-gf-id");
      if (!id) return undefined;
      const item = this.itemsById.get(id);
      if (!item) return undefined;
      return { id, item, datum: item.datum };
    };

    const localPoint = (event: Event): SvgPoint | undefined => {
      const svg = this.svg;
      if (svg === undefined) return undefined;
      if (!(event instanceof PointerEvent) && !(event instanceof WheelEvent)) {
        return undefined;
      }
      // Map client → SVG user space through the inverse screen CTM: the
      // frame's recorded conversions are in SVG user units, and a plain
      // bounding-rect subtraction diverges from them the moment the svg is
      // visually scaled (a CSS transform — e.g. Storybook's preview zoom — or
      // a future viewBox). Fall back to the subtraction where the CTM isn't
      // available (headless DOMs).
      const ctm = svg.getScreenCTM?.();
      if (ctm && typeof DOMPoint !== "undefined") {
        const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
          ctm.inverse()
        );
        return { x: p.x, y: p.y };
      }
      const box = svg.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    const send = (type: InteractionEventType, event: Event) => {
      const hit = hitFor(event);
      const pt = localPoint(event);
      for (const input of this.inputs) {
        input.onEvent?.(type, event, hit, pt);
      }
    };

    // Where the pointer is, by an event's target: over the svg, off it, or
    // unknown while a re-run has the svg out of the page. A `pointerleave`
    // does not bubble, so the one the host hears is its own: the pointer
    // left the chart.
    const where = (type: InteractionEventType, event: Event) => {
      const target = event.target as Node | null;
      if (type === "pointerleave" && target === host) return "off";
      const svg = this.svg;
      if (svg === undefined || !svg.isConnected) return "unknown";
      return target !== null && svg.contains(target) ? "over" : "off";
    };

    const leaves = needed.has("pointerleave");
    const dispatch = (type: InteractionEventType) => (event: Event) => {
      const at = where(type, event);
      if (at === "unknown") return;
      const inside = at === "over";
      if (this.pointerInside && !inside && leaves) send("pointerleave", event);
      this.pointerInside = inside;
      if (inside && type !== "pointerleave" && needed.has(type))
        send(type, event);
    };

    // A move off the svg inside the host is a leave, so leaving takes moves.
    const types = new Set(needed);
    if (leaves) types.add("pointermove");
    const listeners: [InteractionEventType, (e: Event) => void][] = [
      ...types,
    ].map((type): [InteractionEventType, (e: Event) => void] => [
      type,
      dispatch(type),
    ]);
    for (const [type, fn] of listeners) {
      // Non-passive so wheel-bound inputs can preventDefault page scroll.
      host.addEventListener(
        type,
        fn,
        type === "wheel" ? { passive: false } : undefined
      );
    }

    this.detach = () => {
      for (const [type, fn] of listeners) host.removeEventListener(type, fn);
      this.host = undefined;
      this.attachedEvents = undefined;
      this.pointerInside = false;
    };
  }

  private disposed = false;

  /** True once {@link dispose} ran: the chart this runtime served is gone. */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Tear down this runtime when its chart goes away: `View.unmount()`, or a
   * DIFFERENT chart taking over its container (gofish.tsx compares the
   * incoming runtime against the stored one). Detaches DOM listeners, drops
   * this runtime from every input's `specReaders` sets (so a still-live input
   * no longer invalidates this dead chart, and a `timer()` it was the last
   * reader of stops ticking), and clears the rerender thunk so any stray
   * `invalidate()` that still races in no-ops.
   */
  dispose(): void {
    this.disposed = true;
    this.detach?.();
    // Remove ourselves as a dependency of any still-live shared input.
    this.dropSpecEdges();
    this.rerenderFn = undefined;
    this.inputs = [];
    this.registered.clear();
    this.itemsById.clear();
    this.boxesById.clear();
    this.conv = undefined;
  }
}
