// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * The input behind a tooltip (#1395): which of a mark's nodes the pointer
 * focuses. INTERNAL. It is the runtime half of the proposed
 * `pointer().snap(selectAll(name), focus)`: a dataset of zero or one mark
 * whose value changes only when the focused mark does. Exposing it later is
 * exporting a factory over {@link TooltipFocus}.
 *
 * It is an ordinary {@link InputPrimitive}: the runtime hands it every frame
 * it publishes and every pointer event. From the frame it builds the
 * candidates, one per mark, from the drawn items' boxes (the layout's, not
 * the DOM's) and from where the layout placed each mark. On each event it
 * runs the focus behavior (`focus.ts`), and only when the focused key
 * changes does it invalidate the charts that read it, so a chart re-runs its
 * layout once per change of focus, not once per pointer move.
 *
 * A mark drawn as a path across its data (a line, `isPath`) is one
 * candidate for its whole path, so where the pointer is along it is not a
 * change of focus. Its box follows the pointer as a paint patch: the box is
 * drawn moved by {@link TooltipFocus.offset}, which reads the pointer, to
 * sit beside the point of the path nearest the pointer (`tooltip.ts`).
 */
import type { DisplayList } from "gofish-ir";
import { createSignal } from "solid-js";
import type {
  InputPrimitive,
  InteractionEventType,
  InteractionFrame,
  SpecInvalidator,
  SvgPoint,
} from "./types";
import type { Registrar } from "./resolveContext";
import { itemBox, walkItems, type Affine } from "./runtime";
import {
  defaultFocus,
  isPath,
  nearestOnPath,
  type Box,
  type Candidate,
  type FocusBehavior,
  type Outline,
  type Point,
} from "./focus";
import type { Seated } from "../ast/tooltip/place";
import { breadthFirst, GoFishNode } from "../ast/_node";
import {
  continuousInterval,
  isORDINAL,
  isUNDEFINED,
  originIs,
  type UnderlyingSpace,
} from "../ast/underlyingSpace";

/** A mark a tooltip may describe, as one resolve made it. */
export type FocusMark = {
  /** Derived from the mark's data, so it survives a re-run, which makes
   *  every node anew (#673). Marks with one key are one candidate. */
  key: string;
  node: GoFishNode;
  rows: unknown[];
};

const POINTER_EVENTS: InteractionEventType[] = [
  "pointermove",
  "pointerdown",
  "pointerup",
  "pointerleave",
];

/** One tooltip's focus: the focused key, and the marks of the last resolve. */
export class TooltipFocus implements InputPrimitive {
  private readonly readers = new Set<SpecInvalidator>();
  readonly specReaders = [this.readers];
  readonly events = POINTER_EVENTS;
  readonly needsFrame = true;
  /** The focused mark's key, or undefined with no focus. */
  key: string | undefined;
  private marks: FocusMark[] = [];
  /** The candidates of the last frame, and the pointer of the last event (a
   *  tap holds it, see `onEvent`). Signals, so the paint patch that moves a
   *  path's box ({@link offset}) re-reads them; nothing in layout does. */
  private readonly candidates = createSignal<Candidate[]>([]);
  private readonly pointer = createSignal<Point | undefined>(undefined);
  /** The box the last lowering drew, and where it was drawn. */
  private box: GoFishNode | undefined;
  private cover: Box | undefined;
  /** Where the layout seated a path's box, and where it would seat it
   *  beside a point (`tooltipPlace`), in the layout's px; and, once a frame
   *  has the box, where the layout's origin is in the pointer's px. */
  private seat:
    | {
        at: [number, number];
        seatAt: (p: Point) => [number, number];
        origin?: Point;
      }
    | undefined;
  private touch = false;

  constructor(private readonly behavior: FocusBehavior = defaultFocus) {}

  /**
   * Called by each resolve of a mark with the tooltip: the input registers
   * with `registrar` (so the chart publishes frames to it and wires its
   * events), and the chart becomes a reader of its key (so a change of
   * focus re-runs it).
   */
  read(registrar: Registrar): void {
    registrar.registerInput(this);
    this.readers.add(registrar);
  }

