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
  StatePredicate,
  SvgPoint,
} from "./types";
import type { DeferredSelector, StateChannel } from "./states";
import { isDeferredSelector } from "./states";
import type { LiveValue } from "./live";
import {
  executeBind,
  isBindSpec,
  type Anchor,
  type BindSpec,
  type RangeAnchor,
  type SetAnchor,
} from "./bindings";
import { frameConversions, type FrameConversions } from "./frameScales";

/**
 * The `refs` object handed to an `.interact((refs) => [...])` callback —
 * the chart-side anchors bindings compose against, mirroring the refs
 * callback of `.constrain()`. All anchors read the CURRENT frame lazily, so
 * declarations survive Tier-2 re-resolves.
 */
export interface InteractRefs {
  /** The plot's continuous data domains as range anchors. */
  plot: { x: RangeAnchor; y: RangeAnchor };
  /** Band x-extents of a named layer as a keyed Set⟨range⟩ anchor. */
  bands: (layerName: string) => { x: SetAnchor };
  /** A named instrument (declared via an interactive mark or `name:`). */
  instrument: (name: string) => Instrument | undefined;
}

/** What an `.interact()` callback may return: instruments to register and/or
 *  Bind declarations to execute. */
export type InteractEntry = Instrument | BindSpec;
export type InteractCallback = (refs: InteractRefs) => InteractEntry[] | void;

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
  private registered = new Set<Instrument>();
  /** name → instrument, for deferred selectors and `refs.instrument()`. */
  private byName = new Map<string, Instrument>();
  /** node uid → per-channel state declarations, rebuilt each frame. */
  private statesById = new Map<string, Record<string, StateChannel>>();
  /** node uid → per-channel live accessors, rebuilt each frame. */
  private livesById = new Map<string, Record<string, LiveValue>>();
  /** node uid → first lowered item with that id, rebuilt each frame. */
  private itemsById = new Map<string, DisplayList.DisplayItem>();
  /** layer name → node uids, rebuilt each frame (from `__gfLayerName`). */
  private layerUids = new Map<string, Set<string>>();
  private conv?: FrameConversions;
  private frame?: InteractionFrame;
  private svg?: SVGSVGElement;
  private detach?: () => void;

  /** Idempotent by identity: the ambient-context path re-registers the same
   *  instruments on every Tier-2 re-resolve. */
  register(...instruments: Instrument[]): void {
    for (const inst of instruments) {
      if (this.registered.has(inst)) continue;
      this.registered.add(inst);
      this.instruments.push(inst);
      if (inst.name) this.byName.set(inst.name, inst);
      inst.attach?.(this);
    }
  }

  /** True when anything registered — the render terminal's static/interactive
   *  fork reads this after resolve. */
  hasWork(): boolean {
    return this.instruments.length > 0;
  }

  instrumentByName(name: string): Instrument | undefined {
    return this.byName.get(name);
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
    const run = (): void => {
      this.scheduled = false;
      void this.runRerender();
    };
    // rAF is the right cadence for visible interaction, but browsers throttle
    // it to zero in hidden tabs — which would freeze Tier-2 re-renders for
    // headless drivers and backgrounded linked views. Fall back to a timeout
    // when the document isn't visible.
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
   * id-keyed maps (stable-path re-binding: fresh uids each resolve) and
   * notifies instruments.
   */
  publishFrame(frame: InteractionFrame): void {
    this.frame = frame;
    this.conv = frameConversions(frame);
    this.itemsById = new Map();
    for (const item of walkItems(frame.items)) {
      if (item.id !== undefined && !this.itemsById.has(item.id)) {
        this.itemsById.set(item.id, item);
      }
    }
    this.statesById = new Map();
    this.livesById = new Map();
    this.layerUids = new Map();
    const collect = (node: GoFishNode): void => {
      const rec = node as unknown as Record<string, unknown>;
      const states = rec.__gfStates as Record<string, StateChannel> | undefined;
      if (states) this.statesById.set(node.uid, states);
      const lives = rec.__gfLive as Record<string, LiveValue> | undefined;
      if (lives) this.livesById.set(node.uid, lives);
      const layerName = rec.__gfLayerName as string | undefined;
      if (layerName) {
        let set = this.layerUids.get(layerName);
        if (!set) this.layerUids.set(layerName, (set = new Set()));
        set.add(node.uid);
      }
      for (const child of node.children) {
        if (child instanceof GoFishNodeClass) collect(child);
      }
    };
    collect(frame.root);
    for (const inst of this.instruments) inst.onFrame?.(frame);
  }

  /** Band x-extents (converted space) of a named layer's rect items, keyed by
   *  node uid. Re-derived per frame from the CURRENT items — stable-path
   *  re-binding, since uids and geometry are per-resolve. */
  bandsFor(layerName: string): Map<string, [number, number]> {
    const out = new Map<string, [number, number]>();
    const uids = this.layerUids.get(layerName);
    if (!uids || !this.conv) return out;
    // Named layers register the resolved chart node; band rects are its
    // descendants. Fall back to descendant scan when the named node itself
    // isn't a rect item.
    const px = this.conv.pxToData[0];
    const addRect = (uid: string): void => {
      const item = this.itemsById.get(uid);
      if (item?.kind === "rect" && item.role === "node") {
        const lo = px(item.x);
        const hi = px(item.x + item.w);
        out.set(uid, lo <= hi ? [lo, hi] : [hi, lo]);
      }
    };
    for (const uid of uids) addRect(uid);
    if (out.size === 0 && this.frame) {
      // The named nodes may be containers (a named chart tier) rather than
      // the mark rects themselves — scan their subtrees for the rect items.
      const visit = (node: GoFishNode, inNamed: boolean): void => {
        const named = inNamed || uids.has(node.uid);
        if (named) addRect(node.uid);
        for (const child of node.children) {
          if (child instanceof GoFishNodeClass) visit(child, named);
        }
      };
      visit(this.frame.root, false);
    }
    return out;
  }

  /** Resolve a name-deferred selector against the instrument registry. */
  private resolveDeferred(def: DeferredSelector): StatePredicate | undefined {
    const { name, kind, of } = def.__gfSelector;
    const inst = this.byName.get(name) as
      | (Instrument & Record<string, unknown>)
      | undefined;
    if (!inst) return undefined;
    if (kind === "above" || kind === "below") {
      const value = inst.value as (() => number) | undefined;
      if (!value || !of) return undefined;
      return kind === "above"
        ? (datum) => of(datum) > value()
        : (datum) => of(datum) <= value();
    }
    // inside / insideCommitted / intersectsX delegate to the instrument's
    // own selector of the same name.
    const sel = inst[kind] as StatePredicate | undefined;
    return typeof sel === "function" ? sel : undefined;
  }

  /**
   * Tier-0 style patch for one item. Read inside paint-time reactive style
   * accessors — predicates may read signals, so Solid re-runs the accessor
   * (and only it) when interaction state changes.
   */
  patch = (item: DisplayList.DisplayItem): ItemPatch | undefined => {
    if (item.id === undefined) return undefined;
    const states = this.statesById.get(item.id);
    const lives = this.livesById.get(item.id);
    if (!states && !lives) return undefined;
    let out: Record<string, unknown> | undefined;
    if (states) {
      for (const [channel, sc] of Object.entries(states)) {
        for (const c of sc.cases) {
          const pred = isDeferredSelector(c.pred)
            ? this.resolveDeferred(c.pred)
            : c.pred;
          if (pred?.(item.datum, item)) {
            (out ??= {})[channel] = c.value;
            break;
          }
        }
      }
    }
    if (lives) {
      // Live channels: unconditional reactive values. Accessors receive the
      // runtime's refs so they can reach named instruments without closures.
      const refs = this.refs();
      for (const [channel, accessor] of Object.entries(lives)) {
        (out ??= {})[channel] = accessor(refs);
      }
    }
    return out as ItemPatch | undefined;
  };

  /* ---- the `.interact((refs) => [...])` callback form ---- */

  /** Chart-side anchors for Bind declarations. Every getter reads the CURRENT
   *  frame lazily, so declarations survive Tier-2 re-resolves. */
  refs(): InteractRefs {
    const domain = (axis: "x" | "y"): [number, number] =>
      this.frame?.domains?.[axis] ?? [-Infinity, Infinity];
    return {
      plot: {
        x: { kind: "range", get: () => domain("x") },
        y: { kind: "range", get: () => domain("y") },
      },
      bands: (layerName: string) => ({
        x: {
          kind: "set",
          member: "range",
          entries: () => this.bandsFor(layerName),
        } satisfies SetAnchor,
      }),
      instrument: (name: string) => this.byName.get(name),
    };
  }

  /** Run `.interact()` callbacks (once, after the first resolve): register
   *  returned instruments, execute returned Bind declarations. The array is
   *  an UNORDERED relation set, like `.constrain()`'s. */
  runInteractCallbacks(callbacks: InteractCallback[]): void {
    const refs = this.refs();
    for (const cb of callbacks) {
      const entries = cb(refs) ?? [];
      // Register instruments first so Bind declarations may target them
      // regardless of array order (unordered-set semantics).
      const binds: BindSpec[] = [];
      for (const entry of entries) {
        if (isBindSpec(entry)) binds.push(entry);
        else this.register(entry);
      }
      for (const spec of binds) executeBind(spec);
    }
  }

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
