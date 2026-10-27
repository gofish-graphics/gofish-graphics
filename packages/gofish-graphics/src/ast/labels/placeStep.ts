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
 * its outline only), the labels already placed in this layer (by this step,
 * or by the solve for a position string), and the nodes in the call's
 * `avoiding`. A label with no free candidate is hidden. `Place.start()` and
 * `Place.end()` labels are not hidden: the labels of one call slide apart
 * vertically instead.
 *
 * Everything is read and written in pixels, through each placeable's
 * unoriented node (`rawPlaceable`), in the layer's frame.
 */
import type { Placeable } from "../_node";
import type { GoFishRef } from "../_ref";
import { rawPlaceable } from "../axisDirection";
import type { ConstraintRef } from "../constraints/shared";
import { placedOutlines as outlinesAt, type Outline } from "../geometry";
import type { Place } from "../../families/place";
import {
  ObstacleGrid,
  corners,
  convexOverlap,
  outlineObstacles,
  segmentInk,
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
import { rotatedHalfExtents, type LabelNode } from "./labelNode";

/** How far sampled outlines may stray from the shapes they stand for. */
const TOLERANCE = 0.25;
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
  place: Place;
  /** The label's `offset` option, for a strategy that gives none. */
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
  /** Labels in the same layer placed by the solve (a position string). */
  fixed: ConstraintRef[];
}

export const isLabelPlaceConstraint = (
  c: { type: string } | undefined
): c is LabelPlaceConstraint => c?.type === "labelPlace";

export function createLabelPlaceConstraint(
  items: LabelPlaceItem[],
  fixed: ConstraintRef[],
  direction: 1 | -1
): LabelPlaceConstraint {
  const children = [
    ...items.flatMap((i) => [i.target, i.label, ...i.avoiding]),
    ...fixed,
  ];
  return { type: "labelPlace", direction, children, items, fixed };
}

/** A placed node's outlines in the layer's frame, in pixels. */
function placedOutlines(p: Placeable): Outline[] {
  const raw = rawPlaceable(p) as Placeable & {
    yFrame?: { direction: 1 | -1 };
  };
  return outlinesAt(raw, TOLERANCE, raw.yFrame?.direction ?? 1);
}

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
): Obstacle[] =>
  outlines.flatMap((o) =>
    outlineObstacles(o.points as Pt[], o.closed, owner, o.filled, o.width).map(
      (ob) => ({
        ...ob,
        scope,
      })
    )
  );

/** A label's unturned half size: its text and chrome. */
const halfSize = (node: LabelNode, angle: number): HalfSize => {
  const [hx, hy] = rotatedHalfExtents(
    [
      node.metrics.w / 2 + node.metrics.pad[0],
      node.metrics.h / 2 + node.metrics.pad[1],
    ],
    angle
  );
  return { hx, hy };
};

/** Seat a label at `spot`: its angle, and its box, centered there. */
function seat(p: Placeable, node: LabelNode, spot: Spot): void {
  node.state.angle = spot.angle;
  const { hx, hy } = halfSize(node, spot.angle);
  const raw = rawPlaceable(p);
  raw.setExtent!("x", { min: spot.cx - hx, size: 2 * hx });
  raw.setExtent!("y", { min: spot.cy - hy, size: 2 * hy });
}

/** Hide a label: it draws nothing, and its box is an empty one at its
 *  mark's center, so it takes no room. */
function hide(p: Placeable, node: LabelNode, at: Pt): void {
  node.state.hidden = true;
  const raw = rawPlaceable(p);
  raw.setExtent!("x", { min: at[0], size: 0 });
  raw.setExtent!("y", { min: at[1], size: 0 });
}

/** The hidden labels of one render, per call, for the one note a render
 *  prints (`reportHiddenLabels`). */
export type HiddenLabels = Map<string, { hidden: number; total: number }>;

