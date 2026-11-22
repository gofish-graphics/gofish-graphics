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
 * A mark drawn through rows (a line in shape form) is one candidate with a
 * point per row (`Candidate.points`, from where its display item draws
 * them, `drawnRowPoints`), and the focus is one of its points: the line
 * nearest the pointer, then its row nearest the pointer (`Chain.snap`). A
 * move to another point is a change of focus, like a move to another bar,
 * and the box describes that row.
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
import { itemBox, walkItems, type Affine } from "./runtime";
import {
  defaultFocus,
  type Box,
  type Candidate,
  type FocusBehavior,
  type Outline,
  type Point,
} from "./focus";
import {
  drawnRowPoints,
  type DrawnRowPoint,
} from "../ast/displayList/drawnRowPoints";
import { breadthFirst, GoFishNode, placedByOwnData } from "../ast/_node";
import { chainOn } from "../ast/layoutWarnings";
import { inCoordinateSpace } from "../ast/axisDirection";
import {
  continuousInterval,
  isUNDEFINED,
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

/** One tooltip's focus: the focused mark's key and row, and the marks of
 *  the last resolve. */
export class TooltipFocus implements InputPrimitive {
  private readonly readers = new Set<SpecInvalidator>();
  readonly specReaders = [this.readers];
  readonly events = POINTER_EVENTS;
  readonly needsFrame = true;
  /** The focused mark's key, or undefined with no focus. */
  key: string | undefined;
  /** On a mark drawn through rows, the focused row (`Candidate.points`),
   *  and its point's key; undefined on any other mark. */
  point: { key: unknown; row: unknown; color?: string } | undefined;
  private marks: FocusMark[] = [];
  /** The candidates of the last frame, and, by key, each candidate and
   *  each point of one, with the mark it belongs to. */
  private candidates: Candidate[] = [];
  private byKey = new Map<unknown, { choice: Candidate; mark: Candidate }>();
  /** The pointer of the last event (a tap holds it, see `onEvent`). */
  private pointer: Point | undefined;
  /** The box the last lowering drew, and where it was drawn. */
  private box: GoFishNode | undefined;
  private cover: Box | undefined;
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
  }

  /** The box the lowering drew for the focused mark. */
  drew(box: GoFishNode): void {
    this.box = box;
  }

  /** The focused candidate: the focused point, or the focused mark. */
  private focused(): Candidate | undefined {
    const key = this.point?.key ?? this.key;
    return key === undefined ? undefined : this.byKey.get(key)?.choice;
  }

  onFrame(frame: InteractionFrame): void {
    const { candidates, cover } = scan(frame.items, this.marks, this.box);
    this.cover = cover;
    this.candidates = candidates;
    this.byKey = new Map();
    for (const c of candidates) {
      this.byKey.set(c.key, { choice: c, mark: c });
      for (const p of c.points ?? [])
        this.byKey.set(p.key, { choice: p, mark: c });
    }
  }

  /** The chart is gone: drop its marks, its box and its candidates. */
  detach(): void {
    this.key = undefined;
    this.point = undefined;
    this.marks = [];
    this.box = undefined;
    this.cover = undefined;
    this.candidates = [];
    this.byKey = new Map();
    this.pointer = undefined;
    this.readers.clear();
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
      if (!this.touch) this.pointer = undefined;
    } else if (type !== "pointerup") this.pointer = pt && { x: pt.x, y: pt.y };
    this.choose();
  }

  /** Run the behavior on the current pointer and candidates, and invalidate
   *  the readers when the focused mark or point changes. */
  private choose(): void {
    // The box is no pointer target: the behavior runs as if it were not
    // there, so a mark or a row under the open box is reachable. Only
    // where the behavior picks nothing (the box reaches past the marks'
    // hull limit) does a pointer over the box keep the focus; else the box
    // would close under the pointer, and might reopen: a flicker.
    const p = this.pointer;
    const choice = this.behavior({
      pointer: p,
      candidates: this.candidates,
      current: this.focused(),
      clicked: false,
    }).choice;
    const c = this.cover;
    if (
      choice === undefined &&
      this.key !== undefined &&
      p !== undefined &&
      c !== undefined &&
      p.x >= c.x0 &&
      p.x <= c.x1 &&
      p.y >= c.y0 &&
      p.y <= c.y1
    )
      return;
    const found = choice && this.byKey.get(choice.key);
    const key = found?.mark.key as string | undefined;
    const point =
      found && found.choice !== found.mark
        ? {
            key: found.choice.key,
            row: found.choice.datum[0],
            color: (found.choice as PointCandidate).color,
          }
        : undefined;
    if (key === this.key && point?.key === this.point?.key) return;
    this.key = key;
    this.point = point;
    for (const r of this.readers) r.invalidate();
  }
}

