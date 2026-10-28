// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// @wiki Axes — /internals/frontend/axes
// @wiki Color Scale Resolution — /internals/layout/color-scales
// @wiki Overview — /internals/layout/passes
// @wiki Architecture Overview — /internals/overview/architecture
// </gofish-wiki>

// Type-only (erased) so no runtime cycle with solver/scopes.ts, which imports
// RenderSession from here.
import type { ScopeRegistry } from "./solver/scopes";
import type { SplitBy } from "./datumProjection";
import {
  Anchor,
  Dimensions,
  Direction,
  displayTranslate,
  elaborateDims,
  elaborateDirection,
  elaborateSize,
  elaborateTransform,
  FancyDims,
  FancyDirection,
  FancySize,
  FancyTransform,
  combineDims,
  localAnchorOf,
  localAnchorPoint,
  anchorDetermined,
  translateForAnchor,
  Size,
  Transform,
  axisScopeFor,
  BASE_AXIS_SCOPE,
  type AxisScope,
  type SpaceDeclaration,
  type AxisScopeHook,
} from "./dims";
import {
  axesEnabled,
  gofish,
  gofishToSVGElement,
  gofishToSVG,
  gofishSave,
} from "./gofish";
import type { GoFishExportOptions, GoFishRenderOptions } from "./gofish";
import { toDisplayList } from "./displayList/toDisplayList";
import type { DisplayList } from "gofish-ir";
import { setLiveSlots } from "../interaction/liveSlots";
import { readLive, sharedDecision } from "../interaction/live";
import type { LiveValue } from "../interaction/live";
import type { AnimationRule } from "../animation/paint";
import { GoFishRef } from "./_ref";
import { GoFishAST } from "./_ast";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import {
  getValue,
  getValueField,
  getValueFieldType,
  isValue,
  MaybeValue,
  baseEmbedded,
  sameValueUnit,
} from "./data";
import { color6 } from "../color";
import { hasUnits, Units, withUnits } from "./measure";
import { orderByLevels, type HasLevels } from "./schema";
import {
  isCONTINUOUS,
  isORDINAL,
  isUNDEFINED,
  UnderlyingSpace,
  axisOver,
  placeBaseline,
  MeasureClash,
  DEFAULT_AXIS_TICKS,
  type AxisTicks,
} from "./underlyingSpace";
import { impliedExtents, Extent, padExtent } from "./extent";
import * as Pwl from "./solver/pwl";
import type {
  BoxForm,
  ClaimPlacement,
  Placement,
} from "./constraints/claimPlacement";
import { toJSON } from "../util/interval";
import type { AxisScale } from "./domain";
import { envFlag } from "../util";
import type { AxesOptions, AxisOptions, ScaleContext } from "./gofish";
import type { LabelRow } from "./axes/elaborate";
import type { ChromeRing } from "./elaborationUtils";
import type { TokenContext } from "./tokenContext";
import {
  CANVAS_FRAME,
  orientDims,
  orientScales,
  orientTransform,
  orientView,
  yDirection,
  yFrameIn,
  type YFrame,
} from "./axisDirection";
import { isToken, Token } from "./createName";
import type { ConstraintSpec } from "./constraints";
import { childRole, type SharingPlan } from "./constraints/compose";
import type { KeyedDomains } from "./keyedDomains";
import type { LayoutWarning } from "./layoutWarnings";
import { relateEnv, resolveConstraintOperands } from "./constraints";
import { applyRelationalZBelowDefaults } from "./constraints/relationalPaint";
import {
  computeRelateSchedule,
  resolveRelateClauses,
  type RelateFn,
  type RelateSchedule,
} from "./constraints/relate";
import {
  BBox,
  type BBoxKey,
  type BBoxConflict,
  type BBoxValue,
} from "./constraints/bbox";
import {
  assignPaletteColor,
  createGradientScale,
  type ColorConfig,
} from "./colorSchemes";
import {
  type LabelAccessor,
  type LabelOptions,
  type LabelSpec,
} from "./labels/labelPlacement";
import type { HiddenLabels } from "./labels/placeStep";
import type { Place } from "../families/place";
import type { LabelPosition } from "./labels/labelPlacement";
import { withKindValues } from "./strategyKind";
import { packEnclose } from "d3-hierarchy";
import type { KeyCell } from "./cells";
import {
  boxOfDims,
  boxOutline,
  enclosingCircle,
  reflectRegionY,
  translateCircle,
  type Geometry,
  type Outline,
  type Region,
} from "./geometry";

export type RenderSession = {
  tokenContext: TokenContext;
  scaleContext: ScaleContext;
  /** The render's union-find of unknown units (measure.ts): the unit
   *  variable of each quantity and what it is bound to, for the whole
   *  figure. Created on first use by the type walk
   *  (`resolveUnderlyingSpace`). */
  units?: Units;
  /** Set by the lower emit driver (`lowerToDisplayList`) for the duration of a
   *  lowering walk: the map from layout pixels to canvas pixels (the gutter
   *  offset) every `lower` body uses. */
  toPixel?: ToPixel;
  /** The σ-scope registry: the one place σ / posScale is derived,
   *  shared by every scope root in this render. Created on first use
   *  (`getScopeRegistry`). */
  scopes?: ScopeRegistry;
  /** The render's measure-keyed domains (#1114, `keyedDomains.ts`): per
   *  space root, axis and unit, the domain every sized node of that unit
   *  maps into its size, and whether an axis is drawn over it. Built once
   *  by `layout`, after the type walk and before chrome and labels are
   *  elaborated; the rewrites read it and never rebuild it. Its demand half
   *  is refreshed once the axes are assigned. */
  keyedDomains?: KeyedDomains;
  /** Labels the label chooser hid in this render, per `.label()` call, for
   *  the one note the render prints (`labels/placeStep.ts`). */
  hiddenLabels?: HiddenLabels;
  /** What layout found and drew through anyway (`layoutWarnings.ts`):
   *  fixed parts larger than their slot, a drawing past the canvas. */
  warnings?: LayoutWarning[];
  /** The layers whose claim walk found ink children (`ClaimWalk.ink`), so
   *  the render looks for what is drawn past the root's box only where
   *  there is some (`drawnOverflow` in gofish.tsx). */
  inkLayers?: Set<GoFishNode>;
  /** Whether a node laid out draws an outline past its box
   *  (`GoFishNode.strokeOverhang`), so the render looks for it too. */
  outlined?: boolean;
};

/** How far an outline of `stroke` color and `strokeWidth` is drawn past the
 *  geometry it strokes, on every side: half its width, for a stroke centered
 *  on the edge, or 0 where none is drawn (no width, or the color `"none"`).
 *  A shape passes it as its `strokeOverhang`. */
export const outlineOverhang = (
  stroke: unknown,
  strokeWidth: unknown
): number =>
  typeof strokeWidth === "number" &&
  strokeWidth > 0 &&
  stroke !== "none" &&
  stroke !== "transparent"
    ? strokeWidth / 2
    : 0;

/** Record `warning` (if any) on the render of `node`. */
export const warnLayout = (
  node: GoFishNode,
  warning: LayoutWarning | undefined
): void => {
  if (warning === undefined) return;
  const session = node.tryGetRenderSession();
  if (session === undefined) return;
  const list = (session.warnings ??= []);
  if (!list.some((w) => w.message === warning.message)) list.push(warning);
};

/** The claim walk's memos of a node (`GoFishNode._claimMemo`), cleared with
 *  its claims. */
type ClaimMemo = {
  /** Per axis, {@link GoFishNode.carriesData}. */
  carriesData: [boolean | undefined, boolean | undefined];
  /** Per axis, {@link GoFishNode.sharesRoom}. */
  sharesRoom: [boolean | undefined, boolean | undefined];
  /** Per axis, whether the node fills the room it is given
   *  ({@link GoFishNode.fillsRoom}); set with its claim. */
  fills?: [boolean, boolean];
  /** A layer's {@link ClaimWalk.childBoxes}, per axis; `"busy"` while they
   *  are computed (a ref inside the layer that reads the layer itself). */
  childBoxes: [
    Map<number, BoxForm> | "busy" | undefined,
    Map<number, BoxForm> | "busy" | undefined,
  ];
};

const freshClaimMemo = (): ClaimMemo => ({
  carriesData: [undefined, undefined],
  sharesRoom: [undefined, undefined],
  childBoxes: [undefined, undefined],
});

/** What the claim walk reads of a layer (`GoFishNode.claimWalk`). */
export type ClaimWalk = {
  /** Per axis, the indices of its children that are ink there
   *  (`placeByClaims`), which its claim and box leave out. */
  ink: [Set<number>, Set<number>];
  /** Per axis, the indices of its children that are dressing there
   *  (`placeByClaims`): they take room, but are no part of its plot. */
  dressing: [Set<number>, Set<number>];
  /** Per axis, where the claim walk places each of its children in its
   *  frame (`placeByClaims`), for a node deep inside it that a ref or a
   *  label reads (`placementIn`). */
  childBoxes: (axis: 0 | 1) => Map<number, BoxForm> | undefined;
  /** Its constraints' operands, resolved. */
  operands: () => Map<
    string,
    { node: GoFishAST; child: number; direct: boolean }
  >;
  /** Per axis, the literal pixel its own start places it at in its parent
   *  (undefined for none: its parent places it). */
  literalStart: [number | undefined, number | undefined];
  /** How it seats its children, read by the placement walk through it
   *  (`placementIn`): a child's index, its name as a direct operand, and per
   *  axis the constraints that act on it there, by child index. */
  seating: () => {
    indexOf: (child: GoFishAST) => number;
    operandName: Map<number, string>;
    acting: [Map<number, ConstraintSpec[]>, Map<number, ConstraintSpec[]>];
  };
  /** Per axis, whether it has a size of its own there, which makes it a
   *  σ-scope of its own. */
  ownScope: [boolean, boolean];
  /** Where its constraints place its children in the claim walk, for the
   *  children's claims `extents` on `axis` (see `placeByClaims`). A chart
   *  reads its rings' through it, around a plot that fills its room
   *  (`ringsAround` in chromeGutters.ts). */
  placeChildren: (
    axis: 0 | 1,
    extents: Size<Extent | undefined>[]
  ) => ClaimPlacement;
};

export type Placeable = {
  dims: Dimensions;
  /** The node's shape in its LOCAL layout frame (see {@link GeometryFn}).
   *  Available only after layout. */
  geometry: () => Geometry;
  /** Placement state; `translate[i] === undefined` means "parent may place
   *  me". Exposed so the `baseline` align anchor can read a target's origin. */
  transform?: Transform;
  /** The node's origin (`baseline`) as a ledger projection — `transform.translate`
   *  where written, else derived from the ledger. The `baseline`
   *  align anchor reads this so it survives retiring the translate writes; `ref`
   *  stand-ins omit it (they keep a computed `transform`). */
  projectedTranslate?: (dir: Direction) => number | undefined;
  /** Coordinate of one box anchor in the node's local frame. Placement solving
   *  uses this to express every anchor as `absoluteMin + constant`, including
   *  `baseline` for asymmetric boxes such as text and negative bars. */
  localAnchor?: (axis: FancyDirection, anchor: Anchor) => number | undefined;
  /** Where its plot lies in its local frame, when that is not its whole box
   *  (see `GoFishNode.localPlotSpan`). A chain lays its parts by it. */
  localPlotSpan?: (axis: 0 | 1) => [number, number] | undefined;
  place: (axis: FancyDirection, value: number, anchor?: Anchor) => void;
  /** Write an axis extent from owned bbox keys (the size-setting primitive
   *  — `span` and an authoritative `position` pin go through it). Optional
   *  because not every placeable shape implements it (a `ref` stand-in doesn't);
   *  it is only ever invoked on real `GoFishNode` constraint targets. */
  setExtent?: (
    axis: FancyDirection,
    owned: Partial<Record<BBoxKey, number>>,
    owner?: string
  ) => void;
  /** Authoritative override pin: land `anchor` at `value`, rebuilding the
   *  ledger when the axis already self-placed (the write-once `place()` can't).
   *  Handles `baseline` too, so a scatter override never bypasses the ledger.
   *  Optional for the same reason as `setExtent` (a `ref` stand-in omits it). */
  pinAnchor?: (axis: FancyDirection, value: number, anchor: Anchor) => void;
  /** Write ONLY this axis's size, leaving position untouched (#726, align
   *  `"size"`) — the genuinely rank-1 sibling of `setExtent`'s rank-2 write
   *  (which requires ≥2 keys and refuses a lone `size`, since that alone
   *  can't determine a position; here that's the point). Optional for the
   *  same reason as `setExtent`/`pinAnchor`. */
  setSizeOnly?: (axis: FancyDirection, size: number, owner?: string) => void;
  /** This target's resolved {@link UnderlyingSpace} on `dir`, when known — the
   *  unbound-target test for align `"span"`/`"size"` (#726): `isUNDEFINED` on
   *  this means the target has no intrinsic size/position on that axis (a bare
   *  `rect({})`), so the size cell is free for the constraint to own. Optional
   *  for the same reason as the other constraint write hooks. */
  spaceOn?: (dir: Direction) => UnderlyingSpace | undefined;
};

/** Place a child's baseline at `(0, 0)` on whichever axes it hasn't already
 *  resolved a position for — the "fresh vs. already-placed" child rule of an
 *  operator that lays out already-placed operands (e.g. a `ref` whose
 *  translate was reconciled against its LCA during its own `layout()`)
 *  alongside fresh ones, with no frame to seat them in (`enclose`,
 *  `position`). `dims[axis].min === undefined` IS that placed/unplaced
 *  signal (see `combineDims`): a fresh node reports an undefined translate
 *  until placed, while an already-placed node (a ref, or any other
 *  initially-placed target — see `isInitiallyPlaced` in
 *  `constraints/placementLowering.ts`, the same rule) already has a
 *  determined `min`, so re-placing it here would be a no-op-that-should-be —
 *  except `GoFishRef.place()` has no ledger to make that a true no-op, so it
 *  must not be called at all in that case. `layer` applies the same test
 *  when it seats the children its constraints left unplaced (`seatChild`). */
export function placeUnplacedChild(child: Placeable): void {
  if (child.dims[0].min === undefined) child.place("x", 0, "baseline");
  if (child.dims[1].min === undefined) child.place("y", 0, "baseline");
}

