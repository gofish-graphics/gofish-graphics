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
 *   2. delegated DOM event dispatch on the root <svg>
 *      (pointermove/down/up/leave/wheel), routed to registered inputs;
 *   3. hit-testing: `publishFrame` keeps an id → item map (for
 *      `pointer().datum()`) plus the frame's data-space conversions.
 *
 * Inputs register themselves during resolve (via the ambient context). At the
 * start of each resolve the runtime drops itself from every registered input's
 * `specRuntimes` set, so an input read in one resolve but not the next stops
 * invalidating this chart (a shared input keeps its edges to OTHER charts).
 */
import type { DisplayList } from "gofish-ir";
import type {
  Hit,
  InputPrimitive,
  InteractionEventType,
  InteractionFrame,
  SpecInvalidator,
  SvgPoint,
} from "./types";
import type { AmbientRegistrar } from "./resolveContext";
import { frameConversions, type FrameConversions } from "./frameScales";

/** Set equality by membership (small sets of event-type strings). */
function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

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

export class InteractionRuntime implements AmbientRegistrar, SpecInvalidator {
  private inputs: InputPrimitive[] = [];
  private registered = new Set<InputPrimitive>();
  /** node uid → first lowered item with that id, rebuilt each frame. */
  private itemsById = new Map<string, DisplayList.DisplayItem>();
  private conv?: FrameConversions;
  private svg?: SVGSVGElement;
  private detach?: () => void;
  /** The set of DOM event types currently attached to `svg` — the union of
   *  registered inputs' `events` at attach time. Compared on re-attach so a
   *  later resolve that registered a new input kind grows the listener set. */
  private attachedEvents?: Set<InteractionEventType>;

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

  /** Reset THIS runtime's dependency edges. Called at the start of every
   *  resolve: it removes only ITSELF from each registered input's
   *  `specRuntimes` set, so a re-resolve of this chart doesn't drop another
   *  chart's dependency on a shared input. Reads during the coming resolve
   *  re-add this runtime if the input is still read outside `live()`. */
  beginResolve(): void {
    for (const input of this.inputs) input.specRuntimes.delete(this);
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
    // Build the id-keyed hit-test map + data-space conversions only when some
    // registered input needs them (pointer/drag). A wheel/timer/signal-only
    // chart never hit-tests, so skip the full item walk. A pointer that
    // registers on a LATER resolve flips `needsFrame` true, and that resolve's
    // publishFrame builds the map before any hit-test can read it.
    if (this.inputs.some((i) => i.needsFrame)) {
      this.conv = frameConversions(frame);
      this.itemsById = new Map();
      for (const item of walkItems(frame.items)) {
        if (item.id !== undefined && !this.itemsById.has(item.id)) {
          this.itemsById.set(item.id, item);
        }
      }
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

  /** Attach delegated listeners to the rendered <svg> for exactly the event
   *  types the registered inputs consume. Idempotent per (svg, event-set): a
   *  re-resolve into the same svg re-attaches only if the needed set grew (a new
   *  input kind registered). */
  attachSVG(svg: SVGSVGElement): void {
    const needed = this.neededEvents();
    if (
      this.svg === svg &&
      this.attachedEvents !== undefined &&
      sameSet(this.attachedEvents, needed)
    ) {
      return;
    }
    this.detach?.();
    this.svg = svg;
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

    const dispatch = (type: InteractionEventType) => (event: Event) => {
      const hit = hitFor(event);
      const pt = localPoint(event);
      for (const input of this.inputs) {
        input.onEvent?.(type, event, hit, pt);
      }
    };

    const listeners: [InteractionEventType, (e: Event) => void][] = [
      ...needed,
    ].map((type): [InteractionEventType, (e: Event) => void] => [
      type,
      dispatch(type),
    ]);
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
      this.attachedEvents = undefined;
    };
  }

  /**
   * Tear down this runtime when its container is taken over by a DIFFERENT
   * chart (gofish.tsx compares the incoming runtime against the stored one).
   * Detaches DOM listeners, drops this runtime from every input's
   * `specRuntimes` set (so a still-live input — e.g. a running `timer()` a user
   * never `.stop()`ed — no longer invalidates this dead chart), and clears the
   * rerender thunk so any stray `invalidate()` that still races in no-ops.
   */
  dispose(): void {
    this.detach?.();
    // Remove ourselves as a dependency of any still-live shared input.
    for (const input of this.inputs) input.specRuntimes.delete(this);
    this.rerenderFn = undefined;
    this.inputs = [];
    this.registered.clear();
    this.itemsById.clear();
    this.conv = undefined;
  }
}