/** Each registrar's focus for each tooltip call: the focus outlives the
 *  resolves of one chart, and two charts drawing one spec focus apart. */
const focuses = new WeakMap<Registrar, WeakMap<object, TooltipFocus>>();

/** Whether the chart `registrar` renders resolved a mark with a tooltip:
 *  a chart without one lowers no tooltip layer. */
export const hasTooltips = (registrar: Registrar | undefined): boolean =>
  registrar !== undefined && focuses.has(registrar);

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
  return scan(items, marks).candidates;
}

/** The candidates of `marks` among `items` ({@link candidatesOf}), and the
 *  box of everything `cover` (the open tooltip box) drew there, in svg px
 *  (undefined when it drew nothing with a box), from one walk of the
 *  items. */
function scan(
  items: DisplayList.DisplayItem[],
  marks: FocusMark[],
  cover?: GoFishNode
): { candidates: Candidate[]; cover: Box | undefined } {
  // The node uids each mark drew under, itself included, and the box's.
  const owner = new Map<string, FocusMark | typeof COVER>();
  for (const m of marks)
    for (const n of breadthFirst(m.node))
      if (!owner.has(n.uid)) owner.set(n.uid, m);
  if (cover)
    for (const n of breadthFirst(cover))
      if (!owner.has(n.uid)) owner.set(n.uid, COVER);
  const parts = new Map<FocusMark | typeof COVER, Drawn>();
  walkItems(items, (item, at) => {
    const m = item.id !== undefined ? owner.get(item.id) : undefined;
    if (m === undefined) return;
    let drawn = parts.get(m);
    if (drawn === undefined) parts.set(m, (drawn = emptyDrawn()));
    addParts(drawn, outlineOf(item, at));
    const color = item.style?.stroke;
    for (const { row, x, y } of drawnRowPoints(item) ?? [])
      drawn.points.push({
        row,
        x: at.tx + at.sx * x,
        y: at.ty + at.sy * y,
        color: typeof color === "string" ? color : undefined,
      });
  });
  const covered = parts.get(COVER);
  const byKey = new Map<
    string,
    Candidate & { marks: FocusMark[]; drawnPoints: DrawnPoint[] }
  >();
  for (const m of marks) {
    const drawn = parts.get(m);
    if (drawn === undefined || drawn.outline.length === 0) continue;
    const c = byKey.get(m.key);
    if (c === undefined)
      byKey.set(m.key, {
        key: m.key,
        datum: m.rows,
        box: drawn.box,
        position: {},
        outline: drawn.outline,
        marks: [m],
        drawnPoints: drawn.points,
      });
    else {
      // Marks that share a key are one candidate: the union of their parts,
      // grown part by part (rebuilding the box from the merged outline on
      // each merge is quadratic in the number of marks).
      // The first mark's rows are its own: copy them before adding to them.
      if (c.marks.length === 1) c.datum = [...c.datum];
      for (const r of m.rows) c.datum.push(r);
      const merged = { outline: c.outline, box: c.box, points: c.drawnPoints };
      addParts(merged, drawn.outline);
      c.box = merged.box;
      for (const p of drawn.points) c.drawnPoints.push(p);
      c.marks.push(m);
    }
  }
  const candidates = [...byKey.values()].map(
    ({ marks: ms, drawnPoints, ...c }): Candidate => {
      const [px, py] = positionAxes(ms[0].node);
      return {
        ...c,
        position: {
          x: px ? (c.box.x0 + c.box.x1) / 2 : undefined,
          y: py ? (c.box.y0 + c.box.y1) / 2 : undefined,
        },
        ...(drawnPoints.length > 0 && {
          points: pointsOf(c.key, c.datum, drawnPoints),
        }),
      };
    }
  );
  return {
    candidates,
    cover: covered && covered.outline.length > 0 ? covered.box : undefined,
  };
}

/** The owner of the open box's items in {@link scan}. */
const COVER = Symbol("cover");

/** A row point as drawn, in svg px, with the stroke of the item that drew
 *  it (the marker on a focused point takes it). */
type DrawnPoint = DrawnRowPoint & { color: string | undefined };

/** A point candidate, with the color its line is drawn in. */
type PointCandidate = Candidate & { color?: string };

/** A mark's drawn row points as candidates. A point's key is its row's
 *  place among the mark's rows, after the mark's key: the mark's key is its
 *  rows (`rowsKey`), so the place is stable across re-runs too. A point
 *  whose row is not among the mark's rows is left out. */