// `scales` is the per-axis data→pixel affine scale handed down (the single
// {@link AxisScale} carrier: `sigma` = pixels-per-data-unit for size, `map` =
// the anchored data→pixel map). A node MUST NOT mutate this array: a sized
// node that solves a σ of its own (see layer.tsx) copies into a fresh array
// and passes that down — never writing back to the parent's, so a solved σ
// can't leak to the node's siblings.
//
// A layout runs in the node's AXIS ORDER (`axisDirection.ts`): the scale it
// receives, the children it reads and places, and the box and translate it
// returns all run along the node's own direction. `GoFishNode.layout` stores
// the result in pixels. Geometry a node keeps for its `lower` (in
// `renderData` or a closure) stays in that axis order too: `lower` maps it to
// pixels through its `local` map, the one place it is reflected.
//
// `intrinsicDims` is the node's box in its own frame, with no translate
// applied; `transform.translate` is its offset in the parent's frame. `dims`
// composes the two exactly once (`combineDims`), so a layout must never fold
// its translate into `intrinsicDims.min` too (#755).
//
// `region` is the space the parent gives the node, when it gives one (#1059,
// `geometry/region.ts`), in the node's axis order and measured from the
// parent's origin, as `translate` is. A layout may place itself by it (a
// `region` mark fills it, a `layer` that hands regions on passes it to its
// children); one that does not is centered in it by `GoFishNode.layout`.
export type Layout = (
  size: Size,
  scales: Size<AxisScale | undefined>,
  children: GoFishAST[],
  node: GoFishNode,
  region?: Region
) => { intrinsicDims: FancyDims; transform: FancyTransform; renderData?: any };

/** Map a layout pixel (y-down, layout origin) to a final absolute canvas
 *  pixel: the gutter offset, or a boundary's own frame shift. Set once per emit
 *  on the render session. */
export type ToPixel = (p: [number, number]) => [number, number];

/**
 * Lower a node into a fragment of the display-list IR — each shape/operator owns
 * its `lower`, and the display list is the union of every node's fragment,
 * painted by a single backend (no per-shape SVG). `children` are the
 * already-lowered child items (empty for a boundary, which re-walks its own
 * subtree); `toPixel` carries the viewport offset. `local` maps a point the
 * node kept in its own local frame and axis order (see {@link Layout}) to a
 * layout pixel: the node's translate plus `(x, direction · y)`.
 */
export type Lower = (
  {
    intrinsicDims,
    transform,
    renderData,
    coordinateTransform,
    toPixel,
    local,
  }: {
    intrinsicDims?: Dimensions;
    transform?: Transform;
    renderData?: any;
    coordinateTransform?: CoordinateTransform;
    toPixel: ToPixel;
    local: ToPixel;
  },
  children: DisplayList.DisplayItem[],
  node: GoFishNode
) => DisplayList.DisplayItem[];

/**
 * A node's shape queries (see `geometry/index.ts`), computed from its laid-out
 * state. The result is in the node's LOCAL layout frame: the frame of
 * `intrinsicDims`, with no translate applied. `box` must equal
 * `intrinsicDims` as a box, and the shape a query describes must lie inside
 * that box. Called lazily, at most once per layout, by
 * {@link GoFishNode.geometry}.
 */
export type GeometryFn = (
  laidOut: {
    intrinsicDims: Dimensions;
    transform?: Transform;
    renderData?: any;
  },
  children: GoFishAST[],
  node: GoFishNode
) => Omit<Geometry, "outline"> & Partial<Pick<Geometry, "outline">>;

/** The geometry a node has when its definition supplies none. A leaf answers
 *  only `box`. A node with children also answers `enclosingCircle`, lazily: the
 *  smallest circle around its children's enclosing circles, each moved by the
 *  child's translate into this node's frame. */
export const defaultGeometry: GeometryFn = (
  { intrinsicDims },
  children,
  node
) => {
  const box = boxOfDims(intrinsicDims, node.type);
  if (children.length === 0) return { box };
  return {
    box,
    enclosingCircle: () => {
      const circles = children.map((child) => {
        const tx = child.projectedTranslate(0);
        const ty = child.projectedTranslate(1);
        if (tx === undefined || ty === undefined)
          throw new Error(
            `[gofish] geometry(): a child of ${node.type} was not placed, so ` +
              `its position in the ${node.type}'s frame is unknown`
          );
        const c = translateCircle(enclosingCircle(child.geometry()), [tx, ty]);
        return { x: c.cx, y: c.cy, r: c.r };
      });
      const e = packEnclose(circles);
      return { cx: e.x, cy: e.y, r: e.r };
    },
  };
};

export type ResolveUnderlyingSpace = (
  childSpaces: Size<UnderlyingSpace>[],
  childNodes: (GoFishNode | GoFishRef)[],
  /** This node's positioning constraints. `position` constraints contribute a
   *  POSITION-domain fragment to the resolved space (see `layer.tsx`). */
  constraints: ConstraintSpec[]
) => FancySize<UnderlyingSpace>;

/**
 * A node's sharing rule (#1114): which of its children share each axis, as a
 * {@link SharingPlan}. Like the type hook, each node type has its own rule,
 * and it reads only the node's children and constraints (and the node's own
 * options), never a type or a claim. Optional: a node without a rule lets
 * every child share both axes, as a layer with no constraints does. The
 * keyed domains (`keyedDomains.ts`) and the layer's own union read it, and
 * `GOFISH_DUMP_SHARING` prints it.
 */
export type ResolveSharing = (
  childNodes: (GoFishNode | GoFishRef)[],
  constraints: ConstraintSpec[]
) => SharingPlan;

/** Every child in the own set on both axes, nothing nested. */
export const shareAll: ResolveSharing = (childNodes) => ({
  sets: [childNodes.map(() => 0), childNodes.map(() => 0)],
  nested: [new Set(), new Set()],
});

/** Every child in a set of its own on both axes, nested in a frame of its
 *  own (a treemap's tile). */
export const nestEach: ResolveSharing = (childNodes) => {
  const sets = childNodes.map((_, i) => i + 1);
  const all = () => new Set(childNodes.map((_, i) => i));
  return { sets: [sets, [...sets]], nested: [all(), all()] };
};

/**
 * A node's size-claim hook: its per-axis {@link Extent} (undefined on an axis
 * whose type is not continuous). It runs in its own walk, after every type is
 * resolved, so it may read the node's own resolved `spaces` and its children's
 * types as well as the children's claims. The type hook
 * ({@link ResolveUnderlyingSpace}) receives no claims at all, so the
 * dependency runs one way: claims may read types, types never read claims.
 * Optional: a node that adds no pixel overhead claims what its types imply
 * ({@link impliedExtents}).
 */
export type ResolveExtent = (
  childExtents: Size<Extent | undefined>[],
  childSpaces: Size<UnderlyingSpace>[],
  spaces: Size<UnderlyingSpace>,
  childNodes: (GoFishNode | GoFishRef)[],
  constraints: ConstraintSpec[]
) => Size<Extent | undefined>;

/** Depth of type-hook calls in progress. A claim walk started from inside a
 *  type hook throws: types never read claims. */
let typeWalkDepth = 0;

/** Dev gate: set `GOFISH_CONFLICT_CHECK=1` to surface
 *  OVER-DETERMINATION the `BBox` ledger detects but the placement commit silently
 *  absorbs — a single owner writing inconsistent keys on an axis (the
 *  authority-independent half of "conflicts → named"). Off / zero-cost in prod. */
const CONFLICT_CHECK = envFlag("GOFISH_CONFLICT_CHECK");

const _conflicts = new Set<string>();
/** Report a `BBox` over-determination (a box key pinned inconsistent with the
 *  already-determined axis), once per (type, axis, key). The placement pass's
 *  "named conflict instead of silent last-writer-wins" — for the single-owner
 *  case; cross-constraint authority is the open fork (#583). */
const reportConflict = (type: string, dir: 0 | 1, c: BBoxConflict): void => {
  const key = `${type}|${dir}|${c.key}`;
  if (_conflicts.has(key)) return;
  _conflicts.add(key);
  console.warn(
    `[bbox-conflict] ${type} axis ${dir} ${c.key}: asserted=${c.asserted} implied=${c.implied} (owner=${c.owner} prior=${c.priorOwner})`
  );
};

/** Axis-claim signature for a dimension owned by a continuous axis or an
 *  explicit `axes:` override — opaque because (unlike an ordinal's keys) it
 *  carries no grouping identity to nest against, so it blocks descendant
 *  auto-claims on that dim. Ordinal owners record `"o:<keys>"` instead. */
const AXIS_CLAIM_OPAQUE = "continuous";

/** An operator's `axes` option as the {@link GoFishNode._axisOverride} it
 *  sets: one boolean for both axes, or per axis, where `false` hides the
 *  axis and any other option shows it. */
export const axisOverrideOf = (
  axes: boolean | { x?: AxisOptions; y?: AxisOptions }
): { x?: boolean; y?: boolean } => {
  const show = (opt: AxisOptions | undefined): boolean | undefined =>
    opt === undefined ? undefined : opt !== false;
  return typeof axes === "boolean"
    ? { x: axes, y: axes }
    : { x: show(axes.x), y: show(axes.y) };
};

