// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

/**
 * The label chooser: the post-solve step that places the labels whose
 * `position` is a `Place` strategy. Like `overlap` (`constraints/overlap.ts`)
 * it is not a difference constraint, so the placement solver never sees it:
 * the label layer runs it after the solve, when the labeled marks are placed
 * and can be read through their `ref()` stand-ins.
 *
 * For each `.label()` call, its labels are taken in data order, and each
 * takes its strategy's first candidate whose box covers no obstacle: the
 * marks the labels of this layer describe (the label's own mark is read as
 * its outline only), the labels already placed (by this step, by the solve
 * for a position string, or by the chooser in a layer below; a hidden one
 * takes no room), and the nodes in the call's `avoiding`. A label with no
 * free candidate is hidden. `Place.start()` and `Place.end()` labels have
 * one spot each, past their paths' ends: the ones of a call that overlap
 * there slide apart vertically, and one that still covers an obstacle is
 * hidden.
 *
 * Everything is read and written in pixels, through each placeable's
 * unoriented node (`rawPlaceable`), in the layer's frame.
 */
import type { Placeable } from "../_node";
import type { GoFishRef } from "../_ref";
import { rawPlaceable } from "../axisDirection";
import { type ConstraintRef, type KeyOf } from "../constraints/shared";
import { placedOutlines as outlinesAt, type Outline } from "../geometry";
import {
  around,
  end,
  interior,
  type AlongPlace,
  type AroundPlace,
  type InteriorPlace,
  type Place,
} from "../../families/place";
import { ringExtent } from "../geometry/box";
import { turnedCorners } from "../geometry/plane";
import {
  ObstacleGrid,
  corners,
  outlineObstacles,
  type HalfSize,
  type Obstacle,
  type Pt,
  type Spot,
} from "./collide";
import {
  alongCandidates,
  aroundCandidates,
  dodgeVertically,
  endSpot,
  interiorCandidates,
  type Candidate,
  type TargetShape,
} from "./strategies";
import type { LabelNode } from "./labelNode";

/** How far sampled outlines may stray from the shapes they stand for, in
 *  placement and in the inside test of the auto color. */
export const LABEL_TOLERANCE = 0.25;
/** Pixels a label's box is grown by when it is tested for collisions. */
const CLEARANCE = 1;
/** Pixels between labels that `start`/`end` slide apart. */
const DODGE_GAP = 1;

/** One label the chooser places. */
export type LabelPlaceItem = {
  /** Which `.label()` call it comes from: the labels of one call are placed
   *  together, in order, and share its `avoiding`. */
  group: unknown;
  /** The labeled mark's `ref()` stand-in. */
  target: ConstraintRef;
  label: ConstraintRef;
  node: LabelNode;
  /** Its strategy, or `"outline"`: read from its mark's outline
   *  ({@link placeByOutline}). */
  place: Place | "outline";
  /** The label's `offset` option (see {@link placeOffset}). */
  offset?: number;
  /** `ref()` stand-ins of the nodes it avoids. */
  avoiding: ConstraintRef[];
  /** How the label's call reads in a message (`.label("country")`). */
  call: string;
};

export interface LabelPlaceConstraint {
  type: "labelPlace";
  /** The y direction of the layer's axis order (see `axisDirection.ts`). */
  direction: 1 | -1;
  /** Every operand, so the layer resolves them like any constraint's. */
  children: ConstraintRef[];
  items: LabelPlaceItem[];
  /** The labels placed before this step: in this layer by the solve (a
   *  position string), and in the layers below by the solve or the chooser.
   *  A hidden one takes no room. */
  seated: SeatedLabel[];
}

/** A label placed before the chooser runs, read through its `ref()`. */
export type SeatedLabel = { ref: ConstraintRef; label: LabelNode };

export const isLabelPlaceConstraint = (
  c: { type: string } | undefined
): c is LabelPlaceConstraint => c?.type === "labelPlace";

export function createLabelPlaceConstraint(
  items: LabelPlaceItem[],
  seated: SeatedLabel[],
  direction: 1 | -1
): LabelPlaceConstraint {
  const children = [
    ...items.flatMap((i) => [i.target, i.label, ...i.avoiding]),
    ...seated.map((s) => s.ref),
  ];
  return { type: "labelPlace", direction, children, items, seated };
}

