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
import { Domain } from "./domain";
import { GoFishNode } from "./_node";
import { GoFishAST } from "./_ast";
import { MaybeValue } from "./data";
import { ORDINAL, POSITION, UnderlyingSpace } from "./underlyingSpace";
import type { RenderSession } from "./_node";
import { isToken, Token } from "./createName";

/* TODO: resolveMeasures and layout feel pretty similar... */

export type Placeable = {
  dims: Dimensions;
  place: (axis: FancyDirection, value: number, anchor?: Anchor) => void;
};

export type Measure = (
  shared: Size<boolean>,
  // scaleFactors: Size<number | undefined>,
  size: Size,
  children: GoFishNode[]
) => (scaleFactors: Size) => FancySize;

export type Layout = (
  shared: Size<boolean>,
  size: Size,
  scaleFactors: Size<number | undefined>,
  children: {
    layout: (size: Size, scaleFactors: Size<number | undefined>) => Placeable;
  }[],
  measurement: (scaleFactors: Size) => Size
) => { intrinsicDims: FancyDims; transform: FancyTransform };

export class GoFishRef {
  public type: string = "ref";
  // Stored as `_name` (not `name`) so the constraint system's childNameKey,
  // which reads `_name`, treats a named ref as a constraint target — and so
  // `name()` can be a chainable method like GoFishNode.name().
  public _name?: string | Token;
  public parent?: GoFishNode;

  // undefined/"one" = a singular reference; "all" = a plural chart-data
  // selection (created by `selectAll`, consumed at chart-build time).
  // Assigned unconditionally in the constructor so the key is always an own
  // key — RESERVED_KEYS in shapes/ref.tsx is derived from Reflect.ownKeys of
  // a sample instance and must see it regardless of field-init config.
  public readonly multiplicity?: "one" | "all";

  private intrinsicDims?: Dimensions;
  /** @internal Layout-pass state. Public to match GoFishNode.transform so
   *  `(node as GoFishAST).transform` resolves on the union; external callers
   *  should not rely on this field. */
  public transform?: Transform;
  public shared: Size<boolean>;
  private measurement!: (scaleFactors: Size) => Size;
  public readonly selection?: string | Token | (Token | string | number)[];
  private directNode?: GoFishNode;
  private selectedNode?: GoFishNode;
  private renderSession?: RenderSession;
  public color?: MaybeValue<string>;
  constructor({
    name,
    selection,
    node,
    shared = [false, false],
    multiplicity,
  }: {
    name?: string | Token;
    selection?: string | Token | (Token | string | number)[];
    node?: GoFishNode;
    shared?: Size<boolean>;
    multiplicity?: "one" | "all";
  }) {
    if (selection === undefined && !node) {
      throw new Error("Ref must have either selection or node");
    }
    this._name = name;
    this.shared = shared;
    this.selection = selection;
    this.directNode = node;
    this.multiplicity = multiplicity;
  }

  /** The raw datum carried by the node this ref points at — the *bag of rows*
   * that flowed into the node (the operator pipeline binds this as an array;
   * a fully-split leaf is a 1-row bag). Reads `directNode` first because
   * `split` runs before layout/resolveNames (when only `directNode` is set);
   * falls back to the resolved `selectedNode`.
   *
   * This is intentionally the *uncollapsed* bag: `sumBy(ref.datum, "count")`
   * aggregates over the rows. Field access with homogeneity collapse (so
   * `by: "datum.lake"` resolves to a scalar when the rows agree) lives in
   * `projectPath` / `pluck` (see datumProjection.ts), not here. */
  public get datum(): any {
    return (this.directNode ?? this.selectedNode)?.datum;
  }

  /** Chainable: name this ref so a layer constraint can reference it (mirrors
   * GoFishNode.name()). Returns `this` so `ref(token).name("x")` works. */
  public name(name: string | Token): this {
    this._name = name;
    return this;
  }

  public resolveNames(): void {
    if (this.multiplicity === "all") {
      throw new Error(
        'selectAll(...) cannot be used inline in a layout; pass it as chart data: Chart(selectAll("name"))'
      );
    }
    if (this.directNode) {
      this.selectedNode = this.directNode;
    } else if (this.selection !== undefined) {
      this.selectedNode = this.resolveSelection(this.selection);
    }
    this.color = this.selectedNode?.color;
  }