export class GoFishNode {
  public readonly uid: string;
  private static uidCounter = 0;
  public type: string;
  public args?: any;
  public key?: string;
  /** The node's `key` was assigned POSITIONALLY (an auto-index from an operator
   *  with no `by`), not from a data grouping or an explicit user `key`. An
   *  ordinal built entirely from synthetic keys is `anonymous` — a layout-only
   *  spread that renders no axis. Set in `createOperator`; read when folding the
   *  distribute ordinal (see `compose` / `distributeSpaceFold`). */
  public _syntheticKey?: boolean;
  /** The cell the node's `key` names, when the operator grouped by a binned
   *  key (`field(x).bin(p)`): the key is the cell's id. Set in
   *  `createOperator`; read when folding the distribute ordinal, which then
   *  holds cells (`ORDINAL_TYPE.cells`, see `distributeSpaceFold`). */
  public keyCell?: KeyCell;
  /** The `by` the operator that made this node grouped by, when it grouped
   *  by one: the node's `key` is its group's key under it. Set in
   *  `createOperator`; a fused relational mark's default split reads it, to
   *  key a mark by the groups it is in (`computeDefaultBy`). */
  public keyBy?: SplitBy;
  public _name?: string | Token;
  public _isScope: boolean = false;
  /**
   * String-name scope boundary. Set ONLY by createMark — manual `.scope()`
   * (which flips `_isScope`) does not flip this. String-name lookup
   * (`resolveScopedName` in _ref.tsx, shared by `ref("name")` and
   * `.relate()` operands) stops walking up at the nearest `_isComponent`
   * ancestor and does not descend into nested ones, so names don't leak
   * across component boundaries in either direction.
   */
  public _isComponent: boolean = false;
  /** Set when this node is a drawing clause of its parent layer's
   *  `.relate()`: its 1-based position in the callback's clause list (for
   *  error messages). It was returned from the callback, not written as a
   *  plain child. A string
   *  `ref` is legal only inside such a clause, and the layer schedules the
   *  clause after the clauses that place what it reads. */
  public _relateClause?: number;
  /** The paint-order defaults `layer` installed for its relational-mark
   *  children (`applyRelationalZBelowDefaults`): `.relate()` replaces the
   *  author's constraints, and keeps these. */
  public _paintDefaults?: ConstraintSpec[];
  /** Set by `.relate()`: whether it added drawing clauses to this layer, so
   *  a layer without any skips looking for them in `resolveNames`. */
  public _hasRelateClauses: boolean = false;
  /** This layer's relate schedule as `resolveNames` last computed it, with
   *  the children and constraints it was computed from (see
   *  `relateScheduleForLayout` in `constraints/relate.ts`). */
  public _relateSchedule?: {
    children: GoFishAST[];
    constraints: ConstraintSpec[];
    schedule: RelateSchedule;
  };
  public _scopeMap?: Map<string, GoFishNode>;
  public parent?: GoFishNode;
  /** The union-find of unknown units a walk rooted here owns, when there is
   *  no render session to hold it (see `walkUnits`). */
  private units?: Units;
  public datum?: any;
  /** Paint-time reactive channels (a `live()` value per channel), stamped by the
   *  mark builders at resolve. Baked into the `liveSlots` side table at lower
   *  time; undefined on the static path. */
  public __gfLive?: Record<string, LiveValue>;
  /** Paint-time visibility rules, one per owner (see
   *  {@link INTERNAL_visibleWhile}); undefined on the static path. */
  public __gfVisible?: Map<object, () => boolean>;
  private _resolveUnderlyingSpace: ResolveUnderlyingSpace;
  private _resolveSharing: ResolveSharing;
  private _sharing?: SharingPlan;
  private _resolveExtent: ResolveExtent;
  public _underlyingSpace?: Size<UnderlyingSpace> = undefined;
  public _extent?: Size<Extent | undefined> = undefined;
  /** Set by a node's claim hook when its plot claim differs from its claim
   *  (see {@link resolvePlotExtent}); cleared with the claims. */
  public _plotExtent?: Size<Extent | undefined> = undefined;
  /** {@link resolvePlotExtent}'s answer where the plot is the box on one
   *  axis only, a new array, with the claim and plot it was read from, so
   *  every read returns the same array while those stay the same. */
  private _mixedPlot?: {
    extent: Size<Extent | undefined>;
    plot: Size<Extent | undefined>;
    mixed: Size<Extent | undefined>;
  };
  /** The claim walk's memos of this node, cleared with the claims. */
  public _claimMemo: ClaimMemo = freshClaimMemo();
  private _layout: Layout;
  /** Per-primitive IR lowering (see {@link Lower}) — the node's sole draw
   *  description. Absent on operators that never lower themselves (their
   *  children are lowered directly); lowering such a node draws nothing
   *  when it has no children, and throws otherwise. */
  private _lower?: Lower;
  /** The lowering the node was built with, kept when
   *  {@link INTERNAL_emitNothing} silences it, so what it lends
   *  ({@link INTERNAL_lendDrawing}) is always its real drawing. */
  private readonly _ownLower?: Lower;
  /** Shape queries (see {@link GeometryFn}); absent means the default. */
  private readonly _geometryFn?: GeometryFn;
  /** Memo for {@link geometry}; cleared by every `layout()`. */
  private _geometry?: Geometry;
  public children: GoFishAST[];
  public intrinsicDims?: Dimensions;
  public transform?: Transform;
  /** Persistent per-axis bbox ledger: the box-key equations that determine this
   *  node's box. `layout()` seeds the self-layout size (+ a self-placed absolute
   *  min), `_pinAnchor` records the absolute anchor a pin lands at, and a rank-2
   *  `setExtent` resets the axis to its determining keys (overriding the
   *  self-layout seed). Lazily created, so the hot single pin / `place()` path
   *  allocates only on first touch. The `dims` getter reads this wherever an axis
   *  is fully solved, falling back to the `(intrinsicDims, transform)` split. */
  private _bbox?: [BBox?, BBox?];
  public renderData?: any;
  public coordinateTransform?: CoordinateTransform;
  public color?: MaybeValue<string>;
  public constraints: ConstraintSpec[] = [];
  public colorConfig?: ColorConfig;
  public _labels?: LabelSpec[];
  /** Where a `.label()` with no `position` goes (see the constructor). */
  public labelPosition?: LabelPosition | Place | "outline";
  /** Nodes that belong to this node as a mark but live OUTSIDE its subtree:
   *  today the label `Text`s the label pass seats for it in the tier above
   *  (`labels/elaborate.tsx`), which stay out of the subtree so they never
   *  inflate this node's box. Whoever takes the mark over (a
   *  `time.transition()`) takes these with it. */
  public _attachments?: GoFishNode[];
  /** The mark this node is attached to (the inverse of `_attachments`), set
   *  by {@link INTERNAL_attach}. An attached label paints under its mark's
   *  animation (see {@link INTERNAL_animate}). */
  public _attachedTo?: GoFishNode;
  /** Paint-time animation (see {@link INTERNAL_animate}); undefined on the
   *  static path. */
  public __gfAnimate?: AnimationRule;
  // `undefined` means "no author opinion" — distinct from an explicit
  // `.zOrder(0)`, which is a deliberate choice and must be distinguishable
  // from silence (e.g. by the relational-mark auto-zBelow suppression check
  // in `graphicalOperators/layer.tsx`). Readers that need a numeric paint-
  // order key apply `?? 0` at the comparison site so unset behaves exactly
  // like an explicit 0 for sorting purposes.
  private _zOrder: number | undefined = undefined;
  private renderSession?: RenderSession;
  // Axis state per dimension. Set by `resolveAxes` and consumed by the axis
  // elaboration pass (`elaborateChrome`), which wraps owning nodes in a Layer of
  // ordinary tick/label shapes.
  // true     = owns the axis (gets elaborated into shapes here)
  // "budget" = a layer sibling owns it; also elaborated (overlapping siblings
  //            overdraw identically, which keeps their content aligned)
  // false    = explicitly suppressed via axes: override (blocks children)
  // undefined = not involved
  public axis: { x?: boolean; y?: boolean } = {};
  /** Persistent per-dim record that THIS node renders an axis, and what that
   *  axis ticks at (issues #659, #1057); undefined = no axis. Unlike `axis` —
   *  a work flag consumed and CLEARED by axis elaboration — this stamp
   *  survives to layout time. The keyed domain table records it against the
   *  keyed domain the axis is over (`KeyedDomains.refreshDemand`). That
   *  demand is what drives nicing: nicing is a presentation adjustment whose
   *  demand comes from axis views, so a keyed domain is niced iff some node
   *  draws an axis over it, and to that axis's ticks. Stamped by
   *  `resolveAxes` wherever it sets an owning (`true`) flag. */
  public axisDemand: [AxisTicks | undefined, AxisTicks | undefined] = [
    undefined,
    undefined,
  ];
  public _axisOverride?: { x?: boolean; y?: boolean };
  /** Set on the node a `chart()` resolves to: per axis, whether the chart
   *  has a size of its own (`w`/`h`). A chart is where its axes are drawn
   *  (`isAxisBoundary`). Undefined on every other node. */
  public _chartBox?: [boolean, boolean];
  /** Set on the node a `chart()` resolves to, next to {@link _chartBox}: the
   *  chart's own `axes` option (default `true`). It applies at the chart and
   *  below it, down to the next chart (`resolveAxes`). The render root's
   *  setting is the render's `axes`, which is this one unless the render
   *  gives its own. Undefined on every other node. */
  public _chartAxes?: AxesOptions;
  /**
   * Set on the outermost ring of chrome that chrome elaboration
   * (`elaborateChrome` in axes/elaborate.tsx) wraps around a node: the boxes
   * inside it. This node's own box is the box WITH chrome (axes, titles,
   * legend); `content` is the node it dresses, the box WITHOUT chrome;
   * `withAxes` is the content with its axis gutters and category label rows,
   * the box its titles and legend are seated around. Tick and category labels
   * are chrome, not ink of the content: they sit outside `content`.
   *
   * `gutters` is how far the chrome reaches past `content` on each side, in
   * pixels, per axis `[start, end]` in this node's axis order (#1032). Chrome
   * sits outside its chart, so this node's box is its content's box plus
   * these: its claim is the hull of its rings (each places its shapes in the
   * claim walk, `placeByClaims`), and it hands its content what is left of
   * its slot. Its layout reads them off the claims at the size it is laid
   * out at (`guttersInSlot` in chromeGutters.ts); until then they are 0.
   */
  public chrome?: {
    content: GoFishNode;
    withAxes: GoFishNode;
    /** The rings, innermost first; the last is this node. Each ring's first
     *  child is the ring inside it (or the content), and its other children
     *  are its chrome. */
    rings: GoFishNode[];
    gutters?: [[number, number], [number, number]];
  };
  /**
   * The chrome this node is asked to carry beyond the axes `resolveAxes`
   * assigned it: a title on each axis it draws (from the `axes` options) and
   * a legend ring. The chart options stamp it on the chart root; chrome
   * elaboration reads it and clears it.
   */
  public _chromeRequest?: { axes?: AxesOptions; legend?: ChromeRing };
  /** Explicit key→node map for ordinal axis label positioning. Set by
   * operators (e.g. table) whose domain keys differ from children's .key. */
  public _ordinalKeyMap?: Record<string, GoFishNode>;
  /** Set on a tick or category label `Text` made by axis elaboration: the
   *  label row it belongs to — which axis (`dim`), whether it labels
   *  categories or continuous ticks (`kind`), and its level's depth among
   *  the levels of the dim (0 = nearest the plot) — and, for a category
   *  row, the data field it labels (its ordinal space's measure).
   *  `label.angle: "auto"` reads these tags after layout to score label
   *  collisions per row across the whole chart (see axes/autoLabelAngle.ts). */
  public axisLabel?: LabelRow & { field?: string };
  /** Per axis, whether this node reads its place there from refs (an
   *  ordinal axis's label span, which lies along the slots it spans): where
   *  it lands only layout knows, so it is ink there. It draws its box, but
   *  takes no room in its parent's claim or box (see `placeByClaims`).
   *  Layout size is separate from drawn size (#493), as a CSS box's ink
   *  overflow or a Typst box's `outset` is. */
  public inkOn?: [boolean, boolean];
  /**
   * How far this node's outline is drawn past its box on every side, in
   * pixels: half the width of a centered stroke ({@link outlineOverhang}),
   * 0 for a node that draws none. The box is the
   * shape's geometry, which data places and sizes and a chain lays out. The
   * outline around it is part of the drawing, and takes room as dressing
   * does: the node's claim is its box widened by it, and its plot is its box
   * (see {@link resolveExtent}). So a stroke never moves a shape, and the
   * graphic leaves room for it at its edges.
   */
  public strokeOverhang = 0;
  /** Whether it draws its content only inside its box (a `mask`, a
   *  composite clipped to its first child): what its content would draw
   *  past its box, an outline included, is not drawn. */
  public clipsToBox = false;
  /** Set on a node whose box is read off other nodes it holds as refs (an
   *  `enclose` around placed members): where it lands in `frame`'s frame on
   *  `axis`, when the claim walk knows where the refs' targets land there
   *  (`placementIn`), else undefined. Known, it takes room in the layer it
   *  sits in, as a label beside a ref does, and it is dressing there: no part
   *  of the plot. Unknown, it is ink, as {@link inkOn} is (see
   *  `placeByClaims`). */
  public placedFromRefs?: (
    frame: GoFishNode,
    axis: 0 | 1
  ) => Placement | undefined;
  /** Set on a layer by `layer`: what the claim walk reads of it. A node
   *  with none is not a layer. */
  public claimWalk?: ClaimWalk;
  /** Set on a ROOT node by the surface that built it (a chart builder or a
   *  component thunk): builds a fresh, unlaid-out copy of the same chart.
   *  Layout writes each node's box once, so a choice that must lay the chart
   *  out once per candidate (`label.angle: "auto"`) needs a new tree for each
   *  run (see `runLayout` in gofish.tsx). A node built by hand has none. */
  public rebuild?: () => Promise<GoFishNode>;
  /**
   * Stack direction of the operator that created this node.
   * Used in coord.tsx collectOverrides to route axis: overrides to the
   * correct polar axis (theta vs radial).
   */
  public axisDir?: 0 | 1;
  /** Memo for {@link yFrame}; cleared with the spaces. */
  private _yFrame?: YFrame;
  /**
   * The part of this node's elaboration that depends on which axis an axis
   * NAME means: a mark's `dims` option (e.g. `{ theta: { size: 0.5 } }`,
   * written onto its per-axis dims against `outer`, see `deferAxisDims` in
   * dims.ts), or an operator's constraints (spread's `dir`, scatter's `dims`,
   * which relate the children, so against `inner`). Deferred at construction,
   * because a name like `theta` only has a meaning inside the coordinate space
   * that declares it, and run once by {@link resolveAliases}.
   */
  public _elaborateInAxisScope?: AxisScopeHook;
  /**
   * The space a `coord` node opens for its subtree: the transform's axis
   * names (`aliases`, e.g. `{ x: "theta", y: "r" }`) and its type. Read by
   * {@link resolveAliases} to rebind the axis scope while walking into this
   * coord.
   */
  public _space?: SpaceDeclaration;
  constructor(
    {
      key,
      type,
      args,
      resolveUnderlyingSpace,
      resolveExtent,
      resolveSharing,
      layout,
      lower,
      geometry,
      color,
      strokeOverhang,
      labelPosition,
    }: {
      key?: string;
      type: string;
      args?: any;
      resolveUnderlyingSpace: ResolveUnderlyingSpace;
      resolveExtent?: ResolveExtent;
      resolveSharing?: ResolveSharing;
      layout: Layout;
      lower?: Lower;
      geometry?: GeometryFn;
      color?: MaybeValue<string>;
      /** See {@link GoFishNode.strokeOverhang}. */
      strokeOverhang?: number;
      /** Where a `.label()` with no `position` goes on this node: a
       *  position or a `Place` strategy by convention (a dot is labeled
       *  around itself, an arrow at its end), or `"outline"`, read from the
       *  outline the node draws when the label is placed: at the end of an
       *  open path, around a closed outline with no fill, inside a filled
       *  one. Default `"outset"` (above its box). A node that sets it draws
       *  its own ink and is itself the target of a `.label()` on it. */
      labelPosition?: LabelPosition | Place | "outline";
    },
    children: GoFishAST[]
  ) {
    this.uid = `node-${GoFishNode.uidCounter++}`;
    this._resolveUnderlyingSpace = resolveUnderlyingSpace;
    this._resolveSharing = resolveSharing ?? shareAll;
    this._resolveExtent =
      resolveExtent ?? ((_ce, _cs, spaces) => impliedExtents(spaces));
    this._layout = layout;
    this._lower = lower;
    this._ownLower = lower;
    this._geometryFn = geometry;
    this.children = children;
    children.forEach((child) => {
      child.parent = this;
    });
    this.key = key;
    this.type = type;
    this.args = args;
    this.color = color;
    this.strokeOverhang = strokeOverhang ?? 0;
    this.labelPosition = labelPosition;
  }

  /** This node's sharing plan: its rule ({@link ResolveSharing}) applied to
   *  its children and constraints. Memoized, and cleared with the types
   *  (`clearUnderlyingSpace`), which every rewrite of the tree re-resolves.
   *  Callers must not mutate it. */
  public sharing(): SharingPlan {
    return (this._sharing ??= this._resolveSharing(
      this.children,
      this.constraints
    ));
  }

  /** Give this node another sharing rule. A wrapper built by elaboration
   *  (a chrome ring) is a node kind of its own, with its own rule. */
  public INTERNAL_setSharing(rule: ResolveSharing): this {
    this._resolveSharing = rule;
    this._sharing = undefined;
    return this;
  }

  /** Collect the distinct color values in this subtree, in first-seen order.
   *  `seen` is the membership index for `out` (which keeps the order).
   *  `orders` collects the levels of the column each value was read from
   *  (`HasLevels`, from the chart's `schema`), or `undefined` for a value
   *  from a column without declared levels. */
  private collectColorValues(
    out: any[],
    seen: Set<any> = new Set(),
    fields?: Set<string>,
    orders?: Set<HasLevels | undefined>
  ): void {
    if (this.color !== undefined && isValue(this.color)) {
      const val = getValue(this.color);
      if (!seen.has(val)) {
        seen.add(val);
        out.push(val);
      }
      const field = getValueField(this.color);
      if (field !== undefined) fields?.add(field);
      orders?.add(getValueFieldType(this.color)?.HasLevels);
    }
    this.children.forEach((child) => {
      if (child instanceof GoFishNode)
        child.collectColorValues(out, seen, fields, orders);
    });
  }

  public resolveColorScale(): void {
    const scaleContext = this.getRenderSession().scaleContext;
    // The unit scale is either a categorical scale (a `color` Map) or a
    // continuous color scale (a `scaleFn` over a numeric `domain`). It is
    // mutated in place here (shapes read the same `scaleContext.unit` object at
    // render time), so we keep a loose shape.
    const unit = scaleContext.unit as {
      color?: Map<any, string>;
      colorConfig?: ColorConfig;
      scaleFn?: (v: number) => string;
      domain?: [number, number];
      resolved?: boolean;
      fields?: Set<string>;
    };

    // If this node carries its own colorConfig (set by ChartBuilder.resolve()),
    // temporarily apply it for this subtree, then restore for siblings.
    if (this.colorConfig) {
      const saved = unit.colorConfig;
      unit.colorConfig = this.colorConfig;
      this._applyColorConfig(unit);
      unit.colorConfig = saved;
      // Recurse so children can override with their own configs
      this.children.forEach((child) => {
        if (child instanceof GoFishNode) child.resolveColorScale();
      });
      return;
    }

    if (unit.colorConfig) {
      this._applyColorConfig(unit);
    } else {
      // No colorConfig — single-pass: cycle color6, skip literal CSS colors
      if (unit.color && this.color !== undefined && isValue(this.color)) {
        const color = getValue(this.color);
        const isLiteralColor =
          typeof color === "string" &&
          (color.startsWith("#") ||
            color.startsWith("rgb") ||
            color.startsWith("hsl"));
        if (!isLiteralColor && !unit.color.has(color)) {
          unit.color.set(color, color6[unit.color.size % 6]);
        }
        // The scale describes which fields it maps, not just which values:
        // a color read from a named field carries that field (its provenance).
        const field = getValueField(this.color);
        if (!isLiteralColor && field !== undefined)
          (unit.fields ??= new Set()).add(field);
      }
      this.children.forEach((child) => {
        if (child instanceof GoFishNode) child.resolveColorScale();
      });
    }
  }

