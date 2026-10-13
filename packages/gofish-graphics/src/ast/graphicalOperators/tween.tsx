/**
 * `Tween` — the node behind `time.transition()`: the temporal reading of
 * `connect`.
 *
 * `connect` consumes a run of already-laid-out marks and emits the geometry
 * BETWEEN them, all of it at once, as a path. `Tween` consumes the same run
 * and emits the geometry AT one point along it — the mark the run passes
 * through at the current playhead. Same operands, same derived-geometry
 * stratum, same lack of a size claim of its own; only the reading differs. A
 * line is the whole trajectory, a tween is the dot moving along it.
 *
 * Interpolation runs over the operands' RESOLVED geometry (their placed
 * boxes), i.e. downstream of layout, with the knots at the keyframes' own data
 * time values — see `src/interpolate.ts`. Under the σ-affine model that
 * agrees with re-laying-out at an interpolated datum whenever the path through
 * layout is affine in the interpolated quantities, which a fixed-domain
 * scatter is (see the animation design note, §4.1).
 *
 * WHAT MOVES. In each operand, the marks a `.transition({ update })` was
 * chained on, or the operand itself when nothing in it chained one (the
 * selection form, `time.transition()` over a bag of marks). A chained
 * transition moves the marks that chained its own tween, however many of
 * them a keyframe holds; marks that chained a different tween are another
 * transition's. The marks that
 * move draw nothing of their own: the moving mark is their drawing. A trail
 * behind it is not the transition's business. It is a `time.history` of
 * another mark, layered with the moving one.
 *
 * WHEN THE MARK IS THERE. A line draws nothing past its endpoints, and a
 * tween, read on time, draws nothing outside its run. Each stretch between two
 * NEIGHBORING keyframes of the sequence is read by which ends of it have a row
 * for the mark. Both: the mark moves, as above. Only the later one: the mark
 * ENTERS, held at that keyframe's geometry and fading in over the stretch.
 * Only the earlier one: it EXITS, held at that keyframe and fading out.
 * Neither: it is absent. A gap in a run (a keyframe between two of its knots
 * with no row for it) is therefore an exit followed later by an enter, and the
 * mark is absent before the first keyframe and after the last. Fading in place
 * is the default Keynote's Magic Move, PowerPoint's Morph and SwiftUI's
 * `.opacity` transition give an unmatched object; `enter`/`exit` options that
 * override it (as `curve` overrides the interpolation) are not built (issue
 * #831). Without the sequence's keyframes (`sequence` omitted), the run's own
 * knots are taken as neighbors, so the mark bridges every gap and never fades.
 *
 * WHERE THE PLAYHEAD IS READ. The run is a LAYOUT-time fact: which keyframes
 * there are, where layout placed each of them, and therefore the whole curve
 * the mark will travel. The playhead is a PAINT-time fact: which point of that
 * curve is showing right now. So the two are split by the reactivity rule
 * (`src/interaction/live.ts`): the node reads the clock once as it is built,
 * through `readLive`, for a value to lower and to register the clock for
 * events, and the paint tier re-reads it per frame inside `live()` slots,
 * patching the moving items' attributes and nothing else.
 *
 * That split is sound because a tween is the LEAF case of subtree containment
 * (incremental layout, issue #674). The node makes no size claim of its own
 * and contributes no domain values, so nothing above it can see the playhead
 * move; and it has no children of its own to re-place, so "re-laying out the
 * subtree" is recomputing one display item — which is exactly what the paint
 * tier does. What it costs is the one thing containment demands in exchange:
 * the node's LAYOUT box is the extent of the whole trajectory, the union of
 * its keyframes' placed boxes, not the box it happens to occupy at t. That is
 * the same box a `line` through the same keyframes claims, for the same
 * reason — the room a mark needs is the room it uses over its whole run.
 */
