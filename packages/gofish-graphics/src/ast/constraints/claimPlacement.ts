// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import type { Placeable } from "../_node";
import type { Extent } from "../extent";
import type { UnderlyingSpace } from "../underlyingSpace";
import * as Monotonic from "../../util/monotonic";
import { solvePlacementCells } from "./placementSolver";
import type { PlacementConstraint } from "./placementLowering";
import { axisIndex, axisName, type Axis } from "./shared";
import type { ConstraintSpec } from ".";

/**
 * Where a layer's constraints place its children, in the claim walk (#493:
 * fixed-size nodes report their size). A layer's own union composes the
 * children that share its frame. The children it places elsewhere (a
 * literal pin, a datum pin, a seat beside a sibling: an axis's ticks and
 * labels around the plot, a scatter's marks at their data) sit where its
 * constraints put them, and its claim is the hull of what they draw there.
 * So whatever composes the layer leaves room for them, and the layout that
 * follows lands them inside that room, with no second layout.
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
 * A child whose position comes from where layout puts a node inside another
 * child (a `ref` stand-in, an operand nested in a child, a node that reads
 * its place from refs: `GoFishNode.inkOn`), or that a constraint ties to
 * one, is ink on that axis: the claim walk cannot know where it lands, so it
 * takes no room, neither in the claim nor in the box. A category label
 * centered on its band, or a value label on its bar, is such a child: it
 * draws over its neighbors instead of pushing them apart (#1115), and the
 * render keeps it on the canvas (`layout` in gofish.tsx).
 */

/** What the claim walk knows of one child of the layer. */
export type ClaimChild = {
  /** The name constraints read it by. */
  name: string | undefined;
  /** Its claim on the axis; undefined when it takes whatever room it is
   *  given (it fills), which the solve reads as no room. */
  extent: Extent | undefined;
  space: UnderlyingSpace | undefined;
  /** It is a stand-in for a node elsewhere (a `ref`): it draws nothing,
   *  and where it lands only layout knows. */
  standIn: boolean;
  /** It reads its place from refs (`GoFishNode.inkOn`): it is ink. */
  inkOn: boolean;
  /** Its own data places it in the layer's frame (a continuous type with a
   *  data position in the layer's own set), as layout's `dataPositioned`. */
  dataPositioned: boolean;
};

export type ClaimPlacement = {
  /** The hull of the placed children, as a claim's two sides, or undefined
   *  when none takes room. */
  ascent?: Monotonic.Monotonic;
  descent?: Monotonic.Monotonic;
  /** The children that draw on the axis but are ink there: they take no
   *  room. (A stand-in draws nothing, so it is not among them.) */
  ink: Set<number>;
};