  /** Called by each lowering of the tooltip (`tooltip.ts`) with the call's
   *  marks in the whole render, before it draws the box. */
  use(marks: FocusMark[]): void {
    this.marks = marks;
    this.box = undefined;
    this.seat = undefined;
  }

  /** The box the lowering drew for the focused mark. */
  drew(box: GoFishNode): void {
    this.box = box;
  }

  /** Whether the focused mark is drawn as a path (`isPath`), so its box
   *  follows the pointer along it. Read from the candidates of the last
   *  frame: a change of focus moves no mark. */
  follows(): boolean {
    const c = this.focused();
    return c !== undefined && isPath(c);
  }

  /** Where the layout seated the box of a path (`tooltipPlace`). */
  readonly seated: Seated = (at, seatAt) => {
    this.seat = { at, seatAt };
  };

  /**
   * How far a path's box moves at paint from where the layout seated it: to
   * its seat beside the point of the path nearest the pointer, kept inside
   * the chart as the layout keeps it. A paint-time value: it reads the
   * pointer and the frame, so the box moves as they change, with no layout.
   */
  offset(): [number, number] {
    const c = this.focused();
    const p = this.pointer[0]();
    const seat = this.seat;
    const q = c && p && nearestOnPath(p, c.outline);
    const o = seat?.origin;
    if (!q || !o) return [0, 0];
    const [x, y] = seat!.seatAt({ x: q.x - o.x, y: q.y - o.y });
    return [x - seat!.at[0], y - seat!.at[1]];
  }

  private focused(): Candidate | undefined {
    return this.candidates[0]().find((c) => c.key === this.key);
  }

  onFrame(frame: InteractionFrame): void {
    this.cover =
      this.box === undefined ? undefined : drawnBox(frame.items, this.box);
    if (this.seat && this.cover)
      this.seat.origin = {
        x: this.cover.x0 - this.seat.at[0],
        y: this.cover.y0 - this.seat.at[1],
      };
    this.candidates[1](candidatesOf(frame.items, this.marks));
  }

  onEvent(
    type: InteractionEventType,
    event: Event,
    _hit: unknown,
    pt: SvgPoint | undefined
  ): void {
    // A tap holds the pointer where it tapped until the next tap: a touch
    // ends with `pointerleave`, which would close the box at once. A mouse
    // move goes back to plain hover.
    const kind = (event as PointerEvent).pointerType;
    if (type === "pointerdown")
      this.touch = kind !== undefined && kind !== "" && kind !== "mouse";
    else if (type === "pointermove" && kind === "mouse") this.touch = false;
    if (type === "pointerleave") {
      if (!this.touch) this.pointer[1](undefined);
    } else if (type !== "pointerup")
      this.pointer[1](pt && { x: pt.x, y: pt.y });
    this.choose();
  }

  /** Run the behavior on the current pointer and candidates, and invalidate
   *  the readers when the focused key changes. */
  private choose(): void {
    // The open box covers the marks under it: a pointer over it reads the
    // box, so the focus stays on the mark it describes. The frame has the
    // box where the layout put it, and a path's box is drawn moved.
    const p = this.pointer[0]();
    const c = this.cover;
    const [dx, dy] = this.offset();
    if (
      this.key !== undefined &&
      p !== undefined &&
      c !== undefined &&
      p.x >= c.x0 + dx &&
      p.x <= c.x1 + dx &&
      p.y >= c.y0 + dy &&
      p.y <= c.y1 + dy
    )
      return;
    const candidates = this.candidates[0]();
    const key = this.behavior({
      pointer: p,
      candidates,
      current: this.focused(),
      clicked: false,
    }).choice?.key as string | undefined;
    if (key === this.key) return;
    this.key = key;
    for (const r of this.readers) r.invalidate();
  }
}

/** Each registrar's focus for each tooltip call: the focus outlives the
 *  resolves of one chart, and two charts drawing one spec focus apart. */
const focuses = new WeakMap<Registrar, WeakMap<object, TooltipFocus>>();

/** The focus `call` (one `.tooltip()` call) has in the chart `registrar`
 *  renders, made on its first resolve. */
export function focusOf(registrar: Registrar, call: object): TooltipFocus {
  let byCall = focuses.get(registrar);
  if (byCall === undefined) focuses.set(registrar, (byCall = new WeakMap()));
  let focus = byCall.get(call);
  if (focus === undefined) byCall.set(call, (focus = new TooltipFocus()));
  return focus;
}

