// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// @wiki Overview — /internals/layout/passes
// @wiki Architecture Overview — /internals/overview/architecture
// </gofish-wiki>

import { createResource, Show, Suspense, type JSX } from "solid-js";
import { type ColorConfig, type GradientScale } from "./colorSchemes";
import { render as solidRender } from "solid-js/web";
import {
  debugInputSceneGraph,
  debugNodeTree,
  debugUnderlyingSpaceTree,
  GoFishNode,
  warnLayout,
  type RenderSession,
} from "./_node";
import type { GoFishAST } from "./_ast";
import { axisScale, pxOf, type AxisMap, type AxisScale } from "./domain";
import { lowerToDisplayList } from "./displayList/lower";
import { paintSVG } from "./displayList/paintSVG";
import type { InteractionRuntime } from "../interaction/runtime";
import { renderWithInteraction } from "../interaction/renderTerminal";
import { resolveMarkResult } from "./marks/markResult";
import type { Size } from "./dims";
import {
  continuousInterval,
  isCONTINUOUS,
  DEFAULT_AXIS_TICKS,
  type AxisTicks,
  type UnderlyingSpace,
} from "./underlyingSpace";
import { mapsDomain, type Extent } from "./extent";
import {
  fixedOverflow,
  inkOverflow,
  reportLayoutWarnings,
  type LayoutWarning,
} from "./layoutWarnings";
import { axisName } from "./constraints/shared";
import * as Monotonic from "../util/monotonic";
import { room } from "../util";
import { KeyedDomains } from "./keyedDomains";
import {
  fromFrameStart,
  orientScales,
  orientSide,
  yDirection,
} from "./axisDirection";
import { shadowCheckScaleRoot } from "./solver/shadow";
import {
  perfNow,
  perfAdd,
  perfBeginRun,
  perfEnabled,
  perfSetCount,
} from "./perf";
import {
  elaborateChrome,
  labelRowSettingsFromAngles,
  type LabelRowSettings,
} from "./axes/elaborate";
import { breadthFirst } from "./elaborationUtils";
import { layoutWithAutoLabelAngles } from "./axes/autoLabelAngle";
import { dumpKeyedDomains, dumpSharing } from "./debug/dump";
import {
  levelOptionsError,
  levelsFromOption,
  type LabelAlign,
  type LevelOption,
  type LevelOptions,
  type PerLevel,
} from "./axes/levels";
import { Frontend } from "gofish-ir";
import {
  getScopeRegistry,
  scopeFrame,
  seatInScope,
  sharesDeclaredMeasure,
  type EqualMeasureAxis,
  type ScopeSolution,
} from "./solver/scopes";
import { legendRing } from "./legends/elaborate";
import { elaborateLabels } from "./labels/elaborate";

export type CategoricalScale = {
  color: Map<any, string>;
  colorConfig?: ColorConfig;
  /** The data fields the scale maps from: the `field` each mark's color value
   *  was read from, when its color channel named one (see
   *  `DatumValueImpl.field`). A scale shared by several layers can
   *  map several fields. Empty or absent when every color came from a
   *  function accessor or a hand-made value. */
  fields?: Set<string>;
};

export type ContinuousScale = {
  domain: [number, number];
  scaleFactor: number;
};

/**
 * A continuous (gradient) color scale: a single `scaleFn` over the numeric
 * `domain`, built by `createGradientScale`. It is the source of truth for a
 * gradient color encoding — mark fills and the colorbar legend both read it,
 * rather than enumerating one swatch per distinct value (which is what
 * {@link CategoricalScale} does for palettes).
 */
export type ContinuousColorScale = {
  scaleFn: (value: number) => string;
  domain: [number, number];
  colorConfig: GradientScale;
  /** The data fields the scale maps from (see `CategoricalScale.fields`). */
  fields?: Set<string>;
  /**
   * Internal: set once the gradient domain has been resolved over the full
   * subtree (first writer wins), so deeper nodes don't recompute a narrower one.
   */
  resolved?: boolean;
};

export type Scale = CategoricalScale | ContinuousScale | ContinuousColorScale;

export type ScaleContext = {
  [measure: string]: Scale;
};

export const isCategoricalScale = (
  s: Scale | undefined
): s is CategoricalScale => s !== undefined && "color" in s;

export const isContinuousColorScale = (
  s: Scale | undefined
): s is ContinuousColorScale => s !== undefined && "scaleFn" in s;
/** Root data → layout-pixel maps, per axis (undefined where the root has no
 *  continuous position scale). */
export type PixelPosScales = [
  ((value: number) => number) | undefined,
  ((value: number) => number) | undefined,
];

export type AxesOptions = boolean | { x?: AxisOptions; y?: AxisOptions };
/** `side` (issue #143/#16): which frame edge the axis seats on — `"start"` (the
 *  start of the frame's axis order: the top of a y that reads top-down, the
 *  bottom of a continuous y, which grows upward) or `"end"` (the far side).
 *  Frame-relative, matching the start/end vocabulary of alignment/distribute.
 *  When OMITTED, a continuous/difference X-axis defaults to the visual BOTTOM
 *  (see `defaultAxisSide` in `axes/elaborate.tsx`); an explicit `side`
 *  overrides that with the literal frame-relative seating. */
export type AxisOptions =
  | boolean
  | {
      title?: string | false;
      side?: "start" | "end";
      /** How the axis's labels are drawn: their `angle` and `align`, each
       *  per level (see `AxisLabelOptions`). */
      label?: AxisLabelOptions;
      /** The levels of the axis: its bands of labels, by depth, nearest the
       *  plot first. Every axis on the dim has levels, nested ones counted
       *  from the inside out: a numeric axis has one (its ticks), a time
       *  axis two (the level-and-step its domain picks for about 10 ticks,
       *  and that level's parent: months, then years), and an ordinal axis
       *  one per split, plus one per `.bin(...)` of a chained key before the
       *  last (`.bin(Calendar.year).bin(Calendar.month)` gives a month level
       *  and a year level). Each entry sets the level at its depth:
       *
       *  - `true` keeps the level as inferred.
       *  - `false` hides it: its labels (and a time row's ticks) are not
       *    drawn and take no space.
       *  - a Calendar value names its cells: a time row's partition
       *    (`Calendar.week`), or, on an ordinal axis over cells of time, the
       *    cells that group its slots (`Calendar.year` over month slots):
       *    each slot falls in the cell that holds its start, so
       *    `Calendar.month` over week slots puts each week in the month it
       *    starts in. A Calendar value with `.format(fn)` relabels the
       *    level.
       *
       *  Depths the list does not reach stay as inferred. On the outermost
       *  axis of the dim, Calendar entries past its inferred levels add
       *  levels. An entry that cannot apply (a Calendar value over slots
       *  that are not times or finer than the slots, `false` on a numeric
       *  axis, an entry past the last level) is an error that lists the
       *  axis's levels. The other per-level options, `label.angle`,
       *  `label.align` and `divider`, use the same depths and the same
       *  rule: a plain value applies to every level where it can, and a
       *  list entry that cannot apply at its depth, or one past the last
       *  level, is this error. */
      levels?: LevelOption[];
      /** Whether each level of an ordinal axis draws dividers: a line in
       *  each gap where its runs break, through every level whose runs
       *  also break there. By default a level draws them when it partitions
       *  the value of the level inside it, that is, both bin the same
       *  column: the year level over a month level of one date
       *  (`field("date").bin(Calendar.year).bin(Calendar.month)`, or nested
       *  splits that bin `"date"`), a coarser `Calendar` entry of `levels`,
       *  numeric bins inside bins. Categories nested in other categories (a
       *  lake over its species) draw none, nor does the innermost level.
       *
       *  `true` turns a level's dividers on, `false` off. A continuous
       *  axis's level has ticks, not regions, so a plain value applies to
       *  every ordinal level of the axis and skips the continuous ones. An
       *  **array** is per level, by the depths of `levels`, nearest the
       *  plot first, with a depth past its end left as inferred
       *  (`[false, true]` divides only the second level); `true` at a
       *  continuous level's depth, or an entry past the last level, is an
       *  error (see `levels`). */
      divider?: boolean | boolean[];
    };

