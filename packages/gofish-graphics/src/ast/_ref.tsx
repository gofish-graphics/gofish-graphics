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
import type { Extent } from "./extent";
import type { Placeable, RenderSession } from "./_node";
import type { Geometry } from "./geometry";
import type { DisplayList } from "gofish-ir";
type DisplayListItem = DisplayList.DisplayItem;
import { isToken, Token } from "./createName";
import {
  childNameKey,
  NodeOperand,
  SlotOperand,
  type ConstraintRef,
} from "./constraints/shared";
import { isZOrderConstraint } from "./constraints/zorder";
import { computeRelateSchedule } from "./constraints/relate";
import type { ConstraintSpec } from "./constraints";
import {
  CANVAS_FRAME,
  orientView,
  yDirection,
  type YFrame,
} from "./axisDirection";

let refUidCounter = 0;

export class GoFishRef {
  public type: string = "ref";
  /** The stand-in's identity, as `GoFishNode.uid` is a node's: the key a
   *  constraint operand that resolves to this stand-in carries. */
  public readonly uid: string = `ref-${refUidCounter++}`;
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
  /** The common ancestor of this ref and its target, set by `layout`: the
   *  ref stands where its target is, read through it (see `transform`). */
  private lca?: GoFishAST;
  /** Per axis, a translate an authoritative pin (`pinAnchor`) set, which
   *  replaces the one read off the target. */
  private pinned: [number | undefined, number | undefined] = [
    undefined,
    undefined,
  ];
  /** @internal Layout-pass state. Public to match GoFishNode.transform so
   *  `(node as GoFishAST).transform` resolves on the union; external callers
   *  should not rely on this field.
   *
   *  A laid-out ref's translate is read off its target each time, not
   *  copied once at layout: the walk from the target up to their common
   *  ancestor, less the walk from the ref's parent up to it. A node on
   *  those walks may be placed after the ref is laid out (a layer places a
   *  constrained child in its solve, after laying out its other children),
   *  and the ref follows it. */
  public get transform(): Transform | undefined {
    if (this.lca === undefined || !this.selectedNode) return undefined;
    return { translate: [this.translateOn(0), this.translateOn(1)] };
  }
  /** The ref's translate on one axis (see {@link transform}). */
  private translateOn(dir: Direction): number | undefined {
    if (this.lca === undefined || !this.selectedNode) return undefined;
    const walk = (from: GoFishAST | undefined): number => {
      let sum = 0;
      for (let n = from; n && n !== this.lca; n = n.parent)
        sum += n.projectedTranslate(dir) ?? 0;
      return sum;
    };
    return this.pinned[dir] ?? walk(this.selectedNode) - walk(this.parent);
  }
  public readonly selection?: string | Token | (Token | string | number)[];
  /** For a string selection that came from a `.relate()` operand: the layer
   *  whose `.relate()` bound it. The name is looked up from there, not from
   *  wherever the ref ends up, so a nested layer's same-named node cannot
   *  capture it. Assigned unconditionally, like `multiplicity`. */
  public readonly scope?: GoFishNode;
  private directNode?: GoFishNode;
  private selectedNode?: GoFishNode;
  private renderSession?: RenderSession;
  public color?: MaybeValue<string>;
  constructor({
    name,
    selection,
    node,
    multiplicity,
    scope,
  }: {
    name?: string | Token;
    selection?: string | Token | (Token | string | number)[];
    node?: GoFishNode;
    multiplicity?: "one" | "all";
    scope?: GoFishNode;
  }) {
    if (selection === undefined && !node) {
      throw new Error("Ref must have either selection or node");
    }
    this._name = name;
    this.selection = selection;
    this.directNode = node;
    this.multiplicity = multiplicity;
    this.scope = scope;
  }

  /** The raw datum carried by the node this ref points at — the *bag of rows*
   * that flowed into the node (the operator pipeline binds this as an array;
   * a fully-split leaf is a 1-row bag). Reads `directNode` first because
   * `split` runs before layout/resolveReferences (when only `directNode` is set);
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

  /** A ref holds its target's box, so it has its target's y frame (see
   *  `axisDirection.ts`). */
  public get yFrame(): YFrame {
    return this.targetNode?.yFrame ?? CANVAS_FRAME;
  }