  private resolveSelection(
    selection: string | Token | (Token | string | number)[]
  ): GoFishNode {
    // String: layer-local lookup from the nearest enclosing Layer.
    if (typeof selection === "string") {
      return this.resolveLocalString(selection);
    }
    // Token: global lookup in tokenContext.
    if (isToken(selection)) {
      return this.resolveToken(selection);
    }
    // Path: first segment must be a Token (or GoFishNode). Subsequent segments
    // are tag-strings (scope-map lookup) or ints (positional).
    if (selection.length === 0) {
      throw new Error("Ref path is empty");
    }
    const head = selection[0];
    if (!isToken(head)) {
      throw new Error(
        `Ref path's first segment must be a Token (from createName), got ${typeof head}`
      );
    }
    let current: GoFishNode = this.resolveToken(head);
    for (let i = 1; i < selection.length; i++) {
      const seg = selection[i];
      const pathSoFar = selection
        .slice(0, i)
        .map((s) => (isToken(s) ? s.__tag : String(s)))
        .join(" > ");
      if (typeof seg === "number") {
        const child = current.children[seg];
        if (child === undefined) {
          throw new Error(
            `Ref path: child index ${seg} out of bounds under "${pathSoFar}" (has ${current.children.length} children)`
          );
        }
        if (!(child instanceof GoFishNode)) {
          throw new Error(
            `Ref path: child at index ${seg} under "${pathSoFar}" is not a GoFishNode`
          );
        }
        current = child;
      } else if (typeof seg === "string") {
        const map = current._scopeMap;
        if (!map) {
          throw new Error(
            `Ref path: "${pathSoFar}" is not a scope root; cannot look up tag "${seg}"`
          );
        }
        const next = map.get(seg);
        if (!next) {
          throw new Error(
            `Ref path: tag "${seg}" not found under "${pathSoFar}". Available: ${Array.from(map.keys()).join(", ")}`
          );
        }
        current = next;
      } else if (isToken(seg)) {
        // Tokens can be used as path segments for future flexibility —
        // look them up globally.
        current = this.resolveToken(seg);
      } else {
        throw new Error(`Ref path segment has unsupported type`);
      }
    }
    return current;
  }

  private resolveToken(token: Token): GoFishNode {
    const tokenContext = this.getRenderSession().tokenContext;
    const node = tokenContext.get(token);
    if (!node) {
      throw new Error(
        `Can't find token "${token.__tag}". Available token tags: ${Array.from(
          tokenContext.keys()
        )
          .map((t) => t.__tag)
          .join(", ")}`
      );
    }
    return node;
  }

  private resolveLocalString(name: string): GoFishNode {
    // Walk up to the nearest enclosing component (createMark output, marked
    // via `_isComponent`). If none, the search root is the topmost ancestor.
    // Then DFS for a node whose `_name` matches, NOT descending into nested
    // components — so strings don't leak across component boundaries.
    //
    // We use `_isComponent` rather than `_isScope` so future operators that
    // scope for token-registration reasons don't silently break this lookup.
    let scope: GoFishNode | undefined = this.parent;
    while (scope && !scope._isComponent) {
      scope = scope.parent;
    }
    if (!scope) {
      scope = this.parent;
      while (scope?.parent) scope = scope.parent;
    }
    if (!scope) {
      throw new Error(
        `Can't find local name "${name}" — ref has no ancestors.`
      );
    }
    const found = findInComponent(scope, name);
    if (found) return found;
    throw new Error(
      `Can't find local name "${name}" within enclosing component.`
    );
  }

  public embed(direction: FancyDirection): void {
    this.selectedNode?.embed(direction);
  }

  /* TODO: what should the default be? */
  public resolveUnderlyingSpace(): Size<UnderlyingSpace> {
    return (
      this.selectedNode?.resolveUnderlyingSpace() ?? [ORDINAL([]), ORDINAL([])]
    );
  }

  /* TODO: I'm not really sure what this should do */
  public measure(size: Size): (scaleFactors: Size) => Size {
    const measurement = (scaleFactors: Size) =>
      // elaborateSize(this._measure(this.shared, size, this.children)(scaleFactors));
      size;
    this.measurement = measurement;
    return measurement;
  }