/** How one axis's labels are drawn (`axes.x.label`). */
export type AxisLabelOptions = {
  /** Rotate tick/category labels by this many degrees, clockwise on screen
   *  — matches Vega-Lite's `labelAngle` (e.g. `45` slants a label down to
   *  the right, `90` reads top-to-bottom).
   *
   *  **`"auto"`** picks the angle for you, separately for each label row
   *  (each level of the axis): the first of 0°, 45°, 90° at
   *  which no two labels in that row collide (at least 2px apart). A
   *  category row that collides at every angle is hidden and takes no
   *  space; a continuous tick row cannot be hidden and keeps the angle
   *  with the least overlap. So a grouped bar chart's crowded inner row
   *  can slant (or disappear) while its roomy outer row stays upright.
   *  Collisions are counted across the whole chart. The chart is
   *  laid out once per angle tried, so it must be rebuildable: a chart
   *  builder or a component thunk, not a prebuilt node (see
   *  axes/autoLabelAngle.ts). "auto" cannot be an entry of a per-level
   *  array.
   *
   *  A plain **number** applies to every level of the axis (e.g. both
   *  the city and year rows of a grouped bar chart). An **array** is per
   *  level, by the depths of `levels`, nearest the plot first — `[45]`
   *  rotates only the innermost level (e.g. the year row directly under
   *  grouped bars) and leaves outer levels (e.g. the city row)
   *  unrotated; `[45, 0]` is the explicit two-level form. A depth the
   *  array does not reach is unrotated, and an entry past the last level
   *  is an error (see `levels`). A numeric axis is one level, so in a
   *  faceted chart its ticks take the first entry and the facets' labels
   *  the next. A time axis does not rotate its labels yet, so a plain
   *  number skips its rows, and a nonzero entry at one of their depths is
   *  an error. */
  angle?: number | number[] | "auto";
  /** Where each level's labels sit along the axis: `"center"` centers a
   *  label under what it names, `"start"` puts it at the start of its
   *  run, just past the divider before it (the axis's first run starts
   *  at the axis start). By default an ordinal axis's outer level over
   *  ordered groups (cells of time, numeric bins, or a column the
   *  `schema` declares ordered) starts its runs, since each label marks
   *  where a run of ordered values begins, as a calendar's month labels
   *  do; an outer level over unordered categories centers, since its
   *  label collects the groups beneath it; and the innermost level, one
   *  label per slot, centers. A continuous axis's labels name points,
   *  so they center on their ticks.
   *
   *  A plain value applies to every level of the axis where it can: a
   *  plain `"start"` skips a continuous axis's levels. An **array** is
   *  per level, by the depths of `levels`, nearest the plot first, like
   *  `angle`'s; `true`, or a depth past the array's end, keeps the
   *  level's inferred alignment (`[true, "center"]` centers only the
   *  second level). `"start"` at a continuous level's depth, or an entry
   *  past the last level, is an error (see `levels`). */
  align?: LabelAlign | (LabelAlign | true)[];
};

/** One axis's options as read (see {@link readAxisOptions}). */
export type AxisRead = {
  side: "start" | "end" | undefined;
  /** `label.angle` as authored: a manual angle, or `"auto"`. */
  angle: PerLevel<number> | "auto";
  /** The per-level options; a `label.angle` of `"auto"` has no entry. */
  perLevel: LevelOptions;
};

/**
 * Each dim's axis options, AS AUTHORED: `undefined` wherever the caller did
 * not specify a field, so an elaboration can tell an explicit value apart
 * from the default (an explicit `side: "start"` vs. a continuous x-axis
 * defaulting to the bottom). Each options object is checked once, against
 * the IR's declared `AxisOptions` (`Frontend.checkOption`), so a JS caller
 * and a Python one get the same errors. The `levels` entries are read by
 * `levelsFromOption` instead: a JS entry may be a Calendar value with a
 * `.format(fn)`, which has no IR form.
 */
export function readAxisOptions(
  axes: AxesOptions | undefined
): [AxisRead, AxisRead] {
  const read = (o: AxisOptions | undefined, axis: "x" | "y"): AxisRead => {
    if (!o || typeof o !== "object")
      return { side: undefined, angle: undefined, perLevel: {} };
    const { levels, ...rest } = o;
    Frontend.checkOption("AxisOptions", rest, `axes.${axis}`);
    const angle = o.label?.angle;
    return {
      side: o.side,
      angle,
      perLevel: {
        levels: levels && levelsFromOption(levels, axis),
        "label.angle": angle === "auto" ? undefined : angle,
        "label.align": o.label?.align,
        divider: o.divider,
      },
    };
  };
  if (axes && typeof axes === "object")
    return [read(axes.x, "x"), read(axes.y, "y")];
  return [read(undefined, "x"), read(undefined, "y")];
}

/** The label-row settings a manual `label.angle` describes. "auto" has none of
 *  its own: `runLayout` chooses them and hands them to `layout()` directly. */
function manualLabelRowSettings(
  read: readonly [AxisRead, AxisRead]
): LabelRowSettings {
  if (read[0].angle === "auto" || read[1].angle === "auto") {
    throw new Error(
      'label.angle: "auto" must be resolved before layout(); render through ' +
        "gofish(), a chart builder, or runLayout()."
    );
  }
  return labelRowSettingsFromAngles([
    read[0].perLevel["label.angle"],
    read[1].perLevel["label.angle"],
  ]);
}

/**
 * What a chart's `axes` option decides on each dim: what its axis ticks at
 * ({@link AxisTicks}) on a dim it draws, and `false` on a dim it turns off.
 * `true` draws both and `false` turns both off. For an `{ x?, y? }` object a
 * dim is drawn unless it is explicitly `false`: specifying one axis does not
 * turn the other off. No option (a bare render that does not pass `axes`)
 * decides neither dim, so the charts inside it decide their own (#1170).
 * Each drawn dim ticks at about 10 ticks. A time axis adds its rows when it
 * is elaborated (`elaborationsFor`), since its levels depend on the axes
 * inside it.
 */
export const axesEnabled = (
  axes: AxesOptions | undefined
): Map<0 | 1, AxisTicks | false> => {
  const enabled = new Map<0 | 1, AxisTicks | false>();
  if (axes == null) return enabled;
  for (const dim of [0, 1] as const) {
    const on =
      axes === true ||
      (typeof axes === "object" && (dim === 0 ? axes.x : axes.y) !== false);
    enabled.set(dim, on ? DEFAULT_AXIS_TICKS : false);
  }
  return enabled;
};

// Fallback extent for an omitted `w`/`h` on a POSITION or data-driven SIZE axis,
// which needs a concrete canvas to scale data into (see the per-axis comment in
// `layout()` for the full behavior, including the shrink-to-fit case).
const DEFAULT_CANVAS_SIZE = 400;

