// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import type { Extent } from "../extent";
import type { UnderlyingSpace } from "../underlyingSpace";
import * as Pwl from "../solver/pwl";
import {
  solvePlacementCells,
  type RigidAttachment,
  type SolvedCell,
} from "./placementSolver";
import { values, type Arith } from "../solver/arith";
import { Tape, type F } from "../solver/formula";
import type { SolvePlaceable } from "./placementProgramLowerer";
import type { PlacementConstraint } from "./placementLowering";
import { axisIndex, axisName, type Axis } from "./shared";
import { isPositionInterval } from "./position";
import { gridTracks, trackGap } from "./grid";
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
 * measured from data 0. It is the one solve, run once in formulas (`Tape`
 * in formula.ts) instead of numbers: each box's edges come out as formulas
 * in σ and in what only layout measures, whose claims are piecewise-linear
 * functions of σ, exact at every σ, and the layer's claim is the envelope
 * of the edges (`buildPlan` in plan.ts).
 *
 * A `ref` stand-in stands where its node lands in this layer's frame, which
 * the claim walk knows through the layers between them (a placement claim,
 * `planPlacement`). An operand nested in a child is held at its offset in
 * that child, which the plans from it up to the child give
 * (`planPlacementInChild`), so it moves with the child wherever the solve
 * places the child. A value label
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
   *  (`planPlacement`). */
  placed?: Placement;
  /** It reads its place from refs and the claim walk does not know where
   *  it lands (`GoFishNode.inkOn`, or a node drawn from refs with no
   *  `placed`): it is ink. */
  inkOn: boolean;
  /** Its own data places it in the layer's frame (a continuous type with a
   *  data position in the layer's own set), as layout's `dataPositioned`. */
  dataPositioned: boolean;
  /** It places itself as it is laid out, before the solve (a position of
   *  its own, a node placed from the refs it reads, or a child in a region
   *  its layer passes on: `placesItself`, `handedRegion` in `plan.ts`).
   *  The solve takes it where layout put it (`at:`) unless a `position`
   *  override owns the axis. */
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
  /** The cell of each child a region's cell places with a size of its
   *  own: the room it takes, which it sits in the middle of. */
  rooms: Map<number, BoxForm>;
  /** Where the solve places each target, as formulas layout evaluates. */
  seats: PlanSeats;
};

/**
 * Where a layer's plan places its targets on one axis (a child by its name,
 * or `\u0000child:<index>`; an operand nested in a child by its name): each
 * placed cell's box start and, where the solve sets it, its size, as nodes
 * of `tape`. Layout evaluates them at the solved σ with the inputs it
 * measured (`evaluate` in formula.ts) and writes them back.
 */
export type PlanSeats = {
  tape: Tape;
  cells: Map<string, SolvedCell<F>>;
  sizeOnly: Map<string, { size: F; owner: string }>;
};

