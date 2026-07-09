// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// @wiki Color Scale Resolution — /internals/layout/color-scales
// @wiki Overview — /internals/layout/passes
// @wiki Architecture Overview — /internals/overview/architecture
// </gofish-wiki>

import type { JSX } from "solid-js";
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
  localAnchorPoint,
  Size,
  Transform,
  AliasResolution,
  buildAliasMap,
} from "./dims";
import { gofish, gofishToSVGElement, gofishToSVG, gofishSave } from "./gofish";
import type {
  AxesOptions,
  GoFishExportOptions,
  GoFishRenderOptions,
} from "./gofish";
import { toDisplayList } from "./displayList/toDisplayList";
import type { DisplayList } from "gofish-ir";
import { lowerLabelItems } from "./labels/renderLabel";
import { setLiveSlots } from "../interaction/liveSlots";
import type { LiveValue } from "../interaction/live";
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
import * as Monotonic from "../util/monotonic";
import {
  isCONTINUOUS,
  isDIFFERENCE,
  isORDINAL,
  isPOSITION,
  isUNDEFINED,
  continuousInterval,
  spacePlacement,
  CONTINUOUS_TYPE,
  type Placement,
  UnderlyingSpace,
} from "./underlyingSpace";
import { toJSON, interval } from "../util/interval";
import type { AxisScale } from "./domain";
import { envFlag } from "../util";
import { nice } from "d3-array";
import type { ScaleContext } from "./gofish";
import type { TokenContext } from "./tokenContext";
import type { FlipScope } from "./_displayObject";
import { isToken, Token } from "./createName";
import type { ConstraintSpec, ConstraintRef } from "./constraints";
import { collectConstraintRefs } from "./constraints";
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
};

export type ScaleFactorFunction = Monotonic.Monotonic;

export const findScaleFactor = (
  sizeDomain: ScaleFactorFunction,
  targetValue: number,
  options: {
    tolerance?: number;
    maxIterations?: number;
    lowerBound?: number;
    upperBoundGuess?: number;
  }
): number => {
  return sizeDomain.inverse(targetValue, options) ?? 0;
};