import type { DisplayList } from "gofish-ir";
import { GoFishAST } from "../_ast";
import { GoFishNode, type Placeable, type ToPixel } from "../_node";
import { GoFishRef } from "../_ref";
import { resolveColorChannel } from "../../color";
import { mixColor } from "../../colorModes";
import {
  fadeItem,
  lowerStyle,
  rectItemFromBox,
  roleFor,
} from "../displayList/lowerHelpers";
import { displayTranslate, type Transform } from "../dims";
import { isValue, MaybeValue } from "../data";
import { axisScale } from "../domain";
import { UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { Size } from "../dims";
import { createNodeOperator } from "../withGoFish";
import { readLive } from "../../interaction/live";
import { GEOMETRY_CHANNELS, setLiveItems } from "../../interaction/liveSlots";
import {
  channelReader,
  locate,
  sourceIndex,
  type InterpolationMethod,
  type KnotLocation,
} from "../../interpolate";
import { bbox, height, unionAll, width } from "../../util/bbox";
import { targetOf } from "./layer";
import { chainedMarks } from "../../animation/transition";
import type { TweenEffect } from "../../animation/effects";
import {
  updateSlotOf,
  updateWarp,
  type UpdateSlot,
} from "../../animation/updateStagger";

export type TweenOptions = {
  /** The playhead, in the time field's own units (a year, not a fraction).
   *  A signal (a `timer`, or anything that reads one) makes the mark move: it
   *  is read once as the node is built, for a value to lower, and then per
   *  frame in paint position. A plain number is a chart held still, and lowers to exactly the
   *  static item it would have lowered before. */
  at: (() => number) | number;
  /** The run the mark travels (`unrollOrder`): `knots[j]` is the time of its
   *  `j`-th point, in time order, and `operand[j]` the operand that stands
   *  there. On a cyclic axis the run is unrolled over the cycle before and
   *  after, so an operand stands at several points; it is laid out once. */
  run: { knots: number[]; operand: number[] };
  /** Every keyframe of the sequence the knots are drawn from, in time order.
   *  The mark enters, moves and exits by which keyframes here have a row for
   *  it (see the header). Omitted, the run's own knots are the keyframes, so
   *  the mark moves from its first knot to its last and never fades. */
  sequence?: number[];
  /** How the run is read between keyframes. */
  method: InterpolationMethod;
  /** Time reparameterization inside one keyframe interval: `u -> u'`, both in
   *  `[0, 1]`. Easing is a warp of the parameter, not of the values, so it
   *  composes with either interpolation method. */
  ease?: (u: number) => number;
  /** The clock's milliseconds per unit of the time field, for an operator
   *  whose `.transition({ update: time.stagger(...) })` staggers the moves
   *  (`src/animation/updateStagger.ts`): its lag is in ms. */
  msPerUnit?: () => number;
  /** The tween a `.transition({ update })` chained on the marks this
   *  transition moves (the chart builder draws one transition per tween,
   *  `ChartBuilder.resolve`). Omitted (the selection form), it moves the
   *  marks that chained any, or each operand itself when none did. */
  moves?: TweenEffect;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  opacity?: number;
};

/** The leaves a transition can move, by how each one moves. A BOX shape's
 *  extent is one of its channels, so its whole box is interpolated, its fill
 *  and stroke mixed, and a rect and an ellipse morph into each other. Any
 *  other leaf (a text, whose extent is the measure of its string, which is
 *  not something to blend) moves RIGIDLY: its position is interpolated and it
 *  keeps the source keyframe's own drawing (string, font, paint), or, where
 *  that drawing changes between keyframes, CROSS-FADES between them. A
 *  build-in `grow` collapses the same box shapes (`src/animation/effects.ts`). */
export const BOX_SHAPES = new Set(["ellipse", "rect", "blank"]);

/**
 * The leaves of one keyframe mark, in structural order: the leaves of its own
 * subtree, then the leaves of what is attached to it from outside the subtree
 * (its labels, see `GoFishNode._attachments`). A mark with no children is its
 * own single leaf. `ref` children draw nothing and are not leaves.
 */
function markLeaves(node: GoFishNode): GoFishNode[] {
  const kids = node.children.filter(
    (c): c is GoFishNode => c instanceof GoFishNode
  );
  const own = kids.length === 0 ? [node] : kids.flatMap(markLeaves);
  return [...own, ...(node._attachments ?? []).flatMap(markLeaves)];
}

/**
 * The marks a transition moves in one keyframe operand: the marks in it that
 * chained the transition's tween (`moves`), or, when the transition was not
 * chained (the selection form), the marks in it that chained any, or the
 * operand itself when none did.
 */
function movedIn(
  operand: GoFishNode | undefined,
  moves: TweenEffect | undefined
): GoFishNode[] {
  if (!(operand instanceof GoFishNode)) return [];
  const chained = chainedMarks(operand, moves);
  return chained.length > 0 || moves !== undefined ? chained : [operand];
}

/** One channel of a track: its value where the run is located. */
type Channel = (at: KnotLocation) => number;

/**
 * One leaf's run through the keyframes, in time order: everything about it
 * that layout decided. Reading it at a playhead is pure arithmetic over these
 * numbers, which is what lets the paint tier do it per frame. Every track
 * keeps the leaf at each keyframe, which lends its own drawing to the moving
 * mark (`INTERNAL_lendDrawing`), and the leaf's local origin there (the point
 * its anchor sits on), where that drawing is placed.
 */
type Track = {
  leaves: GoFishNode[];
  origins: [number, number][];
} & (
  | {
      kind: "box";
      /** The shape of the leaf at each keyframe. One shape for the whole run
       *  paints that shape; a run that mixes rect and ellipse MORPHS, painted
       *  as a rect whose corner radius is interpolated (an ellipse is a rect
       *  with rx = w/2 and ry = h/2). */
      shapes: string[];
      /** The four quantities a box leaf interpolates: its center and its
       *  extent on each axis, each read from every keyframe's placed box. */
      x: Channel;
      y: Channel;
      w: Channel;
      h: Channel;
    }
  | {
      kind: "rigid";
      /** Each keyframe's box center, the point the leaf's drawing moves
       *  with, and the channels that read it. */
      cx: number[];
      cy: number[];
      x: Channel;
      y: Channel;
    }
);

/** One track, lowered: the items its leaf draws when the run is read `at` a
 *  location and its unblended attributes come from keyframe `source`. */
type Painter = (at: KnotLocation, source: number) => DisplayList.DisplayItem[];

/**
 * Where a run with these knots is read at `t`, and how opaque it is there —
 * the enter / update / exit reading of the stretch between the two
 * neighboring keyframes of `sequence` that `t` lies in (see the header).
 * `at` is the time to sample the run at: `t` itself while the mark moves, the
 * keyframe it is held at while it enters or exits. `alpha` multiplies the
 * mark's own opacity; it ramps over the stretch by the same (eased) parameter
 * the motion uses, and is 0 wherever the mark is absent.
 */
export function lifecycle(
  knots: number[],
  sequence: number[] | undefined,
  ease: ((u: number) => number) | undefined
): (t: number) => { at: number; alpha: number } {
  const own = new Set(knots.filter(Number.isFinite));
  // A sequence's keyframes arrive sorted and distinct; the run's own knots
  // are made so.
  const frames = sequence ?? [...own].sort((a, b) => a - b);
  const [first, last] = [frames[0], frames[frames.length - 1]];
  return (t) => {
    // A single keyframe has no stretch to read; the mark holds it.
    if (frames.length < 2) return { at: t, alpha: own.size > 0 ? 1 : 0 };
    // Absent, the mark is held at a fixed time, so the paint tier's geometry
    // reads return the same values frame after frame and patch nothing.
    if (!(t >= first)) return { at: first, alpha: 0 };
    if (!(t <= last)) return { at: last, alpha: 0 };
    const { i, u } = locate(frames, t);
    const [from, to] = [frames[i], frames[i + 1]];
    const eased = ease !== undefined && u > 0 && u < 1 ? ease(u) : u;
    const [before, after] = [own.has(from), own.has(to)];
    if (before && after) return { at: t, alpha: 1 };
    if (after) return { at: to, alpha: eased };
    if (before) return { at: from, alpha: 1 - eased };
    return { at: from, alpha: 0 };
  };
}

/** A display item moved by `(dx, dy)` pixels: its position fields shifted,
 *  everything else as it was. */
function moveItem(
  item: DisplayList.DisplayItem,
  dx: number,
  dy: number
): DisplayList.DisplayItem {
  const moved = { ...item } as Record<string, unknown>;
  if (typeof moved.x === "number") moved.x += dx;
  if (typeof moved.y === "number") moved.y += dy;
  if (typeof moved.cx === "number") moved.cx += dx;
  if (typeof moved.cy === "number") moved.cy += dy;
  return moved as unknown as DisplayList.DisplayItem;
}

/** The run a tween paints: the keyframes' time values, one track per
 *  matched leaf of the keyed mark, and where each keyframe sits in a
 *  staggered update (`updateSlotOf`), if one arranges it. */
type Run = {
  knots: number[];
  tracks: Track[];
  slots: (UpdateSlot | undefined)[];
};

/**
 * Locate `t` in a run: where every per-keyframe channel is read at `t`, and
 * the keyframe the attributes that are NOT blended come from.
 *
 * Easing warps the parameter INSIDE the interval `t` falls in, then maps back
 * to time, so an eased run still passes through every keyframe at its own time
 * value.
 *
 * The paint the moving mark inherits from its keyframes is not interpolated —
 * a country's color is its color — so `source` names one keyframe to read it
 * off rather than blending. Which one: normally the keyframe the playhead is
 * nearest, but under `"step"` the PREVIOUS one, so the whole mark — position,
 * size, paint — is the keyframe the method is holding rather than a held
 * position wearing the next keyframe's paint.
 */
export function sampleRun(
  knots: number[],
  t: number,
  method: InterpolationMethod,
  ease: ((u: number) => number) | undefined
): { at: KnotLocation; source: number } {
  const source = sourceIndex(knots, t, method);
  // Fewer than two keyframes leaves no segment to locate in; a channel of
  // such a run holds its one value wherever it is read (`channelReader`).
  if (knots.length < 2) return { at: { i: 0, u: 0 }, source };
  let loc = locate(knots, t);
  if (ease !== undefined && loc.u > 0 && loc.u < 1) {
    const { i, u } = loc;
    loc = locate(knots, knots[i] + ease(u) * (knots[i + 1] - knots[i]));
  }
  return { at: loc, source };
}

export const tween = createNodeOperator(
  (
    {
      at: playhead,
      run: { knots, operand },
      sequence,
      method,
      ease,
      msPerUnit,
      moves,
      fill,
      stroke,
      strokeWidth,
      opacity,
    }: TweenOptions,
    children: GoFishAST[]
  ) => {
    /** The playhead as a function, whether or not it was written as one, and
     *  whether it can change after layout. A plain number cannot, so the node
     *  lowers to a static item and nothing reactive is wired up. */
    const live = typeof playhead === "function";
    const readPlayhead = live ? playhead : () => playhead;

    // The playhead, read ONCE, HERE: the value the node lowers to, and the
    // read that registers the clock with the chart's interaction runtime.
    // Here rather than in `layout` because this is the part of the node's life
    // that happens during RESOLVE, which is when the ambient runtime is
    // installed and an input read can reach it. `readLive` is what keeps the
    // read paint-time — untracked, and flagged so the input wires event
    // dispatch without becoming a pipeline dependency of this chart (see
    // `src/interaction/live.ts`).
    const t = readLive(readPlayhead);
    /** Where the run is read at a playhead and how opaque it is there. */
    const life = lifecycle(knots, sequence, ease);

    const self: GoFishNode = new GoFishNode(
      {
        type: "tween",
        shared: [false, false],
        // Data-driven paint is registered for the shared color scale the same
        // way a leaf mark's is — see `connect`'s identical note.
        color: isValue(fill) ? fill : undefined,
        resolveUnderlyingSpace: (
          _children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => [UNDEFINED, UNDEFINED],
        layout: (_shared, size, scales, children) => {
          // Forward σ but not the anchored map, exactly as `connect` does:
          // the operands are placed by their own boxes, not by data position.
          const placed = children.map((child) =>
            child.layout(size, [
              axisScale(scales?.[0]?.sigma, undefined),
              axisScale(scales?.[1]?.sigma, undefined),
            ])
          );
          const operands = operand.map((i) => targetOf(children[i]));
          /** The marks that move in each keyframe, in time order. */
          const moved = operands.map((operand) => movedIn(operand, moves));

          /** A leaf's placed box and local origin in this node's frame. The
           *  operand itself is already placed; any other leaf is read through
           *  a `ref` of the same kind, which is how an operand is read. */
          const placeLeaf = (leaf: GoFishNode, k: number): Placeable => {
            if (leaf === operands[k]) return placed[operand[k]];
            const stand = new GoFishRef({ node: leaf });
            stand.parent = self;
            stand.resolveNames();
            return stand.layout(size);
          };

          // Match the moving marks' leaves across the keyframes by structural
          // position. When every keyframe has the same leaves, each leaf gets
          // a run of its own. When they differ (a label present in one year
          // only), the leaves cannot be paired, and each moving mark falls
          // back to one run of itself, its attachments left to the keyframes
          // (they hold and snap with them).
          // Leaves pair up by position whatever their shapes: a row whose
          // shape changes is morphed (rect <-> ellipse) or cross-faded
          // (anything else), see `MORPH_SHAPES` below.
          const leafSets = moved.map((marks) => marks.flatMap(markLeaves));
          const matched =
            leafSets.length > 0 &&
            leafSets.every(
              (leaves) =>
                leaves.length > 0 && leaves.length === leafSets[0].length
            );
          if (
            !matched &&
            moved.some((marks) => marks.length !== moved[0].length)
          ) {
            throw new Error(
              `[gofish] time.transition(): the keyframes hold different ` +
                `numbers of marks to move (` +
                `${[...new Set(moved.map((marks) => marks.length))].join(" / ")}` +
                `), and a transition pairs them across the keyframes by ` +
                `position. Give every keyframe of a run the same marks.`
            );
          }
          const rows: GoFishNode[][] = matched
            ? leafSets[0].map((_, j) => leafSets.map((leaves) => leaves[j]))
            : (moved[0] ?? []).map((_, j) => moved.map((marks) => marks[j]));

          // A fallback row is a moving mark itself (its own leaves did not
          // pair up), so it must be a box: it is interpolated as one.
          if (!matched) {
            for (const row of rows) {
              for (const shape of new Set(row.map((n) => n.type))) {
                if (!BOX_SHAPES.has(shape)) {
                  throw new Error(
                    `[gofish] time.transition(): cannot move a "${shape}" ` +
                      `mark whose parts differ between keyframes — such a ` +
                      `mark moves as one box, so it must be ` +
                      `${[...BOX_SHAPES].join(" / ")}. Give every keyframe ` +
                      `of the run the same parts.`
                  );
                }
              }
            }
          }

          /** A channel of this run, from each keyframe's value of it. */
          const channel = (values: number[]): Channel =>
            channelReader(knots, values, method);
          const allBoxes: ReturnType<typeof bbox>[] = [];
          const tracks: Track[] = rows.map((leaves) => {
            const stands = leaves.map((leaf, k) => placeLeaf(leaf, k));
            const boxes = stands.map((s) => {
              const [x, y] = s.dims;
              return bbox(x.min!, x.max!, y.min!, y.max!);
            });
            allBoxes.push(...boxes);
            const shapes = leaves.map((leaf) => leaf.type);
            const cx = boxes.map((b) => (b.minX + b.maxX) / 2);
            const cy = boxes.map((b) => (b.minY + b.maxY) / 2);
            // Every leaf the transition moves draws nothing of its own: the
            // moving mark is its drawing. Each lends that drawing to the
            // moving mark at lowering: a rigid leaf's is placed where the
            // playhead is, and a box leaf's gives the moving mark its paint.
            leaves.forEach((leaf) => leaf.INTERNAL_emitNothing());
            const origins = stands.map((s) => displayTranslate(s.transform));
            // A row of box shapes is interpolated as a box, morphing between
            // a rect and an ellipse where its shape changes. Any other row
            // moves rigidly, cross-fading where its drawing changes.
            if (!shapes.every((s) => BOX_SHAPES.has(s))) {
              return {
                kind: "rigid",
                leaves,
                origins,
                cx,
                cy,
                x: channel(cx),
                y: channel(cy),
              };
            }
            return {
              kind: "box",
              leaves,
              origins,
              shapes,
              x: channel(cx),
              y: channel(cy),
              w: channel(boxes.map(width)),
              h: channel(boxes.map(height)),
            };
          });
          const run: Run = {
            knots,
            tracks,
            slots: moved.map((marks) =>
              marks[0] === undefined ? undefined : updateSlotOf(marks[0])
            ),
          };

          // The box is the whole TRAJECTORY, not the point the mark is at:
          // the union of the keyframes' placed boxes, which is the room the
          // mark uses over its run. That is what makes the playhead paint-time
          // — nothing above this node can see it move — and it is the same box
          // a `line` through the same keyframes claims.
          const trajectory = unionAll(...allBoxes);

          return {
            intrinsicDims: [
              { min: trajectory.minX, size: width(trajectory) },
              { min: trajectory.minY, size: height(trajectory) },
            ],
            transform: { translate: [0, 0] },
            renderData: { run },
          };
        },
        lower: (
          { renderData, toPixel, local },
          _children,
          node
        ): DisplayList.DisplayItem[] => {
          const { run } = renderData as { run: Run };
          const unitScale = node.getRenderSession().scaleContext?.unit;
          const declaredStroke = resolveColorChannel(stroke, unitScale);

          // The run was measured in this node's local frame and axis order;
          // `local` places it, so the interpolated point lands where the
          // keyframes' own boxes were measured.
          const toLocalPixel = (p: [number, number]): [number, number] =>
            toPixel(local(p));

          const datum = node.datum;
          const role = roleFor(datum);

          /** A box leaf, lowered: its style resolved once per keyframe, so
           *  reading it at a playhead is an array index rather than a color
           *  computation. Each keyframe's style is the one its own drawing
           *  has, with what the transition's options say over it. */
          const declaredFill =
            fill === undefined
              ? undefined
              : resolveColorChannel(fill as MaybeValue<string>, unitScale);
          // A declared fill outlines the mark in the same paint unless a
          // stroke is declared too, as a mark's own fill does.
          const declared = lowerStyle({
            fill: declaredFill,
            stroke: declaredStroke ?? declaredFill,
            strokeWidth,
            opacity,
          });
          /** The drawing the leaf at keyframe `k` of a track lends, lowered
           *  once per leaf, under this node's scope, at the leaf's own origin.
           *  A leaf stands at several points of an unrolled run, and it is
           *  the same drawing at each. */
          const drawings = new Map<GoFishNode, DisplayList.DisplayItem[]>();
          const drawingAt = (track: Track, k: number) => {
            const leaf = track.leaves[k];
            let drawn = drawings.get(leaf);
            if (drawn === undefined) {
              drawn = leaf.INTERNAL_lendDrawing()(
                { translate: local(track.origins[k]) },
                toPixel
              );
              drawings.set(leaf, drawn);
            }
            return drawn;
          };

          const boxPainter = (
            track: Extract<Track, { kind: "box" }>
          ): Painter => {
            const { shapes } = track;
            const styles = track.leaves.map((_, k) => ({
              ...drawingAt(track, k)[0]?.style,
              ...declared,
            }));
            const single = shapes.every((s) => s === shapes[0]);
            /** Each keyframe's corner radii in pixels, for a run that morphs:
             *  an ellipse's are half its size, a rect's its own. */
            const radii = track.leaves.map((_, k) => {
              const item = drawingAt(track, k)[0] as
                | DisplayList.DisplayItem
                | undefined;
              if (item?.kind === "ellipse") return [item.rx, item.ry];
              if (item?.kind === "rect") return [item.rx ?? 0, item.ry ?? 0];
              return [0, 0];
            });
            /** The paint at a location: the source keyframe's, with fill and
             *  stroke mixed toward the next keyframe's while the run moves
             *  between two that differ (under `"step"` nothing moves, so
             *  nothing mixes). */
            const styleAt = (at: KnotLocation, source: number) => {
              const style = styles[source];
              const [a, b] = [styles[at.i], styles[at.i + 1]];
              if (method === "step" || b === undefined || at.u <= 0) {
                return style;
              }
              const mixed = { ...style };
              let changed = false;
              for (const key of ["fill", "stroke"] as const) {
                const [ca, cb] = [a[key], b[key]];
                if (
                  typeof ca === "string" &&
                  typeof cb === "string" &&
                  ca !== cb
                ) {
                  mixed[key] = mixColor(ca, cb, at.u);
                  changed = true;
                }
              }
              return changed ? mixed : style;
            };
            return (at, source) => {
              const x = track.x(at);
              const y = track.y(at);
              const bw = track.w(at);
              const bh = track.h(at);
              const style = styleAt(at, source);
              if (!single) {
                // A morph: one rect whose corners round from one keyframe's
                // radii to the next one's, never past half its size.
                const [ra, rb] = [radii[at.i], radii[at.i + 1] ?? radii[at.i]];
                const u = Math.max(0, Math.min(1, at.u));
                return [
                  {
                    ...rectItemFromBox(
                      x - bw / 2,
                      x + bw / 2,
                      y - bh / 2,
                      y + bh / 2,
                      toLocalPixel
                    ),
                    rx: Math.min(Math.abs(bw) / 2, ra[0] + (rb[0] - ra[0]) * u),
                    ry: Math.min(Math.abs(bh) / 2, ra[1] + (rb[1] - ra[1]) * u),
                    style,
                    datum,
                    role,
                  },
                ];
              }
              if (shapes[0] === "ellipse") {
                const [px, py] = toLocalPixel([x, y]);
                return [
                  {
                    kind: "ellipse",
                    cx: px,
                    cy: py,
                    rx: bw / 2,
                    ry: bh / 2,
                    style,
                    datum,
                    role,
                  },
                ];
              }
              return [
                {
                  ...rectItemFromBox(
                    x - bw / 2,
                    x + bw / 2,
                    y - bh / 2,
                    y + bh / 2,
                    toLocalPixel
                  ),
                  style,
                  datum,
                  role,
                },
              ];
            };
          };

          /** A rigid leaf, lowered: each keyframe's own drawing
           *  (`drawingAt`), with the pixel its box center sits on. At a
           *  playhead the source keyframe's items are moved by as much as the
           *  center moved, so the anchor keeps its place in the box; that is
           *  plain arithmetic the paint tier can do per frame. The painter
           *  keeps the items, not the keyframes' drawings. */
          const rigidPainter = (
            track: Extract<Track, { kind: "rigid" }>
          ): Painter => {
            const { cx, cy } = track;
            const drawn = track.leaves.map((_, k) => drawingAt(track, k));
            const centers = cx.map((x, k) => toLocalPixel([x, cy[k]]));
            // A drawing that changes between keyframes (a text's string, a
            // shape that is not a box) CROSS-FADES: every keyframe's own
            // drawing moves with the run, the two the playhead is between
            // weighted by where it is, the rest at 0. Every keyframe keeps
            // its items in every frame, so the paint tier patches a fixed
            // list.
            const signature = (items: DisplayList.DisplayItem[]) =>
              JSON.stringify(
                items.map((item) => [
                  item.kind,
                  (item as { text?: string }).text,
                  item.style?.fill,
                ])
              );
            const same = drawn.every(
              (items) => signature(items) === signature(drawn[0])
            );
            if (!same && method !== "step") {
              return (at) => {
                const [toX, toY] = toLocalPixel([track.x(at), track.y(at)]);
                const u = Math.max(0, Math.min(1, at.u));
                return drawn.flatMap((items, k) => {
                  const weight = k === at.i ? 1 - u : k === at.i + 1 ? u : 0;
                  const [fromX, fromY] = centers[k];
                  return items.map((item) =>
                    fadeItem(moveItem(item, toX - fromX, toY - fromY), weight)
                  );
                });
              };
            }
            return (at, source) => {
              const [fromX, fromY] = centers[source];
              const [toX, toY] = toLocalPixel([track.x(at), track.y(at)]);
              return drawn[source].map((item) =>
                moveItem(item, toX - fromX, toY - fromY)
              );
            };
          };

          const painters = run.tracks.map((track) =>
            track.kind === "box" ? boxPainter(track) : rigidPainter(track)
          );
          const knots = run.knots;
          /** The playhead as this key reads it: itself, unless an operator
           *  staggers the moves between keyframes, when each key moves in its
           *  own fitted slice of the stretch. */
          const warp = updateWarp(sequence, knots, run.slots, msPerUnit);

          /** The moving mark as it stands at one playhead: every leaf's items,
           *  in leaf order. Everything it needs was computed by layout or
           *  lowering, so the paint tier can call it per frame. */
          const build = (at: number): DisplayList.DisplayItem[] => {
            const phase = life(warp(at));
            const s = sampleRun(knots, phase.at, method, ease);
            const items = painters.flatMap((paint) => paint(s.at, s.source));
            // Every leaf fades together, box and text alike: they are one
            // mark entering or leaving.
            return phase.alpha === 1
              ? items
              : items.map((item) => fadeItem(item, phase.alpha));
          };

          // The playhead as it is NOW, not as it was when the node was built:
          // a clock that is only set when the chart renders (a `.relate()`
          // timeline's, which the render options hold) has moved since.
          const now = live ? readLive(readPlayhead) : t;
          const items = build(now);
          if (live) {
            // The paint tier's half of the split: one thunk per attribute of
            // each moving item, each re-reading the playhead in JSX attribute
            // position so Solid patches that attribute and nothing else. The
            // items are rebuilt at most once per distinct playhead value, and
            // the attributes then read their own field off them.
            const channels = items.map((item) => [
              ...[...GEOMETRY_CHANNELS].filter((field) => field in item),
              // A text's string comes from the source keyframe, like paint.
              ...(item.kind === "text" ? ["text"] : []),
              // Paint moves with the mark: which keyframe a run reads its
              // color off depends on where the playhead is.
              "fill",
              "stroke",
              // And so does presence: the mark fades in and out as it enters
              // and leaves the run.
              "opacity",
            ]);
            setLiveItems(items, channels, readPlayhead, build, {
              key: now,
              items,
            });
          }
          return items;
        },
      },
      children
    );
    return self;
  }
);