  private _applyColorConfig(unit: {
    color?: Map<any, string>;
    colorConfig?: ColorConfig;
    scaleFn?: (v: number) => string;
    domain?: [number, number];
    resolved?: boolean;
    fields?: Set<string>;
  }): void {
    const colorConfig = unit.colorConfig!;

    if (colorConfig._tag === "gradient") {
      // First writer wins: the first node to resolve a gradient (the root,
      // which sees the whole subtree) sets the domain over every value. Deeper
      // nodes re-entering this pass would otherwise recompute a narrower domain
      // from their own subtree and clobber it.
      if (unit.resolved) return;
      const orderedKeys: any[] = [];
      this.collectColorValues(
        orderedKeys,
        new Set(),
        (unit.fields ??= new Set())
      );
      const numericKeys = orderedKeys.filter((k) => typeof k === "number");
      const min = numericKeys.length > 0 ? Math.min(...numericKeys) : 0;
      const max = numericKeys.length > 0 ? Math.max(...numericKeys) : 1;
      // Upgrade the shared unit scale to a continuous color scale: one scaleFn
      // over [min, max], the source of truth for both mark fills and the
      // colorbar legend. The per-value `color` Map is not used for gradients.
      unit.scaleFn = createGradientScale(colorConfig, [min, max]);
      unit.domain = [min, max];
      unit.resolved = true;
      delete unit.color;
    } else {
      const seenKeys: any[] = [];
      const orders = new Set<HasLevels | undefined>();
      this.collectColorValues(
        seenKeys,
        new Set(),
        (unit.fields ??= new Set()),
        orders
      );
      // The domain lists its values in first-seen order, or in the order of
      // their columns' levels when every value comes from a column with
      // declared levels and those levels are the same list, so the legend
      // follows the order the schema declares. Levels compare by value: each
      // column read from the wire has its own copy of its unit's levels.
      // TODO(#996): a diverging palette driven by HasMidpoint.
      const [order] = orders;
      const oneOrder =
        order !== undefined &&
        [...orders].every(
          (o) =>
            o !== undefined &&
            o.levels.length === order.levels.length &&
            o.levels.every((level, i) => level === order.levels[i])
        );
      const orderedKeys = oneOrder
        ? orderByLevels([...unit.fields].join(", "), order, seenKeys)
        : seenKeys;
      if (!(unit.color instanceof Map)) unit.color = new Map();
      const color = unit.color;
      orderedKeys.forEach((key, i) => {
        if (!color.has(key)) {
          color.set(key, assignPaletteColor(colorConfig, String(key), i));
        }
      });
    }
  }

  public resolveNames(): void {
    if (this._isScope && !this._scopeMap) {
      this._scopeMap = new Map();
    }
    if (this._name !== undefined && isToken(this._name)) {
      const token = this._name;
      this.getRenderSession().tokenContext.set(token, this);
      // Register the token's tag in the nearest enclosing scope root.
      let ancestor: GoFishNode | undefined = this.parent;
      while (ancestor) {
        if (ancestor._isScope) {
          if (!ancestor._scopeMap) ancestor._scopeMap = new Map();
          ancestor._scopeMap.set(token.__tag, this);
          break;
        }
        ancestor = ancestor.parent;
      }
    }
    // A string _name registers nowhere: `ref(string)` and `.relate()`
    // operands find it by walking the component scope (`resolveScopedName`
    // in _ref.tsx), bounded by the nearest createMark.
    this.children.forEach((child) => {
      child.resolveNames();
    });
    // With every ref resolved, check the relate clauses' dependency order
    // now: a cycle would otherwise recurse forever in the space pass (a ref
    // proxies its target's space, and a cyclic target contains the ref).
    if (this._hasRelateClauses && this.children.some(isRelateClause)) {
      computeRelateSchedule(this, resolveConstraintOperands(this));
    }
  }

  public resolveUnderlyingSpace(): Size<UnderlyingSpace> {
    if (this._underlyingSpace) {
      return this._underlyingSpace;
    }
    // The type walk runs inside one union-find of unknown units (measure.ts),
    // so a binding made anywhere in the figure holds everywhere in it. The
    // outermost call, the walk's root, installs the one it owns.
    if (!hasUnits()) {
      return withUnits(this.walkUnits(), () => this.resolveUnderlyingSpace());
    }
    const childSpaces = this.children.map((child) =>
      child.resolveUnderlyingSpace()
    );
    typeWalkDepth++;
    try {
      this._underlyingSpace = elaborateSize(
        this._resolveUnderlyingSpace(
          childSpaces,
          this.children,
          this.constraints
        )
      );
    } catch (e) {
      // A measure clash knows its axis index; this node knows what that axis
      // is called here (`x`, `y`, or a coordinate space's own name).
      throw e instanceof MeasureClash
        ? e.named((axis) => this.axisName(axis))
        : e;
    } finally {
      typeWalkDepth--;
    }
    return this._underlyingSpace;
  }

  /**
   * This node's y frame (see `axisDirection.ts`): its y direction and whether
   * it sits in a coordinate space, read off its resolved spaces and its
   * parent's frame. Resolved once, top-down; cleared with the spaces
   * (`clearUnderlyingSpace`), which every rewrite of the tree re-resolves.
   */
  public get yFrame(): YFrame {
    if (this._yFrame !== undefined) return this._yFrame;
    if (this._underlyingSpace === undefined)
      throw new Error(
        `[gofish] ${this.type}: its y direction was read before its spaces ` +
          `were resolved.`
      );
    return (this._yFrame = yFrameIn(this, this.parent?.yFrame ?? CANVAS_FRAME));
  }

  /** The axis names visible inside this node: the scope {@link
   *  resolveAliases} gives its children, folded from the root down by
   *  `axisScopeFor`, so the innermost coordinate space decides. */
  public axisScope(): AxisScope {
    const spaces: SpaceDeclaration[] = [];
    for (let n: GoFishNode | undefined = this; n; n = n.parent)
      if (n._space) spaces.push(n._space);
    return spaces.reduceRight(
      (scope, space) => axisScopeFor(space, scope),
      BASE_AXIS_SCOPE
    );
  }

  /** The name of axis `dim` where this node sits: the name the innermost
   *  enclosing coordinate space gives it (polar's `theta` / `r`, geo's `lon` /
   *  `lat`), or `x` / `y` (also inside a space that declares no names). */
  public axisName(dim: 0 | 1): string {
    const xy = dim === 0 ? "x" : "y";
    const named = Object.entries(this.axisScope().names).find(
      ([name, axis]) => axis === dim && name !== "x" && name !== "y"
    );
    return named?.[0] ?? xy;
  }

  /** Whether this node's parent nests it in a slot of its own on `dim` (a
   *  spread, grid or treemap slot): a set of its own that sits in a frame of
   *  its own. A child nested at a datum is in its parent's set, so it is not
   *  in a slot. Read by a layer's σ solve (`solveLayerScales`). */
  public inSlot(dim: 0 | 1): boolean {
    const p = this.parent;
    if (p === undefined) return false;
    return childRole(p.sharing(), p.children.indexOf(this), dim) === "slot";
  }

  /** One of this node's axis spaces on `dim` as the axis machinery sees it:
   *  placed ({@link placeBaseline}) when this node is seated by a sized scope
   *  that places a free baseline at the scope's `originPx` — the render root,
   *  or the content of a chart with a size of its own on `dim` — so the root
   *  of a bar chart renders an absolute value axis over its free bars. A
   *  chart is placed whole, its baseline with it, so it does too: a bar
   *  chart beside a caption draws the axis it draws on its own (#1170).
   *  Anywhere else a free space is still waiting for its parent to place it. */
  public placedSpace(space: UnderlyingSpace, dim: 0 | 1): UnderlyingSpace {
    return this.parent === undefined ||
      this._chartBox !== undefined ||
      this.isSizedChartContent(dim)
      ? placeBaseline(space)
      : space;
  }

  /** This node is the content of a `chart()` with a size of its own on
   *  `dim`: the chart solves σ there, and seats this content in its frame. A
   *  chart's frame has one child, its content (`frameChart`). */
  private isSizedChartContent(dim: 0 | 1): boolean {
    return this.parent?._chartBox?.[dim] === true;
  }

  /**
   * Whether this node draws its continuous axes on `dim` (#1114 step 6):
   * axes are drawn at `chart()` boundaries, inside the chart's own sized
   * scope, so the ticks map with the σ the marks map with. A chart with no
   * size of its own on `dim` draws them around itself (its σ is solved above
   * it, at the sized node that contains it); a chart with a size of its own
   * draws them around its content, inside the box it solves σ in. The render
   * root is an implicit chart and nothing more: it draws the axes of the
   * domains its own type covers, a bare low-level render's included. A piece
   * placed apart from it (detached, so the root's type does not cover it)
   * draws an axis only if it is a chart itself. No other node draws one.
   *
   * A chart is a boundary whether or not a chart is above it, and it never
   * draws a second axis: every chart nested in another is inside that
   * chart's one content node (`frameChart`), which (or whose chart) claims
   * each axis its type covers first, and a continuous axis has one owner.
   * A nested chart draws only an axis no node above it claimed.
   */
  private isAxisBoundary(dim: 0 | 1): boolean {
    if (this._chartBox !== undefined) return !this._chartBox[dim];
    return this.parent === undefined || this.isSizedChartContent(dim);
  }

  /**
   * This node's per-axis size claims ({@link Extent}), memoized. Resolves the
   * types first (claims may read them), then the children's claims, then this
   * node's own claim hook. Every continuous axis gets a claim; a
   * non-continuous axis claims only when its content's room is σ-dependent
   * (a spread of magnitudes).
   */
  public resolveExtent(): Size<Extent | undefined> {
    if (this._extent) return this._extent;
    if (typeWalkDepth > 0)
      throw new Error(
        `[gofish] ${this.type}: a size claim was read during type inference. ` +
          `Types never read claims; compute this from the types instead.`
      );
    const spaces = this.resolveUnderlyingSpace();
    const childSpaces = this.children.map((c) => c.resolveUnderlyingSpace());
    const childExtents = this.children.map((c) => c.resolveExtent());
    const extent = this._resolveExtent(
      childExtents,
      childSpaces,
      spaces,
      this.children,
      this.constraints
    );
    // A node fills the room it is given when it has no size of its own: a
    // leaf with no claim, or a node with no size of its own whose children
    // all fill. Where the room is a share (`sharesRoom`), a leaf that fills
    // claims one σ (#493 piece 3).
    this._claimMemo.fills = ([0, 1] as const).map((dim) => {
      if (this.children.length > 0)
        return (
          this.claimWalk?.ownScope[dim] !== true &&
          this.children.every(
            (c) => c instanceof GoFishNode && c._claimMemo.fills?.[dim] === true
          )
        );
      const fills = extent[dim] === undefined && this.inkOn?.[dim] !== true;
      if (fills && this.sharesRoom(dim) && this.inShare(dim))
        extent[dim] = Extent(Pwl.affine(1, 0));
      return fills;
    }) as [boolean, boolean];
    for (const dim of [0, 1] as const) {
      if (isCONTINUOUS(spaces[dim]) && extent[dim] === undefined)
        throw new Error(
          `[gofish] ${this.type}: axis ${dim} has a continuous type but no ` +
            `size claim. Every continuous axis has a claim.`
        );
    }
    // A drawn outline takes room as dressing does: the claim reaches past
    // the box by it, and the plot is the box, so a chain still lays the
    // shape by its box. Inside a coordinate space a claim is in the space's
    // own units, not pixels, and the space holds its interior's outlines
    // itself (`coord`).
    const o = this.claimedOverhang;
    if (o > 0 && extent.some((e) => e !== undefined)) {
      this._plotExtent ??= extent;
      this._extent = extent.map((e) =>
        e === undefined ? undefined : padExtent(e, o)
      ) as Size<Extent | undefined>;
      return this._extent;
    }
    this._extent = extent;
    return extent;
  }

  /** The outline this node's claim reaches past its box by: its
   *  {@link strokeOverhang}, or 0 inside a coordinate space (a `coord` above
   *  it), whose interior is laid out in the space's own coordinates and which
   *  holds its interior's outlines itself. */
  public get claimedOverhang(): number {
    const o = this.strokeOverhang;
    return o > 0 && this.parent?.yFrame.inCoord === true ? 0 : o;
  }

  /** This node's own claim rule over `childExtents` in place of its
   *  children's claims, without the outline it adds: what it composes from
   *  any form of its children. The plan (`solver/planShadow`) reads a
   *  node's box this way, from its children's boxes. */
  public composeExtent(
    childExtents: Size<Extent | undefined>[]
  ): Size<Extent | undefined> {
    return this._resolveExtent(
      childExtents,
      this.children.map((c) => c.resolveUnderlyingSpace()),
      this.resolveUnderlyingSpace(),
      this.children,
      this.constraints
    );
  }

  /** Whether the room this node is given on `axis` is a share: it is in a
   *  slot (a spread, grid or treemap slot), or inside a node that is, short
   *  of a node with a size of its own. A node in no slot (a rule laid over a
   *  bar chart) is given the whole room of what holds it. */
  private inShare(axis: 0 | 1): boolean {
    for (
      let n: GoFishNode | undefined = this;
      n !== undefined && n.claimWalk?.ownScope[axis] !== true;
      n = n.parent
    )
      if (n.inSlot(axis)) return true;
    return false;
  }

  /** Whether this node fills the room it is given on `axis`: a leaf with
   *  no size of its own, or a node with no size of its own whose children
   *  all fill. A share scope gives such a node one σ
   *  (`sharesRoom`), but a `nest` that derives it gives it its inner's size
   *  plus the padding instead. */
  public fillsRoom(axis: 0 | 1): boolean {
    this.resolveExtent();
    return this._claimMemo.fills?.[axis] === true;
  }

  /**
   * The claim of this node's plot: its claim without its dressing, what is
   * placed beside a node the claim walk places elsewhere (a value label
   * beside its bar's ref, an axis beside the content it dresses). A node
   * with a size of its own maps its plot into that size, and its dressing,
   * like its chrome, adds around it (#1032). A layer computes it with its
   * claim (`placeByClaims`' plot hull); any other node's plot is its claim.
   * On an axis where its plot is its whole box ({@link plotIsBox}), it is
   * its claim.
   */
  public resolvePlotExtent(): Size<Extent | undefined> {
    const extent = this.resolveExtent();
    const plot = this._plotExtent;
    if (plot === undefined) return extent;
    const picked = ([0, 1] as const).map((axis) =>
      this.plotIsBox(axis) ? extent[axis] : plot[axis]
    );
    // A reader asks whether the plot differs from the claim by identity
    // (`plot !== claim`: a dressed child, `plotIn`), so the answer is
    // the claim or the plot itself where it is one of them, and otherwise
    // one array per claim and plot.
    const same = (of: Size<Extent | undefined>) =>
      picked[0] === of[0] && picked[1] === of[1];
    if (same(extent)) return extent;
    if (same(plot)) return plot;
    const memo = this._mixedPlot;
    if (memo?.extent === extent && memo.plot === plot) return memo.mixed;
    const mixed: Size<Extent | undefined> = [picked[0], picked[1]];
    this._mixedPlot = { extent, plot, mixed };
    return mixed;
  }

