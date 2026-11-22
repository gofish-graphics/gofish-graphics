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
 */
import type { DisplayList } from "gofish-ir";
import type {
  InputPrimitive,
  InteractionEventType,
  InteractionFrame,
  SpecInvalidator,
  SvgPoint,
} from "./types";
import type { Registrar } from "./resolveContext";
import { walkItems, type Affine } from "./runtime";
import {
  defaultFocus,
  type Box,
  type Candidate,
  type FocusBehavior,
  type Outline,
  type Point,
} from "./focus";
import { GoFishNode } from "../ast/_node";
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
  private candidates: Candidate[] = [];
  /** The pointer of the last event; a tap holds it (see `onEvent`). */
  private pointerAt: Point | undefined;
  private touch = false;

  constructor(private readonly behavior: FocusBehavior = defaultFocus) {}

  /**
   * Called by each resolve that draws the tooltip, with that resolve's
   * marks: the input registers with `registrar` (so the chart publishes
   * frames to it and wires its events), and the chart becomes a reader of
   * its key (so a change of focus re-runs it).
   */
  use(registrar: Registrar, marks: FocusMark[]): void {
    this.marks = marks;
    registrar.registerInput(this);
    this.readers.add(registrar);
  }

  onFrame(frame: InteractionFrame): void {
    this.candidates = candidatesOf(frame.items, this.marks);
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
      if (!this.touch) this.pointerAt = undefined;
    } else if (type !== "pointerup") this.pointerAt = pt;
    this.choose();
  }

  /** Run the behavior on the current pointer and candidates, and invalidate
   *  the readers when the focused key changes. */
  private choose(): void {
    const current = this.candidates.find((c) => c.key === this.key);
    const key = this.behavior({
      pointer: this.pointerAt,
      candidates: this.candidates,
      current,
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
    for (const n of subtree(m.node)) if (!owner.has(n.uid)) owner.set(n.uid, m);
  const parts = new Map<FocusMark, Outline>();
  walkItems(items, (item, at) => {
    const m = item.id !== undefined ? owner.get(item.id) : undefined;
    if (m === undefined) return;
    const outline = parts.get(m) ?? [];
    parts.set(m, outline);
    outline.push(...outlineOf(item, at));
  });
  const byKey = new Map<string, Candidate & { marks: FocusMark[] }>();
  for (const m of marks) {
    const outline = parts.get(m);
    if (outline === undefined || outline.length === 0) continue;
    const c = byKey.get(m.key);
    if (c === undefined)
      byKey.set(m.key, {
        key: m.key,
        datum: [...m.rows],
        box: hullBox(outline),
        position: {},
        outline: [...outline],
        marks: [m],
      });
    else {
      c.datum.push(...m.rows);
      c.outline.push(...outline);
      c.box = hullBox(c.outline);
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

function* subtree(n: GoFishNode): Generator<GoFishNode> {
  yield n;
  for (const c of n.children) if (c instanceof GoFishNode) yield* subtree(c);
}

const hullBox = (outline: Outline): Box => ({
  x0: Math.min(...outline.map((p) => p.box.x0)),
  y0: Math.min(...outline.map((p) => p.box.y0)),
  x1: Math.max(...outline.map((p) => p.box.x1)),
  y1: Math.max(...outline.map((p) => p.box.y1)),
});

const boxAt = (at: Affine, x: number, y: number, w: number, h: number): Box => {
  const [ax, bx] = [at.tx + at.sx * x, at.tx + at.sx * (x + w)];
  const [ay, by] = [at.ty + at.sy * y, at.ty + at.sy * (y + h)];
  return {
    x0: Math.min(ax, bx),
    x1: Math.max(ax, bx),
    y0: Math.min(ay, by),
    y1: Math.max(ay, by),
  };
};

/** The outline parts one drawn item adds, in svg px. A text item carries
 *  no box, so it adds none. */
function outlineOf(item: DisplayList.DisplayItem, at: Affine): Outline {
  switch (item.kind) {
    case "rect":
    case "image":
      return [{ box: boxAt(at, item.x, item.y, item.w, item.h), round: false }];
    case "ellipse":
      return [
        {
          box: boxAt(
            at,
            item.cx - item.rx,
            item.cy - item.ry,
            2 * item.rx,
            2 * item.ry
          ),
          round: Math.abs(item.rx - item.ry) < 1e-9,
        },
      ];
    case "composite":
      return [
        {
          box: boxAt(at, item.bbox.x, item.bbox.y, item.bbox.w, item.bbox.h),
          round: false,
        },
      ];
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
