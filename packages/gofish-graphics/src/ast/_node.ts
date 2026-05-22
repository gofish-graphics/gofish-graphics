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
  elaboratePosition,
  elaborateSize,
  elaborateTransform,
  FancyDims,
  FancyDirection,
  FancyPosition,
  FancySize,
  FancyTransform,
  Position,
  Size,
  Transform,
} from "./dims";
import { ContinuousDomain } from "./domain";
import { gofish } from "./gofish";
import type { AxesOptions } from "./gofish";
import { GoFishRef } from "./_ref";
import { GoFishAST } from "./_ast";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import { getValue, isValue, MaybeValue } from "./data";
import { color6 } from "../color";
import * as Monotonic from "../util/monotonic";
import { findTargetMonotonic } from "../util";
import {
  isDIFFERENCE,
  isORDINAL,
  isPOSITION,
  isUNDEFINED,
  UnderlyingSpace,
} from "./underlyingSpace";
import { toJSON } from "../util/interval";
import type { KeyContext, ScaleContext } from "./gofish";
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
  keyContext: KeyContext;
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
  children: {
    layout: (
      size: Size,
      scaleFactors: Size<number | undefined>,
      posScales: Size<((pos: number) => number) | undefined>
    ) => Placeable;
  }[],
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
        if (!isLiteralColor && !scaleContext.unit.color.has(color)) {
          scaleContext.unit.color.set(
            color,
            color6[scaleContext.unit.color.size % 6]
          );
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

  public resolveKeys(): void {
    if (this.key !== undefined) {
      this.getRenderSession().keyContext[this.key] = this;
    }
    this.children.forEach((child) => {
      child.resolveKeys();
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

  public layout(
    size: Size,
    scaleFactors: Size<number | undefined>,
    posScales: Size<((pos: number) => number) | undefined>
  ): Placeable {
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
      this.intrinsicDims![dir][anchor] = value;
      return;
    }

    if (this.transform?.translate?.[dir] !== undefined) return;

    const anchorToPoint = {
      min: intrinsic!.min ?? 0,
      max: intrinsic!.max ?? 0,
      center: intrinsic!.center ?? 0,
      baseline: 0,
    };

    this.transform!.translate![dir] = value - anchorToPoint[anchor];
  }

  public embed(direction: FancyDirection): void {
    this.intrinsicDims![elaborateDirection(direction)].embedded = true;
  }

  public INTERNAL_render(
    coordinateTransform?: CoordinateTransform
  ): JSX.Element {
    const shapeJSX = this._render(
      {
        intrinsicDims: this.intrinsicDims,
        transform: this.transform,
        renderData: this.renderData,
        /* TODO: do we want to add this as an object property? */
        coordinateTransform: coordinateTransform,
      },
      this.children.map((child) =>
        child.INTERNAL_render(
          this.type !== "box" ? coordinateTransform : undefined
        )
      ),
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
    }
  ) {
    return gofish(
      container,
      { w, h, x, y, transform, debug, defs, axes, axisFields, colorConfig },
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
  let current = node;
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