  /**
   * Whether this node is a chart's outer box (#1032): the outermost ring of
   * chrome around a `chart()` with no size of its own. The chart's chrome
   * adds around its plot, but its parent lays the chart out whole, plot and
   * chrome, so to its parent all of it is plot. (A chart with a size of its
   * own wears its chrome inside its frame, which claims the total.)
   */
  public isChartBox(): boolean {
    return this.chrome?.content._chartBox !== undefined;
  }

  /**
   * Whether this node's plot on `axis` is its whole box: it is a part of
   * its parent's plot with its chrome and dressing included. That is a
   * chart's outer box ({@link isChartBox}), and a node with a size of its
   * own there, which maps its plot into that size and claims the total.
   */
  public plotIsBox(axis: 0 | 1): boolean {
    return this.isChartBox() || this.claimWalk?.ownScope[axis] === true;
  }

  /**
   * Whether something data sizes or places on `axis` composes into this
   * node's claim: its type there is continuous, or a child's is, short of a
   * child with a size of its own (a σ-scope of its own, which claims its
   * pixels). Read from the types alone, which the claim walk resolves
   * first.
   */
  public carriesData(axis: 0 | 1): boolean {
    const memo = this._claimMemo.carriesData;
    if (memo[axis] !== undefined) return memo[axis]!;
    const result =
      this._underlyingSpace?.[axis]?.kind === "continuous" ||
      this.children.some(
        (c) =>
          c instanceof GoFishNode &&
          c.claimWalk?.ownScope[axis] !== true &&
          c.carriesData(axis)
      );
    memo[axis] = result;
    return result;
  }

  /**
   * Whether this node's σ on `axis` is the size of a share (#493 piece 3).
   * σ is the one free variable of the scope this node is in (the nearest
   * node with a size of its own, or the root). When nothing in the scope is
   * sized or placed by data there (`carriesData`), σ has no data unit to be
   * the pixels of, and it is the room a node with no size of its own takes:
   * a band of a category axis is one σ, and a spread of `n` bands with
   * spacing `g` claims `n·σ + (n − 1)·g`. So what hangs off a band (a label
   * beside it, a category label past the last band) takes room, and the
   * bands narrow to make it. Inside a coordinate space the room is the
   * space's own coordinates, which the space fits itself, so σ is never a
   * share there.
   */
  public sharesRoom(axis: 0 | 1): boolean {
    const memo = this._claimMemo.sharesRoom;
    if (memo[axis] !== undefined) return memo[axis]!;
    let scope: GoFishNode = this;
    while (
      scope.parent !== undefined &&
      scope.claimWalk?.ownScope[axis] !== true
    )
      scope = scope.parent;
    let inCoord = false;
    for (let n: GoFishNode | undefined = this; n; n = n.parent)
      if (n.type === "coord") inCoord = true;
    const result = !inCoord && !scope.carriesData(axis);
    memo[axis] = result;
    return result;
  }

  /** The pixels this node's chrome reaches past its content on `axis`,
   *  `[start, end]` in its axis order (see {@link chrome}); `[0, 0]` for a
   *  node with no chrome, or before its layout reads them. */
  public chromeGutters(axis: 0 | 1): [number, number] {
    return this.chrome?.gutters?.[axis] ?? [0, 0];
  }

  /**
   * Drop the memoized underlying space for this node and its whole subtree, so a
   * later `resolveUnderlyingSpace()` recomputes from scratch. Used after the axis
   * elaboration pass rewrites the tree (inserts wrappers, moves keys). Keeping
   * the invalidation here — rather than ad hoc at the call site — means any
   * future memoized field can be cleared in one place.
   */
  public clearUnderlyingSpace(): void {
    this._underlyingSpace = undefined;
    this._yFrame = undefined;
    this._extent = undefined;
    this._plotExtent = undefined;
    this._claimMemo = freshClaimMemo();
    this._sharing = undefined;
    this.children.forEach((c) => {
      if (c instanceof GoFishNode) c.clearUnderlyingSpace();
    });
  }

  /**
   * Top-down pass that gives axis NAMES their meaning. `x`/`y` mean axis 0/1
   * everywhere; a coordinate space adds the names its transform declares in
   * `aliases` (polar `theta`/`r`, geo `lon`/`lat`). Mirrors {@link resolveAxes}:
   * it carries the scope downward, and every `coord` rebinds it for its
   * subtree to the names it declares (the innermost coord wins; one that
   * declares no names leaves only `x`/`y`).
   *
   * At each node it consumes the {@link _elaborateInAxisScope} hook, the work a
   * factory could not do at construction, when the enclosing coord did not
   * exist yet. The hook gets both scopes: `outer`, where the node's own box
   * lives (its PARENT's space, even on a coord), and `inner`, its children's.
   *
   * The walk is synchronous and only collects the hooks, in pre-order; they
   * then run one at a time in that order. Not concurrently: an operator's hook
   * calls `relate`, whose environment walks the subtree, so it must not
   * interleave with a descendant's hook. The walk sees the tree as it was
   * before any hook ran, which is enough: spread's and scatter's `relate`
   * return constraints only, so no hook adds a node that needs a hook of its
   * own.
   *
   * A hook is cleared once it has run to completion, so the pass is
   * idempotent and can rerun over a tree that an elaboration pass (axes,
   * legends) extended with new nodes. A hook that throws stays in place, as do
   * the hooks queued after it, so a rerun meets the same error again instead
   * of silently skipping the rest of the work.
   *
   * Runs BEFORE `resolveUnderlyingSpace` (which reads the dims and the
   * constraints). The `embedded` flag is authored later by
   * {@link resolveEmbedding}, not here. A name no enclosing coord declares is
   * a build-time error that lists the names that are declared.
   */
  public async resolveAliases(): Promise<void> {
    const work: (() => Promise<void>)[] = [];
    this.collectAxisScopeWork(BASE_AXIS_SCOPE, work);
    for (const run of work) await run();
  }

  /** The synchronous walk of {@link resolveAliases}: queue each node's hook,
   *  with its scopes, in pre-order. Every coord establishes its own scope: the
   *  names its transform declares, or only `x`/`y` when it declares none (a
   *  name has a meaning only inside the space that declares it). */
  private collectAxisScopeWork(
    outer: AxisScope,
    work: (() => Promise<void>)[]
  ): void {
    const inner = this._space ? axisScopeFor(this._space, outer) : outer;
    const hook = this._elaborateInAxisScope;
    if (hook) {
      work.push(async () => {
        await hook(outer, inner);
        if (this._elaborateInAxisScope === hook)
          this._elaborateInAxisScope = undefined;
      });
    }
    for (const c of this.children) {
      if (c instanceof GoFishNode) c.collectAxisScopeWork(inner, work);
    }
  }

  /**
   * Top-down pass that authors each dim's `embedded` flag — the flag a shape's
   * `lower` switches on to draw a mark as point (0 embedded axes) / line (1) /
   * area (2). It is the **sole author** of `embedded`, except an explicit
   * `emX`/`emY` (or `connect`'s `embed()`), which lock the flag to `true` and are
   * never recomputed here.
   *
   * Two routes by which a dim's edges become coordinate-space positions (so a
   * coord warps the extent):
   *
   * - **Route B (intrinsic, measure-gated)** — implemented here. A dim embeds iff
   *   {@link baseEmbedded} holds (its size is a data value or unsized) AND, when
   *   inside a coordinate space, the size's own measure matches the dim's
   *   *position* measure — the measure of wherever the box sits in coord space
   *   (its `min`/`center`/`max`, whichever is a data value). A *foreign*-measure
   *   size (a scatter bubble's area at a positioned center, area ≠ position
   *   measure) stays ink — drawn flat at the mapped center.
   *
   *   The discriminator is mark-LOCAL (size-vs-position on the same dim), not
   *   read from the coord: a polar coord *forgets* its axis measure (its
   *   underlying space is measureless), but a positioned mark's own position
   *   measure IS the axis measure it sits on. A pure-size mark (a bar: size, no
   *   position) has no position measure to clash with → embeds.
   * - **Route A (relational, measure-free)** — deferred (no corpus oracle yet).
   *
   * The extra revocation only fires INSIDE a coord, so Cartesian behavior is
   * byte-identical to the old construction-time `inferEmbedded` (which gated on
   * `min` alone). Runs AFTER `resolveUnderlyingSpace`, BEFORE `layout`/render;
   * like {@link resolveAliases} it mutates the shared `args.dims` element so the
   * captured render closure observes it.
   */
  public resolveEmbedding(insideCoord: boolean = false): void {
    // Unit equality reads the type walk's union-find.
    if (!hasUnits()) {
      return withUnits(this.walkUnits(), () =>
        this.resolveEmbedding(insideCoord)
      );
    }
    const within = insideCoord || this.type === "coord";

    const dims = this.args?.dims as Dimensions | undefined;
    if (dims) {
      for (const dir of [0, 1] as const) {
        const dim = dims[dir];
        if (dim === undefined) continue;
        // Explicit emX/emY (or connect's embed()) is a hard claim — leave it.
        if (dim.embedded === true) continue;
        let embedded = baseEmbedded(dim);
        // Route B gate (coord-scoped): a value-sized dim positioned in a unit
        // FOREIGN to its size's unit is a foreign extent (a bubble) → ink.
        if (embedded && within) {
          for (const pos of [dim.min, dim.center, dim.max]) {
            if (isValue(pos) && !sameValueUnit(pos, dim.size)) {
              embedded = false;
              break;
            }
          }
        }
        dims[dir] = { ...dim, embedded };
      }
    }

    this.children.forEach((c) => {
      if (c instanceof GoFishNode) c.resolveEmbedding(within);
    });
  }

  /**
   * Top-down walk that marks which nodes should render axes.
   *
   * `claimed` maps each dimension an ancestor already owns to a SIGNATURE of
   * what claimed it: an ordinal axis records `"o:<keys>"`, a continuous axis
   * records `"c:<keyed domain>"` (`KeyedDomains.axisKey`), and anything else
   * (an explicit override with no signature) records
   * {@link AXIS_CLAIM_OPAQUE}. The signature lets ordinal axes NEST — a node
   * claims its own ordinal axis even under an ancestor ordinal, as long as
   * it's a DIFFERENT grouping (a finer level), so a grouped/faceted chart
   * renders one ordinal axis per grouping level (per facet). Continuous axes
   * stay single-owner: only the root-most unclaimed chart boundary
   * (`isAxisBoundary`, #1114) claims one, and an explicit override over a
   * keyed domain an ancestor already draws is the same axis, so it is not
   * drawn again.
   *
   * `enabled` is what the nearest enclosing chart's `axes` option decides
   * on each dim (`axesEnabled`): the render's at the root, and each chart's
   * own below it ({@link _chartAxes}). On a dim it turns on, it maps to what
   * the axis ticks at ({@link AxisTicks}): a node that claims the axis draws
   * it and stamps those ticks as its `axisDemand`. On a dim it turns off
   * (`false`), a node that claims the axis still owns it, so the axis is
   * hidden, not drawn by a chart below. A dim it decides nothing about (a
   * bare render that passes no `axes`) is claimed by no node, so each chart
   * below decides its own (#1170). An operator's explicit override can draw
   * an axis on a dim `enabled` does not turn on, with the default ticks.
   */
  public resolveAxes(
    claimed: Map<0 | 1, string> = new Map(),
    enabled: Map<0 | 1, AxisTicks | false> = new Map([
      [0, DEFAULT_AXIS_TICKS],
      [1, DEFAULT_AXIS_TICKS],
    ])
  ): void {
    // A `layer` is treated like any other node: it claims the axis for its own
    // (unioned) space ONCE, so overlaid children share a single axis. Per-child
    // axes still happen via explicit operator `axes:` overrides, which the
    // override branch honors regardless.

    // Coordinate-transform nodes (polar, clock, wavy, geo, etc.) manage their
    // own coordinate space; Cartesian axes make no sense for them or their
    // children. Collect directional axis overrides from the subtree so the
    // coord's render function can honour per-operator axis: true/false.
    if (this.type === "coord") {
      let polarAxisX: boolean | undefined = undefined;
      let polarAxisY: boolean | undefined = undefined;
      const collectOverrides = (n: GoFishNode) => {
        if (n._axisOverride) {
          const dir = n.axisDir;
          // If the node carries a direction tag, only apply override to that dim.
          // Otherwise (e.g. scatter with no dir) apply to both.
          if (dir !== 1 && n._axisOverride.x !== undefined)
            polarAxisX = n._axisOverride.x;
          if (dir !== 0 && n._axisOverride.y !== undefined)
            polarAxisY = n._axisOverride.y;
        }
        n.children.forEach((c) => {
          if (c instanceof GoFishNode) collectOverrides(c);
        });
      };
      this.children.forEach((c) => {
        if (c instanceof GoFishNode) collectOverrides(c);
      });
      if (polarAxisX !== undefined) (this as any)._polarAxisX = polarAxisX;
      if (polarAxisY !== undefined) (this as any)._polarAxisY = polarAxisY;

      const allClaimed = new Map<0 | 1, string>([
        [0, AXIS_CLAIM_OPAQUE],
        [1, AXIS_CLAIM_OPAQUE],
      ]);
      this.children.forEach((c) => {
        if (c instanceof GoFishNode)
          c.resolveAxes(allClaimed, c.axesBelow(enabled));
      });
      // _axisOverride can set axisX/Y on descendants even when claimed,
      // which would apply Cartesian axis budgets in polar coordinate space.
      // Clear them so only the polar axis path (via _polarAxisX/Y) applies.
      const clearCartesianAxes = (n: GoFishNode): void => {
        n.axis.x = undefined;
        n.axis.y = undefined;
        n.children.forEach((c) => {
          if (c instanceof GoFishNode) clearCartesianAxes(c);
        });
      };
      this.children.forEach((c) => {
        if (c instanceof GoFishNode) clearCartesianAxes(c);
      });
      return;
    }

    // Copy-on-claim: most nodes claim nothing, so they pass `claimed` itself
    // down. Every read below is of `claimed`, never of `next`, so deferring the
    // copy is observationally identical.
    let next = claimed;
    const claim = (dim: 0 | 1, sig: string): void => {
      if (next === claimed) next = new Map(claimed);
      next.set(dim, sig);
    };
    const space = this._underlyingSpace;
    const ticksOf = (dim: 0 | 1): AxisTicks =>
      enabled.get(dim) || DEFAULT_AXIS_TICKS;
    // A continuous axis is named by the keyed domain it is drawn over.
    const continuousSig = (dim: 0 | 1): string | undefined => {
      const s = space?.[dim];
      if (s === undefined || axisOver(this.placedSpace(s, dim)) === undefined)
        return undefined;
      const key = this.tryGetRenderSession()?.keyedDomains?.axisKey(
        this,
        dim,
        s
      );
      return key === undefined ? undefined : `c:${key}`;
    };
    for (const dim of [0, 1] as (0 | 1)[]) {
      const override =
        dim === 0 ? this._axisOverride?.x : this._axisOverride?.y;
      if (override !== undefined) {
        // An explicit `axes:{x/y:...}` override. `false` always suppresses. A
        // `true`, though, must not DUPLICATE an axis an ancestor already renders
        // for the SAME ordinal grouping: under the recursive-axis model an
        // enclosing facet cell auto-claims this node's ordinal (nesting), so an
        // inner `axes:{x:true}` on the same grouping would draw a redundant
        // second label row. Suppress the duplicate (but still block descendants).
        const s = space?.[dim];
        const mySig =
          s && isORDINAL(s) && !s.anonymous
            ? "o:" + JSON.stringify(s.domain ?? [])
            : undefined;
        // The continuous analogue: an ancestor already draws an axis over
        // this node's keyed domain (#1114), so this node's axis would be the
        // same axis again (a ridgeline's rows under the chart's x axis).
        const sig = mySig ?? continuousSig(dim);
        const dup =
          override !== false && sig !== undefined && claimed.get(dim) === sig;
        const show = override !== false && !dup;
        if (dim === 0) this.axis.x = show;
        else this.axis.y = show;
        if (show) this.axisDemand[dim] = ticksOf(dim);
        claim(dim, sig ?? AXIS_CLAIM_OPAQUE); // claim regardless — false blocks children too
      } else if (space && !isUNDEFINED(space[dim]) && enabled.has(dim)) {
        // A baseline magnitude ("free") owns no guide yet — only an anchored
        // (POSITION), unanchored (DIFFERENCE), or ORDINAL axis does.
        const s = space[dim];
        const prior = claimed.get(dim);
        let sig: string | undefined;
        if (isORDINAL(s) && !s.anonymous) {
          // Ordinal axes nest: claim unless this exact grouping is already
          // claimed by an ancestor (same keys → a duplicate of the same axis) or
          // a continuous/override owner holds the dim (opaque).
          //
          // An `anonymous` ordinal (its keys are positional — see
          // `ORDINAL_TYPE.anonymous` / `_syntheticKey`) is a `spread` with no
          // `by` — unit dots packed along a dimension for layout only. It carries
          // no grouping identity, so it renders no guide: it neither claims nor
          // labels an axis. An explicitly-KEYED spread (the low-level `key:`
          // idiom) is NOT anonymous and keeps its axis — its semantic
          // keys are a real category axis even without a `by`-derived measure.
          const mySig = "o:" + JSON.stringify(s.domain ?? []);
          if (
            prior === undefined ||
            (prior.startsWith("o:") && prior !== mySig)
          )
            sig = mySig;
        } else if (axisOver(this.placedSpace(s, dim)) !== undefined) {
          // Continuous: single-owner — only the root-most unclaimed chart
          // boundary claims (`isAxisBoundary`).
          if (prior === undefined && this.isAxisBoundary(dim))
            sig = continuousSig(dim) ?? AXIS_CLAIM_OPAQUE;
        }
        // A node owns the axis whether or not its chart draws it: an axis
        // its chart turns off is hidden, not handed to a chart below.
        if (sig !== undefined) {
          if (enabled.get(dim) !== false) {
            if (dim === 0) this.axis.x = true;
            else this.axis.y = true;
            this.axisDemand[dim] = ticksOf(dim);
          }
          claim(dim, sig);
        }
      }
    }
    this.children.forEach((c) => {
      if (c instanceof GoFishNode) c.resolveAxes(next, c.axesBelow(enabled));
    });
  }

