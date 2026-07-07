/**
 * InteractionRuntime — owns the interaction side of a rendered chart. It has
 * exactly three jobs and never touches the layout pipeline:
 *
 *   1. an rAF-coalesced, latest-wins re-render scheduler (`invalidate` /
 *      `runRerender`), with a hidden-tab timeout fallback so headless drivers
 *      and backgrounded tabs don't freeze;
 *   2. delegated DOM event dispatch on the root <svg>
 *      (pointermove/down/up/leave/wheel), routed to registered inputs;
 *   3. hit-testing: `publishFrame` keeps an id → item map (for
 *      `pointer().datum()`) plus the frame's data-space conversions.
 *
 * Inputs register themselves during resolve (via the ambient context). At the
 * start of each resolve the runtime resets every registered input's
 * `usedInSpec` flag, so an input read in one resolve but not the next stops
 * invalidating.
 */
import type { DisplayList } from "gofish-ir";
import type {
  Hit,
  InputPrimitive,
  InteractionEventType,
  InteractionFrame,
  SvgPoint,
} from "./types";
import { frameConversions, type FrameConversions } from "./frameScales";

/** Walk a display list depth-first, including composite/group/mask innards. */
function* walkItems(
  items: DisplayList.DisplayItem[]
): Generator<DisplayList.DisplayItem> {
  for (const item of items) {
    yield item;
    switch (item.kind) {
      case "group":
        yield* walkItems(item.children);
        break;
      case "composite":
        yield* walkItems(item.source);
        yield* walkItems(item.dest);
        break;
      case "mask":
        yield* walkItems(item.mask);
        yield* walkItems(item.content);
        break;
    }
  }
}

export class InteractionRuntime {
  private inputs: InputPrimitive[] = [];
  private registered = new Set<InputPrimitive>();
  /** node uid → first lowered item with that id, rebuilt each frame. */
  private itemsById = new Map<string, DisplayList.DisplayItem>();
  private conv?: FrameConversions;
  private svg?: SVGSVGElement;
  private detach?: () => void;

  /** Register an input (idempotent by identity: the ambient-context path
   *  re-registers the same inputs on every re-resolve). */
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

  /** Reset per-resolve dependency flags. Called at the start of every resolve
   *  so `usedInSpec` reflects only reads in the CURRENT resolve. */
  beginResolve(): void {
    for (const input of this.inputs) input.usedInSpec = false;
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
    this.running = true;
    try {
      await this.rerenderFn!();
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
   * id-keyed hit-test map (fresh uids each resolve) and the data-space
   * conversions, then notifies inputs.
   */
  publishFrame(frame: InteractionFrame): void {
    this.conv = frameConversions(frame);
    this.itemsById = new Map();
    for (const item of walkItems(frame.items)) {
      if (item.id !== undefined && !this.itemsById.has(item.id)) {
        this.itemsById.set(item.id, item);
      }
    }
    for (const input of this.inputs) input.onFrame?.(frame);
  }

  /** Attach delegated listeners to the rendered <svg> (idempotent per svg). */
  attachSVG(svg: SVGSVGElement): void {
    if (this.svg === svg) return;
    this.detach?.();
    this.svg = svg;

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
      if (!(event instanceof PointerEvent) && !(event instanceof WheelEvent)) {
        return undefined;
      }
      const box = svg.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    const dispatch = (type: InteractionEventType) => (event: Event) => {
      const hit = hitFor(event);
      const pt = localPoint(event);
      for (const input of this.inputs) {
        input.onEvent?.(type, event, hit, pt);
      }
    };

    const listeners: [InteractionEventType, (e: Event) => void][] = [
      ["pointermove", dispatch("pointermove")],
      ["pointerdown", dispatch("pointerdown")],
      ["pointerup", dispatch("pointerup")],
      ["pointerleave", dispatch("pointerleave")],
      ["wheel", dispatch("wheel")],
    ];
    for (const [type, fn] of listeners) {
      // Non-passive so wheel-bound inputs can preventDefault page scroll.
      svg.addEventListener(
        type,
        fn,
        type === "wheel" ? { passive: false } : undefined
      );
    }

    this.detach = () => {
      for (const [type, fn] of listeners) svg.removeEventListener(type, fn);
      this.svg = undefined;
    };
  }

  dispose(): void {
    this.detach?.();
    this.inputs = [];
    this.registered.clear();
    this.itemsById.clear();
  }
}