export function applyLabelPlacement(
  constraint: LabelPlaceConstraint,
  targets: Map<string, Placeable>,
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
    const p = targets.get(ref.name);
    if (p === undefined)
      throw new Error(`[gofish] .label(): "${ref.name}" was not laid out`);
    return p;
  };

  // Each labeled mark's outlines, read once.
  const shapes = new Map<string, TargetShape & { mark: unknown }>();
  const shapeOf = (ref: ConstraintRef): TargetShape & { mark: unknown } => {
    let s = shapes.get(ref.name);
    if (s === undefined) {
      const p = get(ref);
      const mark = markOf(p);
      s = {
        outlines: placedOutlines(p),
        type: (mark as { type?: string }).type ?? "node",
        mark,
      };
      shapes.set(ref.name, s);
    }
    return s;
  };

  const cell = Math.max(
    16,
    4 * Math.max(...constraint.items.map((i) => i.node.metrics.h), 4)
  );
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
  // The labels the solve placed.
  for (const ref of constraint.fixed) {
    const d = rawPlaceable(get(ref)).dims;
    const [x0, x1, y0, y1] = [d[0].min, d[0].max, d[1].min, d[1].max];
    if ([x0, x1, y0, y1].some((v) => v === undefined || !Number.isFinite(v)))
      continue;
    grid.add({
      kind: "box",
      poly: [
        [x0!, y0!],
        [x1!, y0!],
        [x1!, y1!],
        [x0!, y1!],
      ],
      owner: ref,
    });
  }

  // The calls, in the order their first label appears; each call's labels
  // in data order.
  const calls = new Map<unknown, LabelPlaceItem[]>();
  for (const item of constraint.items) {
    const list = calls.get(item.group);
    if (list) list.push(item);
    else calls.set(item.group, [item]);
  }

  for (const [group, items] of calls) {
    const kind = items[0].place.kind;
    if (kind === "start" || kind === "end") {
      placeEnds(items, kind, shapeOf, get, grid);
      continue;
    }
    let hidden = 0;
    for (const item of items) {
      const shape = shapeOf(item.target);
      const angle = item.node.state.angle;
      const size = halfSize(item.node, angle);
      const candidates = candidatesFor(item, shape, size, angle);
      // Its own mark is read as its outline's band only: a label may sit
      // inside its own mark, filled or not.
      const ownSegments = shape.outlines.flatMap((o) =>
        outlineObstacles(o.points as Pt[], o.closed, shape.mark, false, o.width)
      );
      const keep = (o: Obstacle) =>
        o.owner !== shape.mark && (o.scope === undefined || o.scope === group);
      let chosen: Candidate | undefined;
      for (const c of candidates) {
        const poly = corners(c, size, CLEARANCE);
        if (!inFrame(corners(c, size))) continue;
        if (grid.hits(poly, keep)) continue;
        if (
          !c.onOutline &&
          ownSegments.some(
            (o) =>
              o.kind === "segment" &&
              convexOverlap(poly, segmentInk(o.a, o.b, o.w))
          )
        )
          continue;
        chosen = c;
        break;
      }
      const p = get(item.label);
      if (chosen === undefined) {
        hidden++;
        hide(p, item.node, centerOf(shape));
        continue;
      }
      seat(p, item.node, chosen);
      grid.add({
        kind: "box",
        poly: corners(chosen, size),
        owner: item.label,
      });
    }
    const key = `${items[0].call} with ${placeName(items[0].place)}`;
    const entry = hiddenLabels.get(key) ?? { hidden: 0, total: 0 };
    entry.hidden += hidden;
    entry.total += items.length;
    hiddenLabels.set(key, entry);
  }
}

/** A strategy's name as written: `Place.around()`. */
const placeName = (p: Place): string => `Place.${p.kind}()`;

/** The middle of a mark's outlines' box. */
function centerOf(shape: TargetShape): Pt {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const o of shape.outlines)
    for (const [x, y] of o.points) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  return Number.isFinite(x0) ? [(x0 + x1) / 2, (y0 + y1) / 2] : [0, 0];
}

const DEFAULT_OFFSET = { around: 3, along: 3, start: 4, end: 4 } as const;

function candidatesFor(
  item: LabelPlaceItem,
  shape: TargetShape,
  size: HalfSize,
  angle: number
): Candidate[] {
  const place = item.place;
  switch (place.kind) {
    case "around":
      return aroundCandidates(
        shape,
        size,
        angle,
        place,
        place.offset ?? item.offset ?? DEFAULT_OFFSET.around
      );
    case "along":
      return alongCandidates(
        shape,
        size,
        angle,
        place,
        place.offset ?? item.offset ?? DEFAULT_OFFSET.along
      );
    case "interior":
      return interiorCandidates(shape, size, angle);
    default:
      throw new Error(
        `[gofish] .label({ position }): ${JSON.stringify(place)} is not a Place strategy.`
      );
  }
}

/** `Place.start()` / `Place.end()` for one call: each label at its path's
 *  end, then the labels on each side slid apart vertically. */
function placeEnds(
  items: LabelPlaceItem[],
  which: "start" | "end",
  shapeOf: (ref: ConstraintRef) => TargetShape,
  get: (ref: ConstraintRef) => Placeable,
  grid: ObstacleGrid
): void {
  const wanted = items.map((item) => {
    const angle = item.node.state.angle;
    const size = halfSize(item.node, angle);
    const place = item.place as { offset?: number };
    const spot = endSpot(
      shapeOf(item.target),
      size,
      angle,
      which,
      place.offset ?? item.offset ?? DEFAULT_OFFSET[which]
    );
    return { item, size, spot };
  });
  for (const side of [1, -1] as const) {
    const onSide = wanted.filter((w) => w.spot.side === side);
    const ys = dodgeVertically(
      onSide.map((w) => ({ want: w.spot.cy, h: 2 * w.size.hy })),
      DODGE_GAP
    );
    onSide.forEach((w, k) => {
      const spot = { ...w.spot, cy: ys[k] };
      seat(get(w.item.label), w.item.node, spot);
      grid.add({
        kind: "box",
        poly: corners(spot, w.size),
        owner: w.item.label,
      });
    });
  }
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