/** A placed node's outlines in the layer's frame, in pixels. */
const placedOutlines = (p: Placeable): Outline[] =>
  outlinesAt(rawPlaceable(p), LABEL_TOLERANCE);

/** The node a placeable stands for: a ref's target, or the node itself. */
const markOf = (p: Placeable): unknown => {
  const raw = rawPlaceable(p) as unknown as GoFishRef;
  return raw.targetNode ?? raw;
};

/** The obstacles a placed node's outlines stand for: the ink each draws,
 *  its stroke band and, when filled, its inside. `scope` limits them to one
 *  call. */
const obstaclesOf = (
  outlines: Outline[],
  owner: unknown,
  scope?: unknown
): Obstacle[] => outlines.flatMap((o) => outlineObstacles(o, owner, scope));

/** Seat a label at `spot`: its angle, and its box (`size`, its own turned
 *  box when not given), centered there. */
function seat(
  p: Placeable,
  node: LabelNode,
  spot: Spot,
  { hx, hy }: HalfSize = node.halfSize(spot.angle)
): void {
  node.state.angle = spot.angle;
  const raw = rawPlaceable(p);
  raw.setExtent!("x", { min: spot.cx - hx, size: 2 * hx });
  raw.setExtent!("y", { min: spot.cy - hy, size: 2 * hy });
}

/** Hide a label: it draws nothing, and its box is an empty one at its
 *  mark's center, so it takes no room. */
function hide(p: Placeable, node: LabelNode, [cx, cy]: Pt): void {
  seat(p, node, { cx, cy, angle: node.state.angle }, { hx: 0, hy: 0 });
  node.state.hidden = true;
}

/** The hidden labels of one render, per call, for the one note a render
 *  prints (`reportHiddenLabels`). */
export type HiddenLabels = Map<string, { hidden: number; total: number }>;