export async function layout(
  {
    w,
    h,
    x,
    y,
    transform,
    debug = false,
    axes,
    legend = true,
    labelRowSettings,
  }: {
    w?: number;
    h?: number;
    x?: number;
    y?: number;
    transform?: { x?: number; y?: number };
    debug?: boolean;
    axes?: AxesOptions;
    legend?: boolean;
    /** Internal: how each axis label row is drawn, as chosen by
     *  `label.angle: "auto"` (see `runLayout`). Overrides the angles in `axes`. */
    labelRowSettings?: LabelRowSettings;
  },
  child: GoFishNode | Promise<GoFishNode>,
  contexts: {
    session: RenderSession;
  }
): Promise<{
  underlyingSpaceX: UnderlyingSpace;
  underlyingSpaceY: UnderlyingSpace;
  posScales: PixelPosScales;
  child: GoFishNode;
  width: number;
  height: number;
  legendFields: ReadonlySet<string>;
  warnings: LayoutWarning[];
}> {
  child = await child;
  child.setRenderSession(contexts.session);
  // Note: callers must await `document.fonts.ready` before invoking
  // `layout()`. The public `gofish()` entry handles this; standalone
  // callers of `layout()` are responsible for the wait themselves.

  if (debug) {
    console.log("🌳 Input Scene Graph:");
    debugInputSceneGraph(child);
  }

  const __tResolve = perfNow();
  child.resolveColorScale();
  child.resolveNames();
  // Resolve axis names (polar theta/r, geo lon/lat, …) BEFORE space inference
  // reads the dims: run each node's deferred axis-scope work (a mark's `dims`,
  // spread's `dir`, scatter's `dims`). Top-down + scope-bounded (see resolveAliases).
  await child.resolveAliases();
  child.resolveUnderlyingSpace();
  perfAdd("resolve", perfNow() - __tResolve);

  // Re-resolve after an elaboration pass rewrote `child`. The inserted nodes
  // need the session and name resolution (a `ref()` stand-in resolves its
  // target here, or layout throws "Selected node not found"), and because
  // `resolveUnderlyingSpace` memoizes while a rewrite moves keys onto fresh
  // wrappers, every cached space is cleared and recomputed from scratch. The
  // color scale is NOT re-resolved: it was final before chrome was elaborated
  // (the legend shows it), and chrome adds no data colors.
  const reresolve = async (n: GoFishNode) => {
    n.setRenderSession(contexts.session);
    n.resolveNames();
    // The inserted chrome is built from operators (Spread) whose constraints
    // install in this pass; nodes resolved before are consumed and untouched.
    await n.resolveAliases();
    n.clearUnderlyingSpace();
    n.resolveUnderlyingSpace();
  };
  // The measure-keyed domains (#1114): after the type walk, per space root,
  // axis and unit, the domain every sized node of that unit maps into its
  // size. Decided once, here, before chrome and labels are elaborated:
  // chrome only reads them. Axis ownership reads which keyed domain each
  // axis is over, and the demand half (an axis drawn over a domain is what
  // nices it) is refreshed once the axes are assigned.
  const keyedDomains = (contexts.session.keyedDomains =
    KeyedDomains.build(child));

  const __tAxes = perfNow();
  // Axis ownership: which node draws each axis (`resolveAxes`). The render
  // root is the outermost chart, and the render's `axes` (the outermost
  // chart's own option, unless the render gives one) applies there; every
  // chart below it applies its own (`GoFishNode._chartAxes`). Each drawn dim
  // ticks at about 10 ticks; a time axis stamps its rows on it when it is
  // elaborated (its levels, which depend on the axes inside it), before any
  // solve nices its domain to its inner row. The per-level options
  // (`levels`, `label`, `divider`) and `side` are read from the render's
  // `axes` only.
  const read = readAxisOptions(axes);
  const perLevel: [LevelOptions, LevelOptions] = [
    read[0].perLevel,
    read[1].perLevel,
  ];
  child.resolveAxes(new Map(), axesEnabled(axes));
  keyedDomains.refreshDemand();

  // Chrome elaboration (src/ast/axes/elaborate.tsx): every node that owns
  // chrome wraps itself in it, as ordinary shapes + constraints — its axes,
  // their titles, its legend. Each chart titles the axes it draws (with the
  // measure of the axis, so the outermost grouping names it) by its own
  // `axes` option, wherever it sits (#1170): the render's at the root, which
  // is the outermost chart's own unless the render gives one, and each
  // chart's own below it (`GoFishNode._chartAxes`). Its options are stamped
  // on it as its request. The root also carries the legend, because the
  // color scale is resolved once, from the root, for the whole render. The
  // legend is built here, from the root as it is laid out, before any
  // chrome wraps the nodes inside it. `legend: false` drops the legend; the
  // color scale still paints the marks.
  const unitScale = contexts.session.scaleContext.unit;
  const hasLegend =
    legend !== false &&
    ((isCategoricalScale(unitScale) && unitScale.color.size > 0) ||
      isContinuousColorScale(unitScale));
  child._chromeRequest = {
    legend: hasLegend
      ? await legendRing(
          unitScale as CategoricalScale | ContinuousColorScale,
          child
        )
      : undefined,
  };
  // A chart with a size of its own draws its axes around its content, its
  // frame's one child (`isAxisBoundary`), so the content carries the
  // request for their titles too; each node titles only the axes it draws.
  for (const n of [...breadthFirst(child)]) {
    if (n !== child && n._chartAxes === undefined) continue;
    const chartAxes = n === child ? axes : n._chartAxes;
    n._chromeRequest = { ...n._chromeRequest, axes: chartAxes };
    const content = n.children[0];
    if (n._chartBox?.some((sized) => sized) && content instanceof GoFishNode)
      content._chromeRequest = { axes: chartAxes };
  }
  const elaborated = await elaborateChrome(child, {
    sides: [read[0].side, read[1].side],
    labelSettings: labelRowSettings ?? manualLabelRowSettings(read),
    perLevel,
  });
  // Per-level entries that no level took are an error (see
  // `AxisOptions.levels`).
  const levelsErr = levelOptionsError(
    perLevel,
    [elaborated.fold.dims[0].names, elaborated.fold.dims[1].names],
    elaborated.fold.issues
  );
  if (levelsErr !== undefined) throw levelsErr;
  if (elaborated.changed) {
    child = elaborated.node;
    await reresolve(child);
  }

  // Label elaboration: turn every `.label(...)` spec into a real `Text` node +
  // constraints (src/ast/labels/elaborate.tsx), the same technique the chrome
  // pass above uses. Runs after chrome elaboration (a label may target a node
  // the chrome pass just wrapped).
  const labelRes = await elaborateLabels(child);
  if (labelRes.changed) {
    child = labelRes.node;
    await reresolve(child);
  }
  perfAdd("axes", perfNow() - __tAxes);

  // The render's σ-scope registry: the ONE place σ / posScale is derived
  // (Stage 6b). The root's claim walk below is where every node with a
  // literal size solves its scope (`solveFixed`); the root and every other
  // sized node (a slot, a coord boundary) solve through the same registry.
  const scopes = getScopeRegistry(contexts.session);

  if (debug) {
    console.log("🌳 Underlying Space Tree:");
    debugUnderlyingSpaceTree(child);
  }

  // Author each dim's `embedded` flag (point/line/area) now that underlying
  // space has resolved each coord axis's measure — Route B reads it to keep a
  // foreign-measure size flat. Runs on the final (axis/title/legend-elaborated)
  // tree, before layout/render consume the flag. See _node.resolveEmbedding.
  const __tEmbed = perfNow();
  child.resolveEmbedding();
  perfAdd("embed", perfNow() - __tEmbed);

  // Scene-graph size the solver actually sees (axis/title/legend already
  // elaborated). Whole walk guarded so the off path pays nothing.
  if (perfEnabled()) {
    const countNodes = (node: GoFishAST): number => {
      let n = 1;
      const kids = "children" in node ? node.children : [];
      for (const c of kids) n += countNodes(c);
      return n;
    };
    perfSetCount("nodes", countNodes(child));
  }

  // `render({ w, h })` is the whole graphic (#493, #1032): the canvas is the
  // slot the root is given, its chrome included. Chrome sits outside its
  // chart, so the root's content gets the slot less its chrome's gutters,
  // as every node does with the slot its parent gives it. Every chrome
  // shape claims its size, so the root's claim already holds its chrome
  // (`placeByClaims`), and the layout fits it to the slot.
  const root = child;
  // The layout of the root at the render's slot: solve its scopes, lay it
  // out, and place it on the canvas.
  // The render root maps the keyed domain of its types (#1114). Its types
  // and claims are widened to their keyed domains, then niced together
  // (#659) when some chart draws an axis over the domain (with axes off no
  // axis is drawn, so axis-less content stays at the honest raw scale).
  // Every root consumer below — the posScale, the baseline-magnitude size
  // solve, the equal-measure recentering, the root's size — reads this one
  // niced domain, the same domain the tick elaboration niced
  // (`KeyedDomains.scope`), so content and ticks agree by construction. A
  // claim that is only pixels (content of literal sizes) is left as it is.
  // The root's claim includes its chrome (each ring's claim is the hull of
  // what it wraps and of its shapes, `placeByClaims`), so a scope solved
  // against the slot leaves the chrome room.
  const rootExtent = root.resolveExtent();
  const rootScope = (axis: 0 | 1) => {
    const space = root._underlyingSpace![axis];
    return keyedDomains.scope(root, axis, space, rootExtent[axis]);
  };
  const [niceUnderlyingSpaceX, niceExtentX] = rootScope(0);
  const [niceUnderlyingSpaceY, niceExtentY] = rootScope(1);

  // The root's scope and size on each axis, computed once. Its σ is solved
  // against the render's slot on an axis the render gives one (the root is
  // then a sized node, #1114). On an axis with no render size the root
  // shrink-wraps its content: when the nodes with a literal size below map
  // its keyed domain, all at one σ (`ScopeRegistry.keyedSigma`), the root
  // maps it at that σ too, so the axis it draws agrees with the marks. Only
  // when none does (the common `chart(...).render(el, {})`), or they map it
  // at different σs (an over-constrained layout), is σ solved against the
  // default canvas. The root's size is its claim at its σ: the slot for a
  // root fitted to it, its own box for a claim that is only pixels (which is
  // the same at any σ, so 0 stands in). With no claim (a bar chart's
  // category axis, a bare fixed-size shape) it is the render's slot, or the
  // default canvas.
  const rootSpaces = [niceUnderlyingSpaceX, niceUnderlyingSpaceY] as const;
  const given = [w, h] as const;
  // A share (#493 piece 3: `sharesRoom`) is a part of a slot, so on an
  // axis the render gives no size there is none to share: the root lays
  // that axis out unsized, and a node with no size of its own keeps its
  // default size, as it does where nothing claims.
  const rootClaims = ([0, 1] as const).map((axis) =>
    given[axis] === undefined && root.sharesRoom(axis)
      ? undefined
      : [niceExtentX, niceExtentY][axis]
  ) as [Extent | undefined, Extent | undefined];
  const rootSizes = ([0, 1] as const).map((axis) => {
    const space = rootSpaces[axis];
    const claim = rootClaims[axis];
    const meta = { kind: "root", rootKey: "root", axis } as const;
    const key = mapsDomain(space, claim)
      ? keyedDomains.axisKey(root, axis, root._underlyingSpace![axis])
      : undefined;
    const keyed = key === undefined ? undefined : scopes.keyedSigma(key, axis);
    const allocated = given[axis] ?? DEFAULT_CANVAS_SIZE;
    // A root given a slot fits its claim to it. When no σ does, the
    // nodes with a literal size and their chrome are larger than the slot
    // (over-constrained, #1032): the root maps its domain at their σ, and
    // overflows the slot like any other fixed size. With no such nodes,
    // what is larger than the slot is pixels that do not scale (a text at
    // a literal position past the slot's end): the data fills the slot,
    // at the σ where the part of the claim that grows with σ, alone,
    // reaches it (as if the fixed parts took no room),
    // and the pixels overflow.
    // Fixed parts larger than the slot: no σ ≥ 0 fits (a numeric solve
    // of a claim with no pieces would settle at σ = 0), and the layout
    // warns (`layoutWarnings.ts`).
    const overfull =
      given[axis] !== undefined &&
      claim !== undefined &&
      claim.width.run(0) > allocated + 0.5;
    if (overfull) warnLayout(root, fixedOverflow(root, axis, allocated));
    const fitted =
      overfull || (given[axis] === undefined && keyed !== undefined)
        ? undefined
        : scopes.solveScope(meta, space, claim, allocated);
    const grows =
      claim === undefined ? undefined : Monotonic.rising(claim.width);
    const below =
      fitted !== undefined ? undefined : (keyed ?? grows?.inverse(allocated));
    const scope =
      below === undefined ? fitted : scopes.scopeAt(meta, space, claim, below);
    // A scope solved against the box fills it (a one-value domain's claim
    // is centered in it); one at a σ from below is its claim at that σ.
    const px =
      claim === undefined
        ? undefined
        : scope !== undefined
          ? below === undefined
            ? allocated
            : claim.width.run(scope.sigma)
          : Monotonic.isConstant(claim.width)
            ? claim.width.run(0)
            : undefined;
    return {
      scope,
      px:
        px !== undefined && Number.isFinite(px) && px > 0
          ? px
          : (given[axis] ?? DEFAULT_CANVAS_SIZE),
    };
  });
  // The size handed to `root.layout`: a claim that maps a domain
  // (`mapsDomain`) is data to scale into the root's size. Any other axis is
  // laid out *unsized*: a box of literal size keeps its pixels, marks keep
  // their default sizes, and the operator shrinks to fit. Unsized axes are
  // handed `UNSIZED` (NaN); marks treat a non-finite size as "use my
  // default" (e.g. rect's DEFAULT_RECT_SIZE) via their `Number.isFinite`
  // guards.
  const UNSIZED = NaN;
  const canvas = [
    given[0] ?? rootSizes[0].px,
    given[1] ?? rootSizes[1].px,
  ] as const;
  const layoutW =
    given[0] ??
    (mapsDomain(niceUnderlyingSpaceX, rootClaims[0]) ? canvas[0] : UNSIZED);
  const layoutH =
    given[1] ??
    (mapsDomain(niceUnderlyingSpaceY, rootClaims[1]) ? canvas[1] : UNSIZED);
  let rootScopes: Size<ScopeSolution | undefined> = [
    rootSizes[0].scope,
    rootSizes[1].scope,
  ];

  if (debug) {
    console.log("width and height constraints:", layoutW, layoutH);
  }

  // Shared-measure scale equality (#582): when x and y carry the SAME unit
  // of measure, "1 unit on x" and "1 unit on y" are the same quantity, so
  // their data→pixel scales must be equal — a circle stays circular, a 45°
  // line looks 45°. This is type equality, not an opt-in knob: it follows
  // from the measures matching, the same way `circle({ r })` lowers to a
  // `w`/`h` that share a measure and so cannot render as an ellipse. The
  // scope-level operation — take the binding (smaller) σ and equate both
  // axes' scopes — lives on the registry (Stage 6c: the ONE post-solve σ
  // adjustment, so every slope stays registry-sourced and the dump shows the
  // FINAL σ). Silently skipped when an axis has no solved scope to equate.
  //
  // Only a DECLARED unit counts (`sharesDeclaredMeasure`). A chart with a
  // size of its own recenters its own scopes the same way
  // (`ScopeRegistry.equalizeFixed`).
  if (sharesDeclaredMeasure(niceUnderlyingSpaceX, niceUnderlyingSpaceY)) {
    const axisInfo = ([0, 1] as const).map(
      (axis): EqualMeasureAxis | undefined => {
        const space = rootSpaces[axis];
        const scope = rootScopes[axis];
        return scope !== undefined && isCONTINUOUS(space)
          ? {
              space,
              claim: rootClaims[axis]!,
              canvas: canvas[axis],
              unitPx: scope.sigma,
            }
          : undefined;
      }
    ) as [EqualMeasureAxis | undefined, EqualMeasureAxis | undefined];
    rootScopes = scopes.recenterEqualMeasure("root", axisInfo) ?? rootScopes;
  }
  const rootScaleFactors: Size<number | undefined> = [
    rootScopes[0]?.sigma,
    rootScopes[1]?.sigma,
  ];

  // Solver shadow (#39): the ROOT σ-scope — the SIZE frame equation
  // content(σ)=canvas the whole chart resolves against. No-op unless
  // GOFISH_SOLVER_CHECK is set.
  shadowCheckScaleRoot(rootClaims[0], canvas[0], rootScaleFactors[0], 0);
  shadowCheckScaleRoot(rootClaims[1], canvas[1], rootScaleFactors[1], 1);

  // The root content sits in the root scope's frame by the one seating
  // rule (`seatInScope`): a pinned content shares the frame and places its
  // data through its map; a free content's baseline is placed at
  // `originPx` below (`placeRoot`) and it gets a frame of its own whose 0
  // is that baseline. Who applies the pixel of data 0 is inherent to the
  // two origin states: a pinned extent's position is fixed by its data, a
  // free extent's is set by its parent.
  const rootSeats = ([0, 1] as const).map((axis) =>
    seatInScope(scopeFrame(rootScopes[axis]), rootSpaces[axis])
  );
  const rootMaps: Size<AxisMap | undefined> = [
    rootSeats[0].childMap,
    rootSeats[1].childMap,
  ];

  // Merge the two half-channels into the single per-axis scale carrier
  // handed to layout: σ (size slope) from `rootScaleFactors`, the anchored
  // map from `rootMaps`.
  const rootScales: Size<AxisScale | undefined> = [
    axisScale(rootScaleFactors[0], rootMaps[0]),
    axisScale(rootScaleFactors[1], rootMaps[1]),
  ];

  // The root scales are solved in the root's own axis order; the canvas
  // hands them down in pixels, so a root whose y grows upward receives them
  // reflected (and `layout()` reads them back in its own order). The root's
  // order is its frame's: the chrome rings seat what they wrap at their own
  // origin and only add chrome around it.
  const rootYDirection = yDirection(root.chrome?.withAxes ?? root);
  const __tSolve = perfNow();
  root.layout([layoutW, layoutH], orientScales(rootScales, 1, rootYDirection));
  perfAdd("solve", perfNow() - __tSolve);
  // Scope dump (#39 Stage 6b): every σ-scope solved during the layout pass
  // just above, as printable frame equations. No-op unless
  // GOFISH_DUMP_SCOPES is set.
  scopes.dump();
  dumpKeyedDomains(keyedDomains);
  // Sharing dump (#1114 step 3): every layer's sharing sets, from its
  // constraints and children. No-op unless GOFISH_DUMP_SHARING is set.
  dumpSharing(root);

  // Root placement. The canvas is a frame on each axis whose start edge is
  // `edge` pixels in: 0, or on an axis the render gives no size, the
  // root's ink before its box (see below). The root's
  // axis order starts at the frame's start edge: the left on
  // x, the top for a y that reads top-down, and the BOTTOM for a continuous
  // y, which grows upward from there (`fromFrameStart`). A position `p`
  // along the root's axis order is the pixel `p` from that edge, inward.
  //
  // Where a scope solved against the render's slot places the root's data
  // (a given dimension that maps a domain with a data 0), the root is
  // seated by the one seating rule (`seatInScope`): a free
  // (baseline-magnitude) root's baseline at the scope's `originPx` (#773:
  // `descent·σ` from the frame's start edge, plus any overhead, the
  // chrome's start gutter included), and a pinned root at 0. The frame is
  // the root's own size (`rootSizes`), so a root that does not fill the
  // slot sits at its top-left rather than at its bottom.
  //
  // Anywhere else no data places the root, so its box is placed: its start
  // edge at the frame's start, at the top-left for either y direction
  // (#1032). That is a shrink-to-fit dimension, whose box is the canvas,
  // a given dimension whose σ is a share (`sharesRoom`, a category axis
  // whose bands the slot sizes), a given dimension whose scope has no
  // data 0 (a spread of magnitudes, whose rows may reach past its origin
  // on either side), and a given dimension the root does not map a domain
  // into (a chart with a size of its own), whose box sits at the slot's
  // top-left. The box is the whole graphic, its chrome included. The pin
  // uses `pinAnchor`, not the write-once `place()`, so it lands even when
  // the root self-placed (a diagram with its own root transform). Returns
  // whether data seated the root.
  const placeRoot = (axis: 0 | 1, edge: number): boolean => {
    const name = axisName(axis);
    const offset = (axis === 0 ? x : y) ?? transform?.[name] ?? 0;
    const direction = axis === 0 ? 1 : rootYDirection;
    if (
      given[axis] !== undefined &&
      rootScopes[axis]?.originPx !== undefined &&
      !root.sharesRoom(axis)
    ) {
      root.place(
        name,
        edge +
          fromFrameStart(
            offset + rootSeats[axis].seatPx,
            rootSizes[axis].px,
            direction
          ),
        "baseline"
      );
      return true;
    }
    root.pinAnchor(
      name,
      edge + fromFrameStart(offset, root.dims[axis].size ?? 0, direction),
      orientSide("min", direction)
    );
    return false;
  };
  const seated = [placeRoot(0, 0), placeRoot(1, 0)];

  // What the root draws past its box (#493: layout size is separate from
  // drawn size), in pixels before and after it on each axis: the shapes
  // that are ink (`placeByClaims`), whose place only layout knows, and the
  // outlines drawn past the shapes' boxes (`GoFishNode.strokeOverhang`). On
  // an axis the render gives no size, the canvas grows to hold it: the SVG
  // is the root's box plus what it draws past it, and the box sits past
  // what it draws before it.
  //
  // On an axis the render gives a size, the outlines of the shapes that
  // take room are in the root's claim, which was fitted to the canvas, so a
  // box no data seats sits past the outlines before it, as far as the
  // outlines after it still fit (a shape that fills the canvas has its
  // outline centered on the canvas edge, and keeps its box there). The ink
  // is not
  // fitted inside the canvas, and it overflows it. A label placed beside a
  // node takes room wherever the claim walk knows where the node lands
  // (`placementIn`), bands of a category axis included (#493 piece 3:
  // `sharesRoom`), so the ink left is what the claim walk cannot place:
  // inside a coordinate space, under a node with a size of its own or one
  // that reads y the other way, a label centered on a run of several slots,
  // and a band in a scope that mixes data and bands.
  const drawn = drawnOverflow(root);
  const ink = drawn.ink;
  for (const axis of [0, 1] as const)
    if (given[axis] === undefined) placeRoot(axis, ink[axis][0]);
    else if (!seated[axis]) {
      const [before, after] = drawn.outline[axis];
      const room = given[axis]! - (root.dims[axis].size ?? 0) - after;
      placeRoot(axis, Math.max(0, Math.min(before, room)));
    }
  // What the graphic draws past a canvas the render gives a size, for any
  // reason but fixed parts larger than their slot (warned above): warn.
  for (const axis of [0, 1] as const) {
    const size = given[axis];
    const { min, max } = root.dims[axis];
    if (size === undefined || min === undefined || max === undefined) continue;
    const name = axisName(axis);
    const fixed = contexts.session.warnings?.some(
      (w) => w.kind === "fixed-overflow" && w.axis === name
    );
    if (fixed) continue;
    const lo = min - ink[axis][0];
    const hi = max + ink[axis][1];
    warnLayout(
      root,
      inkOverflow(
        axis,
        [lo, hi],
        size,
        -lo >= hi - size ? drawn.farthest[axis][0] : drawn.farthest[axis][1]
      )
    );
  }

  // The root data → layout-pixel maps the interaction layer converts
  // through: a position along the root's axis order, from the root's
  // placed origin.
  const posScales = [0, 1].map((axis) => {
    const map = rootScales[axis]?.map;
    if (map === undefined) return undefined;
    const origin = root.projectedTranslate(axis as 0 | 1) ?? 0;
    const direction = axis === 0 ? 1 : rootYDirection;
    return (v: number) => origin + direction * pxOf(map, v);
  }) as PixelPosScales;

  // The SVG is the render's size, exactly (#493): the root, its chrome
  // included, was fitted to it. A dimension the render does not give is the
  // root's whole box, its chrome included, plus its ink.
  const svgDim = (axis: 0 | 1, given: number | undefined): number => {
    if (given !== undefined) return given;
    const s = root.dims[axis]?.size;
    return (
      (s !== undefined && Number.isFinite(s) ? s : DEFAULT_CANVAS_SIZE) +
      ink[axis][0] +
      ink[axis][1]
    );
  };

  if (debug) {
    console.log("🌳 Node Tree:");
    debugNodeTree(root);
  }

  return {
    underlyingSpaceX: niceUnderlyingSpaceX,
    underlyingSpaceY: niceUnderlyingSpaceY,
    posScales,
    child: root,
    width: svgDim(0, w),
    height: svgDim(1, h),
    // The fields a rendered legend shows: the color scale's fields when the
    // legend was drawn, none when it was suppressed or had nothing to show.
    legendFields: hasLegend
      ? new Set(
          (unitScale as { fields?: Set<string> } | undefined)?.fields ?? []
        )
      : new Set<string>(),
    warnings: contexts.session.warnings ?? [],
  };
}