  /** The axes this node draws, given its parent's (`enabled`): its own
   *  chart's `axes` option when it is a chart, else its parent's. */
  private axesBelow(
    enabled: Map<0 | 1, AxisTicks | false>
  ): Map<0 | 1, AxisTicks | false> {
    return this._chartAxes === undefined
      ? enabled
      : axesEnabled(this._chartAxes);
  }

  /**
   * Lay this node out and return it as its parent sees it.
   *
   * The node's own `_layout` reasons in its AXIS ORDER (see `axisDirection.ts`):
   * the box and translate it returns, and the scale it receives, run along its
   * own direction. Here that result is stored in pixels (`orientDims`,
   * `orientTransform`), and the node is handed back to its parent as a view in
   * the PARENT's axis order (`orientView`). The y scale is reflected on the
   * way in when the two directions differ (`orientScales`).
   *
   * `region` is the space the parent gives the node (#1059,
   * `geometry/region.ts`), in the PARENT's axis order. The node's own layout
   * reads it in its own order. On each axis where the region has a span and
   * the node's layout did not place itself, the node is centered in the span:
   * a node with no size of its own there was laid out in the span's length
   * (the size proposal), so it fills the span, and any other node keeps its
   * size and sits in the middle.
   */
  public layout(
    size: Size,
    scales: Size<AxisScale | undefined>,
    region?: Region
  ): Placeable {
    // Layout re-joins a layer's position measures (`collectPositionDomains`),
    // so it reads the type walk's union-find of units, whose bindings it
    // must see. The outermost call installs it, as the walk's root does.
    if (!hasUnits()) {
      return withUnits(this.walkUnits(), () =>
        this.layout(size, scales, region)
      );
    }
    const direction = this.yFrame.direction;
    const parentDirection = yDirection(this.parent);
    this._plotSpan = [undefined, undefined];
    if (this.strokeOverhang > 0) {
      const session = this.tryGetRenderSession();
      if (session !== undefined) session.outlined = true;
    }
    const { intrinsicDims, transform, renderData } = this._layout(
      size,
      orientScales(scales, direction, parentDirection),
      this.children,
      this,
      region === undefined || direction === parentDirection
        ? region
        : reflectRegionY(region)
    );

    this.intrinsicDims = orientDims(elaborateDims(intrinsicDims), direction);
    this.transform = orientTransform(elaborateTransform(transform), direction);
    this.renderData = renderData;
    this._geometry = undefined;

    // Seed the per-axis ledger from this node's own layout: the `size` is
    // frame-invariant, and a self-placed node (`translate` defined) also records
    // the absolute `min`. While unplaced only `size` is recorded — rank-1, so
    // `min`/`center`/`max` read `undefined`, the "not yet placed" state
    // `combineDims` encodes.
    for (const dir of [0, 1] as const) {
      const id = this.intrinsicDims?.[dir];
      if (id?.size === undefined && id?.min === undefined) continue;
      this._bbox ??= [undefined, undefined];
      const ledger = (this._bbox[dir] ??= new BBox());
      if (id?.size !== undefined)
        this._addEquation(ledger, dir, "size", id.size);
      const tr = this.transform?.translate?.[dir];
      if (tr !== undefined && id?.min !== undefined)
        this._addEquation(ledger, dir, "min", tr + id.min);
      // The ledger now records the self-placement (`min = translate + localMin`),
      // so the redundant written translate is retired: the parent's later
      // `place()` short-circuits on the solved ledger, not on the translate.
      this._clearTranslateIfSolved(dir);
    }
    const view = orientView(this, parentDirection);
    region?.spans.forEach((span, dir) => {
      if (span === undefined || view.dims[dir].min !== undefined) return;
      view.place(dir === 0 ? "x" : "y", (span[0] + span[1]) / 2, "center");
    });
    return view;
  }

  /**
   * This node's shape in its LOCAL layout frame (see {@link GeometryFn}),
   * computed on first call after layout and memoized until the next layout.
   * Geometry exists only after layout; a sizing-time form is #967.
   */
  public geometry(): Geometry {
    if (!this.intrinsicDims)
      throw new Error(
        `[gofish] geometry() called on ${this.type} before it was laid out`
      );
    if (this._geometry === undefined) {
      const g = (this._geometryFn ?? defaultGeometry)(
        {
          intrinsicDims: this.intrinsicDims,
          transform: this.transform,
          renderData: this.renderData,
        },
        this.children,
        this
      );
      // A node whose definition gives no outline is read as its box, its
      // edges named in its own axis order. Its samples are kept per
      // tolerance, for every reader of this layout.
      const outline =
        g.outline ?? (() => [boxOutline(g.box, this.yFrame.direction)]);
      const sampled = new Map<number, Outline[]>();
      this._geometry = {
        ...g,
        outline: (tolerance) => {
          let o = sampled.get(tolerance);
          if (o === undefined) sampled.set(tolerance, (o = outline(tolerance)));
          return o;
        },
      };
    }
    return this._geometry;
  }

  public get dims(): Dimensions {
    // The persistent per-axis ledger is the geometry AUTHORITY wherever it is
    // fully solved (rank 2): `dims` derives its absolute `(min, size)` from the
    // ledger and re-derives center/max via `localAnchorPoint`, exactly as
    // `combineDims` does. An under-determined or absent ledger falls back to the
    // `(intrinsicDims, transform)` split, derived lazily so a fully-solved node
    // never pays for it.
    let split: Dimensions | undefined;
    const fromSplit = (dir: Direction) =>
      (split ??= combineDims(this.intrinsicDims, this.transform))[dir];
    return ([0, 1] as const).map((dir) => {
      const ledger = this._bbox?.[dir];
      if (!ledger?.solved) return fromSplit(dir);
      const min = ledger.read("min")!;
      const size = ledger.read("size")!;
      return {
        min,
        center: localAnchorPoint("center", min, size),
        max: localAnchorPoint("max", min, size),
        size,
        // `embedded` is a layout-fold flag, never a ledger key — read it from
        // the local box.
        embedded: this.intrinsicDims?.[dir]?.embedded,
      };
    });
  }

  /** The node's parent-frame offset (`transform.translate`) as a DERIVED VIEW of
   *  the ledger — `ledger.min − localMin` on a fully solved axis, else the written
   *  `transform.translate` (the unplaced/under-determined fallback). Uses the
   *  CURRENT `intrinsicDims.min` (a rank-2 `setExtent` keeps it and sets the
   *  size), never a stale local box. */
  private _projectTranslate(dir: Direction): number | undefined {
    const ledger = this._bbox?.[dir];
    if (!ledger?.solved) return this.transform?.translate?.[dir];
    const min = ledger.read("min");
    if (min === undefined) return this.transform?.translate?.[dir];
    return min - (this.intrinsicDims?.[dir]?.min ?? 0);
  }

  /** "Is this axis already placed?" — read the LEDGER (a defined `min` means
   *  positioned), not the written `transform.translate`, which is retired where
   *  solved. Shared by `place()`'s short-circuit and `_pinAnchor`'s override
   *  check. */
  private _isPlacedOn(dir: Direction): boolean {
    return this._bbox?.[dir]?.read("min") !== undefined;
  }

  /** The single reconciliation every ledger write does: on a solved axis the
   *  ledger is the authority, so CLEAR the redundant written translate (the split
   *  becomes a projection, not a stale mirror). An under-determined axis keeps its
   *  written fallback. Shared by the `layout()` seed, `_pinAnchor`, and rank-2
   *  `setExtent`. */
  private _clearTranslateIfSolved(dir: Direction): void {
    if (this._bbox?.[dir]?.solved && this.transform?.translate)
      this.transform.translate[dir] = undefined;
  }

  /** Add a box-key equation to a per-axis ledger, surfacing any over-determination
   *  the `BBox` detects (the placement pass's "named conflict, not silent
   *  last-writer" — single-owner case; observe-only behind GOFISH_CONFLICT_CHECK).
   *  Every ledger write goes through here so no conflict is silently dropped. */
  private _addEquation(
    box: BBox,
    dir: Direction,
    key: BBoxKey,
    value: BBoxValue,
    owner?: string
  ): void {
    const conflict = box.add(key, value, owner);
    if (CONFLICT_CHECK && conflict)
      reportConflict(this.type, dir as 0 | 1, conflict);
  }

  /** Public read of {@link _projectTranslate} for cross-node geometry: `_ref`
   *  accumulates the parent-frame translate up/down the tree to position a ref. */
  public projectedTranslate(dir: Direction): number | undefined {
    return this._projectTranslate(dir);
  }

  /** {@link localPlotSpan}'s memo, per axis, cleared when it is laid out
   *  (`null`: its plot is its box). */
  private _plotSpan: [
    [number, number] | null | undefined,
    [number, number] | null | undefined,
  ] = [undefined, undefined];

  /**
   * Where its plot lies on `axis` in its local frame, once laid out: its
   * box without its dressing and chrome (see {@link resolvePlotExtent}), or
   * undefined when that is its whole box ({@link plotIsBox}). Any other
   * node that wears chrome has its content's; a layer has the hull of its
   * children that are no dressing there, each at its own plot. A chain lays its parts by their plots
   * (`anchorOffset`), so dressing never moves the parts it dresses (#1032).
   */
  public localPlotSpan(axis: 0 | 1): [number, number] | undefined {
    const memo = this._plotSpan[axis];
    if (memo !== undefined) return memo ?? undefined;
    const value = this.computePlotSpan(axis);
    this._plotSpan[axis] = value ?? null;
    return value;
  }

  private computePlotSpan(axis: 0 | 1): [number, number] | undefined {
    if (this.plotIsBox(axis)) return undefined;
    // A child's plot in its parent's frame, or its box when that is its
    // plot. Both are in pixels, as the child stores its box, whichever way
    // the parent reads y: a parent that reads y the other way sees the span
    // through its view of the child (`orientView`), which reflects it.
    const inFrame = (
      c: Placeable,
      plot: [number, number] | undefined
    ): [number, number] | undefined => {
      const { min, max } = c.dims[axis];
      if (min === undefined || max === undefined) return undefined;
      if (plot === undefined) return [Math.min(min, max), Math.max(min, max)];
      const shift = min - (c.localAnchor?.(axis, "min") ?? 0);
      return [plot[0] + shift, plot[1] + shift];
    };
    if (this.chrome !== undefined) {
      // Its box less its chrome's gutters, which its layout read off its
      // claims (`chromeGutters`), in its axis order.
      const min = this.localAnchor(axis, "min");
      const max = this.localAnchor(axis, "max");
      if (min === undefined || max === undefined) return undefined;
      const [start, end] = this.chromeGutters(axis);
      const up = axis === 1 && this.yFrame.direction !== 1;
      return up ? [min + end, max - start] : [min + start, max - end];
    }
    const walk = this.claimWalk;
    const out = (i: number) =>
      walk?.dressing[axis].has(i) === true || walk?.ink[axis].has(i) === true;
    const own = this.children.map((c) =>
      c instanceof GoFishNode ? c.localPlotSpan(axis) : undefined
    );
    if (!this.children.some((_, i) => out(i)) && own.every((p) => !p))
      return undefined;
    let lo = Infinity;
    let hi = -Infinity;
    this.children.forEach((c, i) => {
      if (out(i) || !(c instanceof GoFishNode)) return;
      const span = inFrame(c, own[i]);
      if (span === undefined) return;
      lo = Math.min(lo, span[0]);
      hi = Math.max(hi, span[1]);
    });
    return lo <= hi ? [lo, hi] : undefined;
  }

