// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import type { Placeable } from "../_node";
import { Extent } from "../extent";
import type { UnderlyingSpace } from "../underlyingSpace";
import * as Monotonic from "../../util/monotonic";
import { solvePlacementCells } from "./placementSolver";
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
 * measured from data 0. The solve is linear in σ and in the sides of the
 * boxes, so a few solves give each box's edges as an affine form in σ and
 * in the sides of the claims that are not lines in σ (a nested spread's
 * envelope). An edge whose form only adds those sides is exact
 * (`Monotonic.add` keeps envelopes), and the hull is the envelope of the
 * edges. An edge that subtracts one (a box centered on a ring inside it) is
 * evaluated at each σ it is read at.
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
  lo: Monotonic.Monotonic;
  hi: Monotonic.Monotonic;
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

/** One child's box on the axis at σ: `[lo, hi]` about its origin. */
const boxAt = (extent: Extent | undefined, sigma: number): [number, number] =>
  extent === undefined
    ? [0, 0]
    : [-extent.descent.run(sigma), extent.ascent.run(sigma)];

/**
 * A placeable whose box on `axis` is `[lo, hi]` about its origin, placed at
 * `at` (its origin's pixel) when given, else for the solve to place. Only
 * `axis` is solved; the other axis has no size, so no fact on it resolves.
 */