type Span = [number, number];

/**
 * How far what `root` draws reaches past its box, in pixels before and after
 * it on each axis, in the canvas's pixel order. A node's box holds what it
 * draws, except a layer's ink children (`placeByClaims`), which its box
 * leaves out, and a shape's outline, drawn past its box by its
 * `strokeOverhang`: the drawing is the hull of the root's box, of the box of
 * every ink child below it on the axes it is ink on, and of the box of every
 * node grown by its outline. A coordinate space's interior is in its own
 * coordinates, and its box stands for it, outlines included (`coord`); a
 * node that clips its content to its box (`GoFishNode.clipsToBox`) draws
 * nothing past it.
 *
 * `outline` is the part of it the root's claim holds: the outlines of the
 * nodes that take room, ink left out.
 */
function drawnOverflow(root: GoFishNode): {
  ink: [Span, Span];
  outline: [Span, Span];
  /** Per axis, the ink child that reaches farthest before and after. */
  farthest: [
    [GoFishNode | undefined, GoFishNode | undefined],
    [GoFishNode | undefined, GoFishNode | undefined],
  ];
} {
  const farthest: [
    [GoFishNode | undefined, GoFishNode | undefined],
    [GoFishNode | undefined, GoFishNode | undefined],
  ] = [
    [undefined, undefined],
    [undefined, undefined],
  ];
  // No layer found ink children, and no shape draws an outline: the drawing
  // is the root's box.
  const session = root.tryGetRenderSession();
  if (!session?.inkLayers?.size && !session?.outlined)
    return {
      ink: [
        [0, 0],
        [0, 0],
      ],
      outline: [
        [0, 0],
        [0, 0],
      ],
      farthest,
    };
  const box = (n: GoFishNode, axis: 0 | 1): Span | undefined => {
    const { min, max } = n.dims[axis];
    return min !== undefined &&
      max !== undefined &&
      Number.isFinite(min) &&
      Number.isFinite(max)
      ? [min, max]
      : undefined;
  };
  // The hull of everything drawn (`all`), and of what takes room (`held`).
  const hull = () => ({ lo: [Infinity, Infinity], hi: [-Infinity, -Infinity] });
  const all = hull();
  const held = hull();
  const add = (
    h: ReturnType<typeof hull>,
    n: GoFishNode,
    axis: 0 | 1,
    offset: number,
    ink: boolean
  ) => {
    const b = box(n, axis);
    if (b === undefined) return;
    const o = n.strokeOverhang;
    const [min, max] = [b[0] + offset - o, b[1] + offset + o];
    if (ink && min < h.lo[axis]) farthest[axis][0] = n;
    if (ink && max > h.hi[axis]) farthest[axis][1] = n;
    h.lo[axis] = Math.min(h.lo[axis], min);
    h.hi[axis] = Math.max(h.hi[axis], max);
  };
  for (const axis of [0, 1] as const) {
    add(all, root, axis, 0, false);
    add(held, root, axis, 0, false);
  }
  // Ink is looked for only where the claim walk recorded some (`inkLayers`).
  const inkLayer = (session?.inkLayers?.size ?? 0) > 0;
  const visit = (
    n: GoFishNode,
    offset: [number, number],
    inInk: [boolean, boolean]
  ) => {
    if (n.type === "coord" || n.clipsToBox) return;
    const inner: [number, number] = [
      offset[0] + (n.projectedTranslate(0) ?? 0),
      offset[1] + (n.projectedTranslate(1) ?? 0),
    ];
    n.children.forEach((c, i) => {
      if (!(c instanceof GoFishNode)) return;
      const isInk = ([0, 1] as const).map(
        (axis) => inkLayer && n.claimWalk?.ink[axis].has(i) === true
      ) as [boolean, boolean];
      const ink = ([0, 1] as const).map(
        (axis) => inInk[axis] || isInk[axis]
      ) as [boolean, boolean];
      for (const axis of [0, 1] as const) {
        if (isInk[axis]) add(all, c, axis, inner[axis], true);
        else if (c.strokeOverhang > 0) {
          add(all, c, axis, inner[axis], false);
          if (!ink[axis]) add(held, c, axis, inner[axis], false);
        }
      }
      visit(c, inner, ink);
    });
  };
  visit(root, [0, 0], [false, false]);
  const past = (h: ReturnType<typeof hull>) =>
    ([0, 1] as const).map((axis): Span => {
      const { min, max } = root.dims[axis];
      if (min === undefined || max === undefined || !(h.lo[axis] <= h.hi[axis]))
        return [0, 0];
      return [room(min - h.lo[axis]), room(h.hi[axis] - max)];
    }) as [Span, Span];
  return { ink: past(all), outline: past(held), farthest };
}