  public localAnchor(axis: FancyDirection, anchor: Anchor): number | undefined {
    return localAnchorOf(
      this.intrinsicDims?.[elaborateDirection(axis)],
      anchor
    );
  }

  private get _displayTransform(): Transform | undefined {
    const tx = this._projectTranslate(0);
    const ty = this._projectTranslate(1);
    // Derive a transform whenever the ledger supplies a translate OR one was
    // written, so lowering sees the position either way. Undefined only for a
    // node with neither (an unplaced leaf).
    if (tx === undefined && ty === undefined && !this.transform)
      return undefined;
    return { translate: [tx, ty], scale: this.transform?.scale };
  }

  public place(
    axis: FancyDirection,
    value: number,
    anchor: Anchor = "min"
  ): void {
    const dir = elaborateDirection(axis);
    // Until the anchor's local point is determined (see `anchorDetermined`), the
    // only thing place() can record is the local `min` — `center`/`max` aren't
    // stored, and `baseline` can't resolve its origin without a local `min`.
    if (!anchorDetermined(this.intrinsicDims?.[dir], anchor)) {
      if (anchor === "min") {
        this.intrinsicDims![dir].min = value;
        this._geometry = undefined;
      }
      return;
    }

    // Already placed on this axis? The "I have an opinion, don't move me" signal,
    // now read off the ledger (see `_isPlacedOn`), not the retired translate.
    if (this._isPlacedOn(dir)) return;

    // Pin the anchor to `value` (shared with `setExtent`'s rank-1 pin), rather
    // than reading a separately-stored `center`/`max` — so the two placement
    // paths can never disagree on an asymmetric box.
    this._pinAnchor(dir, anchor, value);
  }

  /**
   * Write a node's per-axis extent from OWNED bbox keys (min/max/center/size)
   * — the bbox-backed primitive that `span` and an authoritative `position` pin
   * share. Two or more owned keys DETERMINE the box (size included — the
   * size-setting case, e.g. span's two edges): the local box keeps its min and
   * takes the size, and the translate is the absolute min less that local
   * min. A single owned key is a
   * position pin: the size comes from the node's own layout (the second
   * equation), the local box is left intact, and only the translate moves — so
   * the pin OVERRIDES a self-placed translate, which the write-once `place()`
   * cannot. Anchor keys map start→min, end→max, middle→center; `baseline`
   * (the origin) is not a bbox key, so a baseline pin still uses `place()`.
   *
   * The rank-2 solve writes through the PERSISTENT per-axis ledger
   * ({@link _bbox}) so it mirrors the node's authoritative geometry: a
   * determining constraint resets the axis's ledger (overriding the
   * self-layout seed). Cross-call over-determination
   * detection (two constraints fighting over one axis) waits on the authority
   * model — a self-layout default vs a hard constraint pin.
   */
  public setExtent(
    axis: FancyDirection,
    owned: Partial<Record<BBoxKey, number>>,
    owner?: string
  ): void {
    const dir = elaborateDirection(axis);
    const keys = (
      Object.entries(owned) as [BBoxKey, number | undefined][]
    ).filter((e): e is [BBoxKey, number] => e[1] !== undefined);
    if (keys.length === 0) return;

    const sizeOwned = keys.length >= 2;

    if (!sizeOwned) {
      // Rank-1 position pin: a single anchor key lands at its value; the size
      // is the node's own layout (the second equation). No BBox needed — the
      // anchor's local point is derived directly, the SAME `localAnchorPoint`
      // arithmetic `place()` uses, so the two paths can't diverge (and the hot
      // pin path allocates nothing). The local box is left intact; only the
      // translate moves, so the pin OVERRIDES a self-placed translate.
      const [key, value] = keys[0];
      if (key === "size") return; // a lone size can't determine a position
      this._pinAnchor(dir, key, value);
      return;
    }

    // Rank-2: two+ owned keys DETERMINE the box (size included). This is an
    // overriding determination — it discards whatever the node's own layout seed
    // (or an earlier pin) recorded for this axis. So the persistent ledger is
    // RESET to hold just these keys — and is now the SOLE record of this axis's
    // position.
    this._bbox ??= [undefined, undefined];
    const bbox = (this._bbox[dir] = new BBox());
    for (const [key, value] of keys)
      this._addEquation(bbox, dir, key, value, owner);
    const absMin = bbox.read("min");
    const size = bbox.read("size");
    if (absMin === undefined || size === undefined) return; // under-determined

    if (!this.intrinsicDims) this.intrinsicDims = [];
    // Store only the local box (min, size); the `dims` getter derives center/max.
    // The local min stays where the node's own layout put it: a container's
    // children are placed in its local frame, so moving that frame's min to 0
    // would draw them off the box by the old min (a spread pinned across a
    // cell on an upward y drew its bars one cell away). The translate is
    // read as `absMin − localMin` either way.
    this.intrinsicDims[dir] = {
      ...(this.intrinsicDims[dir] ?? {}),
      min: this.intrinsicDims[dir]?.min ?? 0,
      size,
    };
    this._geometry = undefined;
    // Translate is derived from the solved ledger, not written here; clear any
    // stale prior value (see `_clearTranslateIfSolved`).
    this._clearTranslateIfSolved(dir);
  }

  /**
   * Authoritative override pin: land `anchor` at `value`, REBUILDING the
   * ledger when the axis was already self-placed — which the write-once `place()`
   * cannot do. The public face of {@link _pinAnchor}, shared by an authoritative
   * `position` pin (scatter repositioning a self-placed glyph). Handles EVERY
   * anchor, `baseline` (the origin) included, so no override bypasses the ledger
   * — every reader (`dims`/render via `_projectTranslate`) derives the new
   * position. Optional on `Placeable` for the same reason as `setExtent` (a `ref`
   * stand-in doesn't implement it; only real constraint targets are ever pinned).
   */
  public pinAnchor(axis: FancyDirection, value: number, anchor: Anchor): void {
    this._pinAnchor(elaborateDirection(axis), anchor, value);
  }

  /**
   * Pin one axis so the box's `anchor` lands at `value`, deriving the
   * anchor's local point from `(min, size)` via `localAnchorPoint`. The single
   * arithmetic shared by `place()`'s determined branch, `setExtent`'s rank-1
   * position pin, and the public {@link pinAnchor}, so the placement paths can
   * never disagree on an asymmetric box. Writes only the translate; the local
   * box is left intact.
   */
  private _pinAnchor(dir: Direction, anchor: Anchor, value: number): void {
    const intrinsic = this.intrinsicDims?.[dir];
    // Is this a re-pin of an already-placed axis (so rebuild the ledger below)?
    // Read the ledger's prior state (see `_isPlacedOn`) before the block below
    // mutates it.
    const override = this._isPlacedOn(dir);

    // Record the pin into the ledger so it represents EVERY anchor, `baseline`
    // included. A `baseline` pin sets the box's local-0 ORIGIN (not a
    // min/max/center edge), so record the absolute min that origin implies —
    // screen-min = origin + localMin = value + intrinsicDims.min — and
    // `_projectTranslate`/`dims` derive its geometry like any other anchor. A
    // `setExtent` rank-1 / re-placement OVERRIDE rebuilds the axis ledger (a new
    // position), re-seeding the frame-invariant size.
    this._bbox ??= [undefined, undefined];
    if (override || !this._bbox[dir]) this._bbox[dir] = new BBox();
    const ledger = this._bbox[dir]!;
    if (intrinsic?.size !== undefined)
      this._addEquation(ledger, dir, "size", intrinsic.size);
    if (anchor === "baseline") {
      this._addEquation(ledger, dir, "min", value + (intrinsic?.min ?? 0));
    } else {
      this._addEquation(ledger, dir, anchor, value);
    }

    // Write the pin's translate, then reconcile: on a solved axis the ledger is
    // the authority so the write is cleared (a re-pin OVERRIDING an earlier
    // written translate has its stale value cleared too, not left to diverge);
    // on an under-determined axis (size unknown) the write stays as the readers'
    // fallback. See `_clearTranslateIfSolved`.
    this.ensureTranslate()[dir] = translateForAnchor(intrinsic, anchor, value);
    this._clearTranslateIfSolved(dir);
  }

  /**
   * Write ONLY this axis's size (align `"size"`) — no bbox ledger, no
   * translate write. Overwrites whatever the node's own layout computed for
   * `size` (e.g. a bare rect's baked `DEFAULT_RECT_SIZE`) in place, so a
   * subsequent position write (a companion align, or the parent's seat for
   * a child its constraints left unplaced) still lands normally — this genuinely does
   * not participate in position resolution at all.
   */
  public setSizeOnly(
    axis: FancyDirection,
    size: number,
    _owner?: string
  ): void {
    const dir = elaborateDirection(axis);
    if (!this.intrinsicDims) this.intrinsicDims = [];
    this.intrinsicDims[dir] = { ...(this.intrinsicDims[dir] ?? {}), size };
    this._geometry = undefined;
  }

  /** {@link Placeable.spaceOn} */
  public spaceOn(dir: Direction): UnderlyingSpace | undefined {
    return this._underlyingSpace?.[dir];
  }

  /** Lazily ensure `transform.translate` exists (preserving any `scale`) and
   *  return it. Shared by `place()` and `setExtent` — the one place the
   *  `[undefined, undefined]` "unplaced on both axes" seed is written. */
  private ensureTranslate(): (number | undefined)[] {
    if (!this.transform) this.transform = { translate: [undefined, undefined] };
    if (!this.transform.translate)
      this.transform.translate = [undefined, undefined];
    return this.transform.translate;
  }

  public embed(direction: FancyDirection): void {
    this.intrinsicDims![elaborateDirection(direction)].embedded = true;
  }

  /**
   * Make this node draw nothing: it keeps its dims, its layout, its datum and
   * its ref-anchoring role, but contributes no display items. Every lower path
   * goes through {@link INTERNAL_lower}, so replacing the lowering — rather than
   * consulting a "visible" flag at paint — makes the node invisible everywhere by
   * construction. `blank()` is built this way (`shapes/rect.tsx`); `GoFishRef`
   * draws nothing for the same reason.
   */
  public INTERNAL_emitNothing(): void {
    this._lower = () => [];
  }

  /**
   * Lend this node's own drawing to another node to paint: the returned
   * function lowers the node exactly as it was built to draw itself, placed
   * at `transform` (an absolute transform, like `INTERNAL_lower`'s override)
   * and mapped by `toPixel`. Call it while lowering, like any `_lower`. It lends the node's own lowering
   * even when the node has been silenced (`INTERNAL_emitNothing`), so a node
   * can be silenced and lend in either order, any number of times. A
   * `time.transition()` moves a keyframe's text this way: it draws the copy
   * where the playhead has taken the text.
   */
  public INTERNAL_lendDrawing(): (
    transform: Transform,
    toPixel: ToPixel
  ) => DisplayList.DisplayItem[] {
    const own = this._ownLower;
    // Lowered as `INTERNAL_lower` lowers, ids and live channels included,
    // but without the visibility rule: the node painting the copy owns when
    // it shows.
    return (transform, toPixel) =>
      own ? this.lowerWith(own, transform, toPixel, undefined, false) : [];
  }

  /**
   * Make this node's items show only while `visible()` says so, as a PAINT-time
   * fact: the items are lowered either way, and their opacity is patched per
   * frame from the same live-slot side table a `live()` channel uses.
   *
   * This is the other half of the pair with {@link INTERNAL_emitNothing}, and
   * the difference is which tier decides. A node that must not draw AT ALL
   * (`blank()`, a `ref`, a keyframe a transition moves when its sequence
   * keeps no history) is hidden by construction, at resolve. A node whose
   * drawing comes and goes with a signal — a `time.sequence`'s keyframe
   * groups, where the clock picks which band is showing, or the keyframe marks
   * a `time.transition()` leaves behind as its trail — cannot be, because a
   * resolve-time answer would make the signal a pipeline dependency and put
   * the whole chart through layout on every tick. The layout is the same
   * either way (every keyframe is placed, which is what holds the axes still),
   * so only the painting changes, and only the painting is patched.
   *
   * A rule is set under an `owner`, the thing that decides it (a
   * `time.sequence` for its keyframes). The rule covers the node's whole
   * subtree: a node paints only while every owner's rule holds, and each
   * owner's rule is the one set nearest the node (see `effectiveVisibility`).
   * So marks that an elaboration pass adds under the node later are hidden
   * with it, a descendant can refine what the same owner decides for its own
   * subtree (a transition's trail, over the sequence's keyframe groups), and
   * setting a rule again from the same owner, e.g. on a second layout,
   * replaces the first rather than piling up.
   *
   * Emitting nothing WINS over this: a node whose `_lower` returns no items has
   * nothing to patch, so the two compose with no coordination.
   *
   * The limitation is the live channels' own: the item the runtime records for
   * hit-testing is the one lowered at resolve, so a hidden node still answers
   * to a pointer. See /internals/frontend/reactivity.
   */
  public INTERNAL_visibleWhile(owner: object, visible: () => boolean): void {
    (this.__gfVisible ??= new Map()).set(owner, visible);
  }

  /**
   * Record that `node` belongs to this node as a mark though it lives outside
   * its subtree (a label the label pass seats in the tier above), in both
   * directions: `this._attachments` lists it, and `node._attachedTo` names
   * this node. Whoever takes the mark over (a `time.transition()`) takes its
   * attachments with it, and an attachment paints under its mark's animation.
   */
  public INTERNAL_attach(node: GoFishNode): void {
    (this._attachments ??= []).push(node);
    node._attachedTo = this;
  }

  /**
   * Animate this node's items at PAINT time: the node lowers at rest, and
   * `rule` rewrites the items to the build clock's current state and patches
   * the fields that change per frame through the live-slot side table, the
   * same channel `INTERNAL_visibleWhile` and a `live()` value use. Nothing is
   * laid out again: the node keeps its layout box, the room it takes at rest.
   * The nodes attached to this one (its labels) paint under the same rule, as
   * riders that follow its timing. See `src/animation/paint.ts`.
   */
  public INTERNAL_animate(rule: AnimationRule): void {
    this.__gfAnimate = rule;
  }

  /** The visibility this node paints under: for each owner, the rule set
   *  nearest the node, on it or an ancestor, and all of them must hold. A rule
   *  set on a node covers its whole subtree, including nodes a later
   *  elaboration pass adds under it (a label's `Text`, an axis's ticks), so
   *  nothing has to be stamped node by node. Undefined when no rule is set
   *  anywhere up the chain, which is the static path. */
  private effectiveVisibility(): (() => boolean) | undefined {
    const owners = new Set<object>();
    const rules: (() => boolean)[] = [];
    for (let n: GoFishNode | undefined = this; n; n = n.parent) {
      if (n.__gfVisible === undefined) continue;
      for (const [owner, rule] of n.__gfVisible) {
        if (owners.has(owner)) continue;
        owners.add(owner);
        // One decision per rule, shared by every item the rule covers, so a
        // tick patches the items whose rule changed its answer and no others.
        rules.push(sharedDecision(rule));
      }
    }
    if (rules.length === 0) return undefined;
    if (rules.length === 1) return rules[0];
    return () => {
      for (const rule of rules) if (!rule()) return false;
      return true;
    };
  }