export function applyLabelPlacement(
  constraint: LabelPlaceConstraint,
  targets: Map<string, Placeable>,
  keyOf: KeyOf,
  sizes: [number, number]
): void {
  if (constraint.items.length === 0) return;
  // The area the layer was given: a label the chooser places stays inside
  // it, off the axes and titles around it. In axis order it is
  // `[0, size]` on each axis, so in pixels its y runs up from 0 when the
  // layer's y grows upward.
  const [w, h] = sizes;
  const frame =
    Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
      ? {
          x0: 0,
          x1: w,
          y0: constraint.direction === 1 ? 0 : -h,
          y1: constraint.direction === 1 ? h : 0,
        }
      : undefined;
  const inFrame = (poly: Pt[]) =>
    frame === undefined ||
    poly.every(
      ([x, y]) =>
        x >= frame.x0 - 0.5 &&
        x <= frame.x1 + 0.5 &&
        y >= frame.y0 - 0.5 &&
        y <= frame.y1 + 0.5
    );
  const session = constraint.items[0].node.node.getRenderSession();
  const hiddenLabels = (session.hiddenLabels ??= new Map());
  const get = (ref: ConstraintRef): Placeable => {
    const p = targets.get(keyOf(ref));
    if (p === undefined)
      throw new Error(`[gofish] .label(): "${ref.name}" was not laid out`);
    return p;
  };

  // Each labeled mark's outlines, read once per mark, however many labels
  // (each with its own ref) it has.
  const shapes = new Map<unknown, TargetShape & { mark: unknown }>();
  const shapeOf = (ref: ConstraintRef): TargetShape & { mark: unknown } => {
    const p = get(ref);
    const mark = markOf(p);
    let s = shapes.get(mark);
    if (s === undefined) {
      s = {
        outlines: placedOutlines(p),
        type: (mark as { type?: string }).type ?? "node",
        mark,
      };
      shapes.set(mark, s);
    }
    return s;
  };

  let tallest = 4;
  for (const i of constraint.items)
    tallest = Math.max(tallest, i.node.metrics.h);
  const cell = Math.max(16, 4 * tallest);
  const grid = new ObstacleGrid(cell);
  // The labeled marks, each once.
  const filed = new Set<unknown>();
  for (const item of constraint.items) {
    const s = shapeOf(item.target);
    if (filed.has(s.mark)) continue;
    filed.add(s.mark);
    for (const o of obstaclesOf(s.outlines, s.mark)) grid.add(o);
  }
  // Each call's avoided nodes, for that call only, each once per call.
  const avoided = new Map<unknown, Set<unknown>>();
  for (const item of constraint.items) {
    const seen = avoided.get(item.group) ?? new Set<unknown>();
    avoided.set(item.group, seen);
    for (const ref of item.avoiding) {
      const p = get(ref);
      const mark = markOf(p);
      if (seen.has(mark)) continue;
      seen.add(mark);
      for (const o of obstaclesOf(placedOutlines(p), mark, item.group))
        grid.add(o);
    }
  }
  // The labels placed before this step; a hidden one takes no room.
  for (const { ref, label } of constraint.seated) {
    if (label.state.hidden) continue;
    const d = rawPlaceable(get(ref)).dims;
    const box = {
      minX: d[0].min ?? NaN,
      maxX: d[0].max ?? NaN,
      minY: d[1].min ?? NaN,
      maxY: d[1].max ?? NaN,
    };
    grid.add({ kind: "box", poly: turnedCorners(box, 0), owner: ref });
  }

  // The calls, in the order their first label appears; each call's labels
  // in data order, each with its strategy and its offset resolved.
  const calls = new Map<unknown, Resolved[]>();
  for (const item of constraint.items) {
    const place =
      item.place === "outline"
        ? placeByOutline(shapeOf(item.target))
        : item.place;
    const resolved = {
      ...item,
      place,
      offset: placeOffset(place, item.offset),
    };
    const list = calls.get(item.group);
    if (list) list.push(resolved);
    else calls.set(item.group, [resolved]);
  }

  /** Whether a label of `group` on `shape` is clear at `c`: its box covers
   *  no obstacle of its call and, unless it sits on its own mark's outline,
   *  not that outline's band either (a label may sit inside its own mark,
   *  filled or not). */
  const clear = (
    c: Spot & { onOutline: boolean },
    size: HalfSize,
    shape: TargetShape & { mark: unknown },
    group: unknown
  ): boolean => {
    const poly = corners(c, size, CLEARANCE);
    const keep = (o: Obstacle) =>
      o.owner !== shape.mark && (o.scope === undefined || o.scope === group);
    if (grid.hits(poly, keep)) return false;
    const own = (o: Obstacle) => o.owner === shape.mark && o.kind === "segment";
    return c.onOutline || !grid.hits(poly, own);
  };
  /** Seat a label at the spot it took and file its box (`size` at the
   *  spot), or hide it when it took none, counting it for the render's
   *  note. */
  const settle = (item: Resolved, spot: Spot | undefined, size: HalfSize) => {
    const key = `${item.call} with ${placeName(item.place)}`;
    const entry = hiddenLabels.get(key) ?? { hidden: 0, total: 0 };
    entry.total++;
    hiddenLabels.set(key, entry);
    const p = get(item.label);
    if (spot === undefined) {
      entry.hidden++;
      hide(p, item.node, centerOf(shapeOf(item.target)));
      return;
    }
    seat(p, item.node, spot);
    grid.add({ kind: "box", poly: corners(spot, size), owner: item.label });
  };

  for (const [group, items] of calls) {
    // `start` and `end` labels: each at its path's end, slid apart from
    // the others of its kind it overlaps; one that is not clear there is
    // hidden. All are tested before any is filed: the slide already keeps
    // them off each other. The frame does not hold them: a path's end is
    // where its label goes, often past the area (a line chart's end labels
    // take the margin), and the labels join the layout's box.
    for (const which of ["start", "end"] as const) {
      const ends = items.filter((i) => i.place.kind === which);
      const spots = endSpots(ends, which, shapeOf).map((e) => ({
        ...e,
        ok: clear(
          { ...e.spot, onOutline: false },
          e.size,
          shapeOf(e.item.target),
          group
        ),
      }));
      for (const { item, spot, size, ok } of spots)
        settle(item, ok ? spot : undefined, size);
    }
    // The rest take their first free candidate in the frame, in data order.
    for (const item of items) {
      const { place } = item;
      if (place.kind === "start" || place.kind === "end") continue;
      const shape = shapeOf(item.target);
      const angle = item.node.state.angle;
      const size = item.node.halfSize(angle);
      let chosen: Candidate | undefined;
      for (const c of candidatesFor(place, item.offset, shape, size, angle))
        if (inFrame(corners(c, size)) && clear(c, size, shape, group)) {
          chosen = c;
          break;
        }
      settle(item, chosen, size);
    }
  }
}