/* top-level pass handler */

/** Options shared by every render terminal (`render`, `toSVG`, …). */
export type GoFishRenderOptions = {
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  transform?: { x?: number; y?: number };
  debug?: boolean;
  defs?: JSX.Element[];
  axes?: AxesOptions;
  /** Whether to elaborate the color-scale legend (swatch column / colorbar).
   *  Default true; `false` suppresses it. See `ChartOptions.legend`. */
  legend?: boolean;
  colorConfig?: ColorConfig;
  /**
   * Interaction runtime (see src/interaction/). When present, the render pass
   * publishes each lowered frame to it, emits `data-gf-id` hit-test hooks, and
   * attaches its delegated event listeners to the produced <svg>. Absent (the
   * static path), rendering is byte-identical to before.
   */
  interaction?: InteractionRuntime;
};

/** Extra options for the SVG-export terminals (`toSVG` / `toSVGElement` / `save`). */
export type GoFishExportOptions = GoFishRenderOptions & {
  /** Background fill painted behind the chart. `null`/omitted = transparent. */
  background?: string | null;
};

type LayoutData = {
  underlyingSpaceX: UnderlyingSpace;
  underlyingSpaceY: UnderlyingSpace;
  /** Root data → layout-pixel maps (see `PixelPosScales`). */
  posScales: PixelPosScales;
  child: GoFishNode;
  /** The SVG's size: the render's `w`/`h`, or the laid-out graphic's. */
  width: number;
  height: number;
  /** The data fields the rendered legend shows (empty without a legend). */
  legendFields: ReadonlySet<string>;
  /** What layout found and drew through anyway (`layoutWarnings.ts`). */
  warnings: LayoutWarning[];
};