/** Whether `c` acts on `axis` (for a position, at a point or over a span). */
export const actsOn = (c: ConstraintSpec, axis: 0 | 1): boolean => {
  const name = axisName(axis);
  switch (c.type) {
    case "position":
      return c[name] !== undefined || c.region?.spans[axis] !== undefined;
    case "align":
      return c[name] !== undefined;
    case "distribute":
      return axisIndex(c.dir) === axis;
    case "nest":
      return c[name] !== undefined;
    case "grid":
      return true;
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
 * its origin, with its box start at `min` when it is placed before the
 * solve, and its plot `[plot[0], plot[1]]` where that is not its box. Only
 * `axis` is solved; the other axis has no size, so no fact on it resolves.
 */
const formulaPlaceable = (
  T: Arith<F>,
  axis: 0 | 1,
  lo: F,
  hi: F,
  space: UnderlyingSpace | undefined,
  min: F | undefined,
  plot?: readonly [F, F]
): SolvePlaceable<F> => {
  const box = { min, size: T.sub(hi, lo) };
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
            ? T.scale(0.5, T.add(lo, hi))
            : T.zero;
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
 *  distribute or a nest acting on it), by their direct operands: of the
 *  constraints that pass `test`, if one is given. */
function constrainedOn(
  axis: 0 | 1,
  constraints: ConstraintSpec[],
  operands: Map<string, { child: number; direct: boolean }>,
  test: (c: ConstraintSpec) => boolean = () => true
): Set<number> {
  const out = new Set<number>();
  for (const c of constraints) {
    if (!actsOn(c, axis) || !test(c)) continue;
    for (const r of c.children) {
      const op = operands.get(r.name);
      if (op?.direct) out.add(op.child);
    }
  }
  return out;
}

/**
 * Where a layer's constraints place its children on `axis`, from their
 * claims (see the module comment). `nested` is where an operand nested in a child lands in that child's
 * frame, when the claim walk knows (`planPlacementInChild`).
 */
export function placeByClaims(
  axis: 0 | 1,
  children: ClaimChild[],
  constraints: ConstraintSpec[],
  operands: Map<string, { child: number; direct: boolean }>,
  nested: (name: string) => Placement | undefined,
  // Whether the layer's frame on the axis has a data 0 (`frameOf`): a
  // frame without one maps no datum and seats no baseline.
  framed = true
): ClaimPlacement {
  const onAxis = constraintsOn(constraints, axis);
  const own = axisName(axis);
  // The children a region's cell places on the axis: each lays itself out
  // in the cell, as layout hands it the cell (`GoFishNode.layout`). One
  // with no size of its own fills it, and any other keeps its size in the
  // middle of it.
  const celled = constrainedOn(
    axis,
    constraints,
    operands,
    (c) =>
      c.type === "position" &&
      c[own] === undefined &&
      c.region?.spans[axis] !== undefined
  );
  // A child an interval pins (across a span, or a region's cell it fills)
  // has a size from it, whatever its own claim.
  const spanned = new Set(
    [
      ...constrainedOn(
        axis,
        onAxis,
        operands,
        (c) => c.type === "position" && isPositionInterval(c[own]!)
      ),
    ].filter((i) => !(celled.has(i) && children[i].extent !== undefined))
  );

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
  // Ink spreads through the relations on this axis: whatever is aligned
  // or seated against an operand only layout places lands where it does. A
  // child a position pins on its own stays known.
  const pinned = new Set<number>();
  for (const c of onAxis)
    if (c.type === "position")
      for (const r of c.children) {
        const op = operands.get(r.name);
        if (op?.direct && !inkName(r.name)) pinned.add(op.child);
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
  const ink = new Set<number>();
  for (const n of parent.keys()) {
    const op = operands.get(n);
    if (op === undefined || !op.direct || pinned.has(op.child)) continue;
    if (inkRoots.has(find(n))) ink.add(op.child);
  }
  // A filler (a child with no claim, which takes whatever room it is
  // given) takes no room here: the solve places it as a point, so what a
  // relation ties to it stays placed. Where a datum position puts it, the
  // point is data, and the hull holds it; anywhere else it lands only
  // where layout gives it room, and the hull leaves it out.
  const atDatum = constrainedOn(
    axis,
    onAxis,
    operands,
    (c) => c.type === "position" && typeof c[own] !== "number"
  );
  const unplaced = new Set<number>();
  children.forEach((c, i) => {
    if (c.inkOn) ink.add(i);
    if (c.standIn) ink.delete(i);
    if (
      c.extent === undefined &&
      !c.standIn &&
      presetOf(i) === undefined &&
      !spanned.has(i) &&
      !atDatum.has(i)
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

  // The children a constraint acts on along this axis; the others sit at
  // their own origin, which is the layer's (a free child's baseline is
  // seated at data 0, and a shared child's claim is measured from it).
  const constrained = constrainedOn(axis, constraints, operands);

  // One solve, with σ unknown and over every child, the ink included (it
  // takes no room, but layout seats it where the plan places it): each
  // child's box, `[lo, hi]`, where the solve places it, as a formula in σ
  // and in what only layout measures (`Tape`). A box sits about its origin,
  // or across the span an interval pins. A datum maps through σ from the
  // layer's data 0, at the pixel its frame puts data 0 at.
  const tape = new Tape();
  const T = tape.arith;
  const seats = literalSeats(constraints);
  // A `position` override owns its operands' place on the axis, so a child
  // it names is not pinned where it placed itself.
  const overridden = constrainedOn(
    axis,
    onAxis,
    operands,
    (c) => c.type === "position" && !!c.override
  );
  // The parts a chain places past their whole box, not by their plots:
  // what is no part of the plot (ink, dressing, chrome).
  const apart = new Set<string>();
  // The children their own data places (layout's `dataPositioned`): an
  // align by an end or a baseline leaves them where their data puts them.
  const dataPositioned = new Set<string>();
  const boxOf = (i: number): Box =>
    boxOfClaim(presetOf(i)?.extent ?? children[i].extent);
  const keyOf = (i: number) => children[i].name || `\u0000child:${i}`;
  const at = new Map<number, Box>();
  const targets = new Map<string, SolvePlaceable<F>>();
  const indexOf = new Map<string, number>();
  // Where each child placed before the solve has its box start, for a
  // nested operand's container.
  const presetMin = new Map<number, F>();
  const childIndices = children.map((_, i) => i);
  for (const i of childIndices) {
    const c = children[i];
    const box = boxOf(i);
    const p = presetOf(i);
    const key = keyOf(i);
    const seat = seats.get(key)?.[axis];
    // Where its origin is before the solve: a stand-in, or a node drawn
    // from refs, where layout laid it (in the claim walk, where its target
    // lands); a child that places itself where it put itself; a child no
    // constraint places where its frame seats it (layout's seating rule);
    // a literal seat at its pixel, which layout reads as it lays the layer
    // out (a chart's content is seated past its chrome's start gutter,
    // `contentSeat`; the claim walk keeps the pin, its data 0, and the two
    // agree on every box, as layout hands the content its frame from the
    // seat). Else the solve places it.
    const origin =
      c.standIn || c.fromRefs
        ? tape.input(
            `at:${i}`,
            p !== undefined ? values.sub(p.lo, box[0]) : Pwl.ZERO
          )
        : c.placesItself === true && !overridden.has(i)
          ? tape.input(`at:${i}`, Pwl.ZERO)
          : !constrained.has(i)
            ? tape.input(`seat:${i}`, Pwl.ZERO)
            : seat !== undefined
              ? tape.input(`lit:${i}`, Pwl.constant(seat))
              : undefined;
    const lo = tape.input(`lo:${i}`, box[0]);
    const hi = tape.input(`hi:${i}`, box[1]);
    const plot =
      c.plot === undefined
        ? undefined
        : (() => {
            const [pl, ph] = boxOfClaim(c.plot);
            return [
              tape.input(`plo:${i}`, pl),
              tape.input(`phi:${i}`, ph),
            ] as const;
          })();
    const min = origin === undefined ? undefined : T.add(origin, lo);
    if (min !== undefined) presetMin.set(i, min);
    targets.set(key, formulaPlaceable(T, axis, lo, hi, c.space, min, plot));
    indexOf.set(key, i);
    if (c.dataPositioned) dataPositioned.add(key);
    if (ink.has(i) || dressing.has(i) || c.chrome === true) apart.add(key);
    if (origin !== undefined)
      at.set(i, [
        Pwl.add(tape.claim[origin], box[0]),
        Pwl.add(tape.claim[origin], box[1]),
      ]);
  }
  // An operand nested in a child is held at a fixed offset inside it
  // (`NestedOperand`), which layout measures (`gap:`): the solve moves the
  // child with it. In the claim walk the offset is where the plans of the
  // layers between put it in the child (`planPlacementInChild`), from the
  // child's box start.
  const rigid = new Map<string, RigidAttachment<F>>();
  for (const [name, op] of operands) {
    if (op.direct) continue;
    const p = nestedPlaced.get(name);
    const box = boxOfClaim(p?.extent);
    const containerMin = presetMin.get(op.child);
    const gapClaim =
      p !== undefined ? values.sub(p.lo, boxOf(op.child)[0]) : Pwl.ZERO;
    const gap = tape.input(`gap:@${name}`, gapClaim);
    const lo = tape.input(`lo:@${name}`, box[0]);
    const hi = tape.input(`hi:@${name}`, box[1]);
    targets.set(
      name,
      formulaPlaceable(
        T,
        axis,
        lo,
        hi,
        undefined,
        containerMin === undefined ? undefined : T.add(containerMin, gap)
      )
    );
    rigid.set(name, {
      container: keyOf(op.child),
      gap: axis === 0 ? [gap, T.zero] : [T.zero, gap],
    });
  }
  // A grid's tracks size to the largest of their cells as layout lays them
  // out, a track no cell claims room in being one share (`gridTracks`), and
  // center each cell in its track. Its claim is the tracks and the gaps
  // between them, a chain's along the axis.
  const grid = onAxis.find((c) => c.type === "grid");
  const tracks =
    grid === undefined
      ? undefined
      : gridTracks(
          T,
          grid,
          axis,
          childIndices.map((i) =>
            children[i].extent === undefined
              ? undefined
              : (targets.get(keyOf(i))!.dims[axis].size ?? T.zero)
          ),
          T.fromValue(trackGap(grid, axis)),
          T.fromValue(Pwl.SIGMA)
        );
  // The other axis's tracks, which this axis's solve does not read.
  const across =
    grid === undefined
      ? undefined
      : gridTracks(T, grid, axis === 0 ? 1 : 0, [], T.zero, T.zero);
  const origin = framed ? tape.input("origin", Pwl.ZERO) : undefined;
  const map =
    origin === undefined
      ? undefined
      : { sigma: T.fromValue(Pwl.SIGMA), originPx: origin };
  // The layer's box on the axis, which layout lays it out in: a discrete
  // position divides it.
  const box = tape.input("size", Pwl.ZERO);
  const solvedAxis = solvePlacementCells(
    T,
    onAxis as PlacementConstraint[],
    targets,
    axis === 0 ? [box, T.zero] : [T.zero, box],
    axis === 0 ? [map, undefined] : [undefined, map],
    tracks === undefined
      ? undefined
      : axis === 0
        ? [tracks, across!]
        : [across!, tracks],
    axis === 0 ? [dataPositioned, new Set()] : [new Set(), dataPositioned],
    rigid,
    axis === 0 ? [origin, undefined] : [undefined, origin],
    axis === 0 ? [apart, new Set()] : [new Set(), apart]
  )[axis];
  // Two constraints that place one child at two places on the axis are an
  // error, which layout finds where it evaluates the plan: the solve keeps
  // each over-determination as a check (`Tape.checks`).
  const cells = new Map(solvedAxis.cells);
  // The room a child in a region's cell takes: its cell, which a child with
  // a size of its own sits in the middle of, and may overhang.
  const rooms = new Map<number, BoxForm>();
  for (const [name, cell] of solvedAxis.cells) {
    const i = indexOf.get(name);
    if (i === undefined) continue;
    const own = T.sub(
      tape.input(`hi:${i}`, Pwl.ZERO),
      tape.input(`lo:${i}`, Pwl.ZERO)
    );
    // A child with a size of its own in a region's cell sits in its middle.
    const centered =
      celled.has(i) && !spanned.has(i) && cell.size !== undefined;
    const size = cell.sizeStrong && !centered ? (cell.size ?? own) : own;
    const min = centered
      ? T.add(cell.min, T.scale(0.5, T.sub(cell.size!, own)))
      : cell.min;
    if (centered) cells.set(name, { min, size: own, sizeStrong: false });
    const m = tape.claim[min];
    at.set(i, [m, Pwl.add(m, tape.claim[size])]);
    if (centered)
      rooms.set(i, {
        lo: tape.claim[cell.min],
        hi: Pwl.add(tape.claim[cell.min], tape.claim[cell.size!]),
      });
  }
  // A child the solve leaves unplaced sits at the layer's origin.
  for (const i of childIndices) if (!at.has(i)) at.set(i, boxOf(i));
  const seated: PlanSeats = { tape, cells, sizeOnly: solvedAxis.sizeOnly };

  // Each placed child's box: every child but the ink, the stand-ins the
  // solve cannot place, and the fillers it leaves unplaced.
  let boxes: Map<number, BoxForm> | undefined;
  const boxesOf = () => {
    if (boxes !== undefined) return boxes;
    boxes = new Map();
    for (const i of childIndices)
      if (!out(i) && !unplaced.has(i)) {
        const [lo, hi] = at.get(i)!;
        boxes.set(i, { lo, hi });
      }
    return boxes;
  };
  return { ink, dressing, boxes: boxesOf, rooms, seats: seated };
}
