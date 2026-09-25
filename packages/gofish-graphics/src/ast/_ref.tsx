// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Name Resolution & Scoping — /internals/core/names-and-scoping
// </gofish-wiki>

import {
  Anchor,
  Dimensions,
  Direction,
  elaborateDirection,
  FancyDirection,
  Size,
  Transform,
  anchorDetermined,
  combineDims,
  localAnchorOf,
  translateForAnchor,
} from "./dims";
import type { AxisScale } from "./domain";
import { GoFishNode } from "./_node";
import { GoFishAST } from "./_ast";
import { MaybeValue } from "./data";
import { ORDINAL, UnderlyingSpace } from "./underlyingSpace";
import type { Placeable, RenderSession } from "./_node";
import type { DisplayList } from "gofish-ir";
type DisplayListItem = DisplayList.DisplayItem;
import { isToken, Token } from "./createName";
import { childNameKey } from "./constraints/shared";

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
   * `by: "lake"` resolves to a scalar when the rows agree) lives in
   * `projectPath` / `pluck` (see datumProjection.ts), not here. */
  public get datum(): any {
    return (this.directNode ?? this.selectedNode)?.datum;
  }

  /** The node this ref points at (the direct node before layout, else the
   *  resolved selection). Lets build-time consumers (e.g. the `resolve`
   *  operator) read node-level metadata such as `__splitBy`. */
  public get targetNode(): GoFishNode | undefined {
    return this.directNode ?? this.selectedNode;
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
    // String: innermost-enclosing lookup, bounded by createMark.
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
    if (!this.parent) {
      throw new Error(
        `Can't find local name "${name}" — ref has no ancestors.`
      );
    }
    const found = resolveScopedName(this.parent, name, `ref("${name}")`);
    // A named ref stand-in is an alias for the node it points at.
    if (found instanceof GoFishRef) {
      if (found === this) {
        throw new Error(
          `ref("${name}") refers to itself: it is named "${name}" too, and ` +
            `it is the nearest node with that name. A ref named after its own ` +
            `target is no longer needed. Constrain the named node directly ` +
            `(names are visible anywhere inside the layer), or give the ref a ` +
            `different name.`
        );
      }
      found.resolveNames();
      const target = found.targetNode;
      if (!target) {
        throw new Error(`ref("${name}") names a ref that points at nothing.`);
      }
      return target;
    }
    return found;
  }

  public embed(direction: FancyDirection): void {
    this.selectedNode?.embed(direction);
  }

  public resolveUnderlyingSpace(): Size<UnderlyingSpace> {
    return (
      this.selectedNode?.resolveUnderlyingSpace() ?? [ORDINAL([]), ORDINAL([])]
    );
  }

  public layout(_size: Size, _scales?: Size<AxisScale | undefined>): Placeable {
    if (!this.selectedNode) {
      throw new Error("Selected node not found");
    }

    // Find the least common ancestor between this ref and the selected node
    const lca = findLeastCommonAncestor(this, this.selectedNode);

    // Accumulate the LEDGER-DERIVED translate. `projectedTranslate` is
    // polymorphic across the union: a node returns its ledger projection, a ref
    // (which has no ledger) its computed transform.
    const translateOf = (n: GoFishAST, dir: Direction): number =>
      n.projectedTranslate(dir) ?? 0;

    // Compute transform from selected node up to LCA
    const upwardTranslate: [number, number] = [0, 0];
    let current: GoFishAST | undefined = this.selectedNode;
    while (current && current !== lca) {
      upwardTranslate[0] += translateOf(current, 0);
      upwardTranslate[1] += translateOf(current, 1);
      current = current.parent;
    }

    // Compute transform from LCA down to this ref's parent. The ref's own
    // translate is what this method sets, so it must not be read here:
    // including the value from a previous layout would make a second layout
    // subtract the first result and land at 0 (#928).
    const downwardTranslate: [number, number] = [0, 0];
    current = this.parent;
    while (current && current !== lca) {
      downwardTranslate[0] += translateOf(current, 0);
      downwardTranslate[1] += translateOf(current, 1);
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
    // Shared with GoFishNode.dims (see {@link combineDims}): combine the local
    // box (`intrinsicDims`) with its placement (`translate`), deriving center/max
    // from the placed (min, size).
    return combineDims(this.intrinsicDims, this.transform);
  }

  /** The ref's origin as a `Placeable.projectedTranslate`. A ref has no
   *  ledger, so the projection IS its computed `transform.translate` — exposing
   *  it lets every translate reader (the coord bake, `_ref` accumulation,
   *  baseline align) call `projectedTranslate` polymorphically across the
   *  `GoFishNode | GoFishRef` union instead of branching on `instanceof`. */
  public projectedTranslate(dir: Direction): number | undefined {
    return this.transform?.translate?.[dir];
  }

  public localAnchor(axis: FancyDirection, anchor: Anchor): number | undefined {
    return localAnchorOf(
      this.intrinsicDims?.[elaborateDirection(axis)],
      anchor
    );
  }

  public place(
    axis: FancyDirection,
    value: number,
    anchor: Anchor = "min"
  ): void {
    const dir = elaborateDirection(axis);
    const intrinsic = this.intrinsicDims?.[dir];
    // Until the anchor's local point is determined, only the local min is
    // recordable (mirrors GoFishNode.place).
    if (!anchorDetermined(intrinsic, anchor)) {
      if (anchor === "min") this.intrinsicDims![dir].min = value;
      return;
    }
    this.transform!.translate![dir] = translateForAnchor(
      intrinsic,
      anchor,
      value
    );
  }

  /** Authoritative placement counterpart to `GoFishNode.pinAnchor`. A ref has no
   *  bbox ledger, so overriding means directly replacing its computed translate. */
  public pinAnchor(axis: FancyDirection, value: number, anchor: Anchor): void {
    const dir = elaborateDirection(axis);
    this.transform ??= { translate: [undefined, undefined] };
    this.transform.translate ??= [undefined, undefined];
    this.transform.translate[dir] = translateForAnchor(
      this.intrinsicDims?.[dir],
      anchor,
      value
    );
  }

  /** Refs are placement stand-ins; they draw nothing, so they lower to no
   *  display-list items. */
  public INTERNAL_lower(): DisplayListItem[] {
    return [];
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
 * descendant visible from inside it, in DFS parent-iteration (pre-order): it
 * descends into ordinary children, and *visits* a `_isComponent` child (it is
 * itself visible, since its name belongs to the enclosing scope) but does NOT
 * descend into its subtree — so names don't leak across component boundaries.
 * `ref` stand-ins are visited too (a named ref is a scope member).
 *
 * This is the single home for the bounded walk shared by string-name lookup
 * (`resolveScopedName`, used by `ref(string)` and by `.constrain()` operands)
 * and `collectLayerRegistrations` (chartBuilder.ts layer registry), so the
 * component boundary means the same thing for `ref`, `.constrain()` and
 * `selectAll`.
 */
export function* visibleNodes(root: GoFishAST): Generator<GoFishAST> {
  yield root;
  if (!(root instanceof GoFishNode)) return;
  for (const child of root.children ?? []) {
    if (child instanceof GoFishNode && child._isComponent) {
      // Visible (a leaf component, e.g. a createMark `rect`, can carry a name)
      // but a boundary: don't descend into it.
      yield child;
    } else {
      yield* visibleNodes(child);
    }
  }
}

/**
 * The outermost level a string-name lookup from `from` may reach: the nearest
 * `createMark` component at or above `from` (its inside is one scope), else
 * the topmost ancestor. Layers are NOT boundaries.
 */
function scopeRootOf(from: GoFishNode): GoFishNode {
  let scope: GoFishNode | undefined = from;
  while (scope && !scope._isComponent) scope = scope.parent;
  if (scope) return scope;
  let top = from;
  while (top.parent) top = top.parent;
  return top;
}

/**
 * The CLOSEST nodes named `name` inside `level`: a breadth-first search over
 * the nodes visible inside `level` (not `level` itself; nested `createMark`
 * components are visited but not entered) that returns every match at the
 * smallest depth below `level`, or `[]`. `searched` is a child subtree an
 * earlier, narrower level already searched without a match: its root is still
 * checked (a level never matches itself, so it was not), but its inside is
 * not walked again.
 */
function closestAtLevel(
  level: GoFishNode,
  name: string,
  searched: GoFishNode | undefined
): GoFishAST[] {
  let frontier: GoFishAST[] = level.children;
  while (frontier.length > 0) {
    const matches = frontier.filter((n) => childNameKey(n) === name);
    if (matches.length > 0) return matches;
    const next: GoFishAST[] = [];
    for (const n of frontier) {
      if (n === searched) continue;
      if (n instanceof GoFishNode && !n._isComponent) next.push(...n.children);
    }
    frontier = next;
  }
  return [];
}

/**
 * Resolve a string name from a use site: `from` is the ref's parent, or the
 * layer running `.constrain()`. This is the one lookup behind both.
 *
 * Search `from`'s subtree, then its parent's, one ancestor at a time, and stop
 * at the first level whose subtree contains the name. Within that level the
 * closest match wins: the one with the fewest steps down from the level's
 * node. So a layer's direct child `x` beats an `x` nested deeper, and a deeper
 * name is reachable when nothing closer has it. Two or more matches at that
 * same smallest distance is a loud error, and so is no match up to the
 * boundary. The search never crosses a `createMark` boundary (neither upward
 * past the enclosing component, nor downward into a nested one). An inner
 * match hides an outer one with the same name; that is intended, and it is
 * what lets a mark repeated per row (or a helper called many times) reuse its
 * local names. `what` names the consumer in the error message.
 */
export function resolveScopedName(
  from: GoFishNode,
  name: string,
  what: string
): GoFishAST {
  const boundary = scopeRootOf(from);
  let level = from;
  let searched: GoFishNode | undefined;
  for (;;) {
    const matches = closestAtLevel(level, name, searched);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new Error(
        `${what}: the name "${name}" is ambiguous — ${matches.length} nodes ` +
          `named "${name}" are equally close to the use site. Give them ` +
          `distinct names, or wrap each repeated part in its own createMark ` +
          `component.`
      );
    }
    if (level === boundary || !level.parent) break;
    searched = level;
    level = level.parent;
  }
  const where = boundary._isComponent
    ? "the enclosing createMark component"
    : "this diagram";
  throw new Error(
    `${what}: no node named "${name}" in ${where}. String names are ` +
      `visible up to the nearest createMark boundary; to reach across one, ` +
      `use createName("${name}") and a ref path.`
  );
}

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
