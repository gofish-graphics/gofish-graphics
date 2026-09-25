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
import {
  Anchor,
  Dimensions,
  Direction,
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
  AliasResolution,
  buildAliasMap,
} from "./dims";
import { gofish, gofishToSVGElement, gofishToSVG, gofishSave } from "./gofish";
import type { GoFishExportOptions, GoFishRenderOptions } from "./gofish";
import { toDisplayList } from "./displayList/toDisplayList";
import type { DisplayList } from "gofish-ir";
import { setLiveSlots } from "../interaction/liveSlots";
import { readLive } from "../interaction/live";
import type { LiveValue } from "../interaction/live";
import type { AnimationRule } from "../animation/paint";
import { GoFishRef } from "./_ref";
import { GoFishAST } from "./_ast";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import {
  getValue,
  isValue,
  MaybeValue,
  baseEmbedded,
  getMeasure,
} from "./data";
import { color6 } from "../color";
import {
  isCONTINUOUS,
  isDIFFERENCE,
  isORDINAL,
  isPOSITION,
  isUNDEFINED,
  continuousInterval,
  spacePlacement,
  UnderlyingSpace,
} from "./underlyingSpace";
import { toJSON } from "../util/interval";
import type { AxisScale } from "./domain";
import { envFlag } from "../util";
import type { ScaleContext } from "./gofish";
import type { TokenContext } from "./tokenContext";
import type { FlipScope } from "./_displayObject";
import { isToken, Token } from "./createName";
import type { ConstraintSpec, ConstraintRef } from "./constraints";
import { constraintEnv, validateOperands } from "./constraints";
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

export type RenderSession = {
  tokenContext: TokenContext;
  scaleContext: ScaleContext;
  /** Set by the lower emit driver (`lowerToDisplayList`) for the duration of a
   *  lowering walk: the y-up→y-down pixel mapping every `lower` body uses. */
  toPixel?: ToPixel;
  /** The per-scope `toPixel` factory (issue #629): `flip → ToPixel`, built once by
   *  the render terminal from the viewport. A BAKE BOUNDARY reads it to re-lower
   *  its child subtree through the scope walk (`bake`) and install each descendant
   *  scope's own map — so a continuous-y subtree inside an UNDEFINED-y boundary
   *  (`enclose`/`arrow`/`connect`) still flips, instead of inheriting the
   *  boundary's single (y-down) map. Set by `lowerToDisplayList`. */
  toPixelFor?: (flip?: FlipScope) => ToPixel;
  /** The flip scope of the draw entry currently being lowered (issue #629) — the
   *  boundary's own scope, seeded into its child re-bake so descendants inherit it
   *  unless they open their own. Set by `lowerToDisplayList` per baked entry. */
  flip?: FlipScope;
  /** The σ-scope registry: the one place σ / posScale is derived,
   *  shared by every scope root in this render. Created on first use
   *  (`getScopeRegistry`). */
  scopes?: ScopeRegistry;
};

export type Placeable = {
  dims: Dimensions;
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
  /** Stamped by a FIXED-PITCH `distribute` (`anchor` ≠ "edge") on `dir: "y"`:
   *  the anchor the chain related on this target. A fixed-pitch chain is an
   *  overlay, not a tiling — the target's allocated y band is just the leftover
   *  slice and bears no relation to where its chained anchor sits — so if this
   *  node later opens its own y-up flip scope, the scope mirrors about THIS
   *  anchor (a point reflection; see `scopeBox` in coordinateTransforms/bake.ts)
   *  rather than the allocated band. That keeps the PAINTED anchor coincident
   *  with the solver's chained position, so `anchor: "baseline"` rows land on
   *  their solved baselines at exact pitch. */
  pitchAnchorY?: "start" | "middle" | "end" | "baseline";
};

/** Place a child at `(0, 0)` on whichever axes it hasn't already resolved a
 *  position for — the "fresh vs. already-placed" child rule shared by every
 *  operator that lays out already-placed operands (e.g. a `ref` whose
 *  translate was reconciled against its LCA during its own `layout()`)
 *  alongside fresh ones. `dims[axis].min === undefined` IS that placed/unplaced
 *  signal (see `combineDims`): a fresh node reports an undefined translate
 *  until placed, while an already-placed node (a ref, or any other
 *  initially-placed target — see `isInitiallyPlaced` in
 *  `constraints/placementLowering.ts`, the same rule) already has a
 *  determined `min`, so re-placing it here would be a no-op-that-should-be —
 *  except `GoFishRef.place()` has no ledger to make that a true no-op, so it
 *  must not be called at all in that case. This is `layer`'s own
 *  unplaced-child finalization (its constrained-children branch); `enclose`
 *  reuses it verbatim rather than re-deriving the rule. */
