// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import { Extent } from "../extent";
import type { UnderlyingSpace } from "../underlyingSpace";
import * as Pwl from "../solver/pwl";
import { solvePlacementCells } from "./placementSolver";
import { values } from "../solver/arith";
import type { SolvePlaceable } from "./placementProgramLowerer";
import type { PlacementConstraint } from "./placementLowering";
import { axisIndex, axisName, isPointAlign, type Axis } from "./shared";
import { isPositionInterval } from "./position";
import type { ConstraintSpec } from ".";

/**
 * Where a layer's constraints place its children, in the claim walk (#493:
 * fixed-size nodes report their size). A layer's own union composes the
 * children that share its frame. The children it places elsewhere (a
 * literal pin, a datum pin, a seat beside a sibling: an axis's ticks and
 * labels around the plot, a scatter's marks at their data) sit where its
 * constraints put them, and its claim is the hull of what they draw there.
 * So whatever composes the layer leaves room for them, and the layout that
 * follows lands them inside that room.
 *
 * The claim walk places them with the same solve the layout runs (the
 * placement solver), on boxes that are the children's claims instead of
 * their laid-out boxes: data maps through σ from data 0, and every claim is
 * measured from data 0. It is the one solve, run once in values in σ
 * (`values` in arith.ts) instead of numbers: each box's edges come out as
 * piecewise-linear functions of σ, exact at every σ, and the hull is the
 * envelope of the edges.
 *
 * A `ref` stand-in, or an operand nested in a child, stands where its node
 * lands in this layer's frame, which the claim walk knows through the
 * layers between them (a placement claim, `placementIn`): a value label
 * beside its bar takes room where it draws, while the bar stays where its
 * own layout puts it. A band of a category axis is a share, which is a
 * claim too (`GoFishNode.sharesRoom`), so a label beside a band is placed
 * the same way. Where the claim walk does not know (the node sits in a
 * coordinate space, or its band is in a scope that mixes data and bands),
 * or for a node that reads its place from refs (`GoFishNode.inkOn`),
 * whatever a constraint ties to it is ink on that axis: it takes no room,
 * neither in the claim nor in the box. A category label centered on its band
 * draws over its neighbors instead of pushing the bands apart (#1115): the
 * claim is the hull of the labels, so only the overhang at the ends of the
 * axis takes room, and a label in a ring that a spread along its axis
 * holds is ink there (`layer`'s `claimChildren`). Ink overflows the canvas
 * (`layout` in gofish.tsx).
 */

/** A box's two edges along one axis, `[lo, hi]`, each a function of σ: where
 *  the claim walk knows a node lands in some layer's frame. */
export type BoxForm = {
  lo: Pwl.Value;
  hi: Pwl.Value;
};

/** Where the claim walk knows a node lands: its box, and its own claim (so
 *  its origin, which a `baseline` anchor reads, is known too). */
export type Placement = BoxForm & { extent: Extent };

/** What the claim walk knows of one child of the layer. */
export type ClaimChild = {
  /** The name constraints read it by. */
  name: string | undefined;
  /** Its claim on the axis; undefined when it takes whatever room it is
   *  given (it fills), so its size is not known. */
  extent: Extent | undefined;
  space: UnderlyingSpace | undefined;
  /** It is a stand-in for a node elsewhere (a `ref`). */
  standIn: boolean;
  /** It draws a box read off refs it holds (`GoFishNode.placedFromRefs`,
   *  an `enclose` around placed members). */
  fromRefs: boolean;
  /** For a stand-in, where its target lands in the layer's frame, and for a
   *  node drawn from refs, where it lands, when the claim walk knows
   *  (`placementIn`). */
  placed?: Placement;
  /** It reads its place from refs and the claim walk does not know where
   *  it lands (`GoFishNode.inkOn`, or a node drawn from refs with no
   *  `placed`): it is ink. */
  inkOn: boolean;
  /** Its own data places it in the layer's frame (a continuous type with a
   *  data position in the layer's own set), as layout's `dataPositioned`. */
  dataPositioned: boolean;
  /** It places itself at a literal pixel of its own (a shape's literal
   *  start or center, a layer's literal start), so its claim is about the
   *  layer's origin already. Layout pins it where it put itself unless a
   *  `position` override owns the axis (`shouldPinSelfPlacement`), so the
   *  solve does too. */
  placesItself?: boolean;
  /** Its plot on the axis, about its origin, where it is not its whole
   *  claim (an outline, dressing or chrome around it): a chain lays it by
   *  its plot, as layout's `localPlotSpan` does, so what dresses a part
   *  never moves the parts (#1032). */
  plot?: Extent;
  /** It is chrome (a ring's shapes): no part of the plot, so a chain
   *  places it past the whole box of what it dresses. */
  chrome?: boolean;
};