const claimPlaceable = (
  axis: 0 | 1,
  [lo, hi]: [number, number],
  space: UnderlyingSpace | undefined,
  at: number | undefined
): Placeable => {
  const size = hi - lo;
  const box = { min: at === undefined ? undefined : at + lo, size };
  const none = { min: undefined, size: undefined };
  return {
    dims: axis === 0 ? [box, none] : [none, box],
    geometry: () => {
      throw new Error("[gofish] a claim placeable has no geometry");
    },
    localAnchor: (a, anchor) => {
      if (axisIndex(typeof a === "number" ? axisName(a) : (a as Axis)) !== axis)
        return undefined;
      return anchor === "min"
        ? lo
        : anchor === "max"
          ? hi
          : anchor === "center"
            ? (lo + hi) / 2
            : 0;
    },
    place: () => {},
    spaceOn: (dir) => (dir === axis ? space : undefined),
  } as Placeable;
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

const isLinearExtent = (e: Extent): boolean =>
  Monotonic.isLinear(e.ascent) && Monotonic.isLinear(e.descent);

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

  // The claims that are not lines in σ: the solve reads each of their two
  // sides as a value of its own. Placed operands are read at σ.
  const curved = solved.filter((i) => {
    const e = children[i].extent;
    return presetOf(i) === undefined && e !== undefined && !isLinearExtent(e);
  });
  const presets = [
    ...solved.flatMap((i) => presetOf(i) ?? []),
    ...nestedPlaced.values(),
  ];
  // The affine forms below hold when every placed operand's box is a line
  // in σ; otherwise each σ is solved when read.
  const exact = presets.every(
    (p) =>
      Monotonic.isLinear(p.lo) &&
      Monotonic.isLinear(p.hi) &&
      isLinearExtent(p.extent)
  );
  type Box = readonly [number, number];

  // Each child's box, `[lo, hi]`, where the solve places it at σ, with the
  // curved claims' sides `sides` (`[ascent, descent]`): a box sits about its
  // origin, or across the span an interval pins.
  const seats = literalSeats(constraints);
  const isCurved = new Set(curved);
  const solve = (sigma: number, sides: Map<number, Box>): Map<number, Box> => {
    const boxOf = (i: number): [number, number] => {
      const side = sides.get(i);
      if (side !== undefined) return [-side[1], side[0]];
      const p = presetOf(i);
      if (p !== undefined) return boxAt(p.extent, sigma);
      return isCurved.has(i) ? [0, 0] : boxAt(children[i].extent, sigma);
    };
    const at = new Map<number, Box>();
    const targets = new Map<string, Placeable>();
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
          ? p.lo.run(sigma) - box[0]
          : !constrained.has(i) || c.dataPositioned
            ? 0
            : seat !== undefined
              ? seat
              : undefined;
      targets.set(key, claimPlaceable(axis, box, c.space, preset));
      indexOf.set(key, i);
      if (preset !== undefined) at.set(i, [preset + box[0], preset + box[1]]);
    }
    for (const [name, p] of nestedPlaced) {
      const box = boxAt(p.extent, sigma);
      targets.set(
        name,
        claimPlaceable(axis, box, undefined, p.lo.run(sigma) - box[0])
      );
    }
    const map = { sigma, originPx: 0 };
    // A relation with an operand the solve leaves out (ink) places nothing
    // here.
    const solvable = onAxis.filter((c) =>
      c.children.every((r) => targets.has(r.name))
    );
    const cells = solvePlacementCells(
      solvable as PlacementConstraint[],
      targets,
      [NaN, NaN],
      axis === 0 ? [map, undefined] : [undefined, map],
      undefined,
      [new Set(), new Set()],
      undefined,
      axis === 0 ? [0, undefined] : [undefined, 0]
    )[axis].cells;
    for (const [name, cell] of cells) {
      const i = indexOf.get(name);
      if (i === undefined) continue;
      const [lo, hi] = boxOf(i);
      const size = cell.sizeStrong ? (cell.size ?? hi - lo) : hi - lo;
      at.set(i, [cell.min, cell.min + size]);
    }
    // A child the solve leaves unplaced sits at the layer's origin.
    for (const i of solved) if (!at.has(i)) at.set(i, boxOf(i));
    return at;
  };

  // Each edge (0 = lo, 1 = hi) of child `i`, times `sign`, as a function of
  // σ (`sign` −1 reads a low edge as a reach below 0, a descent).
  let edge: (i: number, end: 0 | 1, sign: 1 | -1) => Monotonic.Monotonic;
  if (exact) {
    // At σ = 0 with every side 0, then one more solve per variable (σ, and
    // each side of each curved claim), each the change it makes.
    const none = new Map<number, Box>();
    const base = solve(0, none);
    const variables: { m: Monotonic.Monotonic; boxes: Map<number, Box> }[] = [
      { m: Monotonic.linear(1, 0), boxes: solve(1, none) },
      ...curved.flatMap((k) => {
        const e = children[k].extent!;
        return [
          { m: e.ascent, boxes: solve(0, new Map([[k, [1, 0] as const]])) },
          {
            m: e.descent,
            boxes: solve(0, new Map([[k, [0, 1] as const]])),
          },
        ];
      }),
    ];
    edge = (i, end, sign) => {
      const c0 = sign * base.get(i)![end];
      const terms = variables
        .map((v) => ({
          m: v.m,
          c: sign * (v.boxes.get(i)![end] - base.get(i)![end]),
        }))
        .filter((t) => Math.abs(t.c) >= 1e-9);
      // An envelope weighed by a negative number is no envelope (`smul`
      // keeps one only for a positive weight): read such a form at each σ.
      if (terms.some((t) => t.c < 0 && !Monotonic.isLinear(t.m)))
        return Monotonic.unknown(
          (sigma) => c0 + terms.reduce((a, t) => a + t.c * t.m.run(sigma), 0)
        );
      return Monotonic.add(
        Monotonic.linear(0, c0),
        ...terms.map((t) => Monotonic.smul(t.c, t.m))
      );
    };
  } else {
    // Solve at each σ read, with every claim's sides at that σ.
    let memo: { sigma: number; boxes: Map<number, Box> } | undefined;
    const at = (sigma: number) => {
      if (memo?.sigma !== sigma)
        memo = {
          sigma,
          boxes: solve(
            sigma,
            new Map(
              curved.map((k) => {
                const e = children[k].extent!;
                return [k, [e.ascent.run(sigma), e.descent.run(sigma)]];
              })
            )
          ),
        };
      return memo.boxes;
    };
    edge = (i, end, sign) =>
      Monotonic.unknown((sigma) => sign * at(sigma).get(i)![end]);
  }

  // Each edge's form, built once: the boxes and both hulls read the same
  // edges.
  const forms = new Map<number, Monotonic.Monotonic>();
  const form = (i: number, end: 0 | 1, sign: 1 | -1): Monotonic.Monotonic => {
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
      Monotonic.envelope(is.map((i) => form(i, 1, 1))),
      Monotonic.envelope(is.map((i) => form(i, 0, -1)))
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
