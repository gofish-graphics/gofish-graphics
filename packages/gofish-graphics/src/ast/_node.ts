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
  elaborateDims,
  elaborateDirection,
  elaborateSize,
  elaborateTransform,
  FancyDims,
  FancyDirection,
  FancySize,
  FancyTransform,
  Size,
  Transform,
} from "./dims";
import { gofish } from "./gofish";
import type { AxesOptions } from "./gofish";
import { GoFishRef } from "./_ref";
import { GoFishAST } from "./_ast";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import { getValue, isValue, MaybeValue } from "./data";
import { color6 } from "../color";
import * as Monotonic from "../util/monotonic";
import {
  isDIFFERENCE,
  isORDINAL,
  isPOSITION,
  isUNDEFINED,
  UnderlyingSpace,
} from "./underlyingSpace";
import { toJSON, interval } from "../util/interval";
import { nice } from "d3-array";
import type { ScaleContext } from "./gofish";
import { createAxisNode, AXIS_WIDTH } from "./shapes/axis";
import { computePosScale, continuous } from "./domain";
import type { TokenContext } from "./tokenContext";
import { isToken, Token } from "./createName";
import type { ConstraintSpec, ConstraintRef } from "./constraints";
import { collectConstraintRefs } from "./constraints";
import {
  assignPaletteColor,
  assignGradientColor,
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
  place: (axis: FancyDirection, value: number, anchor?: Anchor) => void;
};

