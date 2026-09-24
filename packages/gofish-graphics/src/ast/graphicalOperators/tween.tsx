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
 * The operands are made invisible here, by the same structural rule `blank()`
 * uses (`INTERNAL_emitNothing`): once a transition is reading a run of
 * keyframes, the keyframes themselves are scaffolding. They keep their boxes,
 * their data and their anchoring role, and they contribute no display items
 * and no hit-test targets.
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
import {
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
import { GEOMETRY_CHANNELS, setLiveSlots } from "../../interaction/liveSlots";
import {
  interpolateAt,
  knotOrder,
  locate,
  sourceIndex,
  type InterpolationMethod,
} from "../../interpolate";
import { bbox, height, unionAll, width } from "../../util/bbox";
import { keyframeOf } from "../../timeWindow";
import { targetOf } from "./layer";

export type TweenOptions = {
  /** The playhead, in the time field's own units (a year, not a fraction).
   *  A signal (a `timer`, or anything that reads one) makes the mark move: it
   *  is read once as the node is built, for a value to lower, and then per
   *  frame in paint position. A plain number is a chart held still, and lowers to exactly the
   *  static item it would have lowered before. */
  at: (() => number) | number;
  /** Each operand's time value, in operand order. */
  knots: number[];
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
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  opacity?: number;
};

/** The leaves a transition can move, by how each one moves. A BOX shape's
 *  extent is one of its channels, so its whole box is interpolated. A TEXT's
 *  extent is the measure of its string, which is not something to blend, so
 *  it moves RIGIDLY: its position is interpolated and it keeps the source
 *  keyframe's own drawing (string, font, paint), the way a box leaf keeps the
 *  source keyframe's color. */
const BOX_SHAPES = new Set(["ellipse", "rect", "blank"]);
const RIGID_SHAPES = new Set(["text"]);

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
 * One leaf's run through the keyframes, in time order: everything about it
 * that layout decided. Reading it at a playhead is pure arithmetic over these
 * numbers, which is what lets the paint tier do it per frame.
 */
type Track =
  | {
      kind: "box";
      /** The shape every keyframe of the leaf is: the shape the moving leaf
       *  is. */
      shape: string;
      /** Each keyframe's placed box, per channel: center and extent on each
       *  axis, the four quantities a box leaf interpolates. */
      cx: number[];
      cy: number[];
      w: number[];
      h: number[];
      /** Each keyframe's own color channel, for the paint the leaf
       *  inherits. */
      colors: (MaybeValue<string> | undefined)[];
    }
  | {
      kind: "rigid";
      /** Each keyframe's box center, the point the leaf's drawing moves
       *  with. */
      cx: number[];
      cy: number[];
      /** Each keyframe's local origin (the point its anchor sits on), and
       *  its own drawing, taken over from the keyframe. */
      origins: [number, number][];
      draws: ((
        transform: Transform,
        toPixel: ToPixel
      ) => DisplayList.DisplayItem[])[];
    };

/** One track, lowered: the items its leaf draws when the run is read by `at`
 *  and its unblended attributes come from keyframe `source`. */
type Painter = (
  at: (values: number[]) => number,
  source: number
) => DisplayList.DisplayItem[];

/**
 * Where a run with these knots is read at `t`, and how opaque it is there —
 * the enter / update / exit reading of the stretch between the two
 * neighboring keyframes of `sequence` that `t` lies in (see the header).
 * `at` is the time to sample the run at: `t` itself while the mark moves, the
 * keyframe it is held at while it enters or exits. `alpha` multiplies the
 * mark's own opacity; it ramps over the stretch by the same (eased) parameter
 * the motion uses, and is 0 wherever the mark is absent.
 */
function lifecycle(
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

/** A display item with its opacity multiplied by `alpha`. */
function fadeItem(
  item: DisplayList.DisplayItem,
  alpha: number
): DisplayList.DisplayItem {
  const own = item.style?.opacity ?? 1;
  return { ...item, style: { ...item.style, opacity: own * alpha } };
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

/** The run a tween paints: the keyframes' time values and one track per
 *  matched leaf of the keyed mark. */
type Run = { knots: number[]; tracks: Track[] };

/**
 * Locate `t` in a run: a reader for any per-keyframe channel at `t`, and the
 * keyframe the attributes that are NOT blended come from.
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
function sampleRun(
  knots: number[],
  t: number,
  method: InterpolationMethod,
  ease: ((u: number) => number) | undefined
): { at: (values: number[]) => number; source: number } {
  const source = sourceIndex(knots, t, method);
  // Fewer than two keyframes leaves no segment to locate in; the channel
  // rule is `interpolateRun`'s (a lone keyframe holds, an empty run is NaN).
  if (knots.length < 2) {
    return {
      at: (values) => (knots.length === 0 ? NaN : values[0]),
      source,
    };
  }
  let loc = locate(knots, t);
  if (ease !== undefined && loc.u > 0 && loc.u < 1) {
    const { i, u } = loc;
    loc = locate(knots, knots[i] + ease(u) * (knots[i + 1] - knots[i]));
  }
  return { at: (values) => interpolateAt(knots, values, loc, method), source };
}

export const tween = createNodeOperator(
  (
    {
      at: playhead,
      knots,
      sequence,
      method,
      ease,
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
    const moves = typeof playhead === "function";
    const readPlayhead = moves ? playhead : () => playhead;

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
          const order = knotOrder(knots);
          const keyframes = order.map((i) => targetOf(children[i]));

          // A sequence that keeps history shows several of its keyframes at
          // once, and a transition takes the keyframes over to draw ONE mark
          // moving between them. What that mark should leave behind (a trail
          // of where it has been) is not decided, so the pair is an error
          // rather than a guess.
          const history = keyframes
            .map((k) => keyframeOf(k)?.sequence.history ?? 0)
            .find((h) => h > 0);
          if (history !== undefined) {
            throw new Error(
              `[gofish] time.transition(): the sequence it moves through keeps ` +
                `history (history: ${history}), so it shows several keyframes ` +
                `at once, and a transition draws one moving mark in place of ` +
                `them. What that mark should leave behind is not built yet. ` +
                `Drop \`history\` to animate the mark, or drop the transition ` +
                `and draw the past as a line({ along }) through the keyframes.`
            );
          }

          /** A leaf's placed box and local origin in this node's frame. The
           *  keyframe mark itself is its operand, already placed; any other
           *  leaf is read through a `ref` of the same kind, which is how an
           *  operand is read. */
          const placeLeaf = (leaf: GoFishNode, k: number): Placeable => {
            if (leaf === keyframes[k]) return placed[order[k]];
            const stand = new GoFishRef({ node: leaf });
            stand.parent = self;
            stand.resolveNames();
            return stand.layout(size);
          };

          // Match the keyed mark's leaves across the keyframes by structural
          // position. When every keyframe has the same leaves, each leaf gets
          // a run of its own. When they differ (a label present in one year
          // only), the leaves cannot be paired, and the mark falls back to one
          // run of the keyframe mark itself, its attachments left to the
          // keyframes (they hold and snap with them).
          const leafSets = keyframes.map((n) =>
            n instanceof GoFishNode ? markLeaves(n) : []
          );
          const shapesOf = (leaves: GoFishNode[]) =>
            leaves.map((l) => l.type).join("/");
          const matched =
            leafSets.length > 0 &&
            leafSets.every(
              (leaves) =>
                leaves.length > 0 &&
                shapesOf(leaves) === shapesOf(leafSets[0]) &&
                leaves.every(
                  (l) => BOX_SHAPES.has(l.type) || RIGID_SHAPES.has(l.type)
                )
            );
          const rows: GoFishNode[][] = matched
            ? leafSets[0].map((_, j) => leafSets.map((leaves) => leaves[j]))
            : [
                keyframes.filter(
                  (n): n is GoFishNode => n instanceof GoFishNode
                ),
              ];

          // Every leaf of a row is one mark moving, so the row is checked as
          // one: a shape the transition can move, the same for every
          // keyframe. Matched rows may be text, which moves rigidly; the
          // fallback row is the keyframe mark itself, so it must be a box.
          for (const row of rows) {
            const shapes = new Set(row.map((n) => n.type));
            for (const shape of shapes) {
              if (
                !BOX_SHAPES.has(shape) &&
                !(matched && RIGID_SHAPES.has(shape))
              ) {
                throw new Error(
                  `[gofish] time.transition(): cannot move a "${shape}" mark — a ` +
                    `transition paints its keyframes' own shape, and so far that ` +
                    `is ${[...BOX_SHAPES].join(" / ")}, or marks built of ` +
                    `those and text. Use one of those as the keyframe mark, ` +
                    `or open an issue for "${shape}".`
                );
              }
            }
            // ONE shape for the whole run, because the shape is a layout-time
            // fact like the rest of the run: the moving mark is a single
            // display item whose attributes the playhead patches, and no
            // attribute turns a circle into a rectangle. A run is one key's
            // marks from one mark factory, so this is homogeneous in practice;
            // saying so loudly beats painting whichever shape the playhead
            // happened to start on.
            if (shapes.size > 1) {
              throw new Error(
                `[gofish] time.transition(): a transition paints ONE shape for ` +
                  `the whole run, and these keyframes are ` +
                  `${[...shapes].join(" / ")}. Use the same mark for every ` +
                  `keyframe of a run.`
              );
            }
          }

          const allBoxes: ReturnType<typeof bbox>[] = [];
          const tracks: Track[] = rows.map((leaves) => {
            const stands = leaves.map((leaf, k) => placeLeaf(leaf, k));
            const boxes = stands.map((s) => {
              const [x, y] = s.dims;
              return bbox(x.min!, x.max!, y.min!, y.max!);
            });
            allBoxes.push(...boxes);
            const shape = leaves[0].type;
            const cx = boxes.map((b) => (b.minX + b.maxX) / 2);
            const cy = boxes.map((b) => (b.minY + b.maxY) / 2);
            // The keyframes are scaffolding once a transition reads them:
            // every leaf it moves stops drawing, and a rigid leaf hands its
            // drawing over to be placed where the playhead is.
            if (RIGID_SHAPES.has(shape)) {
              return {
                kind: "rigid",
                cx,
                cy,
                origins: stands.map((s) => displayTranslate(s.transform)),
                draws: leaves.map((leaf) => leaf.INTERNAL_takeOverLowering()),
              };
            }
            for (const leaf of leaves) leaf.INTERNAL_emitNothing();
            return {
              kind: "box",
              shape,
              cx,
              cy,
              w: boxes.map(width),
              h: boxes.map(height),
              colors: leaves.map((leaf) => leaf.color),
            };
          });
          const run: Run = { knots: order.map((i) => knots[i]), tracks };

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
          { transform, renderData, toPixel },
          _children,
          node
        ): DisplayList.DisplayItem[] => {
          const { run } = renderData as { run: Run };
          const unitScale = node.getRenderSession().scaleContext?.unit;
          const declaredStroke = resolveColorChannel(stroke, unitScale);

          // The same local-pixel map `connect` builds: the node's absolute
          // translate folded in, so the interpolated point lands where the
          // keyframes' own boxes were measured.
          const [tx, ty] = displayTranslate(transform);
          const toLocalPixel = ([px, py]: [number, number]): [number, number] =>
            toPixel([px + tx, py + ty]);

          const datum = node.datum;
          const role = roleFor(datum);

          /** A box leaf, lowered: its style resolved once per keyframe, so
           *  reading it at a playhead is an array index rather than a color
           *  computation. */
          const boxPainter = (
            track: Extract<Track, { kind: "box" }>
          ): Painter => {
            const { shape, cx, cy, w, h } = track;
            const styles = track.colors.map((keyframeColor) => {
              const resolvedFill =
                resolveColorChannel(
                  (fill ?? keyframeColor) as MaybeValue<string>,
                  unitScale
                ) ?? "black";
              return lowerStyle({
                fill: resolvedFill,
                stroke: declaredStroke ?? resolvedFill,
                strokeWidth: strokeWidth ?? 0,
                opacity: opacity ?? 1,
              });
            });
            return (at, source) => {
              const [x, y, bw, bh] = [cx, cy, w, h].map(at);
              const style = styles[source];
              if (shape === "ellipse") {
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

          /** A rigid leaf, lowered: each keyframe's own drawing lowered ONCE,
           *  here, under this node's scope, with the pixel its box center
           *  sits on. At a playhead the source keyframe's items are moved by
           *  as much as the center moved, so the anchor keeps its place in
           *  the box; that is plain arithmetic the paint tier can do per
           *  frame. The painter keeps the items, not the keyframes' drawings. */
          const rigidPainter = (
            track: Extract<Track, { kind: "rigid" }>
          ): Painter => {
            const { cx, cy } = track;
            const drawn = track.draws.map((draw, k) => {
              const [ox, oy] = track.origins[k];
              return draw({ translate: [tx + ox, ty + oy] }, toPixel);
            });
            const centers = cx.map((x, k) => toLocalPixel([x, cy[k]]));
            return (at, source) => {
              const [fromX, fromY] = centers[source];
              const [toX, toY] = toLocalPixel([at(cx), at(cy)]);
              return drawn[source].map((item) =>
                moveItem(item, toX - fromX, toY - fromY)
              );
            };
          };

          const painters = run.tracks.map((track) =>
            track.kind === "box" ? boxPainter(track) : rigidPainter(track)
          );
          const knots = run.knots;

          /** The moving mark as it stands at one playhead: every leaf's items,
           *  in leaf order. Everything it needs was computed by layout or
           *  lowering, so the paint tier can call it per frame. */
          const build = (at: number): DisplayList.DisplayItem[] => {
            const phase = life(at);
            const s = sampleRun(knots, phase.at, method, ease);
            const items = painters.flatMap((paint) => paint(s.at, s.source));
            // Every leaf fades together, box and text alike: they are one
            // mark entering or leaving.
            return phase.alpha === 1
              ? items
              : items.map((item) => fadeItem(item, phase.alpha));
          };

          const items = build(t);
          if (moves) {
            // The paint tier's half of the split: one thunk per attribute of
            // each moving item, each re-reading the playhead in JSX attribute
            // position so Solid patches that attribute and nothing else. The
            // items are rebuilt at most once per distinct playhead value, and
            // the attributes then read their own field off them.
            let cache = { at: t, items };
            const itemsAt = (): DisplayList.DisplayItem[] => {
              const now = readPlayhead();
              if (now !== cache.at) cache = { at: now, items: build(now) };
              return cache.items;
            };
            items.forEach((item, j) => {
              const current = () =>
                itemsAt()[j] as unknown as Record<string, any>;
              const slots: Record<string, () => unknown> = {};
              for (const field of GEOMETRY_CHANNELS) {
                if (!(field in item)) continue;
                slots[field] = () => current()?.[field];
              }
              // A text's string comes from the source keyframe, like paint.
              if (item.kind === "text") slots.text = () => current()?.text;
              // Paint moves with the mark: which keyframe a run reads its
              // color off depends on where the playhead is.
              slots.fill = () => current()?.style?.fill;
              slots.stroke = () => current()?.style?.stroke;
              // And so does presence: the mark fades in and out as it enters
              // and leaves the run.
              slots.opacity = () => current()?.style?.opacity;
              setLiveSlots(item, slots);
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