export type ClaimPlacement = {
  /** The hull of the placed children, or undefined when none takes room. */
  hull?: Extent;
  /** The hull of the placed children that are not dressing (see
   *  {@link placeByClaims}), or undefined when every one is. */
  plot?: Extent;
  /** The children that draw on the axis but are ink there: they take no
   *  room. (A stand-in draws nothing, so it is not among them.) */
  ink: Set<number>;
  /** The children that are dressing there (see {@link placeByClaims}):
   *  they take room, but are no part of the plot. */
  dressing: Set<number>;
  /** Each child's box in the layer's frame, where the claim walk knows it
   *  (a child whose size or place depends on a share of the layer's room,
   *  or on a node only layout places, has none). Built when first read. */
  boxes: () => Map<number, BoxForm>;
};

/** Whether `c` acts on `axis` (for a position, at a point or over a span). */
export const actsOn = (c: ConstraintSpec, axis: 0 | 1): boolean => {
  const name = axisName(axis);
  switch (c.type) {
    case "position":
      return c[name] !== undefined || c.region?.spans[axis] !== undefined;
    case "align":
      // A "span" or "size" align sets a size layout measures, not a place.
      return isPointAlign(c[name]);
    case "distribute":
      return axisIndex(c.dir) === axis;
    case "nest":
      return c[name] !== undefined;
    default:
      return false;
  }
};

/** Whether `c` relates its operands to each other on `axis` (an align, a
 *  distribute, a nest), rather than pinning each on its own. */
const relates = (c: ConstraintSpec): boolean =>
  c.type === "align" || c.type === "distribute" || c.type === "nest";

/** Whether `c` pins its operands' origins at a literal pixel on some axis
 *  (a point `position`, `anchor: "baseline"`). */
export const isLiteralSeat = (c: ConstraintSpec): boolean =>
  c.type === "position" &&
  c.anchor === "baseline" &&
  (typeof c.x === "number" || typeof c.y === "number");

/** Per operand name, the literal pixel a `position` pins its origin at on
 *  each axis (`isLiteralSeat`), the first such pin on each axis. One pass
 *  over the constraints. */
export const literalSeats = (
  constraints: readonly ConstraintSpec[]
): Map<string, [number | undefined, number | undefined]> => {
  const seats = new Map<string, [number | undefined, number | undefined]>();
  for (const c of constraints) {
    if (c.type !== "position" || !isLiteralSeat(c)) continue;
    for (const r of c.children) {
      let s = seats.get(r.name);
      if (s === undefined) seats.set(r.name, (s = [undefined, undefined]));
      if (s[0] === undefined && typeof c.x === "number") s[0] = c.x;
      if (s[1] === undefined && typeof c.y === "number") s[1] = c.y;
    }
  }
  return seats;
};

/** One child's box on the axis: `[lo, hi]` about its origin, in σ. */
type Box = readonly [Pwl.Value, Pwl.Value];

/** The box `[−descent, ascent]` of a claim about its origin. */
const boxOfClaim = (extent: Extent | undefined): Box =>
  extent === undefined
    ? [Pwl.ZERO, Pwl.ZERO]
    : [Pwl.negate(extent.descent), extent.ascent];

/**
 * What the solve reads of a child whose box on `axis` is `[lo, hi]` about
 * its origin, placed at `at` (its origin's pixel) when given, else for the
 * solve to place. Only `axis` is solved; the other axis has no size, so no
 * fact on it resolves.
 */