  /**
   * Lower this node and its subtree into display-list items: call this node's
   * `_lower`, then append the lowered label. `transformOverride` is the baked
   * absolute transform from the bake pass.
   */
  public INTERNAL_lower(
    coordinateTransform?: CoordinateTransform,
    transformOverride?: Transform
  ): DisplayList.DisplayItem[] {
    // Children are NOT pre-recursed here. A node reaching
    // INTERNAL_lower is either a leaf (no children) or a bake boundary (coord,
    // box, connect, arrow, enclose, …) that carries its own absolute transform —
    // a boundary must re-walk its subtree with that transform composed in (via
    // `flattenLayout`) so descendants land in absolute coordinates before
    // `toPixel`. Pre-recursed, parent-relative child items would be mispositioned.
    if (!this._lower) {
      // A node with no lowering of its own draws only its children (the bake
      // lowers them directly), so with no children it draws nothing: an
      // operator over a group with no rows, such as an empty cell's.
      if (this.children.length === 0) return [];
      throw new Error(
        `[gofish] node type "${this.type}" has no lower() yet — cannot ` +
          `emit the display list.`
      );
    }
    const toPixel = this.getRenderSession().toPixel;
    if (!toPixel) {
      throw new Error("[gofish] toPixel not set on the render session");
    }

    return this.lowerWith(
      this._lower,
      transformOverride ?? this._displayTransform,
      toPixel,
      coordinateTransform,
      true
    );
  }

  /**
   * The body of {@link INTERNAL_lower}, shared with the drawing
   * {@link INTERNAL_lendDrawing} lends: call `lower` for this node, stamp the
   * items' ids, wire its live channels, and, when `withVisibility` is set,
   * apply the paint-time visibility rule. A lent drawing skips that rule
   * because the node painting it decides when it shows, and it passes the
   * lowering it was lent, which the node itself may since have been silenced
   * out of.
   */
  private lowerWith(
    lower: Lower,
    transform: Transform | undefined,
    toPixel: ToPixel,
    coordinateTransform: CoordinateTransform | undefined,
    withVisibility: boolean
  ): DisplayList.DisplayItem[] {
    const [tx, ty] = displayTranslate(transform);
    const direction = this.yFrame.direction;
    const items = lower(
      {
        intrinsicDims: this.intrinsicDims,
        transform,
        renderData: this.renderData,
        coordinateTransform,
        toPixel,
        local: ([x, y]) => [x + tx, direction * y + ty],
      },
      [],
      this
    );
    // Stamp the emitting node's uid as the item id (hit-testing hook — the IR
    // field predates this and was unpopulated). Boundary nodes re-walk children
    // through the children's own INTERNAL_lower, so descendants keep their own
    // ids; `??=` preserves any id a lower body sets itself. Zero-cost otherwise.
    for (const item of items) item.id ??= this.uid;
    // Live channels (a `live()` value): bake a datum-bound thunk per channel
    // into the paint-time side table so paint re-evaluates it reactively. The
    // thunks are held OUTSIDE the display item (WeakMap) so the item stays pure
    // data for serialization / normalized-DOM captures.
    const liveChannels = this.__gfLive;
    if (liveChannels) {
      const datum = this.datum;
      const slots: Record<string, () => unknown> = {};
      for (const channel in liveChannels) {
        const accessor = liveChannels[channel];
        slots[channel] = () => accessor(datum);
      }
      for (const item of items) setLiveSlots(item, slots);
    }
    // A node with no items has nothing to hide, so it skips the walk to the
    // root that finding its visibility takes.
    if (!withVisibility || items.length === 0) return items;
    // Paint-time animation (see `INTERNAL_animate`): this node's own rule, or
    // the rule of the mark it is attached to. Like visibility, a taken-over
    // drawing skips it: its new owner decides how it shows.
    const rule = this.__gfAnimate ?? this._attachedTo?.__gfAnimate;
    if (rule) {
      const role = this.__gfAnimate ? "host" : "rider";
      rule.paint(items, { transform, toPixel }, this, role);
    }
    // Paint-time visibility (see `INTERNAL_visibleWhile`): the item keeps the
    // opacity it was lowered with while it is showing, and goes to 0 while it
    // is not. The STATIC value is read here, so a headless lowering and a
    // screenshot show exactly what the live chart shows at that playhead; the
    // slot then patches the one attribute per frame.
    const visible = this.effectiveVisibility();
    if (visible) {
      const showing = readLive(visible);
      for (const item of items) {
        const own = item.style?.opacity ?? 1;
        if (!showing) item.style = { ...item.style, opacity: 0 };
        setLiveSlots(item, { opacity: () => (visible() ? own : 0) });
      }
    }
    return items;
  }

  public setRenderSession(session: RenderSession): void {
    this.renderSession = session;
    this.children.forEach((child) => {
      if (
        "setRenderSession" in child &&
        typeof child.setRenderSession === "function"
      ) {
        child.setRenderSession(session);
      }
    });
  }

  /** The union-find of unknown units this node's walks run in (measure.ts):
   *  the render session's when there is one (`RenderSession.units`), else the
   *  one the root of the first walk over this node's tree owns, which that
   *  walk creates. The layout pass and the embedding pass read the same one,
   *  so they see the type walk's bindings. */
  private walkUnits(): Units {
    const session = this.tryGetRenderSession();
    if (session !== undefined) return (session.units ??= new Units());
    for (let n: GoFishNode | undefined = this; n; n = n.parent) {
      if (n.units !== undefined) return n.units;
    }
    return (this.units = new Units());
  }

  public getRenderSession(): RenderSession {
    if (this.renderSession) {
      return this.renderSession;
    }
    if (this.parent && "getRenderSession" in this.parent) {
      return this.parent.getRenderSession();
    }
    throw new Error("Render session not set");
  }

  /** Non-throwing session lookup for the layout-path σ-scope registry: the full
   *  `gofish()` flow always sets a session before layout, but a
   *  standalone `node.layout(...)` (some coord/confluence tests) has none — then
   *  the scope solve just uses a throwaway registry with identical arithmetic. */
  public tryGetRenderSession(): RenderSession | undefined {
    if (this.renderSession) return this.renderSession;
    const parent = this.parent as
      | { tryGetRenderSession?: () => RenderSession | undefined }
      | undefined;
    return parent && typeof parent.tryGetRenderSession === "function"
      ? parent.tryGetRenderSession()
      : undefined;
  }

  public render(container: HTMLElement, options: GoFishRenderOptions) {
    return gofish(container, options, this);
  }

  /**
   * Render to a detached `<svg>` element instead of mounting into the page.
   * Same options as {@link render}, plus `background`. Requires a DOM
   * (browser or notebook front-end); headless Node is tracked in #577.
   */
  public toSVGElement(
    options: GoFishExportOptions = {}
  ): Promise<SVGSVGElement> {
    return gofishToSVGElement(options, this);
  }

  /** Render to a standalone SVG markup string. See {@link toSVGElement}. */
  public toSVG(options: GoFishExportOptions = {}): Promise<string> {
    return gofishToSVG(options, this);
  }

  /**
   * Emit the post-layout *render IR* — a flat display list of positioned
   * primitives in absolute pixels, solved at this viewport. The SVG/Canvas/
   * WebGPU backends each consume it. See {@link toDisplayList}.
   */
  public toDisplayList(options: GoFishRenderOptions = {}) {
    return toDisplayList(this, options);
  }

  /**
   * Render and save to `filename`. Format is inferred from the extension
   * (only `.svg` today). In a browser this downloads; in Node it writes the
   * file.
   */
  public save(
    filename: string,
    options: GoFishExportOptions = {}
  ): Promise<void> {
    return gofishSave(filename, options, this);
  }

  public name(name: string | Token): this {
    this._name = name;
    return this;
  }

  public scope(): this {
    this._isScope = true;
    return this;
  }

  /**
   * Label this node (see `labels/elaborate.tsx`). `call` stands for the
   * `.label()` call the label comes from, and the labels of one call are
   * placed together: a mark's or an operator's `.label()` passes the one
   * `call` it made to every node it labels. Called on a node directly, it
   * is a call of its own.
   */
  public label(
    accessor: LabelAccessor,
    options?: LabelOptions,
    call: object = {}
  ): this {
    (this._labels ??= []).push({
      accessor,
      ...withKindValues(options),
      group: call,
    });
    return this;
  }

  public setKey(key: string): this {
    this.key = key;
    return this;
  }

  /**
   * Relate nodes inside this layer. `fn` receives the layer's environment
   * (`relateEnv`: one operand per name inside the layer) and returns a list of
   * clauses. A clause is either a constraint (`Constraint.align`, ...), which
   * places its operands, or a term that draws: an operator or mark such as
   * `arrow(opts, [a, b])` or `enclose(opts, [a, b])`, whose children may
   * mix operands from the environment with fresh marks. A drawing clause
   * becomes a child of this layer (flagged `_relateClause`), and the layer
   * lays it out after the clauses that write the positions it reads (see
   * `scheduleRelate` in `constraints/relate.ts`). A later call replaces the
   * clauses of an earlier one.
   */
  public async relate(fn: RelateFn): Promise<this> {
    // Only a layer schedules clauses around its solve (layer.tsx).
    if (this.type !== "layer" && this.type !== "box") {
      throw new Error(
        `.relate() is a layer method, but it was called on a ${this.type}. ` +
          `Wrap the nodes to relate in a layer([...]) and relate that.`
      );
    }
    // A later call replaces the drawing clauses of an earlier one.
    this.children = this.children.filter((c) => !isRelateClause(c));
    const env = relateEnv(this);
    const { constraints, nodes } = await resolveRelateClauses(fn(env), env);
    // The relate's constraints replace an earlier relate's, and the layer's
    // paint-order defaults for its own relational-mark children stay.
    this.constraints = [...(this._paintDefaults ?? []), ...constraints];
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
    // A drawing clause that is a relational mark (`enclose`, `line`, ...)
    // paints under the nodes it reads, by the same default a layer gives its
    // children (`applyRelationalZBelowDefaults`); a clause's operands are
    // names of this layer.
    applyRelationalZBelowDefaults(this, nodes);
    this._hasRelateClauses = nodes.length > 0;
    return this;
  }

  public zOrder(value: number): this {
    this._zOrder = value;
    return this;
  }

  /** The raw author-set z-order hint, or `undefined` if never set (distinct
   *  from an explicit `.zOrder(0)`). Callers that need a numeric sort key
   *  should apply `?? 0`; callers that need to detect "was a hint given at
   *  all" should compare against `undefined`. */
  public getZOrder(): number | undefined {
    return this._zOrder;
  }
}

/** Whether `c` is a drawing clause of some layer's `.relate()`. (`instanceof`
 *  first: a token `ref` proxy answers every property.) */
export function isRelateClause(c: GoFishAST | undefined): c is GoFishNode {
  return c instanceof GoFishNode && c._relateClause !== undefined;
}

const isGoFishNode = (node: GoFishNode | GoFishAST): node is GoFishNode => {
  return "intrinsicDims" in node && "transform" in node && "dims" in node;
};

const nodeLabel = (node: GoFishNode | GoFishAST): string => {
  const name = isGoFishNode(node) ? node._name : node.name;
  return `${node.type}${name ? ` (${name})` : ""}`;
};

/** One line per node, plus optional detail lines printed inside the node's
 *  console group. The shared shape every debug tree printer below formats into. */
type TreeLine = { label: string; details?: string[] };

/** Depth-first console printer shared by the debug tree dumps: a node with
 *  children (or detail lines) opens a console group, everything else is a
 *  single line. */
const walkTree = (
  node: GoFishNode | GoFishAST,
  format: (node: GoFishNode | GoFishAST) => TreeLine,
  indent: string = ""
): void => {
  const { label, details } = format(node);
  const children = ("children" in node ? node.children : undefined) ?? [];
  const grouped = children.length > 0 || (details?.length ?? 0) > 0;
  if (grouped) console.group(`${indent}${label}`);
  else console.log(`${indent}${label}`);
  details?.forEach((line) => console.log(`${indent}${line}`));
  children.forEach((child) => walkTree(child, format, indent + "  "));
  if (grouped) console.groupEnd();
};

export const debugNodeTree = (node: GoFishNode | GoFishAST): void =>
  walkTree(node, (n) => {
    const details: string[] = [];
    if (isGoFishNode(n)) {
      n.intrinsicDims?.forEach((dim, i) => {
        details.push(
          `${i === 0 ? "Width" : "Height"}: ${JSON.stringify({
            min: dim.min,
            center: dim.center,
            max: dim.max,
            size: dim.size,
          })}`
        );
      });
      if (n.transform)
        details.push(`Transform: ${JSON.stringify(n.transform.translate)}`);
      details.push(`Combined Dimensions: ${JSON.stringify(n.dims)}`);
    }
    return { label: `Node: ${nodeLabel(n)}`, details };
  });

const formatSpace = (s: UnderlyingSpace): string => {
  if (isCONTINUOUS(s)) {
    return `${s.origin}(${toJSON(s.dataInterval)})`;
  }
  if (isORDINAL(s)) return `ordinal(${s.domain})`;
  if (isUNDEFINED(s)) return `undefined`;
  return "unknown";
};

export const debugUnderlyingSpaceTree = (node: GoFishNode | GoFishAST): void =>
  walkTree(node, (n) => ({
    label: `${nodeLabel(n)} → [${n.resolveUnderlyingSpace().map(formatSpace).join(", ")}]`,
  }));

const formatArgValue = (val: any): string => {
  if (
    typeof val === "object" &&
    val !== null &&
    "type" in val &&
    val.type === "datum"
  ) {
    return `v(${JSON.stringify(val.datum)})`;
  }
  if (Array.isArray(val)) return `[${val.map(formatArgValue).join(", ")}]`;
  if (typeof val === "object" && val !== null) {
    return `{${Object.entries(val)
      .map(([key, nested]) => `${key}: ${formatArgValue(nested)}`)
      .join(", ")}}`;
  }
  return JSON.stringify(val);
};

const formatArgs = (args: any): string => {
  if (args === undefined || args === null) return "";
  try {
    return ` ${formatArgValue(args)}`;
  } catch {
    return ` [Object]`;
  }
};

export const debugInputSceneGraph = (node: GoFishNode | GoFishAST): void =>
  walkTree(node, (n) => ({
    label: `${nodeLabel(n)}${isGoFishNode(n) ? formatArgs(n.args) : ""}`,
  }));
