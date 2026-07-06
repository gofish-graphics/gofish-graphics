/**
 * InteractionRuntime — owns the interaction side of a rendered chart:
 * delegated DOM events on the root <svg>, hit resolution via `data-gf-id`,
 * per-frame re-binding (uids are minted fresh per resolve, so all maps are
 * rebuilt at frame publication), and the Tier-0 `patch` accessor the paint
 * layer reads per item.
 *
 * The runtime never touches the layout pipeline; it reads published frames
 * and exposes signal-backed state that paint-time accessors track.
 */
import type { JSX } from "solid-js";
import type { DisplayList } from "gofish-ir";
import type { GoFishNode } from "../ast/_node";
import { GoFishNode as GoFishNodeClass } from "../ast/_node";
import type {
  Hit,
  Instrument,
  InteractionEventType,
  InteractionFrame,
  ItemPatch,
  SvgPoint,
} from "./types";
import type { StateChannel } from "./states";

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
  private instruments: Instrument[] = [];
  /** node uid → per-channel state declarations, rebuilt each frame. */
  private statesById = new Map<string, Record<string, StateChannel>>();
  /** node uid → first lowered item with that id, rebuilt each frame. */
  private itemsById = new Map<string, DisplayList.DisplayItem>();
  private svg?: SVGSVGElement;
  private detach?: () => void;

  register(...instruments: Instrument[]): void {
    this.instruments.push(...instruments);
    for (const inst of instruments) inst.attach?.(this);
  }

  /* ---- Tier-2 scheduler: re-resolve + re-render on spec changes ---- */

  private rerenderFn?: () => Promise<unknown>;
  private scheduled = false;
  private running = false;
  private dirty = false;

  /** Wired by the render terminal: the thunk that re-runs resolve → layout →
   *  paint into the same container (the pipeline is tree-consuming, so a
   *  fresh tree is rebuilt through the immutable builder each time). */
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
    requestAnimationFrame(() => {
      this.scheduled = false;
      void this.runRerender();
    });
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
   * id-keyed maps (stable-path re-binding: fresh uids each resolve) and
   * notifies instruments.
   */
  publishFrame(frame: InteractionFrame): void {
    this.itemsById = new Map();
    for (const item of walkItems(frame.items)) {
      if (item.id !== undefined && !this.itemsById.has(item.id)) {
        this.itemsById.set(item.id, item);
      }
    }
    this.statesById = new Map();
    const collect = (node: GoFishNode): void => {
      const states = (node as unknown as Record<string, unknown>).__gfStates as
        | Record<string, StateChannel>
        | undefined;
      if (states) this.statesById.set(node.uid, states);
      for (const child of node.children) {
        if (child instanceof GoFishNodeClass) collect(child);
      }
    };
    collect(frame.root);
    for (const inst of this.instruments) inst.onFrame?.(frame);
  }

  /**
   * Tier-0 style patch for one item. Read inside paint-time reactive style
   * accessors — predicates may read signals, so Solid re-runs the accessor
   * (and only it) when interaction state changes.
   */
  patch = (item: DisplayList.DisplayItem): ItemPatch | undefined => {
    if (item.id === undefined) return undefined;
    const states = this.statesById.get(item.id);
    if (!states) return undefined;
    let out: Record<string, unknown> | undefined;
    for (const [channel, sc] of Object.entries(states)) {
      for (const c of sc.cases) {
        if (c.pred(item.datum, item)) {
          (out ??= {})[channel] = c.value;
          break;
        }
      }
    }
    return out as ItemPatch | undefined;
  };

  /** Tier-1 overlays: instrument-owned geometry painted above the chart. */
  renderOverlays(): JSX.Element[] {
    return this.instruments
      .filter((inst) => inst.renderOverlay)
      .map((inst) => inst.renderOverlay!());
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
      for (const inst of this.instruments) {
        inst.onEvent?.(type, event, hit, pt);
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
      // Non-passive so wheel-bound parameters can preventDefault page scroll.
      svg.addEventListener(
        type,
        fn,
        type === "wheel" ? { passive: false } : undefined
      );
    }
    // Keyboard events don't bubble to an <svg> without focus; listen on the
    // document while attached.
    const keyFn = dispatch("keydown");
    document.addEventListener("keydown", keyFn);

    this.detach = () => {
      for (const [type, fn] of listeners) svg.removeEventListener(type, fn);
      document.removeEventListener("keydown", keyFn);
      this.svg = undefined;
    };
  }

  dispose(): void {
    this.detach?.();
    this.instruments = [];
    this.statesById.clear();
    this.itemsById.clear();
  }
}