function pointsOf(
  key: unknown,
  rows: readonly unknown[],
  drawn: DrawnPoint[]
): PointCandidate[] {
  const index = new Map(rows.map((r, i) => [r, i]));
  const out: PointCandidate[] = [];
  for (const { row, x, y, color } of drawn) {
    const i = index.get(row);
    if (i === undefined) continue;
    const box = { x0: x, y0: y, x1: x, y1: y };
    out.push({
      key: `${String(key)}#${i}`,
      datum: [row],
      box,
      position: { x, y },
      outline: [{ box, round: true }],
      color,
    });
  }
  return out;
}

/** An outline being collected, the box of its parts so far, and the
 *  points of the rows it is drawn through. */
type Drawn = { outline: Outline; box: Box; points: DrawnPoint[] };

const emptyDrawn = (): Drawn => ({
  outline: [],
  box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
  points: [],
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
    case "path": {
      const filled = isFilled(item.style) && /z/i.test(item.d);
      const edge = pathSegments(item.d, filled).map(([a, b]) => [
        { x: at.tx + at.sx * a.x, y: at.ty + at.sy * a.y },
        { x: at.tx + at.sx * b.x, y: at.ty + at.sy * b.y },
      ]) as [Point, Point][];
      if (filled) {
        // A filled closed path is a region: the pointer inside it is on
        // the mark (a wedge, an area), not only near its edge.
        const drawn = emptyDrawn();
        for (const [p, q] of edge) {
          drawn.box.x0 = Math.min(drawn.box.x0, p.x, q.x);
          drawn.box.x1 = Math.max(drawn.box.x1, p.x, q.x);
          drawn.box.y0 = Math.min(drawn.box.y0, p.y, q.y);
          drawn.box.y1 = Math.max(drawn.box.y1, p.y, q.y);
        }
        return edge.length > 0
          ? [{ box: drawn.box, round: false, region: edge }]
          : [];
      }
      return edge.map(([p, q]) => {
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
    }
    default:
      return [];
  }
}

/** Whether a style paints a fill: SVG fills a path black unless told
 *  otherwise, so only `none`, `transparent` and a zero opacity do not. */
const isFilled = (style: DisplayList.Style | undefined): boolean =>
  style?.fill !== "none" &&
  style?.fill !== "transparent" &&
  style?.fillOpacity !== 0 &&
  style?.opacity !== 0;

/**
 * The segments of a path's `d`, from point to point of each command. A
 * curve is read as the chord from its start to its end: near enough to
 * measure a pointer's distance to a line mark, which is what it is for.
 * Commands are read in absolute and relative form. With `close`, every
 * subpath is closed, as a fill closes it.
 */
export function pathSegments(d: string, close = false): [Point, Point][] {
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
      if (close && (cur.x !== start.x || cur.y !== start.y)) lineTo(start);
      cur = start = end;
      // Further pairs after a moveto are linetos.
      cmd = rel ? "l" : "L";
    } else lineTo(end);
  }
  if (close && (cur.x !== start.x || cur.y !== start.y)) lineTo(start);
  return out;
}

/* ------------------------------ positions -------------------------------- */

/**
 * Per axis, whether the layout places `mark` at a point there, so its box
 * center there is its position. It does when a chain along the axis (a
 * `spread` slot, a `stack` place, `chainOn`) lays it out between it and its
 * chart, and when the mark is a point there (its own space has no data
 * extent, as a circle's) that data places in an ancestor's frame
 * (`placedByOwnData`: a `scatter`'s `x`/`y`). A mark with only a size there
 * (a bar's length from a baseline) or drawn across its data (a line) has no
 * position there. Inside a coordinate space (`Coord.polar()`), a mark's
 * drawn box is not its data box, so its drawn center is its position on
 * both screen axes: a wedge is as near as its center, as a dot is.
 */
export function positionAxes(mark: GoFishNode): [boolean, boolean] {
  if (inCoordinateSpace(mark)) return [true, true];
  return ([0, 1] as const).map((axis) => {
    let byData = false;
    for (let n = mark; n.parent instanceof GoFishNode && !n._chartBox; ) {
      const parent: GoFishNode = n.parent;
      if (chainOn(parent, axis) !== undefined) return true;
      if (placedByOwnData(parent, parent.indexOfChild(n) ?? -1, axis))
        byData = true;
      n = parent;
    }
    return byData && isPoint(mark.resolveUnderlyingSpace()[axis]);
  }) as [boolean, boolean];
}

/** A space with no data extent: undefined (pixels only), or a pinned
 *  space of one value. */
const isPoint = (space: UnderlyingSpace): boolean => {
  if (isUNDEFINED(space)) return true;
  const iv = continuousInterval(space);
  return iv !== undefined && iv.min === iv.max;
};