/* ------------------------------ candidates ------------------------------ */

/** The candidates the drawn `items` make of `marks`: per key, the outline
 *  of every item the key's marks drew, their box, and where the layout
 *  placed them. A mark that drew nothing with a box is no candidate. */
export function candidatesOf(
  items: DisplayList.DisplayItem[],
  marks: FocusMark[]
): Candidate[] {
  // The node uids each mark drew under, itself included.
  const owner = new Map<string, FocusMark>();
  for (const m of marks)
    for (const n of breadthFirst(m.node))
      if (!owner.has(n.uid)) owner.set(n.uid, m);
  const parts = new Map<FocusMark, Drawn>();
  walkItems(items, (item, at) => {
    const m = item.id !== undefined ? owner.get(item.id) : undefined;
    if (m === undefined) return;
    let drawn = parts.get(m);
    if (drawn === undefined) parts.set(m, (drawn = emptyDrawn()));
    addParts(drawn, outlineOf(item, at));
  });
  const byKey = new Map<string, Candidate & { marks: FocusMark[] }>();
  for (const m of marks) {
    const drawn = parts.get(m);
    if (drawn === undefined || drawn.outline.length === 0) continue;
    const c = byKey.get(m.key);
    if (c === undefined)
      byKey.set(m.key, {
        key: m.key,
        datum: [...m.rows],
        box: drawn.box,
        position: {},
        outline: drawn.outline,
        marks: [m],
      });
    else {
      // Marks that share a key are one candidate: the union of their parts,
      // grown part by part (rebuilding the box from the merged outline on
      // each merge is quadratic in the number of marks).
      for (const r of m.rows) c.datum.push(r);
      const merged = { outline: c.outline, box: c.box };
      addParts(merged, drawn.outline);
      c.box = merged.box;
      c.marks.push(m);
    }
  }
  return [...byKey.values()].map(({ marks: ms, ...c }) => {
    const [px, py] = positionAxes(ms[0].node);
    return {
      ...c,
      position: {
        x: px ? (c.box.x0 + c.box.x1) / 2 : undefined,
        y: py ? (c.box.y0 + c.box.y1) / 2 : undefined,
      },
    };
  });
}

/** The box of everything `node` drew among `items`, in svg px; undefined
 *  when it drew nothing with a box. */
function drawnBox(
  items: DisplayList.DisplayItem[],
  node: GoFishNode
): Box | undefined {
  const uids = new Set([...breadthFirst(node)].map((n) => n.uid));
  const drawn = emptyDrawn();
  walkItems(items, (item, at) => {
    if (item.id !== undefined && uids.has(item.id))
      addParts(drawn, outlineOf(item, at));
  });
  return drawn.outline.length > 0 ? drawn.box : undefined;
}

/** An outline being collected, and the box of its parts so far. */
type Drawn = { outline: Outline; box: Box };

const emptyDrawn = (): Drawn => ({
  outline: [],
  box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
});

/** Add `parts` to `drawn`, growing its box by each. A loop, not a spread
 *  into `push` or `Math.min`: a long path has more parts than a call takes
 *  arguments. */
function addParts(drawn: Drawn, parts: Outline): void {
  const { outline, box } = drawn;
  for (const p of parts) {
    outline.push(p);
    if (p.box.x0 < box.x0) box.x0 = p.box.x0;
    if (p.box.y0 < box.y0) box.y0 = p.box.y0;
    if (p.box.x1 > box.x1) box.x1 = p.box.x1;
    if (p.box.y1 > box.y1) box.y1 = p.box.y1;
  }
}

/** The outline parts one drawn item adds, in svg px. A text item carries
 *  no box, so it adds none. A box is the item's box (`itemBox`) with its
 *  corners in order, under a negative scale too. */