const claimPlaceable = (
  axis: 0 | 1,
  [lo, hi]: Box,
  space: UnderlyingSpace | undefined,
  at: Pwl.Value | undefined,
  plot?: Box
): SolvePlaceable<Pwl.Value> => {
  const box = {
    min: at === undefined ? undefined : Pwl.add(at, lo),
    size: values.sub(hi, lo),
  };
  const none = { min: undefined, size: undefined };
  return {
    dims: axis === 0 ? [box, none] : [none, box],
    localAnchor: (a, anchor) => {
      if (axisIndex(typeof a === "number" ? axisName(a) : (a as Axis)) !== axis)
        return undefined;
      return anchor === "min"
        ? lo
        : anchor === "max"
          ? hi
          : anchor === "center"
            ? Pwl.scale(0.5, Pwl.add(lo, hi))
            : Pwl.ZERO;
    },
    localPlotSpan: (a) =>
      a === axis && plot !== undefined ? [plot[0], plot[1]] : undefined,
    spaceOn: (dir) => (dir === axis ? space : undefined),
  };
};

/** The constraints that act on `axis`, each as it acts on that axis alone
 *  (a position's or an align's other coordinate places nothing there). A
 *  region (a `partition` cell) places its child across its datum span on
 *  the axis, as an interval does. */
export const constraintsOn = (
  constraints: ConstraintSpec[],
  axis: 0 | 1
): ConstraintSpec[] => {
  const own = axisName(axis);
  const other = axisName((1 - axis) as 0 | 1);
  return constraints
    .filter((c) => actsOn(c, axis))
    .map((c) =>
      c.type === "position"
        ? {
            ...c,
            [own]: c[own] ?? c.region?.spans[axis],
            [other]: undefined,
            region: undefined,
          }
        : c.type === "align" && c[other] !== undefined
          ? { ...c, [other]: undefined }
          : c
    );
};

/** The children a constraint places on `axis` (a position, an align, a
 *  distribute or a nest acting on it), by their direct operands. */
export function constrainedOn(
  axis: 0 | 1,
  constraints: ConstraintSpec[],
  operands: Map<string, { child: number; direct: boolean }>
): Set<number> {
  const out = new Set<number>();
  for (const c of constraints) {
    if (!actsOn(c, axis)) continue;
    for (const r of c.children) {
      const op = operands.get(r.name);
      if (op?.direct) out.add(op.child);
    }
  }
  return out;
}

/**
 * Where a layer's constraints place its children on `axis`, from their
 * claims, and the hull of the `candidates` (see the module comment).
 * `nested` is where an operand nested in a child lands in the layer's frame,
 * when the claim walk knows (`placementIn`).
 */