export function placeUnplacedChild(
  child: Placeable,
  anchor: Anchor = "baseline"
): void {
  if (child.dims[0].min === undefined) child.place("x", 0, anchor);
  if (child.dims[1].min === undefined) child.place("y", 0, anchor);
}

// `scales` is the per-axis data→pixel affine scale handed down (the single
// {@link AxisScale} carrier: `sigma` = pixels-per-data-unit for size, `map` =
// the anchored data→pixel map). A node MUST NOT mutate this array: to establish
// a local scale for its descendants (the `shared` scoping annotation, below) it
// copies into a fresh array and passes that down — never writing back to the
// parent's, so a solved σ can't leak to the node's siblings (see layer.tsx).
export type Layout = (
  shared: Size<boolean>,
  size: Size,
  scales: Size<AxisScale | undefined>,
  children: GoFishAST[],
  node: GoFishNode
) => { intrinsicDims: FancyDims; transform: FancyTransform; renderData?: any };

/** Map a GoFish y-up display point to a final y-down absolute SVG pixel. The one
 *  transform a `lower` body needs: it folds in both the per-shape `scale(1,-1)`
 *  and the root flip. Set once per emit on the render session. */
export type ToPixel = (p: [number, number]) => [number, number];

/**
 * Lower a node into a fragment of the display-list IR — each shape/operator owns
 * its `lower`, and the display list is the union of every node's fragment,
 * painted by a single backend (no per-shape SVG). `children` are the
 * already-lowered child items (empty for a boundary, which re-walks its own
 * subtree); `toPixel` carries the y-flip + viewport offset.
 */
export type Lower = (
  {
    intrinsicDims,
    transform,
    renderData,
    coordinateTransform,
    toPixel,
  }: {
    intrinsicDims?: Dimensions;
    transform?: Transform;
    renderData?: any;
    coordinateTransform?: CoordinateTransform;
    toPixel: ToPixel;
  },
  children: DisplayList.DisplayItem[],
  node: GoFishNode
) => DisplayList.DisplayItem[];

export type ResolveUnderlyingSpace = (
  childSpaces: Size<UnderlyingSpace>[],
  childNodes: (GoFishNode | GoFishRef)[],
  shared: Size<boolean>,
  /** This node's positioning constraints. `position` constraints contribute a
   *  POSITION-domain fragment to the resolved space (see `layer.tsx`). */
  constraints: ConstraintSpec[]
) => FancySize<UnderlyingSpace>;

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

/** Signature for a node's own self-scaled (explicit-size) space on `dim`, or
 *  `undefined` if the node isn't self-scaled there or its stashed space isn't
 *  anchored/difference (see `GoFishNode.selfScaledSpace`). Two sibling
 *  self-scaled nodes with equal signatures are genuinely viewing ONE shared
 *  scale (same data domain, same σ-affine width, same measure) — e.g. a
 *  `spread`'s per-group facets all given the same explicit pixel width over
 *  the same padded data domain — as opposed to independent per-facet scales
 *  that merely happen to be self-scaled too (a small-multiples chart with a
 *  different domain per facet). Prefixed `"c:"` (parallel to the ordinal
 *  `"o:<keys>"` signature) so a claim carrying this signature is
 *  distinguishable from the generic {@link AXIS_CLAIM_OPAQUE} a plain
 *  (non-self-scaled) continuous axis claims with. */
function selfScaledAxisSignature(
  node: GoFishNode,
  dim: 0 | 1
): string | undefined {
  const s = node.selfScaledSpace[dim];
  if (s === undefined || !(isPOSITION(s) || isDIFFERENCE(s))) return undefined;
  return (
    "c:" +
    JSON.stringify({
      d: s.dataDomain,
      w: s.width,
      m: s.measure,
    })
  );
}

/** If every one of `node`'s direct GoFishNode children is self-scaled on
 *  `dim` with the SAME {@link selfScaledAxisSignature} (at least two of
 *  them — a lone self-scaled child has no sibling to unify with), returns
 *  that shared signature plus one representative child's real (anchored/
 *  difference) space — the piece self-scaling normally throws away above the
 *  child (it reports UNDEFINED upward so its parent's union / auto-fit sizing
 *  ignores it; see `selfScaledSpace`'s doc comment). Returns `undefined` for
 *  any mismatch (a differently-scaled sibling, a non-self-scaled sibling, or
 *  fewer than two children) — the siblings do NOT genuinely share one scale,
 *  so each keeps whatever per-sibling axis claim it would otherwise get. */
