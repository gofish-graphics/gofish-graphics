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
} from "./dims";
import { gofish, gofishToSVGElement, gofishToSVG, gofishSave } from "./gofish";
import type { AxesOptions, GoFishExportOptions } from "./gofish";
import { GoFishRef } from "./_ref";
import { GoFishAST } from "./_ast";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import { getValue, isValue, MaybeValue } from "./data";
import { color6 } from "../color";
import * as Monotonic from "../util/monotonic";
import {
  isCONTINUOUS,
  isDIFFERENCE,
  isORDINAL,
  isPOSITION,
  isUNDEFINED,
  continuousInterval,
  CONTINUOUS_TYPE,
  UnderlyingSpace,
} from "./underlyingSpace";
import { toJSON, interval } from "../util/interval";
import { envFlag } from "../util";
import { nice } from "d3-array";
import type { ScaleContext } from "./gofish";
import type { TokenContext } from "./tokenContext";
import { isToken, Token } from "./createName";
import type { ConstraintSpec, ConstraintRef } from "./constraints";
import { collectConstraintRefs } from "./constraints";
import {
  BBox,
  type BBoxFacet,
  type BBoxConflict,
  type FacetValue,
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
import { renderLabelJSX } from "./labels/renderLabel";

export type RenderSession = {
  tokenContext: TokenContext;
  scaleContext: ScaleContext;
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
  place: (axis: FancyDirection, value: number, anchor?: Anchor) => void;
  /** Write an axis extent from owned bbox facets (the size-setting primitive
   *  #39 — `span` and an authoritative `position` pin go through it). Optional
   *  because not every placeable shape implements it (a `ref` stand-in doesn't);
   *  it is only ever invoked on real `GoFishNode` constraint targets. */
  setExtent?: (
    axis: FancyDirection,
    owned: Partial<Record<BBoxFacet, number>>,
    owner?: string
  ) => void;
  /** Authoritative override pin (#39): land `anchor` at `value`, rebuilding the
   *  ledger when the axis already self-placed (the write-once `place()` can't).
   *  Handles `baseline` too, so a scatter override never bypasses the ledger.
   *  Optional for the same reason as `setExtent` (a `ref` stand-in omits it). */
  pinAnchor?: (axis: FancyDirection, value: number, anchor: Anchor) => void;
};

// `scaleFactors` is the σ (pixels-per-data-unit) handed down per axis. A node
// MUST NOT mutate this array: to establish a local scale for its descendants
// (the `shared` scoping annotation, below) it copies into a fresh array and
// passes that down — never writing back to the parent's, so a solved σ can't
// leak to the node's siblings (see spread.tsx / layer.tsx).
export type Layout = (
  shared: Size<boolean>,
  size: Size,
  scaleFactors: Size<number | undefined>,
  children: GoFishAST[],
  posScales: Size<((pos: number) => number) | undefined>,
  node: GoFishNode
) => { intrinsicDims: FancyDims; transform: FancyTransform; renderData?: any };

export type Render = (
  {
    intrinsicDims,
    transform,
    renderData,
    coordinateTransform,
  }: {
    intrinsicDims?: Dimensions;
    transform?: Transform;
    renderData?: any;
    coordinateTransform?: CoordinateTransform;
  },
  children: JSX.Element[],
  node: GoFishNode
) => JSX.Element;

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
 *  absorbs — a single owner writing inconsistent facets on an axis (the
 *  authority-independent half of "conflicts → named"). Off / zero-cost in prod. */
const CONFLICT_CHECK = envFlag("GOFISH_CONFLICT_CHECK");

const _conflicts = new Set<string>();
/** Report a `BBox` over-determination (a facet pinned inconsistent with the
 *  already-determined axis), once per (type, axis, facet). The placement pass's
 *  "named conflict instead of silent last-writer-wins" — for the single-owner
 *  case; cross-constraint authority is the open fork (#583). */
const reportConflict = (type: string, dir: 0 | 1, c: BBoxConflict): void => {
  const key = `${type}|${dir}|${c.facet}`;
  if (_conflicts.has(key)) return;
  _conflicts.add(key);
  console.warn(
    `[bbox-conflict] ${type} axis ${dir} ${c.facet}: asserted=${c.asserted} implied=${c.implied} (owner=${c.owner} prior=${c.priorOwner})`
  );
};

export class GoFishNode {
  public readonly uid: string;
  private static uidCounter = 0;
  public type: string;
  public args?: any;
  public key?: string;
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
  // private inferDomains: (childDomains: Size<Domain>[]) => FancySize<Domain | undefined>;
  private _resolveUnderlyingSpace: ResolveUnderlyingSpace;
  public _underlyingSpace?: Size<UnderlyingSpace> = undefined;
  private _layout: Layout;
  private _render: Render;
  public children: GoFishAST[];
  public intrinsicDims?: Dimensions;
  public transform?: Transform;
  /** Persistent per-axis bbox ledger (#39 stage 2). Records the facet equations
   *  that determine this node's box, so it mirrors the authoritative
   *  `(intrinsicDims, transform)`: `layout()` seeds the self-layout size (+ a
   *  self-placed absolute min), `_pinAnchor` records the absolute anchor a pin
   *  lands at, and a rank-2 `setExtent` resets the axis to its determining
   *  facets (overriding the self-layout seed). Lazily created (the hot single
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
   *  `scaleFactors`. Currently set only by `spread`/`stack` (`sharedScale`). */
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
  constructor(
    {
      name,
      key,
      type,
      args,
      // inferDomains,
      resolveUnderlyingSpace,
      layout,
      render,
      shared = [false, false],
      color,
    }: {
      name?: string;
      key?: string;
      type: string;
      args?: any;
      // inferDomains: (childDomains: Size<Domain>[]) => FancySize<Domain | undefined>;
      resolveUnderlyingSpace: ResolveUnderlyingSpace;
      layout: Layout;
      render: Render;
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
    this._render = render;
    this.children = children;
    children.forEach((child) => {
      child.parent = this;
    });
    this._name = name;
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
   * `claimed` tracks dimensions already claimed by an ancestor.
   */
  public resolveAxes(
    claimed: Set<0 | 1> = new Set(),
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

      const allClaimed = new Set<0 | 1>([0, 1]);
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

    const next = new Set(claimed);
    const space = this._underlyingSpace;
    for (const dim of [0, 1] as (0 | 1)[]) {
      const override =
        dim === 0 ? this._axisOverride?.x : this._axisOverride?.y;
      if (override !== undefined) {
        if (dim === 0) this.axis.x = override === false ? false : true;
        else this.axis.y = override === false ? false : true;
        next.add(dim); // claim regardless — false blocks children too
      } else if (
        enabled.has(dim) &&
        !claimed.has(dim) &&
        space &&
        !isUNDEFINED(space[dim]) &&
        // A baseline magnitude ("free") owns no guide yet — only an anchored
        // (POSITION), unanchored (DIFFERENCE), or ORDINAL axis does.
        (isPOSITION(space[dim]) ||
          isDIFFERENCE(space[dim]) ||
          isORDINAL(space[dim]))
      ) {
        if (dim === 0) this.axis.x = true;
        else this.axis.y = true;
        next.add(dim);
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
          (space as CONTINUOUS_TYPE).origin = niceMin;
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

  public layout(
    size: Size,
    scaleFactors: Size<number | undefined>,
    posScales: Size<((pos: number) => number) | undefined>
  ): Placeable {
    // Axes are no longer drawn here: they are elaborated into ordinary shapes +
    // constraints by `elaborateAxes` (src/ast/axes/elaborate.tsx) before layout,
    // so the layout engine has no axis-specific budget/baseline machinery.
    const { intrinsicDims, transform, renderData } = this._layout(
      this.shared,
      size,
      scaleFactors,
      this.children,
      posScales,
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
      if (id?.size !== undefined) this._addFacet(ledger, dir, "size", id.size);
      const tr = this.transform?.translate?.[dir];
      if (tr !== undefined && id?.min !== undefined)
        this._addFacet(ledger, dir, "min", tr + id.min);
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
        // `embedded` is a layout-fold flag, never a ledger facet — read it from
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

  /** Add a facet equation to a per-axis ledger, surfacing any over-determination
   *  the `BBox` detects (the placement pass's "named conflict, not silent
   *  last-writer" — single-owner case; observe-only behind GOFISH_CONFLICT_CHECK).
   *  Every ledger write goes through here so no conflict is silently dropped. */
  private _addFacet(
    box: BBox,
    dir: Direction,
    facet: BBoxFacet,
    value: FacetValue,
    owner?: string
  ): void {
    const conflict = box.add(facet, value, owner);
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
   * Write a node's per-axis extent from OWNED bbox facets (min/max/center/size)
   * — the bbox-backed primitive that `span` and an authoritative `position` pin
   * share (#39). Two or more owned facets DETERMINE the box (size included — the
   * size-setting case, e.g. span's two edges), so the local box is reset to
   * `[0, size]` and the translate to the absolute min. A single owned facet is a
   * position pin: the size comes from the node's own layout (the second
   * equation), the local box is left intact, and only the translate moves — so
   * the pin OVERRIDES a self-placed translate, which the write-once `place()`
   * cannot. Anchor facets map start→min, end→max, middle→center; `baseline`
   * (the origin) is not a bbox facet, so a baseline pin still uses `place()`.
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
    owned: Partial<Record<BBoxFacet, number>>,
    owner?: string
  ): void {
    const dir = elaborateDirection(axis);
    const facets = (
      Object.entries(owned) as [BBoxFacet, number | undefined][]
    ).filter((e): e is [BBoxFacet, number] => e[1] !== undefined);
    if (facets.length === 0) return;

    const intrinsic = this.intrinsicDims?.[dir];
    const sizeOwned = facets.length >= 2;

    if (!sizeOwned) {
      // Rank-1 position pin: a single anchor facet lands at its value; the size
      // is the node's own layout (the second equation). No BBox needed — the
      // anchor's local point is derived directly, the SAME `localAnchorPoint`
      // arithmetic `place()` uses, so the two paths can't diverge (and the hot
      // pin path allocates nothing). The local box is left intact; only the
      // translate moves, so the pin OVERRIDES a self-placed translate.
      const [facet, value] = facets[0];
      if (facet === "size") return; // a lone size can't determine a position
      this._pinAnchor(dir, facet, value);
      return;
    }

    // Rank-2: two+ owned facets DETERMINE the box (size included). This is an
    // overriding determination — it discards whatever the node's own layout seed
    // (or an earlier pin) recorded for this axis, exactly as it resets the local
    // frame to [0, size] at the absolute min. So the persistent ledger is RESET
    // to hold just these facets — and is now the SOLE record of this axis's
    // position.
    this._bbox ??= [undefined, undefined];
    const bbox = (this._bbox[dir] = new BBox());
    for (const [facet, value] of facets)
      this._addFacet(bbox, dir, facet, value, owner);
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
   * Pin one axis so the box's `anchor` facet lands at `value`, deriving the
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
      this._addFacet(ledger, dir, "size", intrinsic.size);
    if (anchor === "baseline") {
      this._addFacet(ledger, dir, "min", value + (intrinsic?.min ?? 0));
    } else {
      this._addFacet(ledger, dir, anchor, value);
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

  public INTERNAL_render(
    coordinateTransform?: CoordinateTransform,
    // Baked absolute transform supplied by the coord bake pass (a DisplayObject's
    // transform). When present it overrides this node's own (parent-relative)
    // transform for THIS node's draw — but not for its children's recursion,
    // which keep composing their own transforms. See `_displayObject.ts`.
    transformOverride?: Transform
  ): JSX.Element {
    const contentChildrenJSX = this.children.map((child) =>
      child.INTERNAL_render(
        this.type !== "box" ? coordinateTransform : undefined
      )
    );

    const transform = transformOverride ?? this._displayTransform;
    const shapeJSX = this._render(
      {
        intrinsicDims: this.intrinsicDims,
        transform,
        renderData: this.renderData,
        coordinateTransform: coordinateTransform,
      },
      contentChildrenJSX,
      this
    );
    if (this._label && this.intrinsicDims) {
      const labelJSX = this._renderLabel(transform);
      if (labelJSX) return [shapeJSX, labelJSX] as unknown as JSX.Element;
    }
    return shapeJSX;
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
      axisFields,
      colorConfig,
      padding,
    }: {
      w?: number;
      h?: number;
      x?: number;
      y?: number;
      transform?: { x?: number; y?: number };
      debug?: boolean;
      defs?: JSX.Element[];
      axes?: AxesOptions;
      axisFields?: { x?: string; y?: string };
      colorConfig?: ColorConfig;
      padding?: number;
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
        axisFields,
        colorConfig,
        padding,
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

  private _renderLabel(transformOverride?: Transform): JSX.Element | null {
    return renderLabelJSX(this, transformOverride);
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
        return typeof s.origin === "number"
          ? `position(${toJSON(continuousInterval(s)!)})`
          : s.origin === "free"
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