/** Whether `c` acts on `axis` (for a position, at a point or over a span). */
const actsOn = (c: ConstraintSpec, axis: 0 | 1): boolean => {
  const name = axisName(axis);
  switch (c.type) {
    case "position":
      return c[name] !== undefined;
    case "align":
      return c[name] !== undefined;
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

/** The literal pixel a position pins `name`'s origin at on `axis`. */
const literalSeat = (
  constraints: ConstraintSpec[],
  name: string,
  axis: 0 | 1
): number | undefined => {
  for (const c of constraints) {
    if (c.type !== "position" || c.anchor !== "baseline") continue;
    if (!c.children.some((r) => r.name === name)) continue;
    const v = c[axisName(axis)];
    if (typeof v === "number") return v;
  }
  return undefined;
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

export function placeByClaims(
  axis: 0 | 1,
  children: ClaimChild[],
  constraints: ConstraintSpec[],
  operands: Map<string, { child: number; direct: boolean }>,
  candidates: Set<number>
): ClaimPlacement {
  const ink = new Set<number>();
  const onAxis = constraints.filter((c) => actsOn(c, axis));

  // The operands whose place only layout knows: a node nested in a child, a
  // stand-in, a node that reads its place from refs.
  const childOf = (name: string): number | undefined =>
    operands.get(name)?.child;
  const unknownName = (name: string): boolean => {
    const op = operands.get(name);
    if (op === undefined || !op.direct) return true;
    const c = children[op.child];
    return c.standIn || c.inkOn;
  };
  // Ink spreads through the relations on this axis: whatever is aligned or
  // seated against an unknown operand lands where it does. A child a
  // position pins on its own stays known.
  const pinned = new Set<number>();
  for (const c of onAxis)
    if (c.type === "position")
      for (const r of c.children) {
        const i = childOf(r.name);
        if (i !== undefined && !unknownName(r.name)) pinned.add(i);
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
  const unknownRoots = new Set(
    [...parent.keys()].filter(unknownName).map(find)
  );
  for (const n of parent.keys()) {
    const op = operands.get(n);
    if (op === undefined || !op.direct || pinned.has(op.child)) continue;
    if (unknownRoots.has(find(n))) ink.add(op.child);
  }
  children.forEach((c, i) => {
    if (c.inkOn) ink.add(i);
    if (c.standIn) ink.delete(i);
  });
  // What the solve leaves out: the ink, and the stand-ins.
  const out = (i: number) => ink.has(i) || children[i].standIn;

  // A child a region places (a `partition` cell) fills its cell, whose
  // datum span the layer's own domain already holds.
  const inRegion = new Set<number>();
  for (const c of constraints)
    if (c.type === "position" && c.region !== undefined && !actsOn(c, axis))
      for (const r of c.children) {
        const i = childOf(r.name);
        if (i !== undefined) inRegion.add(i);
      }
  const placed = [...candidates].filter((i) => !out(i) && !inRegion.has(i));
  if (placed.length === 0) return { ink };

  // The children a constraint acts on along this axis; the others sit at
  // their own origin, which is the layer's (a free child's baseline is
  // seated at data 0, and a shared child's claim is measured from it).
  const constrained = new Set<number>();
  for (const c of onAxis)
    for (const r of c.children) {
      const i = childOf(r.name);
      if (i !== undefined && operands.get(r.name)!.direct) constrained.add(i);
    }

  // The claims that are not lines in σ: the solve reads each of their two
  // sides as a value of its own.
  const curved = children
    .map((c, i) => i)
    .filter((i) => {
      const e = children[i].extent;
      return !out(i) && e !== undefined && !isLinearExtent(e);
    });
  type Box = readonly [number, number];

  // Each child's box, `[lo, hi]`, where the solve places it at σ, with the
  // curved claims' sides `sides` (`[ascent, descent]`, 0 when not given): a
  // box sits about its origin, or across the span an interval pins.
  const solve = (sigma: number, sides: Map<number, Box>): Map<number, Box> => {
    const boxOf = (i: number): [number, number] => {
      const side = sides.get(i);
      if (side !== undefined) return [-side[1], side[0]];
      return curved.includes(i) ? [0, 0] : boxAt(children[i].extent, sigma);
    };
    const at = new Map<number, Box>();
    const targets = new Map<string, Placeable>();
    const indexOf = new Map<string, number>();
    children.forEach((c, i) => {
      if (out(i) || c.name === undefined) return;
      const seat = literalSeat(constraints, c.name, axis);
      const preset =
        !constrained.has(i) || c.dataPositioned
          ? 0
          : seat !== undefined
            ? seat
            : undefined;
      const box = boxOf(i);
      targets.set(c.name, claimPlaceable(axis, box, c.space, preset));
      indexOf.set(c.name, i);
      if (preset !== undefined) at.set(i, [preset + box[0], preset + box[1]]);
    });
    const map = { sigma, originPx: 0 };
    const solved = solvePlacementCells(
      onAxis as PlacementConstraint[],
      targets,
      [NaN, NaN],
      axis === 0 ? [map, undefined] : [undefined, map],
      undefined,
      [new Set(), new Set()],
      undefined,
      axis === 0 ? [0, undefined] : [undefined, 0]
    )[axis];
    for (const [name, cell] of solved.cells) {
      const i = indexOf.get(name);
      if (i === undefined) continue;
      const [lo, hi] = boxOf(i);
      const size = cell.sizeStrong ? (cell.size ?? hi - lo) : hi - lo;
      at.set(i, [cell.min, cell.min + size]);
    }
    // A child the solve leaves unplaced sits at the layer's origin.
    for (const i of placed) if (!at.has(i)) at.set(i, boxOf(i));
    return at;
  };

  // The affine form of each placed box's edges: at σ = 0 with every side
  // 0, then one more solve per variable (σ, and each side of each curved
  // claim), each the change it makes.
  const none = new Map<number, Box>();
  const base = solve(0, none);
  const variables: {
    m: Monotonic.Monotonic;
    boxes: Map<number, Box>;
  }[] = [
    { m: Monotonic.linear(1, 0), boxes: solve(1, none) },
    ...curved.flatMap((k) => {
      const e = children[k].extent!;
      return [
        { m: e.ascent, boxes: solve(0, new Map([[k, [1, 0] as const]])) },
        { m: e.descent, boxes: solve(0, new Map([[k, [0, 1] as const]])) },
      ];
    }),
  ];
  // One edge (0 = lo, 1 = hi) of child `i`, signed (`sign` −1 reads a low
  // edge as a reach below 0, a descent), as a function of σ.
  const edge = (i: number, end: 0 | 1, sign: 1 | -1): Monotonic.Monotonic => {
    const at0 = base.get(i)![end];
    const terms = variables.map((v) => ({
      m: v.m,
      c: sign * (v.boxes.get(i)![end] - at0),
    }));
    const c0 = sign * at0;
    const tiny = (c: number) => Math.abs(c) < 1e-9;
    if (terms.every((t) => tiny(t.c) || t.c > 0 || Monotonic.isLinear(t.m)))
      return Monotonic.add(
        Monotonic.linear(0, c0),
        ...terms.filter((t) => !tiny(t.c)).map((t) => Monotonic.smul(t.c, t.m))
      );
    // A curved side it subtracts has no envelope: read it at each σ.
    return Monotonic.unknown(
      (sigma) => c0 + terms.reduce((acc, t) => acc + t.c * t.m.run(sigma), 0)
    );
  };
  return {
    ink,
    ascent: Monotonic.envelope(placed.map((i) => edge(i, 1, 1))),
    descent: Monotonic.envelope(placed.map((i) => edge(i, 0, -1))),
  };
}

const isLinearExtent = (e: Extent): boolean =>
  Monotonic.isLinear(e.ascent) && Monotonic.isLinear(e.descent);