/**
 * Run the domain-inference + layout passes for `child` and return the
 * measured layout data. The single place the pipeline is driven — shared by
 * the live `gofish()` render path and the `gofishToSVG*` export paths.
 *
 * An axis with `label.angle: "auto"` is the one case that lays out more than
 * once: the chart is rebuilt and laid out once per candidate angle, and the
 * winning run's layout is returned as is (see axes/autoLabelAngle.ts). A chart
 * without "auto" takes the single `layoutOnce` below, unchanged.
 */
export async function runLayout(
  options: GoFishRenderOptions,
  child: GoFishNode | Promise<GoFishNode>
): Promise<LayoutData> {
  const read = readAxisOptions(options.axes);
  if (read[0].angle !== "auto" && read[1].angle !== "auto")
    return layoutOnce(options, child);
  return layoutWithAutoLabelAngles(options, child, read, layoutOnce);
}

/** One pass of the pipeline over `child`, which it lays out in place. */
async function layoutOnce(
  options: GoFishRenderOptions,
  child: GoFishNode | Promise<GoFishNode>,
  labelRowSettings?: LabelRowSettings
): Promise<LayoutData> {
  const {
    w,
    h,
    x,
    y,
    transform,
    debug = false,
    axes,
    legend = true,
    colorConfig,
  } = options;
  // Seed the unit color scale by config kind. A gradient is a continuous
  // color scale (its `scaleFn`/`domain` are finalized in resolveColorScale
  // once the data domain is known); anything else is categorical. A
  // node-local gradient `colorConfig` (set by ChartBuilder) upgrades the
  // categorical seed in place during resolveColorScale.
  const session: RenderSession = {
    tokenContext: new Map(),
    scaleContext: {
      unit:
        colorConfig?._tag === "gradient"
          ? {
              scaleFn: () => "#cccccc",
              domain: [0, 1] as [number, number],
              colorConfig,
            }
          : { color: new Map(), colorConfig },
    },
  };
  // Reset the per-pass accumulator at the start of every render so the bench
  // harness reads a clean slate (the `lower`/`paint` passes land later, during
  // SolidJS's reactive render — see perf.ts). No-op when instrumentation is off.
  perfBeginRun();
  try {
    const contexts = { session };

    // Text mark bbox measurements (via canvas measureText in
    // text.tsx) depend on resolved font metrics. If a webfont is
    // still loading when layout runs, measurement uses fallback
    // metrics, baking the wrong positions into the SVG.
    // FontFaceSet.ready resolves once all CSS-declared @font-face
    // loads are done. System-fallback resolution (e.g. "Andale Mono"
    // → fontconfig monospace on Linux) bypasses this entirely, so
    // this isn't a full guarantee — but it's a strict improvement
    // for any consumer using <link>-loaded webfonts.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      const __tFonts = perfNow();
      await document.fonts.ready;
      perfAdd("fonts", perfNow() - __tFonts);
    }

    return await layout(
      {
        w,
        h,
        x,
        y,
        transform,
        debug,
        axes,
        legend,
        labelRowSettings,
      },
      child,
      contexts
    );
  } finally {
    if (debug) {
      console.log("scaleContext", session.scaleContext);
      console.log("tokenContext", session.tokenContext);
    }
  }
}

