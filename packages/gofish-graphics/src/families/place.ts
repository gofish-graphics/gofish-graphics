// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

/**
 * The `Place` family: where a label goes on the mark it labels, the values
 * of `.label()`'s `position` option beside today's position strings
 * (`"outset-top"`, `"center"`, ...).
 *
 * `lib.ts` binds this module as `Place` (`Place.along({ at: 0.6 })`), and
 * `gofish-graphics/place` exports the same module. A strategy is a plain
 * object, `{ kind, ...params }`. No strategy has a required option, so each
 * is a value as it is, and calling it sets options: `Place.end` is
 * `Place.end()` (#1133, `ast/strategyKind.ts`).
 *
 * Each strategy reads one kind of geometry from the labeled mark's outline
 * (`ast/geometry/outline.ts`) and proposes candidate spots in order. The
 * labels of one `.label()` call then take, in data order, their first spot
 * that does not cover the labeled marks, a label already placed, or a node
 * in `avoiding`; a label with no free spot is hidden. The placement itself
 * is in `ast/labels/`.
 */
import { bareKind, given } from "../ast/strategyKind";

/** A screen direction from a mark: the four sides and the four corners. */
export type Direction =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left"
  | "right"
  | "left"
  | "top"
  | "bottom";

/** Which side of a region's boundary a label sits on. */
export type BoundarySide = "outset" | "inset";

/**
 * Which side of an outline a label sits on. `"on"` straddles the outline.
 * On an open path, `"above"` and `"below"` are the screen's (a stretch
 * steeper than about 75° has neither, so it gives no spot), and `"left"`
 * and `"right"` are the path's own, of its direction of travel. On a closed
 * outline, `"inset"` and `"outset"` are inside and outside.
 */
export type Side =
  | "on"
  | "above"
  | "below"
  | "left"
  | "right"
  | "inset"
  | "outset";

/** A box's edges, named by axis in the mark's own frame (`y-max` is the
 *  top of a bar on a continuous y). */
export type Part = "x-min" | "x-max" | "y-min" | "y-max";

/** Where along an outline: a fraction of its length (the label is centered
 *  there), its start, middle or end (the label's start or end is flush with
 *  the path's), or one of the mark's parts (the label stays within it). */
export type At = number | "start" | "middle" | "end" | Part;

/** How a label along an outline is turned: level, or turned to the chord of
 *  the outline across the label's width. */
export type Orient = "horizontal" | "sloped";

/** `around()`: at the outline's extreme point in each direction. See
 *  {@link around}. */
export type AroundPlace = {
  kind: "around";
  directions?: Direction[];
  side?: BoundarySide | BoundarySide[];
  offset?: number;
};

/** `along()`: on an outline. See {@link along}. */
export type AlongPlace = {
  kind: "along";
  at?: At;
  side?: Side | Side[];
  orient?: Orient;
  offset?: number;
};

/** `start()`: past the first point of an open path. See {@link start}. */
export type StartPlace = { kind: "start"; offset?: number };

/** `end()`: past the last point of an open path. See {@link end}. */
export type EndPlace = { kind: "end"; offset?: number };

/** `interior()`: inside a region. See {@link interior}. */
export type InteriorPlace = { kind: "interior" };

/** Every placement strategy: a value of `.label()`'s `position`. */
export type Place =
  | AroundPlace
  | AlongPlace
  | StartPlace
  | EndPlace
  | InteriorPlace;

/**
 * Around a mark, by screen direction: each candidate sits at the point of
 * the mark's outline that is farthest in one direction (on a circle, on the
 * circle itself, not its box), just outside it. On an outline with several
 * such points (the two arm tips of a C facing right), the one nearest the
 * middle of that side of the box wins, then the upper one. The default for
 * a dot.
 *
 * @param directions The directions to try, in order. Default: top-right,
 *   top-left, bottom-right, bottom-left, right, left, top, bottom (Imhof's
 *   order for point labels).
 * @param side `"outset"` (default) or `"inset"`, or a list tried in order at
 *   each direction: a bar's value goes above it, or inside its top when there
 *   is no room above, with
 *   `Place.around({ directions: ["top"], side: ["outset", "inset"] })`.
 * @param offset Pixels between the outline and the label. Default: the
 *   label's `offset`, or 3.
 */
export const around = bareKind(
  "Place.around",
  (opts: Omit<AroundPlace, "kind"> = {}): AroundPlace => ({
    kind: "around",
    ...given(opts),
  })
);

/**
 * Along an outline: an open path (a line, an arrow) or a region's boundary.
 * Candidates start at `at` and slide along the outline, nearest first; at
 * each spot every side in `side` is tried before sliding on.
 *
 * @param at A fraction of the outline's length, 0 to 1 (the label is
 *   centered there); `"start"` or `"end"` (the label's start or end is flush
 *   with the path's, so it stays on the path); `"middle"` (default); or one
 *   of the mark's parts, `"x-min"`, `"x-max"`, `"y-min"`, `"y-max"` on a box
 *   (the label stays within the part, or is hidden).
 * @param side `"on"` (default), `"above"`, `"below"`, `"left"` or `"right"`
 *   on an open path; `"on"`, `"inset"` or `"outset"` on a closed one; or a
 *   list tried in order.
 * @param orient `"horizontal"` (default), or `"sloped"`: turned to the chord
 *   of the outline across the label's width and kept upright. A sloped label
 *   skips a spot where the outline bends away from the chord by more than
 *   about a third of the text's height, so it suits smooth lines.
 * @param offset Pixels between the outline and a label beside it. Default:
 *   the label's `offset`, or 3.
 */
export const along = bareKind(
  "Place.along",
  (opts: Omit<AlongPlace, "kind"> = {}): AlongPlace => ({
    kind: "along",
    ...given(opts),
  })
);

/**
 * Just before the first point of an open path, level: on a line chart,
 * left of where each series starts. Labels of one `.label()` that would
 * cover each other slide apart vertically; none is hidden.
 *
 * @param offset Pixels between the path's start and the label. Default: the
 *   label's `offset`, or 4.
 */
export const start = bareKind(
  "Place.start",
  (opts: Omit<StartPlace, "kind"> = {}): StartPlace => ({
    kind: "start",
    ...given(opts),
  })
);

/**
 * Just past the last point of an open path, level: on a line chart, right
 * of where each series ends. Labels of one `.label()` that would cover each
 * other slide apart vertically; none is hidden. The default for a line and
 * an arrow.
 *
 * @param offset Pixels between the path's end and the label. Default: the
 *   label's `offset`, or 4.
 */
export const end = bareKind(
  "Place.end",
  (opts: Omit<EndPlace, "kind"> = {}): EndPlace => ({
    kind: "end",
    ...given(opts),
  })
);

/**
 * Inside a region, where the label's own box can grow largest: the middle
 * of a streamgraph band where it is thickest, or the middle of the widest
 * arm of an L. The label is hidden when its box does not fit at its font
 * size. The default for a band (`ribbon`, `area`) and a `polygon`.
 */
export const interior = bareKind(
  "Place.interior",
  (opts: Omit<InteriorPlace, "kind"> = {}): InteriorPlace => ({
    kind: "interior",
    ...given(opts),
  })
);