function sharedSelfScaledChildSpace(
  node: GoFishNode,
  dim: 0 | 1
): { sig: string; space: UnderlyingSpace } | undefined {
  const kids = node.children.filter(
    (c): c is GoFishNode => c instanceof GoFishNode
  );
  if (kids.length < 2) return undefined;
  let sig: string | undefined;
  let rep: UnderlyingSpace | undefined;
  for (const kid of kids) {
    const kidSig = selfScaledAxisSignature(kid, dim);
    if (kidSig === undefined) return undefined;
    if (sig === undefined) {
      sig = kidSig;
      rep = kid.selfScaledSpace[dim];
    } else if (kidSig !== sig) {
      return undefined;
    }
  }
  return sig !== undefined && rep !== undefined
    ? { sig, space: rep }
    : undefined;
}

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
  public _name?: string | Token;
  public _isScope: boolean = false;
  /**
   * String-name scope boundary. Set ONLY by createMark — manual `.scope()`
   * (which flips `_isScope`) does not flip this. String-name lookup
   * (`resolveScopedName` in _ref.tsx, shared by `ref("name")` and
   * `.constrain()` operands) stops walking up at the nearest `_isComponent`
   * ancestor and does not descend into nested ones, so names don't leak
   * across component boundaries in either direction.
   */
  public _isComponent: boolean = false;
  public _scopeMap?: Map<string, GoFishNode>;
  public parent?: GoFishNode;
  public datum?: any;
  /** Paint-time reactive channels (a `live()` value per channel), stamped by the
   *  mark builders at resolve. Baked into the `liveSlots` side table at lower
   *  time; undefined on the static path. */
  public __gfLive?: Record<string, LiveValue>;
  /** Paint-time visibility rules, one per owner (see
   *  {@link INTERNAL_visibleWhile}); undefined on the static path. */
  public __gfVisible?: Map<object, () => boolean>;
  private _resolveUnderlyingSpace: ResolveUnderlyingSpace;
  public _underlyingSpace?: Size<UnderlyingSpace> = undefined;
  private _layout: Layout;
  /** Per-primitive IR lowering (see {@link Lower}) — the node's sole draw
   *  description. Absent on operators that never lower themselves (their
   *  children are lowered directly); lowering such a node throws. */
  private _lower?: Lower;
  /** The lowering the node was built with, kept when
   *  {@link INTERNAL_emitNothing} silences it, so what it lends
   *  ({@link INTERNAL_lendDrawing}) is always its real drawing. */
  private readonly _ownLower?: Lower;
  public children: GoFishAST[];
  public intrinsicDims?: Dimensions;
  public transform?: Transform;
  /** The pixel size this node was ALLOCATED by its parent (the `size` handed to
   *  `layout()`) — the extent of its coordinate frame, which for a continuous
   *  axis is the posScale's pixel range (canvas height for the root, cell height
   *  for a facet). The y-up flip scope (#629) mirrors about this, NOT the content
   *  bbox (`intrinsicDims.size`, which shrinks to the tallest bar). An UNSIZED
   *  (NaN) axis leaves it undefined. */
  public _allocatedSize?: Size;
  /** This node and its subtree are CHROME that seats in the AMBIENT y-down frame,
   *  NOT in the plot's y-up flip scope (issue #629). Set by the chrome-elaboration
   *  passes (axis titles, the legend swatch column, the colorbar) on the shapes
   *  they synthesize: those describe the plot from the outside and read top→bottom
   *  regardless of whether the plot's value axis grows upward. The bake walk resets
   *  the active flip scope to ambient when it enters such a subtree, so a titled /
   *  legended y-up chart flips only its DATA marks (and their in-plot labels),
   *  while the legend column and rotated axis titles stay y-down. The plot content
   *  itself is NOT flagged, so it still flips. Only `options.yUp` (a global y-up
   *  ambient) overrides — see the ambient seed in `render`. */
  public _ambientYDown?: boolean;
  /** This node UNIONS a continuous y up but does not ESTABLISH it — a chrome
   *  wrapper (the axis-title / legend layer) that seats the plot content plus its
   *  chrome siblings (issue #629). It is scope-TRANSPARENT for the y-up flip: the
   *  bake walk does NOT open a scope here (its bbox includes the chrome, so it is
   *  the wrong mirror band), but descends to the plot content it wraps — whose
   *  frame is the canvas `finalH` — which opens the scope. Set by the chrome
   *  elaboration passes. Distinct from `_ambientYDown` (which resets to y-down);
   *  a scope-transparent node's CONTENT child still flips. */
  public _scopeTransparent?: boolean;
  /** The authoritative canvas y-flip frame for the ROOT plot content (issue
   *  #629): `{ baseY: 0, height: finalH }`, stamped by `layout()` on `contentNode`
   *  once `finalH = contentNode.dims.size` is known. This is the exact frame the
   *  old global flip mirrored about (`toDisplayList`'s `data.height`) — the canvas
   *  origin, NOT the node's placed bbox min, which a shrink-to-fit pin can offset
   *  from 0. The bake walk uses it when the root content opens the flip scope; a
   *  scope opening deeper (a facet cell) has no stamp and mirrors about its own
   *  allocated band. `{baseY, height}` mirrors `FlipScope` in `_displayObject`. */
  public _rootFlipScope?: { baseY: number; height: number };
  /** See {@link Placeable.pitchAnchorY} — the fixed-pitch distribute anchor this
   *  node's y was chained at, consumed by the bake's flip-scope band decision. */
  public pitchAnchorY?: "start" | "middle" | "end" | "baseline";
  /** The plot's flip frame a chrome subtree's BOX is mirrored about (issue #629).
   *  Stamped by `layout()` on each OUTERMOST `_ambientYDown` chrome node (axis
   *  title, legend column, colorbar) — the same value as the plot content's
   *  `_rootFlipScope` — so the bake reads it directly (`node._chromeFrame`)
   *  instead of searching up through the scope-transparent wrappers on every
   *  visit. Only set when the plot mirrors (`contentFlipsY`); a chrome subtree
   *  with no frame passes through unmirrored. `{baseY, height}` mirrors
   *  `FlipScope`. */
  public _chromeFrame?: { baseY: number; height: number };
  /** Persistent per-axis bbox ledger: the box-key equations that determine this
   *  node's box. `layout()` seeds the self-layout size (+ a self-placed absolute
   *  min), `_pinAnchor` records the absolute anchor a pin lands at, and a rank-2
   *  `setExtent` resets the axis to its determining keys (overriding the
   *  self-layout seed). Lazily created, so the hot single pin / `place()` path
   *  allocates only on first touch. The `dims` getter reads this wherever an axis
   *  is fully solved, falling back to the `(intrinsicDims, transform)` split. */
  private _bbox?: [BBox?, BBox?];
  /** Per-axis scope annotation: `true` = this node is a scale scope (it solves
   *  σ from its own box and hands it to descendants via a fresh array — claim
   *  hoisting, #549); `false` (default) = pass-through, inheriting σ from above.
   *  It is NOT a mutation flag — no node writes back to the parent's
   *  `scales`. Currently set only by `spread`/`stack` (`sharedScale`). */
  public shared: Size<boolean>;
  public renderData?: any;
  public coordinateTransform?: CoordinateTransform;
  public color?: MaybeValue<string>;
  public constraints: ConstraintSpec[] = [];
  public colorConfig?: ColorConfig;
  public _labels?: LabelSpec[];
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
  // elaboration pass (`elaborateAxes`), which wraps owning nodes in a Layer of
  // ordinary tick/label shapes.
  // true     = owns the axis (gets elaborated into shapes here)
  // "budget" = a layer sibling owns it; also elaborated (overlapping siblings
  //            overdraw identically, which keeps their content aligned)
  // false    = explicitly suppressed via axes: override (blocks children)
  // undefined = not involved
  public axis: { x?: boolean; y?: boolean } = {};
  /** Persistent per-dim record that THIS node renders an axis (issue #659).
   *  Unlike `axis` — a work flag consumed and CLEARED by axis elaboration —
   *  this stamp survives to layout time, so a σ-scope solve can ask "does any
   *  node in my scope render an axis on this dim?" (`scopeRendersAxis`). That
   *  demand bit is what gates nicing: nicing is a presentation adjustment
   *  whose demand comes from axis views, so a scope nices its POSITION domain
   *  iff some node in the scope draws that dim's axis. Stamped by
   *  `resolveAxes` wherever it sets an owning (`true`) flag. */
  public axisDemand: [boolean, boolean] = [false, false];
  /** Per-dim: the real (anchored/difference) space that was stashed and
   *  replaced with UNDEFINED for a self-scaled dim (explicit pixel size
   *  absorbing a baseline space) — set by `layer`'s space resolution. A
   *  self-scaled node's own `_underlyingSpace[dim]` is UNDEFINED (so an
   *  ancestor's union ignores it), which is right for sizing but throws away
   *  the one piece of information `resolveAxes` needs to tell a genuine
   *  cross-sibling scale match from an incidental one: this field keeps that
   *  real space reachable for the comparison, without touching
   *  `_underlyingSpace`/layout at all. Presence (`!== undefined`) IS "this node
   *  roots its own σ-scope on the dim" — read by `scopeRendersAxis` to stop the
   *  demand walk — so there is no separate boolean to keep in sync. */
  public selfScaledSpace: [
    UnderlyingSpace | undefined,
    UnderlyingSpace | undefined,
  ] = [undefined, undefined];
  /** Per-dim: a real (anchored/difference) space `resolveAxes` hoisted onto
   *  this node from a set of self-scaled children that all share one
   *  underlying scale (see `selfScaledSpace` and the sibling-unification
   *  branch of `resolveAxes`). This node's own `_underlyingSpace[dim]` is
   *  still UNDEFINED (self-scaling children collapse the union, and layout
   *  must not be told otherwise); axis elaboration (`elaborationsFor` in
   *  axes/elaborate.tsx) falls back to this field to compute nice bounds and
   *  tick values for the single hoisted axis it draws in its place. */
  public hoistedAxisSpace?: [
    UnderlyingSpace | undefined,
    UnderlyingSpace | undefined,
  ];
  public _axisOverride?: { x?: boolean; y?: boolean };
  /** Explicit key→node map for ordinal axis label positioning. Set by
   * operators (e.g. table) whose domain keys differ from children's .key. */
  public _ordinalKeyMap?: Record<string, GoFishNode>;
  /**
   * Stack direction of the operator that created this node.
   * Used in coord.tsx collectOverrides to route axis: overrides to the
   * correct polar axis (theta vs radial).
   */
  public axisDir?: 0 | 1;
  /**
   * Alias-keyed dim options (e.g. `{ theta: 0.5, rSize: "value" }`) stashed by a
   * mark factory at construction, before its enclosing coord exists. Resolved
   * into `args.dims` by {@link resolveAliases} once the coord's declared aliases
   * are known. See `extractAliasCandidates` (dims.ts).
   */
  public _pendingAliases?: Record<string, any>;
  /**
   * Position aliases a `coord` node declares for its subtree (the transform's
   * `aliases`, e.g. `{ x: "theta", y: "r" }`). Read by {@link resolveAliases} to
   * rebind the active alias scope while walking into this coord.
   */
  public _aliases?: { x?: string; y?: string };
  constructor(
    {
      key,
      type,
      args,
      resolveUnderlyingSpace,
      layout,
      lower,
      shared = [false, false],
      color,
    }: {
      key?: string;
      type: string;
      args?: any;
      resolveUnderlyingSpace: ResolveUnderlyingSpace;
      layout: Layout;
      lower?: Lower;
      shared?: Size<boolean>;
      color?: MaybeValue<string>;
    },
    children: GoFishAST[]
  ) {
    this.uid = `node-${GoFishNode.uidCounter++}`;
    this._resolveUnderlyingSpace = resolveUnderlyingSpace;
    this._layout = layout;
    this._lower = lower;
    this._ownLower = lower;
    this.children = children;
    children.forEach((child) => {
      child.parent = this;
    });
    this.key = key;
    this.type = type;
    this.args = args;
    this.shared = shared;
    this.color = color;
  }

  /** Collect the distinct color values in this subtree, in first-seen order.
   *  `seen` is the membership index for `out` (which keeps the order). */
  private collectColorValues(out: any[], seen: Set<any> = new Set()): void {
    if (this.color !== undefined && isValue(this.color)) {
      const val = getValue(this.color);
      if (!seen.has(val)) {
        seen.add(val);
        out.push(val);
      }
    }
    this.children.forEach((child) => {
      if (child instanceof GoFishNode) child.collectColorValues(out, seen);
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
  }): void {
    const colorConfig = unit.colorConfig!;

    if (colorConfig._tag === "gradient") {
      // First writer wins: the first node to resolve a gradient (the root,
      // which sees the whole subtree) sets the domain over every value. Deeper
      // nodes re-entering this pass would otherwise recompute a narrower domain
      // from their own subtree and clobber it.
      if (unit.resolved) return;
      const orderedKeys: any[] = [];
      this.collectColorValues(orderedKeys);
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
      const orderedKeys: any[] = [];
      this.collectColorValues(orderedKeys);
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
    // A string _name registers nowhere: `ref(string)` and `.constrain()`
    // operands find it by walking the component scope (`resolveScopedName`
    // in _ref.tsx), bounded by the nearest createMark.
    this.children.forEach((child) => {
      child.resolveNames();
    });
  }

  public resolveUnderlyingSpace(): Size<UnderlyingSpace> {
    if (this._underlyingSpace) {
      return this._underlyingSpace;
    }
    this._underlyingSpace = elaborateSize(
      this._resolveUnderlyingSpace(
        this.children.map((child) => child.resolveUnderlyingSpace()),
        this.children,
        this.shared,
        this.constraints
      )
    );
    return this._underlyingSpace;
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
    this.children.forEach((c) => {
      if (c instanceof GoFishNode) c.clearUnderlyingSpace();
    });
  }

  /**
   * Top-down pass that resolves coordinate-space axis aliases (e.g. polar
   * `theta`/`r`/`thetaSize`/`rSize`) into the canonical `x/y/w/h` channels of each
   * mark's `dims`. Mirrors {@link resolveAxes}: it carries the `active` alias
   * scope downward, rebinding it at every `coord` node that declares aliases
   * (a nested coord rebinds for its subtree).
   *
   * Runs BEFORE `resolveUnderlyingSpace` (which reads the resolved dims). It
   * mutates `args.dims` in place — reassigning the array element (not its fields)
   * so the mark's layout/space closures, which captured the same array reference,
   * observe the resolution. The `embedded` flag is authored later by
   * {@link resolveEmbedding}, not here.
   *
   * Hygiene: using an alias outside any coord that declares it (no `active` map),
   * or naming an alias the enclosing coord doesn't declare, is a build-time error.
   */
  public resolveAliases(active?: Record<string, AliasResolution>): void {
    // A coord that declares aliases rebinds the scope for its subtree.
    let next = active;
    if (this.type === "coord" && this._aliases) {
      next = buildAliasMap(this._aliases);
    }

    const pending = this._pendingAliases;
    if (pending) {
      const dims = this.args?.dims as Dimensions | undefined;
      for (const [key, value] of Object.entries(pending)) {
        const res = next?.[key];
        if (res === undefined) {
          throw new Error(
            next === undefined
              ? `Axis alias "${key}" used outside any coordinate space that declares it. Wrap the mark in a coord (e.g. polar()) or use x/y/w/h.`
              : `Axis alias "${key}" is not declared by the enclosing coordinate space. Declared aliases: ${Object.keys(
                  next
                ).join(", ")}.`
          );
        }
        if (dims) {
          dims[res.axis] = {
            ...dims[res.axis],
            [res.key]: value,
          };
        }
      }
    }

    this.children.forEach((c) => {
      if (c instanceof GoFishNode) c.resolveAliases(next);
    });
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
    const within = insideCoord || this.type === "coord";

    const dims = this.args?.dims as Dimensions | undefined;
    if (dims) {
      for (const dir of [0, 1] as const) {
        const dim = dims[dir];
        if (dim === undefined) continue;
        // Explicit emX/emY (or connect's embed()) is a hard claim — leave it.
        if (dim.embedded === true) continue;
        let embedded = baseEmbedded(dim);
        // Route B gate (coord-scoped): a value-sized dim positioned in a measure
        // FOREIGN to its size's measure is a foreign extent (a bubble) → ink.
        if (embedded && within) {
          const sizeMeasure = getMeasure(dim.size);
          for (const pos of [dim.min, dim.center, dim.max]) {
            if (isValue(pos) && getMeasure(pos) !== sizeMeasure) {
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
   * what claimed it: an ordinal axis records `"o:<keys>"`, a continuous axis (or
   * an explicit override) records {@link AXIS_CLAIM_OPAQUE}. The signature lets
   * ordinal axes NEST — a node claims its own ordinal axis even under an ancestor
   * ordinal, as long as it's a DIFFERENT grouping (a finer level), so a
   * grouped/faceted chart renders one ordinal axis per grouping level (per
   * facet). Continuous axes stay single-owner (root-most wins): a descendant
   * continuous axis on an already-claimed dim defers to the chart-level scale.
   */
  public resolveAxes(
    claimed: Map<0 | 1, string> = new Map(),
    enabled: Set<0 | 1> = new Set([0, 1])
  ): void {
    // A `layer` is treated like any other node: it claims the axis for its own
    // (unioned) space ONCE, so overlaid children share a single axis. Per-child
    // axes still happen via explicit operator `axes:` overrides, which the
    // override branch honors regardless.

    // Coordinate-transform nodes (polar, clock, bipolar, etc.) manage their
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
        if (c instanceof GoFishNode) c.resolveAxes(allClaimed, enabled);
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
        const dupOrdinal =
          override !== false &&
          mySig !== undefined &&
          claimed.get(dim) === mySig;
        // The continuous analogue: this node is one of several self-scaled
        // SIBLING facets whose shared scale a parent already hoisted a single
        // axis for (`sharedSelfScaledChildSpace`, below) — the parent claimed
        // with THIS node's own self-scaled signature (not the generic
        // {@link AXIS_CLAIM_OPAQUE}), so an exact signature match here means
        // "an ancestor already drew the one axis this node's own local scale
        // would draw." A mismatch (or no self-scaled signature at all) is NOT
        // suppressed — an ordinary single global continuous scale, or an
        // independent self-scaled facet (a small-multiples chart with its own
        // per-facet domain) that merely happens to sit under an unrelated
        // opaque claim, keeps its own override-forced axis exactly as before.
        const mySelfScaledSig = selfScaledAxisSignature(this, dim);
        const dupContinuous =
          override !== false &&
          mySig === undefined &&
          mySelfScaledSig !== undefined &&
          claimed.get(dim) === mySelfScaledSig;
        const show = override !== false && !dupOrdinal && !dupContinuous;
        if (dim === 0) this.axis.x = show;
        else this.axis.y = show;
        if (show) this.axisDemand[dim] = true;
        // When this node's own space collapsed to UNDEFINED on `dim` (self-
        // scaling swallowed it, or it unioned self-scaled children that did)
        // but it's about to render an axis anyway (an explicit override),
        // borrow a shared self-scaled child space for the ticks — see
        // `hoistedAxisSpace`'s doc comment. Its signature (not the generic
        // opaque one) is what the check above matches against.
        let claimSig = mySig ?? AXIS_CLAIM_OPAQUE;
        if (show && (s === undefined || isUNDEFINED(s))) {
          const shared = sharedSelfScaledChildSpace(this, dim);
          if (shared !== undefined) {
            (this.hoistedAxisSpace ??= [undefined, undefined])[dim] =
              shared.space;
            claimSig = shared.sig;
          }
        }
        claim(dim, claimSig); // claim regardless — false blocks children too
      } else if (
        enabled.has(dim) &&
        space &&
        isUNDEFINED(space[dim]) &&
        claimed.get(dim) === undefined
      ) {
        // No override here, and this node's own space collapsed to UNDEFINED
        // on `dim` — normally a dead end (the natural-claim branch below
        // requires a valid space). But if that collapse happened because
        // every direct child is a self-scaled facet sharing ONE real scale
        // (`sharedSelfScaledChildSpace`), this is exactly the unification
        // case: claim the axis HERE, once, for the whole union, instead of
        // leaving each sibling to independently claim (or, since each
        // sibling's own space is equally UNDEFINED, claim nothing at all).
        const shared = sharedSelfScaledChildSpace(this, dim);
        if (shared !== undefined) {
          if (dim === 0) this.axis.x = true;
          else this.axis.y = true;
          this.axisDemand[dim] = true;
          (this.hoistedAxisSpace ??= [undefined, undefined])[dim] =
            shared.space;
          claim(dim, shared.sig);
        }
      } else if (enabled.has(dim) && space && !isUNDEFINED(space[dim])) {
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
        } else if (isPOSITION(s) || isDIFFERENCE(s)) {
          // Continuous: single-owner — only the root-most unclaimed dim claims.
          if (prior === undefined) sig = AXIS_CLAIM_OPAQUE;
        }
        if (sig !== undefined) {
          if (dim === 0) this.axis.x = true;
          else this.axis.y = true;
          this.axisDemand[dim] = true;
          claim(dim, sig);
        }
      }
    }
    this.children.forEach((c) => {
      if (c instanceof GoFishNode) c.resolveAxes(next, enabled);
    });
  }

  /**
   * Demand-driven nicing (issue #659): does any axis rendered in this scope's
   * SPACE-FLOW REGION view this scope's `dim` domain? A scope nices its
   * anchored POSITION domain iff this returns true — nicing is a presentation
   * adjustment whose demand comes from axis views; axis-less content stays at
   * the honest raw scale, and when an axis IS drawn, content and ticks share
   * the one niced domain.
   *
   * The region is the maximal tree neighborhood over which the dim's space
   * flows freely — every axis inside it is a view of the same underlying
   * domain, so a stamp anywhere in it is demand for every scope in it. It is
   * bounded by the two constructs that cut space flow:
   *   - a self-scaled stash (`selfScaledSpace`) — the stashed dim reports
   *     UNDEFINED upward, so an ancestor's axis cannot be describing it (and,
   *     descending, a deeper stash roots its own region);
   *   - a coord boundary — a coord remaps its subtree into its own space
   *     (and never nices), so axes inside and outside view different spaces.
   * Concretely: walk UP from the scope root while flow is uncut (an inner
   * shared/datum-position scope under an axis-drawing root inherits the
   * root's demand — its space is what bubbled up into the domain that axis
   * draws), then scan that region root's subtree for stamps, stopping at
   * deeper stashes/coords. Reads the persistent `axisDemand` stamps, which
   * survive axis elaboration (the `axis` work flags do not).
   */
  public scopeRendersAxis(dim: 0 | 1): boolean {
    let region: GoFishNode = this;
    while (
      region.selfScaledSpace[dim] === undefined &&
      region.parent !== undefined &&
      region.parent.type !== "coord"
    ) {
      region = region.parent;
    }
    return region.walkAxisDemand(dim, true);
  }

  private walkAxisDemand(dim: 0 | 1, isScopeRoot: boolean): boolean {
    if (this.type === "coord") return false;
    if (!isScopeRoot && this.selfScaledSpace[dim] !== undefined) return false;
    if (this.axisDemand[dim]) return true;
    return this.children.some(
      (c) => c instanceof GoFishNode && c.walkAxisDemand(dim, false)
    );
  }

  public layout(size: Size, scales: Size<AxisScale | undefined>): Placeable {
    this._allocatedSize = size; // frame extent for the y-up flip scope (#629)
    const { intrinsicDims, transform, renderData } = this._layout(
      this.shared,
      size,
      scales,
      this.children,
      this
    );

    this.intrinsicDims = elaborateDims(intrinsicDims);
    this.transform = elaborateTransform(transform);
    this.renderData = renderData;

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
    return this;
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
   *  CURRENT `intrinsicDims.min` (a rank-2 `setExtent` resets it to 0), never a
   *  stale local box. */
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
      if (anchor === "min") this.intrinsicDims![dir].min = value;
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
   * size-setting case, e.g. span's two edges), so the local box is reset to
   * `[0, size]` and the translate to the absolute min. A single owned key is a
   * position pin: the size comes from the node's own layout (the second
   * equation), the local box is left intact, and only the translate moves — so
   * the pin OVERRIDES a self-placed translate, which the write-once `place()`
   * cannot. Anchor keys map start→min, end→max, middle→center; `baseline`
   * (the origin) is not a bbox key, so a baseline pin still uses `place()`.
   *
   * The rank-2 solve writes through the PERSISTENT per-axis ledger
   * ({@link _bbox}) so it mirrors the node's authoritative geometry: a
   * determining constraint resets the axis (overriding the self-layout seed),
   * matching the local-frame reset below. Cross-call over-determination
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
    // (or an earlier pin) recorded for this axis, exactly as it resets the local
    // frame to [0, size] at the absolute min. So the persistent ledger is RESET
    // to hold just these keys — and is now the SOLE record of this axis's
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
    this.intrinsicDims[dir] = {
      ...(this.intrinsicDims[dir] ?? {}),
      min: 0,
      size,
    };
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
   * subsequent position write (a companion align, or the parent-seed
   * `placeUnplacedChild` fallback) still lands normally — this genuinely does
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
   * and mapped by `toPixel`. Call it while lowering, like any `_lower`: it
   * reads the session's active flip scope. It lends the node's own lowering
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
        rules.push(rule);
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
    const items = lower(
      {
        intrinsicDims: this.intrinsicDims,
        transform,
        renderData: this.renderData,
        coordinateTransform,
        toPixel,
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

  public label(accessor: LabelAccessor, options?: LabelOptions): this {
    (this._labels ??= []).push({ accessor, ...options });
    return this;
  }

  public setKey(key: string): this {
    this.key = key;
    return this;
  }

  public setShared(shared: Size<boolean>): this {
    this.shared = shared;
    return this;
  }

  public constrain(
    fn: (refs: Record<string, ConstraintRef>) => ConstraintSpec[]
  ): this {
    const env = constraintEnv(this);
    const specs = fn(env);
    validateOperands(specs, env);
    this.constraints = specs;
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
    const placement = spacePlacement(s);
    return placement === "determined"
      ? `position(${toJSON(continuousInterval(s)!)})`
      : placement === "free"
        ? `size(${s.width.run(1)})`
        : `difference(${s.width.run(1)})`;
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