/** Continuous data domain of an axis's underlying space, for interaction
 *  anchors (clamping, selectors). Undefined for ordinal / difference / bare
 *  magnitude axes. */
const continuousDomain = (
  us?: UnderlyingSpace
): [number, number] | undefined => {
  const iv = us && continuousInterval(us);
  return iv ? [iv.min, iv.max] : undefined;
};

/** Build the `<svg>` JSX element from already-computed layout data. */
function renderLayout(
  data: LayoutData,
  defs?: JSX.Element[],
  interaction?: InteractionRuntime
): JSX.Element {
  return render(
    {
      width: data.width,
      height: data.height,
      defs,
      interaction,
      // Root data → layout-pixel maps for the interaction layer's data↔px
      // conversions (frameConversions).
      posScales: data.posScales,
      domains: {
        x: continuousDomain(data.underlyingSpaceX),
        y: continuousDomain(data.underlyingSpaceY),
      },
    },
    data.child
  );
}

/** What `gofish()` stashes on a container it rendered into: the chart's
 *  current Solid root teardown, and its interaction runtime when it has one.
 *  One object per CHART, not per paint: a re-render of the same chart (same
 *  runtime) swaps `disposeRoot` in place, so a {@link View} recognizes its own
 *  chart by this object's identity across re-renders. */
type ChartState = {
  disposeRoot: () => void;
  runtime?: InteractionRuntime;
  /** The latest layout's warnings, and every one printed so far, so a
   *  re-render prints each problem once. */
  warnings: LayoutWarning[];
  warned: Set<string>;
};
type ChartHost = HTMLElement & { __gofishState?: ChartState };

/**
 * The handle `render` returns for a chart mounted in the page. `unmount()`
 * removes the chart's DOM and detaches it from every input it read, so a
 * `timer()` it was the last reader of stops ticking. It is idempotent, and it
 * never touches a NEWER chart that has since been rendered into the same
 * container.
 */
export interface View {
  /** The element the chart was rendered into. */
  readonly container: HTMLElement;
  /**
   * What the latest layout of the chart found and drew through anyway
   * (#493): fixed parts larger than their slot, a drawing past the canvas.
   * Each is also printed once with `console.warn`, prefixed
   * `[gofish:layout]`. Empty until the chart is laid out, and replaced on
   * each re-render.
   */
  readonly warnings: readonly LayoutWarning[];
  /** Tear the chart down: its DOM, its Solid root, its interaction runtime. */
  unmount(): void;
}

/** Tear down the chart `gofish()` rendered into `container`, if any: its Solid
 *  root and its interaction runtime. A no-op on an element no chart rendered
 *  into. Internal: `View.unmount` is the public form, and a host that holds
 *  only the DOM (the story harness) calls this directly. See "Frame
 *  publication" in the Rendering essay. */
export function disposeChart(container: HTMLElement): void {
  const host = container as ChartHost;
  const state = host.__gofishState;
  if (!state) return;
  host.__gofishState = undefined;
  state.disposeRoot();
  state.runtime?.dispose();
}

/** The {@link View} of the chart whose state is `state`. It unmounts only while
 *  that chart still owns `container`: a newer chart there has its own state. */
const viewOf = (container: HTMLElement, state: ChartState): View => ({
  container,
  get warnings() {
    return state.warnings;
  },
  unmount() {
    if ((container as ChartHost).__gofishState === state)
      disposeChart(container);
  },
});

/** A chart child `gofish()` renders synchronously: a node or a promise of one
 *  (the layout awaits it inside the mounted root). */
type GoFishChild = GoFishNode | Promise<GoFishNode>;

/**
 * Render `child` into `container`. A node renders synchronously and returns its
 * {@link View}; a component thunk (`() => node`) first resolves under the
 * interaction runtime, so it returns a `Promise<View>`.
 */