export type Placeable = {
  dims: Dimensions;
  /** Placement state; `translate[i] === undefined` means "parent may place
   *  me". Exposed so the `baseline` align anchor can read a target's origin. */
  transform?: Transform;
  /** The node's origin (`baseline`) as a ledger projection — `transform.translate`
   *  where written, else derived from the ledger (#39 stage 3). The `baseline`
   *  align anchor reads this so it survives retiring the translate writes; `ref`
   *  stand-ins omit it (they keep a computed `transform`). */
  projectedTranslate?: (dir: Direction) => number | undefined;
  /** Coordinate of one box anchor in the node's local frame. Placement solving
   *  uses this to express every anchor as `absoluteMin + constant`, including
   *  `baseline` for asymmetric boxes such as text and negative bars. */
  localAnchor?: (axis: FancyDirection, anchor: Anchor) => number | undefined;
  /** This target's abstract {@link Placement} on `dir` (`"free"` /
   *  `"determined"` / `"conflict"`), or `undefined` for a non-continuous axis.
   *  `align` reads it to leave self-positioned children alone. Omitted by `ref`
   *  stand-ins (→ `undefined`, so they get the fallback baseline like any
   *  chrome). */
  placementOn?: (dir: Direction) => Placement | undefined;
  place: (axis: FancyDirection, value: number, anchor?: Anchor) => void;
  /** Write an axis extent from owned bbox keys (the size-setting primitive
   *  #39 — `span` and an authoritative `position` pin go through it). Optional
   *  because not every placeable shape implements it (a `ref` stand-in doesn't);
   *  it is only ever invoked on real `GoFishNode` constraint targets. */
  setExtent?: (
    axis: FancyDirection,
    owned: Partial<Record<BBoxKey, number>>,
    owner?: string
  ) => void;
  /** Authoritative override pin (#39): land `anchor` at `value`, rebuilding the
   *  ledger when the axis already self-placed (the write-once `place()` can't).
   *  Handles `baseline` too, so a scatter override never bypasses the ledger.
   *  Optional for the same reason as `setExtent` (a `ref` stand-in omits it). */
  pinAnchor?: (axis: FancyDirection, value: number, anchor: Anchor) => void;
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
 *  and the root flip the now-deleted legacy render relied on. Set once per emit
 *  on the render session. */
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

/** Dev gate (#39, placement pass): set `GOFISH_CONFLICT_CHECK=1` to surface
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
   * String-name search boundary. Set ONLY by createMark — manual `.scope()`
   * (which flips `_isScope`) does not flip this. resolveLocalString in
   * GoFishRef stops walking up at the nearest `_isComponent` ancestor and
   * does not descend into nested ones, so `ref("name")` lookups don't leak
   * across component boundaries even if a future operator silently scopes.
   */
  public _isComponent: boolean = false;
  public _scopeMap?: Map<string, GoFishNode>;
  public parent?: GoFishNode;
  public datum?: any;
  /** Paint-time reactive channels (a `live()` value per channel), stamped by the
   *  mark builders at resolve. Baked into the `liveSlots` side table at lower
   *  time; undefined on the static path. */
  public __gfLive?: Record<string, LiveValue>;
  // private inferDomains: (childDomains: Size<Domain>[]) => FancySize<Domain | undefined>;
  private _resolveUnderlyingSpace: ResolveUnderlyingSpace;
  public _underlyingSpace?: Size<UnderlyingSpace> = undefined;
  private _layout: Layout;
  /** Per-primitive IR lowering (see {@link Lower}). Optional during the
   *  render→lower migration; once every factory supplies one, `_render` is
   *  removed and this becomes the single draw description. */
  private _lower?: Lower;
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
  /** The plot's flip frame a chrome subtree's BOX is mirrored about (issue #629).
   *  Stamped by `layout()` on each OUTERMOST `_ambientYDown` chrome node (axis
   *  title, legend column, colorbar) — the same value as the plot content's
   *  `_rootFlipScope` — so the bake reads it directly (`node._chromeFrame`)
   *  instead of searching up through the scope-transparent wrappers on every
   *  visit. Only set when the plot mirrors (`contentFlipsY`); a chrome subtree
   *  with no frame passes through unmirrored. `{baseY, height}` mirrors
   *  `FlipScope`. */
  public _chromeFrame?: { baseY: number; height: number };
  /** Persistent per-axis bbox ledger (#39 stage 2). Records the box-key
   *  equations that determine this node's box, so it mirrors the authoritative
   *  `(intrinsicDims, transform)`: `layout()` seeds the self-layout size (+ a
   *  self-placed absolute min), `_pinAnchor` records the absolute anchor a pin
   *  lands at, and a rank-2 `setExtent` resets the axis to its determining
   *  keys (overriding the self-layout seed). Lazily created (the hot single
   *  pin / `place()` path allocates only on first touch). As of stage 2 the
   *  `dims` getter READS from this ledger wherever an axis is fully solved
   *  (falling back to the `(intrinsicDims, transform)` split otherwise); render
   *  still reads the split directly, so `(intrinsicDims, transform)` stays
   *  written. Making the split a projection of the ledger (dropping the
   *  redundant writes) is the remaining stage-3 work. */
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
  public _label?: LabelSpec;
  private _zOrder = 0;
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
      // inferDomains,
      resolveUnderlyingSpace,
      layout,
      lower,
      shared = [false, false],
      color,
    }: {
      key?: string;
      type: string;
      args?: any;
      // inferDomains: (childDomains: Size<Domain>[]) => FancySize<Domain | undefined>;
      resolveUnderlyingSpace: ResolveUnderlyingSpace;
      layout: Layout;
      lower?: Lower;
      shared?: Size<boolean>;
      color?: MaybeValue<string>;
    },
    children: GoFishAST[]
  ) {
    // Generate unique ID
    this.uid = `node-${GoFishNode.uidCounter++}`;
    // this.inferDomains = inferDomains;
    this._resolveUnderlyingSpace = resolveUnderlyingSpace;
    this._layout = layout;
    this._lower = lower;
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

  private collectColorValues(out: any[]): void {
    if (this.color !== undefined && isValue(this.color)) {
      const val = getValue(this.color);
      if (!out.includes(val)) out.push(val);
    }
    this.children.forEach((child) => {
      if (child instanceof GoFishNode) child.collectColorValues(out);
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
    // String _name intentionally does not register anywhere global — it is
    // only consulted by layer.tsx for constraint-callback destructuring and
    // by ref(string) for a layer-local lookup.
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
   * Top-down pass that authors each dim's `embedded` flag — the flag the shape
   * `_render` switches on to draw a mark as point (0 embedded axes) / line (1) /
   * area (2). It is the **sole author** of `embedded`, except an explicit
   * `emX`/`emY` (or `connect`'s `embed()`), which lock the flag to `true` and are
   * never recomputed here. Replaces the construction-time `inferEmbedded` the
   * shape factories used to apply (which couldn't see the axis).
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
   *   measure) stays ink — drawn flat at the mapped center. This is the #534
   *   payoff: the size now carries the source measure to compare.
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

  public resolveAxes(
    claimed: Map<0 | 1, string> = new Map(),
    enabled: Set<0 | 1> = new Set([0, 1])
  ): void {
    // Note: a `layer` is treated like any other node below — it claims the
    // axis for its own (unioned) space ONCE, so overlaid children share a single
    // axis instead of each drawing its own (the elaboration pass then wraps the
    // layer). Per-child axes still happen via explicit operator `axes:` overrides
    // (e.g. faceted scatter), which the override branch honors regardless.

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

    const next = new Map(claimed);
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
        const show = override !== false && !dupOrdinal;
        if (dim === 0) this.axis.x = show;
        else this.axis.y = show;
        next.set(dim, mySig ?? AXIS_CLAIM_OPAQUE); // claim regardless — false blocks children too
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
          next.set(dim, sig);
        }
      }
    }
    this.children.forEach((c) => {
      if (c instanceof GoFishNode) c.resolveAxes(next, enabled);
    });
  }

  /**
   * Walk tree after resolveAxes; apply d3.nice() to every POSITION domain
   * so layout and ticks use rounded bounds. Applied to all nodes (not just
   * axis-bearing ones) so that passthrough nodes like layer inherit the same
   * niced domain that gofish.tsx uses for posScale computation.
   */
  public resolveNiceDomains(): void {
    // Coord-transform nodes and their descendants have domains that map into
    // the coordinate system's fixed space (e.g. stacked counts → [0, 2π]).
    // Rounding those domains breaks the mapping, so stop here entirely.
    if (this.type === "coord") {
      return;
    }

    if (this._underlyingSpace) {
      for (const dim of [0, 1] as (0 | 1)[]) {
        const space = this._underlyingSpace[dim];
        if (isPOSITION(space)) {
          const iv = continuousInterval(space)!;
          const [niceMin, niceMax] = nice(iv.min, iv.max, 10);
          // Nicing changes the DATA domain (and the width derived from it);
          // placement is a derived view of dataDomain, so the niced interval
          // keeps it "determined" without a separate write.
          (space as CONTINUOUS_TYPE).dataDomain = interval(niceMin, niceMax);
          (space as CONTINUOUS_TYPE).width = Monotonic.linear(
            niceMax - niceMin,
            0
          );
        }
      }
    }
    this.children.forEach((c) => {
      if (c instanceof GoFishNode) c.resolveNiceDomains();
    });
  }

  public layout(size: Size, scales: Size<AxisScale | undefined>): Placeable {
    // Axes are no longer drawn here: they are elaborated into ordinary shapes +
    // constraints by `elaborateAxes` (src/ast/axes/elaborate.tsx) before layout,
    // so the layout engine has no axis-specific budget/baseline machinery.
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

    // Stage 1 (#39): seed the per-axis ledger from this node's own layout. The
    // `size` is frame-invariant; if the node also self-placed (`translate`
    // defined), record the absolute `min` too, so a self-placing shape's ledger
    // is fully determined and matches `combineDims`. While unplaced (`translate`
    // undefined) only `size` is recorded — rank-1, `min`/`center`/`max` read
    // `undefined`, the same "not yet placed" state `combineDims` encodes. The
    // ledger is recorded only; `dims`/render still read `(intrinsicDims,
    // transform)` until stage 2.
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
      // Stage 3 (#39): the ledger now records the operator's self-placement
      // (`min = translate + localMin`), so retire the redundant written translate
      // — wholesale, at the one wrapper every operator `_layout` flows through,
      // instead of editing each operator. The parent's later `place()` then
      // short-circuits on the solved ledger, not the cleared translate.
      this._clearTranslateIfSolved(dir);
    }
    return this;
  }

  public get dims(): Dimensions {
    // Stage 2 (#39): the persistent per-axis ledger is the geometry AUTHORITY
    // wherever it is fully solved (rank 2) — `dims` derives its absolute
    // `(min, size)` from the ledger and re-derives center/max via
    // `localAnchorPoint`, exactly as `combineDims` does. Where the ledger is
    // under-determined or absent, fall back to the `(intrinsicDims, transform)`
    // split (`combineDims`). The split is still WRITTEN by every mutator (render
    // reads it directly via `INTERNAL_render`/`displayDims`), so this flips only
    // `dims`-getter consumers (constraints, align/distribute, layer bbox fold) —
    // never pixels-from-render. The two agree for every solved node (was proven by
    // the now-retired stage-1 ledger mirror across all stories), so this is REAL=0.
    // The split is only the fallback for an under-determined axis, so derive it
    // lazily — a fully-solved node (the common post-layout case) never pays for it.
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
        // the local box (see the stage-2 invariants in the essay).
        embedded: this.intrinsicDims?.[dir]?.embedded,
      };
    });
  }

  /** Stage 3-B (#39): the node's parent-frame offset (`transform.translate`) as
   *  a DERIVED VIEW of the ledger — `ledger.min − localMin` on a fully solved
   *  axis, else the written `transform.translate` (the unplaced/under-determined
   *  fallback). This reproduces what `place()`/`_pinAnchor`/`setExtent` write
   *  today (proven exact by the now-retired ledger mirror across all stories), so a
   *  later increment can stop writing the field and read this instead. Uses the
   *  CURRENT `intrinsicDims.min` (a rank-2 `setExtent` resets it to 0), never a
   *  stale local box. */
  private _projectTranslate(dir: Direction): number | undefined {
    const ledger = this._bbox?.[dir];
    if (!ledger?.solved) return this.transform?.translate?.[dir];
    const min = ledger.read("min");
    if (min === undefined) return this.transform?.translate?.[dir];
    return min - (this.intrinsicDims?.[dir]?.min ?? 0);
  }

  /** Stage 3 (#39): "is this axis already placed?" — read the LEDGER (a defined
   *  `min` means positioned), not the written `transform.translate`, which is
   *  retired where solved. The placement-state predicate `place()`'s short-circuit
   *  and `_pinAnchor`'s override check share. */
  private _isPlacedOn(dir: Direction): boolean {
    return this._bbox?.[dir]?.read("min") !== undefined;
  }

  /** Stage 3 (#39): the single reconciliation every ledger write does — once the
   *  position is recorded, the ledger is the authority on a solved axis, so CLEAR
   *  the redundant written translate (the split becomes a projection, not a stale
   *  mirror). An under-determined axis keeps its written fallback (left untouched).
   *  Shared by the `layout()` seed, `_pinAnchor`, and rank-2 `setExtent`. */
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

  /** Public read of {@link _projectTranslate} for cross-node geometry. `_ref`
   *  accumulates the parent-frame translate up/down the tree to position a ref;
   *  reading the ledger-derived value (== the written field today) keeps refs
   *  working once stage 3-C retires the direct translate writes. */
  public projectedTranslate(dir: Direction): number | undefined {
    return this._projectTranslate(dir);
  }

  public localAnchor(axis: FancyDirection, anchor: Anchor): number | undefined {
    const dir = elaborateDirection(axis);
    const intrinsic = this.intrinsicDims?.[dir];
    if (intrinsic?.min === undefined) return undefined;
    if (
      (anchor === "center" || anchor === "max") &&
      intrinsic.size === undefined
    )
      return undefined;
    return localAnchorPoint(anchor, intrinsic.min, intrinsic.size ?? 0);
  }

  /** This node's abstract {@link Placement} on `dir` (the layout half of its
   *  underlying space) — `"free"` (awaiting a position), `"determined"` (already
   *  committed to a data coordinate), or `"conflict"`. `undefined` for a
   *  non-continuous / unresolved axis (chrome). `align` reads it to leave
   *  self-positioned children (a scatter facet) where their own scale puts them
   *  — the principled replacement for the data-positioned guard. */
  public placementOn(dir: Direction): Placement | undefined {
    const sp = this._underlyingSpace?.[dir];
    return sp !== undefined && isCONTINUOUS(sp)
      ? spacePlacement(sp)
      : undefined;
  }

  private get _displayTransform(): Transform | undefined {
    const tx = this._projectTranslate(0);
    const ty = this._projectTranslate(1);
    // Derive a transform whenever the ledger supplies a translate OR one was
    // written — so render still sees the position once a mutator records it in
    // the ledger but stops writing `transform` (stage 3 retiring the writes,
    // starting with rank-2 `setExtent`). Returns undefined only for a node with
    // neither (an unplaced leaf). Inert today: a solved ledger still coincides
    // with a written transform until the first write is retired.
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
    const intrinsic = this.intrinsicDims?.[dir];
    const localMin = intrinsic?.min;
    const size = intrinsic?.size;

    // Is this anchor's local point determined yet? `center`/`max` are DERIVED
    // from `(min, size)`, so they need both; `min`/`baseline` need only the local
    // `min`. When not determined, the only thing place() can record is the local
    // `min` (the lone stored anchor — `center`/`max` aren't stored); `baseline`
    // can't resolve its origin without `localMin`, so it no-ops here (when
    // determined it IS recorded, as the absolute min the origin implies — see
    // `_pinAnchor`).
    const determined =
      anchor === "center" || anchor === "max"
        ? localMin !== undefined && size !== undefined
        : localMin !== undefined;
    if (!determined) {
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
   * share (#39). Two or more owned keys DETERMINE the box (size included — the
   * size-setting case, e.g. span's two edges), so the local box is reset to
   * `[0, size]` and the translate to the absolute min. A single owned key is a
   * position pin: the size comes from the node's own layout (the second
   * equation), the local box is left intact, and only the translate moves — so
   * the pin OVERRIDES a self-placed translate, which the write-once `place()`
   * cannot. Anchor keys map start→min, end→max, middle→center; `baseline`
   * (the origin) is not a bbox key, so a baseline pin still uses `place()`.
   *
   * The rank-2 solve writes through the PERSISTENT per-axis ledger
   * ({@link _bbox}) so it mirrors the node's authoritative geometry — a
   * determining constraint resets the axis (overriding the self-layout seed),
   * matching the local-frame reset below. As of stage 2 the `dims` getter reads
   * from this ledger where solved; the remaining #39 step is to make `place()`
   * and render read it too, retiring the redundant `(intrinsicDims, transform)`
   * writes (stage 3). Cross-call
   * over-determination detection (two constraints fighting over one axis) waits
   * on the authority model — a self-layout default vs a hard constraint pin.
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

    const intrinsic = this.intrinsicDims?.[dir];
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
    // Stage 3 (#39): translate is derived from the solved ledger now, not written
    // here; clear any stale prior value (see `_clearTranslateIfSolved`).
    this._clearTranslateIfSolved(dir);
  }

  /**
   * Authoritative override pin (#39): land `anchor` at `value`, REBUILDING the
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

    // Stage 3 (#39): record the pin into the ledger so it represents EVERY
    // anchor — including `baseline`, the one that was missing. A `baseline` pin
    // sets the box's local-0 ORIGIN (not a min/max/center edge); record the
    // absolute min that origin implies — screen-min = origin + localMin =
    // value + intrinsicDims.min — so `_projectTranslate`/`dims` derive a
    // baseline-placed node's geometry like any other anchor. That closes the gap
    // the σ-affine model is built on (origin = the intercept). A `setExtent`
    // rank-1 / re-placement OVERRIDE rebuilds the axis ledger (a new position),
    // re-seeding the frame-invariant size.
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
    this.ensureTranslate()[dir] =
      value -
      localAnchorPoint(anchor, intrinsic?.min ?? 0, intrinsic?.size ?? 0);
    this._clearTranslateIfSolved(dir);
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

    const transform = transformOverride ?? this._displayTransform;
    const items = this._lower(
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
    if (this._label && this.intrinsicDims) {
      const labelItems = lowerLabelItems(this, transform, toPixel);
      if (labelItems.length) {
        for (const item of labelItems) item.id ??= this.uid;
        return [...items, ...labelItems];
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

  public render(
    container: HTMLElement,
    {
      w,
      h,
      x,
      y,
      transform,
      debug = false,
      defs,
      axes = false,
      colorConfig,
      padding,
      yUp,
      interaction,
    }: {
      w?: number;
      h?: number;
      x?: number;
      y?: number;
      transform?: { x?: number; y?: number };
      debug?: boolean;
      defs?: JSX.Element[];
      axes?: AxesOptions;
      colorConfig?: ColorConfig;
      padding?: number;
      yUp?: boolean;
      interaction?: import("../interaction/runtime").InteractionRuntime;
    }
  ) {
    return gofish(
      container,
      {
        w,
        h,
        x,
        y,
        transform,
        debug,
        defs,
        axes,
        colorConfig,
        padding,
        yUp,
        interaction,
      },
      this
    );
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
    this._label = { accessor, ...options };
    return this;
  }

  public resolveLabels(): void {
    // Propagate only when this node has no datum of its own.
    // Nodes with datum (leaf shapes, or spread combinators that carry group data)
    // render their label directly rather than pushing it to children.
    if (this._label && this.children.length > 0 && this.datum === undefined) {
      for (const child of this.children) {
        if (child instanceof GoFishNode && !child._label) {
          child._label = this._label;
        }
      }
      this._label = undefined;
    }
    for (const child of this.children) {
      if (child instanceof GoFishNode) child.resolveLabels();
    }
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
    const refs = collectConstraintRefs(this.children);
    this.constraints = fn(refs);
    return this;
  }

  public zOrder(value: number): this {
    this._zOrder = value;
    return this;
  }

  public getZOrder(): number {
    return this._zOrder;
  }
}

export const findPathToRoot = (node: GoFishNode): GoFishNode[] => {
  const path: GoFishNode[] = [];
  let current: GoFishNode | undefined = node;
  while (current) {
    path.push(current);
    current = current.parent;
  }
  return path;
};

export const findLeastCommonAncestor = (
  node1: GoFishNode,
  node2: GoFishNode
): GoFishNode => {
  const path1 = findPathToRoot(node1);
  const path2 = findPathToRoot(node2);

  let i = path1.length - 1;
  let j = path2.length - 1;
  while (i >= 0 && j >= 0 && path1[i] === path2[j]) {
    i--;
    j--;
  }
  return path1[i + 1];
};

const isGoFishNode = (node: GoFishNode | GoFishAST): node is GoFishNode => {
  return "intrinsicDims" in node && "transform" in node && "dims" in node;
};

export const debugNodeTree = (
  node: GoFishNode | GoFishAST,
  indent: string = ""
): void => {
  // Get the name for display (handle both GoFishNode and GoFishRef)
  const nodeName = isGoFishNode(node) ? node._name : node.name;

  // Create a group for this node
  console.group(
    `${indent}Node: ${node.type}${nodeName ? ` (${nodeName})` : ""}`
  );

  // Only print GoFishNode specific properties
  if (isGoFishNode(node)) {
    // Print intrinsic dimensions
    if (node.intrinsicDims) {
      console.group(`${indent}Intrinsic Dimensions`);
      node.intrinsicDims.forEach(
        (
          dim: { min?: number; center?: number; max?: number; size?: number },
          i: number
        ) => {
          console.log(
            `${i === 0 ? "Width" : "Height"}: ${JSON.stringify(
              {
                min: dim.min,
                center: dim.center,
                max: dim.max,
                size: dim.size,
              },
              null,
              2
            )}`
          );
        }
      );
      console.groupEnd();
    }

    // Print transform
    if (node.transform) {
      console.log(
        `${indent}Transform: ${JSON.stringify(
          {
            translate: node.transform.translate,
          },
          null,
          2
        )}`
      );
    }

    // Print combined dimensions
    console.log(
      `${indent}Combined Dimensions: ${JSON.stringify(node.dims, null, 2)}`
    );
  }

  // Print children
  if ("children" in node && node.children && node.children.length > 0) {
    console.group(`${indent}Children`);
    node.children.forEach((child) => {
      debugNodeTree(child, indent + "    ");
    });
    console.groupEnd();
  }

  console.groupEnd();
};

export const debugUnderlyingSpaceTree = (
  node: GoFishNode | GoFishAST,
  indent: string = ""
): void => {
  // Get the underlying space for this node
  const underlyingSpace = node.resolveUnderlyingSpace();

  // Format the underlying space for display
  const formatUnderlyingSpace = (
    space: UnderlyingSpace | Size<UnderlyingSpace>
  ): string => {
    const fmt = (s: UnderlyingSpace): string => {
      if (isCONTINUOUS(s)) {
        const placement = spacePlacement(s);
        return placement === "determined"
          ? `position(${toJSON(continuousInterval(s)!)})`
          : placement === "free"
            ? `size(${s.width.run(1)})`
            : `difference(${s.width.run(1)})`;
      } else if (isORDINAL(s)) {
        return `ordinal(${s.domain})`;
      } else if (isUNDEFINED(s)) {
        return `undefined`;
      } else {
        return "unknown";
      }
    };
    return Array.isArray(space) ? `[${space.map(fmt).join(", ")}]` : fmt(space);
  };

  // Get the name for display (handle both GoFishNode and GoFishRef)
  const nodeName = isGoFishNode(node) ? node._name : node.name;
  const hasChildren =
    "children" in node && node.children && node.children.length > 0;

  // Create a group for this node only if it has children
  if (hasChildren) {
    console.group(
      `${indent}${node.type}${nodeName ? ` (${nodeName})` : ""} → ${formatUnderlyingSpace(underlyingSpace)}`
    );
  } else {
    console.log(
      `${indent}${node.type}${nodeName ? ` (${nodeName})` : ""} → ${formatUnderlyingSpace(underlyingSpace)}`
    );
  }

  // Print children
  if (hasChildren) {
    node.children.forEach((child) => {
      debugUnderlyingSpaceTree(child, indent + "  ");
    });
    console.groupEnd();
  }
};

export const debugInputSceneGraph = (
  node: GoFishNode | GoFishAST,
  indent: string = ""
): void => {
  // Get the name for display (handle both GoFishNode and GoFishRef)
  const nodeName = isGoFishNode(node) ? node._name : node.name;
  const hasChildren =
    "children" in node && node.children && node.children.length > 0;

  // Format args for display
  const formatArgs = (args: any): string => {
    if (args === undefined || args === null) {
      return "";
    }

    const formatValue = (val: any): string => {
      if (
        typeof val === "object" &&
        val !== null &&
        "type" in val &&
        val.type === "datum"
      ) {
        return `v(${JSON.stringify(val.datum)})`;
      } else if (Array.isArray(val)) {
        const formattedArray = val.map(formatValue);
        return `[${formattedArray.join(", ")}]`;
      } else if (typeof val === "object" && val !== null) {
        const formattedObj = Object.entries(val).map(
          ([key, nestedVal]) => `${key}: ${formatValue(nestedVal)}`
        );
        return `{${formattedObj.join(", ")}}`;
      }
      return JSON.stringify(val);
    };

    try {
      if (Array.isArray(args)) {
        const formattedArray = args.map(formatValue);
        return ` [${formattedArray.join(", ")}]`;
      } else if (typeof args === "object") {
        const formattedObj = Object.entries(args).map(
          ([key, val]) => `${key}: ${formatValue(val)}`
        );
        return ` {${formattedObj.join(", ")}}`;
      } else {
        return ` ${formatValue(args)}`;
      }
    } catch {
      return ` [Object]`;
    }
  };

  // Create a group for this node only if it has children
  if (hasChildren) {
    console.group(
      `${indent}${node.type}${nodeName ? ` (${nodeName})` : ""}${isGoFishNode(node) ? formatArgs(node.args) : ""}`
    );
  } else {
    console.log(
      `${indent}${node.type}${nodeName ? ` (${nodeName})` : ""}${isGoFishNode(node) ? formatArgs(node.args) : ""}`
    );
  }

  // Print children
  if (hasChildren) {
    node.children.forEach((child) => {
      debugInputSceneGraph(child, indent + "  ");
    });
    console.groupEnd();
  }
};