function outlineOf(item: DisplayList.DisplayItem, at: Affine): Outline {
  switch (item.kind) {
    case "rect":
    case "image":
    case "ellipse":
    case "composite": {
      const { x, y, w, h } = itemBox(item, at)!;
      return [
        {
          box: {
            x0: Math.min(x, x + w),
            x1: Math.max(x, x + w),
            y0: Math.min(y, y + h),
            y1: Math.max(y, y + h),
          },
          round: item.kind === "ellipse" && Math.abs(item.rx - item.ry) < 1e-9,
        },
      ];
    }
    case "path":
      return pathSegments(item.d).map(([a, b]) => {
        const p = { x: at.tx + at.sx * a.x, y: at.ty + at.sy * a.y };
        const q = { x: at.tx + at.sx * b.x, y: at.ty + at.sy * b.y };
        return {
          box: {
            x0: Math.min(p.x, q.x),
            x1: Math.max(p.x, q.x),
            y0: Math.min(p.y, q.y),
            y1: Math.max(p.y, q.y),
          },
          round: false,
          segment: [p, q] as const,
        };
      });
    default:
      return [];
  }
}

/**
 * The segments of a path's `d`, from point to point of each command. A
 * curve is read as the chord from its start to its end: near enough to
 * measure a pointer's distance to a line mark, which is what it is for.
 * Commands are read in absolute and relative form.
 */
export function pathSegments(d: string): [Point, Point][] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out: [Point, Point][] = [];
  let cur: Point = { x: 0, y: 0 };
  let start: Point = cur;
  let cmd = "";
  let i = 0;
  const num = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && !/[a-zA-Z]/.test(tokens[i]);
  const lineTo = (p: Point) => {
    out.push([cur, p]);
    cur = p;
  };
  // The number of coordinates each command takes, and the end point of one.
  const ARITY: Record<string, number> = {
    m: 2,
    l: 2,
    h: 1,
    v: 1,
    c: 6,
    s: 4,
    q: 4,
    t: 2,
    a: 7,
  };
  while (i < tokens.length) {
    if (!isNum()) cmd = tokens[i++];
    const lower = cmd.toLowerCase();
    if (lower === "z") {
      if (cur.x !== start.x || cur.y !== start.y) lineTo(start);
      continue;
    }
    const arity = ARITY[lower];
    if (arity === undefined) break;
    const args: number[] = [];
    for (let k = 0; k < arity && isNum(); k++) args.push(num());
    if (args.length < arity) break;
    const rel = cmd !== cmd.toUpperCase();
    const base = rel ? cur : { x: 0, y: 0 };
    let end: Point;
    if (lower === "h") end = { x: base.x + args[0], y: cur.y };
    else if (lower === "v") end = { x: cur.x, y: base.y + args[0] };
    else end = { x: base.x + args[arity - 2], y: base.y + args[arity - 1] };
    if (lower === "m") {
      cur = start = end;
      // Further pairs after a moveto are linetos.
      cmd = rel ? "l" : "L";
    } else lineTo(end);
  }
  return out;
}

/* ------------------------------ positions -------------------------------- */

/**
 * Per axis, whether the layout places `mark` at a point there, so its box
 * center there is its position. It does when a chain along the axis (a
 * `spread` slot, a `stack` place) lays it out between it and its chart, and
 * when the mark is a point there (its own space has no data extent, as a
 * circle's) that its parent's data places (a `scatter`'s `x`/`y`). A mark
 * with only a size there (a bar's length from a baseline) or drawn across
 * its data (a line) has no position there.
 */
export function positionAxes(mark: GoFishNode): [boolean, boolean] {
  return [0, 1].map((axis) => {
    for (let n = mark; n.parent instanceof GoFishNode && !n._chartBox; ) {
      const parent: GoFishNode = n.parent;
      if (parent.axisDir === axis) return true;
      n = parent;
    }
    if (!isPoint(mark.resolveUnderlyingSpace()[axis])) return false;
    for (
      let n: unknown = mark.parent;
      n instanceof GoFishNode && !n._chartBox;
      n = n.parent
    ) {
      const space = n.resolveUnderlyingSpace()[axis];
      if (isORDINAL(space) || originIs(space, "pinned")) return true;
    }
    return false;
  }) as [boolean, boolean];
}

/** A space with no data extent: undefined (pixels only), or a pinned
 *  space of one value. */
const isPoint = (space: UnderlyingSpace): boolean => {
  if (isUNDEFINED(space)) return true;
  const iv = continuousInterval(space);
  return iv !== undefined && iv.min === iv.max;
};