export function gofish(
  container: HTMLElement,
  options: GoFishRenderOptions,
  child: GoFishChild
): View;
export function gofish(
  container: HTMLElement,
  options: GoFishRenderOptions,
  child: () => GoFishChild
): Promise<View>;
export function gofish(
  container: HTMLElement,
  options: GoFishRenderOptions,
  child: GoFishChild | (() => GoFishChild)
): View | Promise<View>;
export function gofish(
  container: HTMLElement,
  options: GoFishRenderOptions,
  child: GoFishChild | (() => GoFishChild)
): View | Promise<View> {
  // Component thunk (`() => node`): a raw shape/operator composition — no
  // `chart()` builder, no data binding — that we give the full reactive
  // treatment. A raw node is built once and can't re-evaluate its spec, so
  // component-level PIPELINE reactivity (a `signal()`/`wheel()` read outside
  // `live()`) needs a thunk the scheduler can re-invoke; and a `pointer()` read
  // in a `live()` needs the runtime installed for `data-gf-id` hit-testing. Both
  // fall out of routing the thunk through the same terminal the chart builders
  // use — a fresh InteractionRuntime, resolve under the ambient context, thread
  // the runtime only if something registered. A PLAIN node keeps today's exact
  // static behavior below (a `live()` channel on a plain node still patches at
  // paint — that's runtime-independent — it just gets no runtime/hit-testing).
  //
  // A function child is a thunk or a mark (`layer([...])` is one), and both
  // reify the way a combinator child does: `resolveMarkResult` calls it with
  // the empty list `[]` (a root has no rows; a thunk ignores it) and reifies
  // whatever it returns.
  if (typeof child === "function") {
    const build = () => resolveMarkResult(child as any);
    return renderWithInteraction(async () => {
      const node = await build();
      // A thunk can build the chart again, which `label.angle: "auto"` needs
      // (see `GoFishNode.rebuild`).
      node.rebuild = build;
      return { node, options: { ...options } };
    }, container);
  }

  const stateHost = container as ChartHost;

  // Re-rendering into the same container must always dispose the previous Solid
  // root, or roots and DOM accumulate. TWO cases enter here with a prior state:
  //  1. A Tier-2 re-render of the SAME chart (the interaction scheduler, per
  //     spec change) — SAME runtime. Dispose only the old Solid root and keep
  //     the chart's state: the runtime is reused and must survive (disposing
  //     it would clear its rerenderFn/inputs and kill interactivity after one
  //     frame), and the chart's View must still recognize the chart as its own.
  //  2. A DIFFERENT chart taking over this container — dispose the old chart
  //     entirely, Solid root AND runtime, so an input it read (e.g. a timer)
  //     stops invalidating a dead chart whose container is now someone else's.
  const prev = stateHost.__gofishState;
  let state: ChartState;
  if (prev?.runtime !== undefined && prev.runtime === options.interaction) {
    prev.disposeRoot();
    state = prev;
  } else {
    disposeChart(container);
    state = {
      disposeRoot: () => {},
      runtime: options.interaction,
      warnings: [],
      warned: new Set(),
    };
  }

  const [layoutData] = createResource(() =>
    runLayout(options, child).then((data) => {
      state.warnings = data.warnings;
      reportLayoutWarnings(data.warnings, state.warned);
      return data;
    })
  );

  const dispose = solidRender(() => {
    // Suspense covers the async layout resource (derived data resolves in it).
    return (
      <Suspense fallback={<div>Loading...</div>}>
        {(() => {
          const data = layoutData();
          if (!data) return null;
          return renderLayout(data, options.defs, options.interaction);
        })()}
      </Suspense>
    );
  }, container);
  state.disposeRoot = () => {
    dispose();
    container.innerHTML = "";
  };
  stateHost.__gofishState = state;
  return viewOf(container, state);
}

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/**
 * Serialize an `<svg>` element to a standalone SVG markup string suitable for
 * writing to a `.svg` file: ensures the SVG/xlink namespaces and a `viewBox`
 * are present, and optionally paints a background rect. Works on a clone, so
 * the passed element is left untouched.
 */
export function serializeSVG(
  svg: SVGSVGElement,
  opts?: { background?: string | null }
): string {
  const el = svg.cloneNode(true) as SVGSVGElement;

  el.setAttribute("xmlns", SVG_NS);
  if (!el.getAttribute("xmlns:xlink")) el.setAttribute("xmlns:xlink", XLINK_NS);

  // viewBox so the SVG scales when a consumer overrides width/height.
  const width = el.getAttribute("width");
  const height = el.getAttribute("height");
  if (!el.getAttribute("viewBox") && width && height) {
    el.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  const background = opts?.background;
  if (background) {
    const rect = el.ownerDocument.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    rect.setAttribute("fill", background);
    el.insertBefore(rect, el.firstChild);
  }

  const markup = new XMLSerializer().serializeToString(el);
  return markup.startsWith("<?xml")
    ? markup
    : `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

/**
 * Produce a detached `<svg>` element for `child` by running the same
 * layout + render pipeline as `gofish()`, but mounting into a throwaway
 * container and returning a clone of the resulting SVG.
 *
 * Requires a DOM (browser or notebook front-end). In Node this throws —
 * headless rendering is tracked in #577.
 */
export async function gofishToSVGElement(
  options: GoFishExportOptions,
  child: GoFishNode | Promise<GoFishNode>
): Promise<SVGSVGElement> {
  if (typeof document === "undefined") {
    throw new Error(
      "toSVG requires a DOM (browser or notebook front-end). " +
        "Headless Node rendering is tracked in #577."
    );
  }
  const data = await runLayout(options, child);
  reportLayoutWarnings(data.warnings);
  const root = document.createElement("div");
  // Layout is already awaited, so the SVG mounts synchronously — no Suspense.
  const dispose = solidRender(() => renderLayout(data, options.defs), root);
  const svg = root.querySelector("svg");
  if (!svg) {
    dispose();
    throw new Error("toSVG: no <svg> element was produced by the render pass");
  }
  // Clone before disposing the reactive root so disposal can't strip it.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  dispose();
  return clone;
}

/** Produce a standalone SVG markup string for `child`. See {@link gofishToSVGElement}. */
export async function gofishToSVG(
  options: GoFishExportOptions,
  child: GoFishNode | Promise<GoFishNode>
): Promise<string> {
  return serializeSVG(await gofishToSVGElement(options, child), options);
}

/**
 * Write or download an SVG string to `filename`. Format is inferred from the
 * extension (only `.svg` today; PNG/HTML tracked in #578). In a browser this
 * triggers a download; in Node it writes the file.
 */
export async function saveSVGString(
  svg: string,
  filename: string
): Promise<void> {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  if (ext !== ".svg") {
    throw new Error(
      `save(): only ".svg" is supported today (got "${ext || filename}"). ` +
        "PNG and HTML export are tracked in #578."
    );
  }

  // Browser: trigger a download via a temporary anchor + object URL.
  if (
    typeof document !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  ) {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  // Node: write to disk. Dynamic import keeps `fs` out of the browser bundle;
  // the indirect specifier stops the bundler/TS from resolving it at build time.
  const fsModule = "node:fs/promises";
  const { writeFile } = (await import(/* @vite-ignore */ fsModule)) as {
    writeFile: (path: string, data: string, encoding: string) => Promise<void>;
  };
  await writeFile(filename, svg, "utf-8");
}

/** Layout + serialize + save for `child`. See {@link saveSVGString}. */
export async function gofishSave(
  filename: string,
  options: GoFishExportOptions,
  child: GoFishNode | Promise<GoFishNode>
): Promise<void> {
  await saveSVGString(await gofishToSVG(options, child), filename);
}

export const render = (
  {
    width,
    height,
    transform,
    defs,
    interaction,
    posScales,
    domains,
  }: {
    width: number;
    height: number;
    transform?: string;
    defs?: JSX.Element[];
    interaction?: InteractionRuntime;
    posScales?: PixelPosScales;
    domains?: { x?: [number, number]; y?: [number, number] };
  },
  child: GoFishNode
): JSX.Element => {
  const interactive = interaction !== undefined;
  const paintBaked = () => {
    const __tLower = perfNow();
    const items = lowerToDisplayList(child);
    perfAdd("lower", perfNow() - __tLower);
    perfSetCount("displayItems", items.length);
    // Publish the frame (id-keyed hit-test map + data-space conversions) before
    // paint so the first hit-test / dataPos reads see the current frame.
    // Layout geometry is already placed on the canvas, so a layout point is
    // its screen point.
    interaction?.publishFrame({
      items,
      toPixel: (p) => p,
      posScales,
      domains,
      size: { width, height },
    });
    const __tPaint = perfNow();
    const painted = items.map((item) => paintSVG(item, interactive));
    perfAdd("paint", perfNow() - __tPaint);
    return painted;
  };
  return (
    <svg
      ref={(el: SVGSVGElement) => interaction?.attachSVG(el)}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
    >
      <Show when={defs}>
        <defs>{defs}</defs>
      </Show>
      {paintBaked()}
    </svg>
  );
};