/** A label to place, with its strategy and its offset resolved. */
type Resolved = Omit<LabelPlaceItem, "place" | "offset"> & {
  place: Place;
  offset: number;
};

/** A strategy's name as written: `Place.around()`. */
const placeName = (p: Place): string => `Place.${p.kind}()`;

/**
 * The strategy of a label whose default is read from its mark's outline
 * (`labelPosition: "outline"`): inside a filled region, around a closed
 * outline that is not filled, and at the end of an open path.
 */
const placeByOutline = (t: TargetShape): Place =>
  t.outlines.some((o) => o.closed && o.filled)
    ? interior()
    : t.outlines.some((o) => o.closed)
      ? around()
      : end();

/** The middle of a mark's outlines' box. */
function centerOf(shape: TargetShape): Pt {
  const e = ringExtent(shape.outlines.flatMap((o) => o.points));
  return Number.isFinite(e.minX)
    ? [(e.minX + e.maxX) / 2, (e.minY + e.maxY) / 2]
    : [0, 0];
}

/** Pixels between the outline and a label at a strategy that takes an
 *  `offset`, when neither it nor the label gives one. */
const DEFAULT_OFFSET = { around: 3, along: 3, start: 4, end: 4, interior: 0 };

/** The pixels between the outline and a label placed by `place`: the
 *  strategy's `offset`, else the label's, else the strategy's default. */
const placeOffset = (place: Place, label: number | undefined): number =>
  ("offset" in place ? place.offset : undefined) ??
  label ??
  DEFAULT_OFFSET[place.kind];

/** The candidates of a strategy that offers several, best first. */
function candidatesFor(
  place: AroundPlace | AlongPlace | InteriorPlace,
  offset: number,
  shape: TargetShape,
  size: HalfSize,
  angle: number
): Iterable<Candidate> {
  switch (place.kind) {
    case "around":
      return aroundCandidates(shape, size, angle, place, offset);
    case "along":
      return alongCandidates(shape, size, angle, place, offset);
    case "interior":
      return interiorCandidates(shape, size, angle);
  }
}

/**
 * The spots of one call's `Place.start()` or `Place.end()` labels: each at
 * its path's end, then the labels whose boxes overlap in x slid apart
 * vertically, a run of them at a time (labels apart in x keep the heights
 * their ends want). In input order, with each label's box size.
 */
function endSpots(
  items: Resolved[],
  which: "start" | "end",
  shapeOf: (ref: ConstraintRef) => TargetShape
): { item: Resolved; spot: Spot; size: HalfSize }[] {
  const wanted = items.map((item) => {
    const angle = item.node.state.angle;
    const size = item.node.halfSize(angle);
    const spot = endSpot(shapeOf(item.target), size, angle, which, item.offset);
    return { item, size, spot };
  });
  // Runs of boxes that overlap in x, chained: sorted by left edge, a box
  // joins the run while it starts before the run's right edge.
  const left = (k: number) => wanted[k].spot.cx - wanted[k].size.hx;
  const right = (k: number) => wanted[k].spot.cx + wanted[k].size.hx;
  const order = wanted.map((_, k) => k).sort((a, b) => left(a) - left(b));
  const runs: number[][] = [];
  let reach = -Infinity;
  for (const k of order) {
    if (runs.length > 0 && left(k) < reach) {
      runs[runs.length - 1].push(k);
      reach = Math.max(reach, right(k));
    } else {
      runs.push([k]);
      reach = right(k);
    }
  }
  for (const run of runs) {
    const members = [...run].sort((a, b) => a - b);
    const ys = dodgeVertically(
      members.map((k) => ({
        want: wanted[k].spot.cy,
        h: 2 * wanted[k].size.hy,
      })),
      DODGE_GAP
    );
    members.forEach((k, i) => (wanted[k].spot.cy = ys[i]));
  }
  return wanted;
}

/** Print one note for a render's hidden labels, and clear them. */
export function reportHiddenLabels(hidden: HiddenLabels | undefined): void {
  if (hidden === undefined || hidden.size === 0) return;
  const parts = [...hidden]
    .filter(([, e]) => e.hidden > 0)
    .map(([call, e]) => `${e.hidden} of ${e.total} for ${call}`);
  hidden.clear();
  if (parts.length === 0) return;
  console.info(
    `[gofish] Some labels were hidden because no candidate spot was free: ${parts.join("; ")}.`
  );
}