export function placeByClaims(
  axis: 0 | 1,
  children: ClaimChild[],
  constraints: ConstraintSpec[],
  operands: Map<string, { child: number; direct: boolean }>,
  candidates: Set<number>,
  nested: (name: string) => Placement | undefined
): ClaimPlacement {
  const onAxis = constraintsOn(constraints, axis);
  // A child an interval pins (across a span, or a region's cell) has a
  // size from it, whatever its own claim.
  const spanned = new Set<number>();
  for (const c of onAxis)
    if (c.type === "position" && isPositionInterval(c[axisName(axis)]!))
      for (const r of c.children) {
        const op = operands.get(r.name);
        if (op?.direct) spanned.add(op.child);
      }

  // An operand only layout places, unless the claim walk knows where it
  // lands: a node nested in a child, a stand-in for a node elsewhere, a
  // node that reads its place from refs.
  const nestedPlaced = new Map<string, Placement>();
  for (const [name, op] of operands)
    if (!op.direct) {
      const p = nested(name);
      if (p !== undefined) nestedPlaced.set(name, p);
    }
  const presetOf = (i: number): Placement | undefined =>
    children[i].standIn || children[i].fromRefs
      ? children[i].placed
      : undefined;
  const inkName = (name: string): boolean => {
    const op = operands.get(name);
    if (op === undefined) return true;
    if (!op.direct) return !nestedPlaced.has(name);
    const c = children[op.child];
    return c.inkOn || (c.standIn && c.placed === undefined);
  };
  // A child that fills the room it is given has no size the claim walk
  // knows, so neither does the place of whatever is seated beside it.
  const sizeless = (name: string): boolean => {
    const op = operands.get(name);
    if (op === undefined || !op.direct) return false;
    const c = children[op.child];
    return (
      !c.standIn &&
      !c.inkOn &&
      presetOf(op.child) === undefined &&
      c.extent === undefined &&
      !spanned.has(op.child)
    );
  };
  // What is unknown spreads through the relations on this axis: whatever
  // is aligned or seated against an operand lands where it does. A child a
  // position pins on its own stays known.
  const pinned = new Set<number>();
  for (const c of onAxis)
    if (c.type === "position")
      for (const r of c.children) {
        const op = operands.get(r.name);
        if (op?.direct && !inkName(r.name) && !sizeless(r.name))
          pinned.add(op.child);
      }
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const c of onAxis) {
    if (!relates(c)) continue;
    const names = c.children.map((r) => r.name);
    for (const n of names) if (!parent.has(n)) parent.set(n, n);
    for (let k = 1; k < names.length; k++) {
      const a = find(names[0]);
      const b = find(names[k]);
      if (a !== b) parent.set(b, a);
    }
  }
  const inkRoots = new Set([...parent.keys()].filter(inkName).map(find));
  const sizelessRoots = new Set([...parent.keys()].filter(sizeless).map(find));
  const ink = new Set<number>();
  const unplaced = new Set<number>();
  for (const n of parent.keys()) {
    const op = operands.get(n);
    if (op === undefined || !op.direct || pinned.has(op.child)) continue;
    if (inkRoots.has(find(n))) ink.add(op.child);
    if (sizelessRoots.has(find(n))) unplaced.add(op.child);
  }
  children.forEach((c, i) => {
    if (c.inkOn) ink.add(i);
    if (c.standIn) ink.delete(i);
    if (
      c.extent === undefined &&
      !c.standIn &&
      presetOf(i) === undefined &&
      !spanned.has(i)
    )
      unplaced.add(i);
  });
  // Dressing: what is placed beside a node the claim walk places elsewhere
  // (a value label beside its bar's ref). It takes room, but it is not part
  // of the plot: a node with a size of its own maps its plot into that
  // size, and its dressing, like its chrome, adds around it (#1032). The
  // stand-in itself is the node it stands for, a part of the plot.
  const placedName = (name: string): boolean => {
    const op = operands.get(name);
    if (op === undefined) return false;
    if (!op.direct) return nestedPlaced.has(name);
    return presetOf(op.child) !== undefined;
  };
  const dressingRoots = new Set(
    [...parent.keys()].filter(placedName).map(find)
  );
  const dressing = new Set<number>();
  for (const n of parent.keys()) {
    const op = operands.get(n);
    if (op === undefined || !op.direct || children[op.child].standIn) continue;
    if (dressingRoots.has(find(n))) dressing.add(op.child);
  }
  // A node drawn around refs (an `enclose`) is placed beside the nodes it
  // reads, as a label is: dressing too.
  children.forEach((c, i) => {
    if (presetOf(i) !== undefined && !c.standIn) dressing.add(i);
  });
  // What the solve leaves out: the ink, and the stand-ins it cannot place.
  const out = (i: number) =>
    ink.has(i) || (children[i].standIn && children[i].placed === undefined);

  const hullOf = [...candidates].filter((i) => !out(i) && !unplaced.has(i));
  const solved = children.map((c, i) => i).filter((i) => !out(i));

  // The children a constraint acts on along this axis; the others sit at
  // their own origin, which is the layer's (a free child's baseline is
  // seated at data 0, and a shared child's claim is measured from it).
  const constrained = constrainedOn(axis, constraints, operands);

  // One solve, with σ unknown: each child's box, `[lo, hi]`, where the
  // solve places it, as a function of σ. A box sits about its origin, or
  // across the span an interval pins. A datum maps through σ from the
  // layer's data 0.
  const seats = literalSeats(constraints);
  // A `position` override owns its operands' place on the axis, so a child
  // it names is not pinned where it placed itself.
  const overridden = new Set<number>();
  for (const c of onAxis)
    if (c.type === "position" && c.override)
      for (const r of c.children) {
        const op = operands.get(r.name);
        if (op?.direct) overridden.add(op.child);
      }
  // The parts a chain places past their whole box, not by their plots:
  // what is no part of the plot (ink, dressing, chrome).
  const apart = new Set<string>();
  const boxOf = (i: number): Box =>
    boxOfClaim(presetOf(i)?.extent ?? children[i].extent);
  const at = new Map<number, Box>();
  const targets = new Map<string, SolvePlaceable<Pwl.Value>>();
  const indexOf = new Map<string, number>();
  for (const i of solved) {
    const c = children[i];
    const box = boxOf(i);
    const p = presetOf(i);
    // A child with no name no constraint reads: it sits at its origin.
    const key = c.name ?? `\u0000child:${i}`;
    const seat = seats.get(key)?.[axis];
    const preset =
      p !== undefined
        ? values.sub(p.lo, box[0])
        : !constrained.has(i) ||
            c.dataPositioned ||
            (c.placesItself === true && !overridden.has(i))
          ? Pwl.ZERO
          : seat !== undefined
            ? Pwl.constant(seat)
            : undefined;
    targets.set(
      key,
      claimPlaceable(
        axis,
        box,
        c.space,
        preset,
        c.plot === undefined ? undefined : boxOfClaim(c.plot)
      )
    );
    indexOf.set(key, i);
    if (ink.has(i) || dressing.has(i) || c.chrome === true) apart.add(key);
    if (preset !== undefined)
      at.set(i, [Pwl.add(preset, box[0]), Pwl.add(preset, box[1])]);
  }
  for (const [name, p] of nestedPlaced) {
    const box = boxOfClaim(p.extent);
    targets.set(
      name,
      claimPlaceable(axis, box, undefined, values.sub(p.lo, box[0]))
    );
  }
  const map = { sigma: Pwl.affine(1, 0), originPx: Pwl.ZERO };
  // A relation with an operand the solve leaves out (ink) places nothing
  // here.
  const solvable = onAxis.filter((c) =>
    c.children.every((r) => targets.has(r.name))
  );
  const cells = solvePlacementCells(
    values,
    solvable as PlacementConstraint[],
    targets,
    [NaN, NaN],
    axis === 0 ? [map, undefined] : [undefined, map],
    undefined,
    [new Set(), new Set()],
    undefined,
    axis === 0 ? [Pwl.ZERO, undefined] : [undefined, Pwl.ZERO],
    axis === 0 ? [apart, new Set()] : [new Set(), apart]
  )[axis].cells;
  for (const [name, cell] of cells) {
    const i = indexOf.get(name);
    if (i === undefined) continue;
    const [lo, hi] = boxOf(i);
    const size = cell.sizeStrong
      ? (cell.size ?? values.sub(hi, lo))
      : values.sub(hi, lo);
    at.set(i, [cell.min, Pwl.add(cell.min, size)]);
  }
  // A child the solve leaves unplaced sits at the layer's origin.
  for (const i of solved) if (!at.has(i)) at.set(i, boxOf(i));

  // Each edge (0 = lo, 1 = hi) of child `i`, times `sign` (−1 reads a low
  // edge as a reach below 0, a descent).
  const edge = (i: number, end: 0 | 1, sign: 1 | -1): Pwl.Value => {
    const v = at.get(i)![end];
    return sign === 1 ? v : Pwl.negate(v);
  };

  // Each edge's form, built once: the boxes and both hulls read the same
  // edges.
  const forms = new Map<number, Pwl.Value>();
  const form = (i: number, end: 0 | 1, sign: 1 | -1): Pwl.Value => {
    const key = 4 * i + 2 * end + (sign === 1 ? 1 : 0);
    let f = forms.get(key);
    if (f === undefined) forms.set(key, (f = edge(i, end, sign)));
    return f;
  };
  let boxes: Map<number, BoxForm> | undefined;
  const boxesOf = () => {
    if (boxes !== undefined) return boxes;
    boxes = new Map();
    for (const i of solved)
      if (!unplaced.has(i))
        boxes.set(i, { lo: form(i, 0, 1), hi: form(i, 1, 1) });
    return boxes;
  };
  if (hullOf.length === 0) return { ink, dressing, boxes: boxesOf };
  const hullOver = (is: number[]): Extent =>
    Extent(
      Pwl.envelope(is.map((i) => form(i, 1, 1))),
      Pwl.envelope(is.map((i) => form(i, 0, -1)))
    );
  const hull = hullOver(hullOf);
  const plotOf = hullOf.filter((i) => !dressing.has(i));
  return {
    ink,
    dressing,
    boxes: boxesOf,
    hull,
    plot:
      plotOf.length === hullOf.length
        ? hull
        : plotOf.length === 0
          ? undefined
          : hullOver(plotOf),
  };
}