export type Layout = (
  shared: Size<boolean>,
  size: Size,
  scaleFactors: Size<number | undefined>,
  children: GoFishAST[],
  posScales: Size<((pos: number) => number) | undefined>,
  node: GoFishNode,
  posDomains?: Size<[number, number] | undefined>
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
  shared: Size<boolean>
) => FancySize<UnderlyingSpace>;

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
  public shared: Size<boolean>;
  // public posDomains: Size<Domain | undefined> = [undefined, undefined];
  public renderData?: any;
  public coordinateTransform?: CoordinateTransform;
  public color?: MaybeValue<string>;
  public constraints: ConstraintSpec[] = [];
  public colorConfig?: ColorConfig;
  public _label?: LabelSpec;
  private _zOrder = 0;
  private renderSession?: RenderSession;
  // Axis state per dimension.
  // true    = owns the axis (renders SVG + reserves AXIS_WIDTH budget)
  // false   = explicitly suppressed via axes: override (no budget, blocks children)
  // "budget"= budget-only; reserves AXIS_WIDTH space but does not render SVG
  //           (set on non-first layer siblings that share a sibling's axis)
  // undefined = not involved
  public axis: { x?: true | false | "budget"; y?: true | false | "budget" } =
    {};
  public _axisOverride?: { x?: boolean; y?: boolean };
  /** Explicit key→node map for ordinal axis label positioning. Set by
   * operators (e.g. table) whose domain keys differ from children's .key. */
  public _ordinalKeyMap?: Record<string, GoFishNode>;
  public _axisChildren?: Map<0 | 1, GoFishNode>;
  public _contentBaseline: Size = [0, 0];
  /**
   * Set by directional operators (Spread) to indicate the align direction.
   * Used in layout() to gate innerBaselineX expansion.
   */
  public _layoutAlignDir?: 0 | 1;
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
    const unit = scaleContext.unit as {
      color: Map<any, string>;
      colorConfig?: ColorConfig;
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
      if (this.color !== undefined && isValue(this.color)) {
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
    color: Map<any, string>;
    colorConfig?: ColorConfig;
  }): void {
    const orderedKeys: any[] = [];
    this.collectColorValues(orderedKeys);
    const colorConfig = unit.colorConfig!;

    if (colorConfig._tag === "gradient") {
      const min = Math.min(...orderedKeys);
      const max = Math.max(...orderedKeys);
      orderedKeys.forEach((key) => {
        if (!unit.color.has(key)) {
          const t = max === min ? 0 : (key - min) / (max - min);
          unit.color.set(key, assignGradientColor(colorConfig, t));
        }
      });
    } else {
      orderedKeys.forEach((key, i) => {
        if (!unit.color.has(key)) {
          unit.color.set(key, assignPaletteColor(colorConfig, String(key), i));
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
        this.shared
      )
    );
    return this._underlyingSpace;
  }

  /**
   * Top-down walk that marks which nodes should render axes.
   * `claimed` tracks dimensions already claimed by an ancestor.
   */
  public resolveAxes(
    claimed: Set<0 | 1> = new Set(),
    budgetOnly: Set<0 | 1> = new Set()
  ): void {
    if (this.type === "layer") {
      // Accumulate claimed dims across siblings so each child sees what
      // previous siblings already claimed. Newly-claimed dims are passed as
      // budgetOnly to subsequent siblings: they reserve the axis margin for
      // layout alignment but don't render duplicate axis SVG.
      const accumulated = new Set(claimed);
      const scanClaimed = (n: GoFishNode): void => {
        if (n.axis.x === true) accumulated.add(0);
        if (n.axis.y === true) accumulated.add(1);
        n.children.forEach((c) => {
          if (c instanceof GoFishNode) scanClaimed(c);
        });
      };
      this.children.forEach((c) => {
        if (c instanceof GoFishNode) {
          // Dims newly claimed by previous siblings (not in the original claimed)
          const siblingClaimed = new Set(
            [...accumulated].filter((d) => !claimed.has(d as 0 | 1))
          ) as Set<0 | 1>;
          // Merge incoming budgetOnly with sibling-claimed dims so nested
          // layer nodes (e.g. Frame wrappers) don't lose the budget signal.
          const childBudgetOnly = new Set([
            ...budgetOnly,
            ...siblingClaimed,
          ]) as Set<0 | 1>;
          c.resolveAxes(new Set(accumulated), childBudgetOnly);
          scanClaimed(c);
        }
      });

      return;
    }

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
        if (c instanceof GoFishNode) c.resolveAxes(allClaimed);
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
        budgetOnly.has(dim) &&
        space &&
        !isUNDEFINED(space[dim]) &&
        (isPOSITION(space[dim]) ||
          isDIFFERENCE(space[dim]) ||
          isORDINAL(space[dim]))
      ) {
        // A layer sibling already owns this axis. Reserve the layout margin
        // so content areas stay aligned, but skip axis SVG rendering.
        // Only applies when this node has a meaningful space for this dim —
        // nodes with UNDEFINED space (e.g. connectY) should never get budget.
        if (dim === 0) this.axis.x = "budget";
        else this.axis.y = "budget";
        next.add(dim);
      } else if (
        !claimed.has(dim) &&
        space &&
        !isUNDEFINED(space[dim]) &&
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
      if (c instanceof GoFishNode) c.resolveAxes(next);
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
        if (isPOSITION(space) && space.domain) {
          const [niceMin, niceMax] = nice(
            space.domain.min!,
            space.domain.max!,
            10
          );
          (space as any).domain = interval(niceMin, niceMax);
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
    posScales: Size<((pos: number) => number) | undefined>,
    posDomains?: Size<[number, number] | undefined>
  ): Placeable {
    let axisBudgetX =
      this.axis.y === true || this.axis.y === "budget" ? AXIS_WIDTH : 0;
    let axisBudgetY =
      this.axis.x === true || this.axis.x === "budget" ? AXIS_WIDTH : 0;

    // Change 1: expand outer axis budget to include inner baselines so both
    // label rows have room (outer labels + inner facet labels).
    // Look through transparent layer nodes to find real axis flags.
    const findAxisFlag = (n: GoFishNode, dim: 0 | 1): boolean => {
      if (n.type === "layer") {
        return n.children.some(
          (c) => c instanceof GoFishNode && findAxisFlag(c, dim)
        );
      }
      return dim === 0 ? n.axis.x === true : n.axis.y === true;
    };
    // innerBaselineY: for horizontal spreads (dir:"x", alignDir=1) only.
    // The inner x-axis label row stacks in y below the outer x-axis labels,
    // so 2×AT is needed. For vertical spreads (dir:"y") the inner x-axis sits
    // inside each facet and already falls adjacent to the outer x-axis with
    // just 1×AT — expanding here would push frames up, creating a dead gap.
    const innerBaselineY =
      axisBudgetY > 0 && this._layoutAlignDir === 1
        ? this.children.reduce(
            (max, c) =>
              c instanceof GoFishNode && findAxisFlag(c, 0)
                ? Math.max(max, AXIS_WIDTH)
                : max,
            0
          )
        : 0;
    // innerBaselineX: for vertical spreads (dir:"y", alignDir=0) only.
    const innerBaselineX =
      axisBudgetX > 0 && this._layoutAlignDir === 0
        ? this.children.reduce(
            (max, c) =>
              c instanceof GoFishNode && findAxisFlag(c, 1)
                ? Math.max(max, AXIS_WIDTH)
                : max,
            0
          )
        : 0;
    axisBudgetY += innerBaselineY;
    axisBudgetX += innerBaselineX;

    let contentSize: Size = size;
    let contentPosScales = posScales;
    let contentScaleFactors = scaleFactors;

    if (axisBudgetX > 0 || axisBudgetY > 0) {
      // Clamp to 0 so charts with h=0 (e.g. 1D strip plots) don't get a
      // negative content size which causes NaN in the posScale compression.
      contentSize = [
        Math.max(0, size[0] - axisBudgetX),
        Math.max(0, size[1] - axisBudgetY),
      ];
      // Rescale posScales to fit within content area.
      // outerManages: when posScales[dim] is already provided by an ancestor,
      // pass it through unchanged to avoid double-compression in faceted charts.
      const outerManagesX = posScales[0] !== undefined;
      const outerManagesY = posScales[1] !== undefined;

      contentPosScales = [
        posScales[0] && axisBudgetX > 0 && !outerManagesX && size[0] > 0
          ? (v: number) => posScales[0]!(v) * (contentSize[0] / size[0])
          : posScales[0],
        posScales[1] && axisBudgetY > 0 && !outerManagesY && size[1] > 0
          ? (v: number) => posScales[1]!(v) * (contentSize[1] / size[1])
          : posScales[1],
      ];
      contentScaleFactors = [
        scaleFactors[0] !== undefined &&
        axisBudgetX > 0 &&
        !outerManagesX &&
        size[0] > 0
          ? scaleFactors[0] * (contentSize[0] / size[0])
          : scaleFactors[0],
        scaleFactors[1] !== undefined &&
        axisBudgetY > 0 &&
        !outerManagesY &&
        size[1] > 0
          ? scaleFactors[1] * (contentSize[1] / size[1])
          : scaleFactors[1],
      ];
      this._contentBaseline = [axisBudgetX, axisBudgetY];

      // When this node owns an axis for a POSITION dimension but the outer
      // context didn't supply a posScale (e.g. inner scatter inside a faceted
      // chart where the outer x-space is ORDINAL), compute a local posScale.
      const uspace = this._underlyingSpace;
      if (
        !contentPosScales[0] &&
        this.axis.x === true &&
        uspace &&
        isPOSITION(uspace[0]) &&
        uspace[0].domain
      ) {
        contentPosScales = [
          computePosScale(
            continuous({
              value: [uspace[0].domain.min!, uspace[0].domain.max!],
              measure: "unit",
            }),
            contentSize[0]
          ),
          contentPosScales[1],
        ];
      }
      if (
        !contentPosScales[1] &&
        this.axis.y === true &&
        uspace &&
        isPOSITION(uspace[1]) &&
        uspace[1].domain
      ) {
        contentPosScales = [
          contentPosScales[0],
          computePosScale(
            continuous({
              value: [uspace[1].domain.min!, uspace[1].domain.max!],
              measure: "unit",
            }),
            contentSize[1]
          ),
        ];
      }
    }

    const { intrinsicDims, transform, renderData } = this._layout(
      this.shared,
      contentSize,
      contentScaleFactors,
      this.children,
      contentPosScales,
      this,
      posDomains
    );

    if (axisBudgetX > 0 || axisBudgetY > 0) {
      // Shift content children's transforms so they occupy the content area
      for (const child of this.children) {
        if (child instanceof GoFishNode && child.transform) {
          if (axisBudgetX > 0) {
            child.transform.translate![0] =
              (child.transform.translate![0] ?? 0) + axisBudgetX;
          }
          if (axisBudgetY > 0) {
            child.transform.translate![1] =
              (child.transform.translate![1] ?? 0) + axisBudgetY;
          }
        }
      }

      // Expand intrinsicDims to include axis budget
      const dims = elaborateDims(intrinsicDims);
      this.intrinsicDims = [
        {
          min: 0,
          max: (dims[0].max ?? 0) + axisBudgetX,
          size: (dims[0].size ?? 0) + axisBudgetX,
          center: ((dims[0].max ?? 0) + axisBudgetX) / 2,
        },
        {
          min: 0,
          max: (dims[1].max ?? 0) + axisBudgetY,
          size: (dims[1].size ?? 0) + axisBudgetY,
          center: ((dims[1].max ?? 0) + axisBudgetY) / 2,
        },
      ];

      // Create and place axis children
      this._axisChildren = new Map();
      const space = this._underlyingSpace!;
      const session = this.getRenderSession();

      if (this.axis.y === true) {
        const sf = this.getRenderSession().scaleContext.y;
        const diffScaleY =
          isDIFFERENCE(space[1]) && sf && "scaleFactor" in sf
            ? (v: number) => v * (sf as any).scaleFactor
            : undefined;
        const yPosScale = contentPosScales[1] ?? diffScaleY;
        const yAxisNode = createAxisNode({
          dim: 1,
          space: space[1],
          contentSize: contentSize[1],
          posScale: yPosScale,
          ownerNode: this,
          posDomain: posDomains?.[1],
        });
        if (yAxisNode) {
          yAxisNode.parent = this;
          yAxisNode.setRenderSession(session);
          yAxisNode.layout(
            [axisBudgetX, contentSize[1]],
            contentScaleFactors,
            contentPosScales
          );
          yAxisNode.place(0, 0, "min");
          yAxisNode.place(1, axisBudgetY, "min");
          this._axisChildren.set(1, yAxisNode);
        }
      }

      if (this.axis.x === true) {
        const sf = this.getRenderSession().scaleContext.x;
        const diffScaleX =
          isDIFFERENCE(space[0]) && sf && "scaleFactor" in sf
            ? (v: number) => v * (sf as any).scaleFactor
            : undefined;
        const xPosScale = contentPosScales[0] ?? diffScaleX;
        const xAxisNode = createAxisNode({
          dim: 0,
          space: space[0],
          contentSize: contentSize[0],
          posScale: xPosScale,
          ownerNode: this,
          posDomain: posDomains?.[0],
        });
        if (xAxisNode) {
          xAxisNode.parent = this;
          xAxisNode.setRenderSession(session);
          xAxisNode.layout(
            [contentSize[0], axisBudgetY],
            contentScaleFactors,
            contentPosScales
          );
          xAxisNode.place(0, axisBudgetX, "min");
          xAxisNode.place(1, 0, "min");
          this._axisChildren.set(0, xAxisNode);
        }
      }
    } else {
      this.intrinsicDims = elaborateDims(intrinsicDims);
      // Propagate _contentBaseline through transparent layer nodes so that
      // outer spreads (Change 3) can read the inner chart's axis offset even
      // when a Frame/layer sits between the outer spread and the inner chart.
      if (this.type === "layer") {
        const maxBaselineX = this.children.reduce(
          (max, c) =>
            c instanceof GoFishNode
              ? Math.max(max, c._contentBaseline[0])
              : max,
          0
        );
        const maxBaselineY = this.children.reduce(
          (max, c) =>
            c instanceof GoFishNode
              ? Math.max(max, c._contentBaseline[1])
              : max,
          0
        );
        if (maxBaselineX > 0 || maxBaselineY > 0) {
          this._contentBaseline = [maxBaselineX, maxBaselineY];
        }
      }
    }

    this.transform = elaborateTransform(transform);
    this.renderData = renderData;
    return this;
  }

  public get dims(): Dimensions {
    // Combine intrinsicDims and transform. Return undefined for min/center/max/size
    // when either the intrinsic dim or translation for that dimension is undefined,
    // so callers can distinguish "not yet placed" from "at 0".
    const dim = (i: 0 | 1) => {
      const intrinsic = this.intrinsicDims?.[i];
      const translate = this.transform?.translate?.[i];
      const hasTranslate = translate !== undefined;
      return {
        min:
          hasTranslate && intrinsic?.min !== undefined
            ? (intrinsic!.min ?? 0) + translate!
            : undefined,
        center:
          hasTranslate && intrinsic?.center !== undefined
            ? (intrinsic!.center ?? 0) + translate!
            : undefined,
        max:
          hasTranslate && intrinsic?.max !== undefined
            ? (intrinsic!.max ?? 0) + translate!
            : undefined,
        size: intrinsic?.size,
        embedded: intrinsic?.embedded,
      };
    };
    return [dim(0), dim(1)];
  }

  public place(
    axis: FancyDirection,
    value: number,
    anchor: Anchor = "min"
  ): void {
    const dir = elaborateDirection(axis);
    const intrinsic = this.intrinsicDims?.[dir];

    const anchorToDim = {
      min: intrinsic?.min,
      max: intrinsic?.max,
      center: intrinsic?.center,
      // TODO: revisit baseline case
      baseline: intrinsic?.min,
    };

    if (anchorToDim[anchor] === undefined) {
      // Interval has min/max/center/size but not "baseline" — baseline is a
      // synthetic anchor aliased to min above (see TODO). When the anchor is
      // already undefined and we're being asked to set it, "baseline" can't
      // be written back: just no-op so the translate path below is skipped.
      if (anchor !== "baseline") {
        this.intrinsicDims![dir][anchor] = value;
      }
      return;
    }

    if (this.transform?.translate?.[dir] !== undefined) return;

    const anchorToPoint = {
      min: intrinsic!.min ?? 0,
      max: intrinsic!.max ?? 0,
      center: intrinsic!.center ?? 0,
      baseline: 0,
    };

    if (!this.transform!.translate) {
      this.transform!.translate = [undefined, undefined];
    }
    this.transform!.translate![dir] = value - anchorToPoint[anchor];
  }

  public embed(direction: FancyDirection): void {
    this.intrinsicDims![elaborateDirection(direction)].embedded = true;
  }

  public INTERNAL_render(
    coordinateTransform?: CoordinateTransform
  ): JSX.Element {
    const contentChildrenJSX = this.children.map((child) =>
      child.INTERNAL_render(
        this.type !== "box" ? coordinateTransform : undefined
      )
    );

    // Include axis children alongside content children
    const axisChildrenJSX: JSX.Element[] =
      this._axisChildren && this._axisChildren.size > 0
        ? [...this._axisChildren.values()].map((n) => n.INTERNAL_render())
        : [];

    const allChildrenJSX =
      axisChildrenJSX.length > 0
        ? ([...contentChildrenJSX, ...axisChildrenJSX] as JSX.Element[])
        : contentChildrenJSX;

    const shapeJSX = this._render(
      {
        intrinsicDims: this.intrinsicDims,
        transform: this.transform,
        renderData: this.renderData,
        coordinateTransform: coordinateTransform,
      },
      allChildrenJSX,
      this
    );
    if (this._label && this.intrinsicDims) {
      const labelJSX = this._renderLabel();
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
      w: number;
      h: number;
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

  private _renderLabel(): JSX.Element | null {
    return renderLabelJSX(this);
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
    if (Array.isArray(space)) {
      return `[${space
        .map((s) => {
          if (isPOSITION(s)) {
            return `position(${toJSON(s.domain)})`;
          } else if (isDIFFERENCE(s)) {
            return `difference(${s.width})`;
          } else if (isORDINAL(s)) {
            return `ordinal(${s.domain})`;
          } else if (isUNDEFINED(s)) {
            return `undefined`;
          } else {
            return s.kind;
          }
        })
        .join(", ")}]`;
    } else {
      if (isPOSITION(space)) {
        return `position(${toJSON(space.domain)})`;
      } else if (isDIFFERENCE(space)) {
        return `difference(${space.width})`;
      } else if (isORDINAL(space)) {
        return `ordinal(${space.domain})`;
      } else if (isUNDEFINED(space)) {
        return `undefined`;
      } else {
        return space.kind;
      }
    }
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