  /** Chainable: name this ref so a relate clause can reference it (mirrors
   * GoFishNode.name()). Returns `this` so `ref(token).name("x")` works. */
  public name(name: string | Token): this {
    this._name = name;
    return this;
  }

  /** Resolve this ref's target (one step of {@link resolveReferences}). */
  public resolveTarget(): void {
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
        current = one(next, `ref path tag "${seg}" under "${pathSoFar}"`);
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
    const nodes = tokenContext.get(token);
    if (!nodes) {
      throw new Error(
        `Can't find token "${token.__tag}". Available token tags: ${Array.from(
          tokenContext.keys()
        )
          .map((t) => t.__tag)
          .join(", ")}`
      );
    }
    return one(nodes, `ref(createName("${token.__tag}"))`);
  }

  private resolveLocalString(name: string): GoFishNode {
    // A string name is a variable of the layer that relates it: legal only
    // inside a `.relate()` clause. An operand's ref is resolved from the
    // layer whose `.relate()` bound it (its scope), which may enclose the
    // clause it sits in; a ref the author wrote by name, from the layer whose
    // clause holds it.
    if (this.scope && !isInside(this, this.scope)) {
      throw new Error(
        `ref("${name}"): a .relate() operand is used outside the layer whose ` +
          `.relate() bound it. Use it inside that layer's clauses.`
      );
    }
    const layer = this.scope ?? relatingLayerOf(this);
    if (!layer) {
      throw new Error(
        `ref("${name}") is a string ref outside a .relate() clause. A string ` +
          `name is local to the layer that relates it: move this ref into ` +
          `the enclosing layer's .relate() callback, e.g. ` +
          `layer([...]).relate(({ ${name} }) => [arrow({}, [${name}, ...])]). ` +
          `To reach a node in another component, name it with createName() ` +
          `and ref the token.`
      );
    }
    const found = resolveScopedName(
      layer,
      name,
      `ref("${name}")`,
      this.scope !== undefined
    );
    if (!isInside(found, layer)) {
      throw new Error(
        `ref("${name}") in a .relate() clause names a node outside the ` +
          `relating layer. A clause relates nodes inside its own layer; ` +
          `attach the .relate() to a layer that contains "${name}".`
      );
    }
    // A named ref stand-in is an alias for the node it points at.
    if (found instanceof GoFishRef) {
      if (found === this) {
        throw new Error(
          `ref("${name}") refers to itself: it is named "${name}" too, and ` +
            `it is the nearest node with that name. A ref named after its own ` +
            `target is no longer needed. Relate the named node directly ` +
            `(names are visible anywhere inside the layer), or give the ref a ` +
            `different name.`
        );
      }
      found.resolveTarget();
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

  /** A ref claims what its target claims. An unresolved ref is ordinal on
   *  both axes, so it claims nothing. */
  public resolveExtent(): Size<Extent | undefined> {
    return this.selectedNode?.resolveExtent() ?? [undefined, undefined];
  }

  public layout(_size: Size, _scales?: Size<AxisScale | undefined>): Placeable {
    if (!this.selectedNode) {
      throw new Error("Selected node not found");
    }

    // The common ancestor its translate is read through (see `transform`).
    // The ref's own translate is never part of the walks, so laying the
    // ref out again reads the same place (#928).
    this.lca = findLeastCommonAncestor(this, this.selectedNode);
    this.pinned = [undefined, undefined];

    this.intrinsicDims = this.selectedNode.intrinsicDims;

    // The copy above is in pixels; the parent reads it in its own axis order.
    return orientView(this as Placeable, yDirection(this.parent));
  }

  public get dims(): Dimensions {
    // Shared with GoFishNode.dims (see {@link combineDims}): combine the local
    // box (`intrinsicDims`) with its placement (`translate`), deriving center/max
    // from the placed (min, size).
    return combineDims(this.intrinsicDims, this.transform);
  }

  /** The target's geometry. A ref shares its target's local frame (it copies
   *  the target's `intrinsicDims` in `layout`), and its own `translate` maps
   *  that frame into the ref's parent, so the target's answer is the ref's. */
  public geometry(): Geometry {
    if (!this.selectedNode)
      throw new Error("[gofish] geometry() called on an unresolved ref");
    return this.selectedNode.geometry();
  }

  /** The ref's origin as a `Placeable.projectedTranslate`. A ref has no
   *  ledger, so the projection IS its computed `transform.translate` — exposing
   *  it lets every translate reader (the coord bake, `_ref` accumulation,
   *  baseline align) call `projectedTranslate` polymorphically across the
   *  `GoFishNode | GoFishRef` union instead of branching on `instanceof`. */
  public projectedTranslate(dir: Direction): number | undefined {
    return this.translateOn(dir);
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
    // A laid-out ref is where its target is (`transform`), and `place()` is
    // write-once, as on a node. Only an authoritative pin (`pinAnchor`)
    // moves it.
    if (this.transform !== undefined) return;
    this.pinned[dir] = translateForAnchor(intrinsic, anchor, value);
  }

  /** Authoritative placement counterpart to `GoFishNode.pinAnchor`. A ref has no
   *  bbox ledger, so overriding means directly replacing its computed translate. */
  public pinAnchor(axis: FancyDirection, value: number, anchor: Anchor): void {
    const dir = elaborateDirection(axis);
    this.pinned[dir] = translateForAnchor(
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

/** The layer whose `.relate()` clause contains `node`: the parent of the
 *  nearest ancestor that sits in one of its parent's clause slots, or
 *  `undefined` when `node` is not inside a relate clause. */
export function relatingLayerOf(node: GoFishAST): GoFishNode | undefined {
  for (let cur: GoFishAST | undefined = node; cur; cur = cur.parent) {
    const parent = cur.parent;
    // (`instanceof` first: a token `ref` proxy answers every property.)
    if (
      parent instanceof GoFishNode &&
      parent._relateClauses.has(parent.children.indexOf(cur))
    )
      return parent;
  }
  return undefined;
}

export function isInside(node: GoFishAST, root: GoFishNode): boolean {
  for (let cur: GoFishAST | undefined = node; cur; cur = cur.parent) {
    if (cur === root) return true;
  }
  return false;
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
 * (`resolveScopedName`, used by `ref(string)` and by `.relate()` operands),
 * `collectLayerRegistrations` (chartBuilder.ts layer registry), and z-order
 * operand lookup (paintOrder.ts), so the component boundary means the same
 * thing for `ref`, `.relate()`, `selectAll` and `zAbove`/`zBelow`.
 *
 * `bound` is for a `.relate()` operand whose scope is `root`: the walk skips
 * `root`'s clause slots, as `resolveScopedName` does.
 */
export function* visibleNodes(
  root: GoFishAST,
  bound = false
): Generator<GoFishAST> {
  yield root;
  if (!(root instanceof GoFishNode)) return;
  for (const [i, child] of (root.children ?? []).entries()) {
    if (bound && root._relateClauses.has(i)) continue;
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

/** `nodes`, with each wrapper an elaboration pass inserted
 *  (`_transparent`) replaced by its children: a wrapper adds no depth. */
const unwrapped = (nodes: readonly GoFishAST[]): GoFishAST[] =>
  nodes.flatMap((n) =>
    n instanceof GoFishNode && n._transparent ? unwrapped(n.children) : [n]
  );

/** The node that stands in `node`'s place inside `layer`: `node`, or the
 *  outermost elaboration wrapper below `layer` whose content (slot 0) it is.
 *  A layer places, and orders, what stands in the place of a node a name
 *  means, so a node an elaboration pass wrapped moves with its wrapper. */
function inPlace(node: GoFishAST, layer: GoFishNode): GoFishAST {
  let cur = node;
  for (let p = cur.parent; p && p !== layer; p = cur.parent) {
    if (!p._transparent || p.children[0] !== cur) break;
    cur = p;
  }
  return cur;
}

/** The one node of `nodes`, which a singular reference (`what`) matched. */
function one<T>(nodes: readonly T[], what: string): T {
  if (nodes.length !== 1)
    throw new Error(
      `${what} matched ${nodes.length} nodes; a singular reference needs ` +
        `exactly one. Use selectAll for all of them, or give them distinct ` +
        `names.`
    );
  return nodes[0];
}

/**
 * The CLOSEST nodes named `name` inside `level`: a breadth-first search over
 * the nodes visible inside `level` (not `level` itself; nested `createMark`
 * components are visited but not entered) that returns every match at the
 * smallest depth below `level`, or `[]`. An elaboration wrapper adds no
 * depth: its children are where it is. `searched` is a child subtree an
 * earlier, narrower level already searched without a match: its root is
 * still checked (a level never matches itself, so it was not), but its
 * inside is not walked again.
 */
function closestAtLevel(
  level: GoFishNode,
  name: string,
  searched: GoFishNode | undefined,
  bound = false
): GoFishAST[] {
  // The first frontier is `level`'s children; a bound lookup skips its
  // clause slots there.
  let frontier = unwrapped(
    level.children.filter((_, i) => !(bound && level._relateClauses.has(i)))
  );
  while (frontier.length > 0) {
    const matches = frontier.filter((n) => childNameKey(n) === name);
    if (matches.length > 0) return matches;
    frontier = unwrapped(
      frontier.flatMap((n) =>
        n !== searched && n instanceof GoFishNode && !n._isComponent
          ? n.children
          : []
      )
    );
  }
  return [];
}

/**
 * Every node a name means from a use site: the matches at the nearest level
 * whose subtree has the name, at the closest depth there (see
 * {@link resolveScopedName}), or `[]` when no level up to the boundary has
 * it. A name is plural: every match at that depth is meant. A singular
 * reference requires one ({@link resolveScopedName}); a paint-order operand
 * takes them all.
 */
export function lookupName(
  from: GoFishNode,
  name: string,
  bound = false
): { matches: GoFishAST[]; boundary: GoFishNode } {
  const boundary = scopeRootOf(from);
  let level = from;
  let searched: GoFishNode | undefined;
  for (;;) {
    const matches = closestAtLevel(
      level,
      name,
      searched,
      bound && level === from
    );
    if (matches.length > 0) return { matches, boundary };
    if (level === boundary || !level.parent) return { matches: [], boundary };
    searched = level;
    level = level.parent;
  }
}

/**
 * Resolve a string name from a use site: the layer running `.relate()`, for
 * a constraint operand and for a string ref inside one of its clauses alike.
 * This is the one lookup behind both.
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
 *
 * `bound` is for a `.relate()` operand, with `from` the layer whose
 * `.relate()` bound it. The operand names a node the layer held when the
 * callback ran, so the search at `from` skips the layer's clause slots: a
 * name a clause introduces (a nested callout's own `density`) never captures
 * the operand, however close it is.
 */
export function resolveScopedName(
  from: GoFishNode,
  name: string,
  what: string,
  bound = false
): GoFishAST {
  const { matches, boundary } = lookupName(from, name, bound);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `${what}: the name "${name}" is ambiguous — ${matches.length} nodes ` +
        `named "${name}" are equally close to the use site. Give them ` +
        `distinct names, or wrap each repeated part in its own createMark ` +
        `component.`
    );
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

/** `layer`'s direct child that is or contains `node`, or `undefined` when
 *  `node` is not inside `layer`. */
export function directChildOf(
  layer: GoFishNode,
  node: GoFishAST
): GoFishAST | undefined {
  let cur: GoFishAST | undefined = node;
  while (cur && cur.parent !== layer) cur = cur.parent;
  return cur;
}

/** The index of `layer`'s direct child that is or contains `node`, or -1 when
 *  `node` is not inside `layer`. */
export function directChildIndex(layer: GoFishNode, node: GoFishAST): number {
  const child = directChildOf(layer, node);
  return child ? layer.children.indexOf(child) : -1;
}

/** A layer constraint operand resolved to a node inside the layer: `child` is
 *  the index of the layer's direct child that is (`direct`) or contains
 *  `node`; `name` is how its first operand reads in a message. */
export type ResolvedOperand = {
  name: string;
  node: GoFishAST;
  child: number;
  direct: boolean;
};

/** What {@link resolveReferences} resolved a node's constraints to, for the
 *  constraints it was resolved from. */
export type ResolvedConstraints = {
  constraints: ConstraintSpec[];
  /** Every placement operand, by its key (`ConstraintRef.key`). */
  operands: Map<string, ResolvedOperand>;
  /** Every z-order operand: the nodes inside the node it names. */
  z: Map<ConstraintRef, GoFishAST[]>;
};

/**
 * Resolve every reference in the tree under `root`: each `ref` stand-in's
 * target, and each constraint operand (a `.relate()` operand, a macro's
 * slot or node handle, a z-order operand), then check each layer's relate
 * clauses for a cycle, which needs both. This is one round of a fixed
 * point: a pass that rewrites the tree (chrome, labels) runs it again, and
 * every pass that reads a resolution reads the last round's.
 *
 * Every token is registered before any ref is resolved, so a token ref may
 * come before its target (#677), and a token on a repeated mark names every
 * node that carries it.
 */
export function resolveReferences(root: GoFishAST): void {
  if (root instanceof GoFishNode) {
    root.tryGetRenderSession()?.tokenContext.clear();
    registerTokens(root);
  }
  resolveIn(root);
}

function resolveIn(root: GoFishAST): void {
  if (root instanceof GoFishRef) {
    root.resolveTarget();
    return;
  }
  for (const child of root.children) resolveIn(child);
  root._resolved =
    root.constraints.length > 0 ? resolveConstraints(root) : undefined;
  // With every ref resolved, check the relate clauses' dependency order
  // now: a cycle would otherwise recurse forever in the space pass (a ref
  // proxies its target's space, and a cyclic target contains the ref).
  if (root._relateClauses.size > 0)
    computeRelateSchedule(root, root._resolved?.operands ?? new Map());
}

/** `node`'s constraints as the last {@link resolveReferences} resolved
 *  them. Throws when the constraints changed since. */
export function resolvedConstraints(node: GoFishNode): ResolvedConstraints {
  const r = node._resolved;
  if (node.constraints.length === 0)
    return { constraints: node.constraints, operands: new Map(), z: new Map() };
  if (r === undefined || r.constraints !== node.constraints)
    throw new Error(
      `[gofish] the constraints of a ${node.type} were not resolved ` +
        `(resolveReferences must run after they are installed)`
    );
  return r;
}

/** Register the token name of every node under `node`, pre-order,
 *  globally and in its nearest scope root. A token is plural: each node
 *  that carries it joins its list. */
function registerTokens(node: GoFishNode): void {
  if (node._isScope) node._scopeMap = new Map();
  if (node._name !== undefined && isToken(node._name)) {
    const token = node._name;
    const context = node.getRenderSession().tokenContext;
    context.set(token, [...(context.get(token) ?? []), node]);
    for (let a = node.parent; a; a = a.parent) {
      if (a._isScope) {
        const map = (a._scopeMap ??= new Map());
        map.set(token.__tag, [...(map.get(token.__tag) ?? []), node]);
        break;
      }
    }
  }
  for (const child of node.children)
    if (child instanceof GoFishNode) registerTokens(child);
}

/**
 * Resolve every operand of `layer`'s constraints and write each placement
 * operand's key. A placement operand resolves to one node inside the layer:
 * a name operand with the string-name lookup (`resolveScopedName`: missing
 * or ambiguous names throw), from `layer` with its clause slots skipped when
 * `layer`'s own `.relate()` bound it, from `layer` when it has no scope (a
 * constraint a pass builds by name); a slot operand to the child that fills
 * its slot; a node operand to its node. An operand an enclosing layer's
 * `.relate()` bound names a node of that layer outside this one (the lookup
 * from there skips that layer's clause slots, and this layer sits in one),
 * so this layer cannot place it. Every operand must lie inside the layer (a
 * layer can only place what it contains).
 *
 * A z-order operand relates a SET of nodes at paint time: every node the
 * name means (see {@link zOperandNodes}).
 *
 * A name means the node that carries it; the layer places, and orders,
 * what stands in that node's place ({@link inPlace}), so a node an
 * elaboration pass wrapped moves with its wrapper. A handle names its node
 * exactly.
 */
function resolveConstraints(layer: GoFishNode): ResolvedConstraints {
  const operands = new Map<string, ResolvedOperand>();
  const z = new Map<ConstraintRef, GoFishAST[]>();
  // A name resolves once per scope it is looked up from.
  const byName = new Map<string, GoFishAST>();
  for (const c of layer.constraints) {
    if (isZOrderConstraint(c)) {
      for (const ref of c.children) z.set(ref, zOperandNodes(layer, ref));
      continue;
    }
    for (const ref of c.children) {
      const node = resolveOperand(layer, ref, `Constraint.${c.type}`, byName);
      if (operands.has(node.uid)) continue;
      const child = directChildIndex(layer, node);
      if (child < 0) {
        throw new Error(
          `Constraint.${c.type}: operand "${ref.name}" is not inside the ` +
            `layer this .relate() is attached to. A layer can only place ` +
            `nodes it contains; attach the constraint to a layer that ` +
            `contains every operand.`
        );
      }
      operands.set(node.uid, {
        name: ref.name,
        node,
        child,
        direct: layer.children[child] === node,
      });
    }
  }
  return { constraints: layer.constraints, operands, z };
}

/** The node one placement operand of `layer` names (see
 *  {@link resolveConstraints}). */
function resolveOperand(
  layer: GoFishNode,
  ref: ConstraintRef,
  what: string,
  byName: Map<string, GoFishAST>
): GoFishAST {
  if (ref instanceof SlotOperand) {
    const child = ref.layer === layer ? layer.children[ref.slot] : undefined;
    if (child === undefined)
      throw new Error(
        `${what}: a slot operand of another layer, or of an empty slot ` +
          `(slot ${ref.slot})`
      );
    return child;
  }
  if (ref instanceof NodeOperand) return ref.node;
  if (ref.scope !== undefined && ref.scope !== layer) {
    throw new Error(
      `${what}: operand "${ref.name}" was bound by an ` +
        `enclosing layer's .relate(), and that layer's operand cannot be ` +
        `placed by this layer. Place it with a constraint of the ` +
        `enclosing layer's .relate().`
    );
  }
  const scopeKey = `${ref.scope !== undefined}:${ref.name}`;
  let node = byName.get(scopeKey);
  if (node === undefined) {
    node = resolveScopedName(
      layer,
      ref.name,
      `${what} operand`,
      ref.scope !== undefined
    );
    node = inPlace(node, layer);
    byName.set(scopeKey, node);
  }
  ref.key = node.uid;
  return node;
}

/**
 * The nodes a z-order operand of `layer` names, each in its place. A handle
 * names its node (a slot operand, the child in its slot). A name is looked up
 * as every name is ({@link lookupName}), and means every match: from the
 * layer whose `.relate()` bound it, without that layer's clause slots, or
 * from `layer` when it has no scope. Only nodes inside `layer` can be
 * ordered by it.
 */
function zOperandNodes(layer: GoFishNode, ref: ConstraintRef): GoFishAST[] {
  let nodes: GoFishAST[];
  if (ref instanceof SlotOperand) {
    const child = ref.layer === layer ? layer.children[ref.slot] : undefined;
    nodes = child === undefined ? [] : [child];
  } else if (ref instanceof NodeOperand) nodes = [ref.node];
  else
    nodes = lookupName(
      ref.scope ?? layer,
      ref.name,
      ref.scope !== undefined
    ).matches.map((n) => inPlace(n, layer));
  return nodes.filter((n) => n !== layer && isInside(n, layer));
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