  public layout(
    size: Size,
    scaleFactors: Size<number | undefined>,
    _posScales?: Size<((pos: number) => number) | undefined>
  ): Placeable {
    if (!this.selectedNode) {
      throw new Error("Selected node not found");
    }

    // Find the least common ancestor between this ref and the selected node
    const lca = findLeastCommonAncestor(this, this.selectedNode);

    // Compute transform from selected node up to LCA
    const upwardTranslate: [number, number] = [0, 0];
    let current: GoFishAST | undefined = this.selectedNode;
    while (current && current !== lca) {
      if (current.transform) {
        upwardTranslate[0] += current.transform.translate?.[0] ?? 0;
        upwardTranslate[1] += current.transform.translate?.[1] ?? 0;
      }
      current = current.parent;
    }

    // Compute transform from LCA down to this ref
    const downwardTranslate: [number, number] = [0, 0];
    current = this;
    while (current && current !== lca) {
      if (current.transform) {
        downwardTranslate[0] += current.transform.translate?.[0] ?? 0;
        downwardTranslate[1] += current.transform.translate?.[1] ?? 0;
      }
      current = current.parent;
    }

    // Combine transforms
    this.transform = {
      translate: [
        upwardTranslate[0] - downwardTranslate[0],
        upwardTranslate[1] - downwardTranslate[1],
      ],
    };

    this.intrinsicDims = this.selectedNode.intrinsicDims;

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

    const anchorToPoint = {
      min: intrinsic!.min ?? 0,
      max: intrinsic!.max ?? 0,
      center: intrinsic!.center ?? 0,
      baseline: 0,
    };

    this.transform!.translate![dir] = value - anchorToPoint[anchor];
  }

  public INTERNAL_render(): JSX.Element {
    return <></>;
  }

  public setRenderSession(session: RenderSession): void {
    this.renderSession = session;
  }

  private getRenderSession(): RenderSession {
    if (this.renderSession) return this.renderSession;
    if (this.parent) return this.parent.getRenderSession();
    throw new Error("Render session not set");
  }
}

/**
 * The component-boundary visibility rule, in one place. Yields `root` and every
 * hygienically-visible descendant in DFS parent-iteration (pre-order): it
 * descends into ordinary children, and *visits* a `_isComponent` child (it is
 * itself visible) but does NOT descend into its subtree — so names don't leak
 * across component boundaries.
 *
 * This is the single home for the bounded walk shared by `findInComponent`
 * (ref/selectAll string lookup, below) and `collectLayerRegistrations`
 * (chartBuilder.ts layer registry). Keeping them on one walk is what guarantees
 * a name is reachable by `ref`/`selectAll` exactly when it's registered as a
 * layer — the two can't drift.
 */
export function* visibleNodes(root: GoFishNode): Generator<GoFishNode> {
  yield root;
  for (const child of root.children ?? []) {
    if (!(child instanceof GoFishNode)) continue;
    if (child._isComponent) {
      // Visible (a leaf component, e.g. a createMark `rect`, can carry a name)
      // but a boundary: don't descend into it.
      yield child;
    } else {
      yield* visibleNodes(child);
    }
  }
}

/**
 * DFS for a descendant of `node` whose `_name` (or token `__tag`) matches
 * `name`, without crossing `_isComponent` boundaries. The match is checked
 * before the descent guard so a leaf component (e.g. a `rect` produced by
 * createMark, which is itself a component) is still findable by name.
 *
 * The bounded traversal is `visibleNodes` above; `node` itself is the search
 * root and is never a match target, only its visible descendants.
 */
const findInComponent = (
  node: GoFishNode,
  name: string
): GoFishNode | undefined => {
  for (const candidate of visibleNodes(node)) {
    if (candidate === node) continue;
    const n = candidate._name;
    const tag = n === undefined ? undefined : isToken(n) ? n.__tag : n;
    if (tag === name) return candidate;
  }
  return undefined;
};

export const findPathToRoot = (node: GoFishAST): GoFishAST[] => {
  const path: GoFishAST[] = [];
  let current: GoFishAST | undefined = node;
  while (current) {
    path.push(current);
    current = current.parent;
  }
  return path;
};

export const findLeastCommonAncestor = (
  node1: GoFishAST,
  node2: GoFishAST
): GoFishAST => {
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
