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
  contentOf,
  SlotOperand,
  type ConstraintRef,
  type KeyOf,
} from "./constraints/shared";
import { isZOrderConstraint } from "./constraints/zorder";
import { scheduleRelate, type RelateSchedule } from "./constraints/relate";
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
  /** The node this ref was made from, when it was made from one (a handle):
   *  a node, or a named ref, which it reads through (an alias). A `.relate()`
   *  operand's ref holds its handle and keeps the name as its `selection`,
   *  for messages and the wire. */
  private directNode?: GoFishAST;
  private selectedNode?: GoFishNode;
  private renderSession?: RenderSession;
  public color?: MaybeValue<string>;
  constructor({
    name,
    selection,
    node,
    multiplicity,
  }: {
    name?: string | Token;
    selection?: string | Token | (Token | string | number)[];
    node?: GoFishAST;
    multiplicity?: "one" | "all";
  }) {
    if (selection === undefined && !node) {
      throw new Error("Ref must have either selection or node");
    }
    this._name = name;
    this.selection = selection;
    this.directNode = node;
    this.multiplicity = multiplicity;
    // A node ref needs no lookup: it is resolved when it is made. A ref
    // made from an alias reads its target in the round.
    if (node instanceof GoFishNode) {
      this.selectedNode = node;
      this.color = node.color;
    }
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
    return this.selectedNode;
  }

  /** The node in the tree this ref stands for before any round: the node
   *  or alias it was made from, else its resolved target. */
  public get handle(): GoFishAST | undefined {
    return this.directNode ?? this.selectedNode;
  }

  /** A fresh ref to what this one points at: the same handle, or the same
   *  selection. */
  public fresh(): GoFishRef {
    return new GoFishRef({
      selection: this.selection,
      node: this.handle,
    });
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
  public resolveTarget(round: Round): void {
    if (this.multiplicity === "all") {
      throw new Error(
        'selectAll(...) cannot be used inline in a layout; pass it as chart data: Chart(selectAll("name"))'
      );
    }
    if (this.directNode) {
      this.selectedNode = aliasTarget(this.directNode, round, this);
    } else if (this.selection !== undefined) {
      this.selectedNode = this.resolveSelection(this.selection, round);
    }
    this.color = this.selectedNode?.color;
  }

  private resolveSelection(
    selection: string | Token | (Token | string | number)[],
    round: Round
  ): GoFishNode {
    // String: innermost-enclosing lookup, bounded by createMark.
    if (typeof selection === "string") {
      return this.resolveLocalString(selection, round);
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
        // A ring is its content: a position counts the content, not the
        // ring's shapes.
        const at = current.children[seg];
        const child = at === undefined ? undefined : contentOf(at);
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

  private resolveLocalString(name: string, round: Round): GoFishNode {
    // A string name is a variable of the layer that relates it: legal only
    // inside a `.relate()` clause, and looked up from the layer whose clause
    // holds it. (A `.relate()` operand's ref holds its node, a handle.)
    const layer = relatingLayerOf(this, round);
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
    const matches = round.lookup(layer, name);
    if (matches.length === 0) throw noSuchName(`ref("${name}")`, name, layer);
    const found = one(matches, `ref("${name}"): the name "${name}"`);
    if (!isInside(found, layer)) {
      throw new Error(
        `ref("${name}") in a .relate() clause names a node outside the ` +
          `relating layer. A clause relates nodes inside its own layer; ` +
          `attach the .relate() to a layer that contains "${name}".`
      );
    }
    if (found === this) {
      throw new Error(
        `ref("${name}") refers to itself: it is named "${name}" too, and ` +
          `it is the nearest node with that name. A ref named after its own ` +
          `target is no longer needed. Relate the named node directly ` +
          `(names are visible anywhere inside the layer), or give the ref a ` +
          `different name.`
      );
    }
    return aliasTarget(found, round, this);
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

/**
 * What one {@link resolveReferences} call memoizes, as the tree stands for
 * the round: every string lookup, by the level it starts at and the name,
 * so the refs that look up the same name share one search; and each layer's
 * clause children, so {@link relatingLayerOf} tests a node in one step.
 */
class Round {
  private readonly names = new Map<GoFishNode, Map<string, Lookup>>();
  private readonly clauses = new Map<GoFishNode, Set<GoFishAST>>();

  /** {@link lookupName}, once per (level, name) this round. */
  lookup(from: GoFishNode, name: string): Lookup {
    let byName = this.names.get(from);
    if (byName === undefined) this.names.set(from, (byName = new Map()));
    let found = byName.get(name);
    if (found === undefined) byName.set(name, (found = lookupName(from, name)));
    return found;
  }

  /** The children of `layer` in its clause slots (`_relateClauses`). */
  clauseChildren(layer: GoFishNode): Set<GoFishAST> {
    let set = this.clauses.get(layer);
    if (set === undefined) {
      set = new Set();
      for (const i of layer._relateClauses.keys()) set.add(layer.children[i]);
      this.clauses.set(layer, set);
    }
    return set;
  }
}

/** The layer whose `.relate()` clause contains `node`: the parent of the
 *  nearest ancestor that sits in one of its parent's clause slots, or
 *  `undefined` when `node` is not inside a relate clause. */
function relatingLayerOf(
  node: GoFishAST,
  round: Round
): GoFishNode | undefined {
  for (let cur: GoFishAST | undefined = node; cur; cur = cur.parent) {
    const parent: GoFishAST | undefined = cur.parent;
    // (`instanceof` first: a token `ref` proxy answers every property.)
    if (parent instanceof GoFishNode && round.clauseChildren(parent).has(cur))
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
 * `ref` stand-ins are visited too (a named ref is a scope member). A ring
 * is its content ({@link contentOf}): its shapes are not visible.
 *
 * This is the single home for the bounded walk shared by string-name lookup
 * (`lookupName`, used by `ref(string)` and by `.relate()` operands),
 * `collectLayerRegistrations` (chartBuilder.ts layer registry), and z-order
 * operand lookup (paintOrder.ts), so the component boundary means the same
 * thing for `ref`, `.relate()`, `selectAll` and `zAbove`/`zBelow`.
 */
export function* visibleNodes(root: GoFishAST): Generator<GoFishAST> {
  yield root;
  if (!(root instanceof GoFishNode)) return;
  for (const c of root.children ?? []) {
    const child = contentOf(c);
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
 * Every name inside `layer`, with the nodes it means from `layer`: the
 * matches at the closest depth below it, as {@link lookupName} finds them
 * at `layer`'s level, all names in one walk. A `.relate()` call binds its
 * operands to these (`relateEnv`). The layer's own drawing clauses are not
 * inside it in this sense: a `.relate()` call replaces them, so it binds
 * the names of the layer's other children.
 */
export function namesIn(layer: GoFishNode): Map<string, GoFishAST[]> {
  const found = new Map<string, { depth: number; nodes: GoFishAST[] }>();
  let frontier = layer.children
    .filter((_, i) => !layer._relateClauses.has(i))
    .map(contentOf);
  for (let depth = 0; frontier.length > 0; depth++) {
    const next: GoFishAST[] = [];
    for (const n of frontier) {
      const name = childNameKey(n);
      if (name !== undefined) {
        const at = found.get(name);
        if (at === undefined) found.set(name, { depth, nodes: [n] });
        else if (at.depth === depth) at.nodes.push(n);
      }
      if (n instanceof GoFishNode && !n._isComponent)
        for (const c of n.children) next.push(contentOf(c));
    }
    frontier = next;
  }
  return new Map([...found].map(([name, at]) => [name, at.nodes]));
}

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

/** The one node of `nodes`, which a singular reference (`what`) matched.
 *  This is the one message for a singular reference, by name or by token,
 *  that matched several nodes. */
export function one<T>(nodes: readonly T[], what: string): T {
  if (nodes.length !== 1)
    throw new Error(
      `${what} is ambiguous: it matched ${nodes.length} nodes, and a ` +
        `singular reference needs exactly one. Use selectAll for all of ` +
        `them, give them distinct names, or wrap each repeated part in its ` +
        `own createMark component.`
    );
  return nodes[0];
}

/** The error for a name that no node up to the boundary of `from` has. */
function noSuchName(what: string, name: string, from: GoFishNode): Error {
  const where = scopeRootOf(from)._isComponent
    ? "the enclosing createMark component"
    : "this diagram";
  return new Error(
    `${what}: no node named "${name}" in ${where}. String names are ` +
      `visible up to the nearest createMark boundary; to reach across one, ` +
      `use createName("${name}") and a ref path.`
  );
}

/**
 * The CLOSEST nodes named `name` inside `level`: a breadth-first search over
 * the nodes visible inside `level` (not `level` itself; nested `createMark`
 * components are visited but not entered) that returns every match at the
 * smallest depth below `level`, or `[]`. A ring is its content
 * ({@link contentOf}). `searched` is a child subtree an
 * earlier, narrower level already searched without a match: its root is
 * still checked (a level never matches itself, so it was not), but its
 * inside is not walked again.
 */
function closestAtLevel(
  level: GoFishNode,
  name: string,
  searched: GoFishNode | undefined
): GoFishAST[] {
  // The first frontier is `level`'s children. Each depth is built into the
  // other array.
  let frontier = level.children.map(contentOf);
  let next: GoFishAST[] = [];
  while (frontier.length > 0) {
    const matches = frontier.filter((n) => childNameKey(n) === name);
    if (matches.length > 0) return matches;
    next.length = 0;
    for (const n of frontier)
      if (n !== searched && n instanceof GoFishNode && !n._isComponent)
        for (const c of n.children) next.push(contentOf(c));
    [frontier, next] = [next, frontier];
  }
  return [];
}

/** What a name means from a use site ({@link lookupName}). */
type Lookup = GoFishAST[];

/**
 * Every node a name means from a use site: the matches at the nearest level
 * whose subtree has the name, at the closest depth there, or `[]` when no
 * level up to the boundary has it.
 *
 * Search `from`'s subtree, then its parent's, one ancestor at a time, and
 * stop at the first level whose subtree contains the name. Within that level
 * the closest matches win: those with the fewest steps down from the level's
 * node. So a layer's direct child `x` beats an `x` nested deeper, and a
 * deeper name is reachable when nothing closer has it. The search never
 * crosses a `createMark` boundary (neither upward past the enclosing
 * component, nor downward into a nested one). An inner match hides an outer
 * one with the same name; that is intended, and it is what lets a mark
 * repeated per row (or a helper called many times) reuse its local names.
 *
 * A name is plural: every match at that depth is meant. A singular
 * reference (`ref`, a placement operand) requires one ({@link one}); a
 * paint-order operand takes them all.
 */
function lookupName(from: GoFishNode, name: string): Lookup {
  const boundary = scopeRootOf(from);
  let level = from;
  let searched: GoFishNode | undefined;
  for (;;) {
    const matches = closestAtLevel(level, name, searched);
    if (matches.length > 0) return matches;
    if (level === boundary || !level.parent) return [];
    searched = level;
    level = level.parent;
  }
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

/** A layer constraint operand resolved to a node inside the layer: `child` is
 *  the index of the layer's direct child that is (`direct`) or contains
 *  `node`; `name` is how its first operand reads in a message. */
export type ResolvedOperand = {
  name: string;
  node: GoFishAST;
  child: number;
  direct: boolean;
};

/** What the last {@link resolveReferences} round resolved a node's
 *  references to (read with {@link resolution}). Its stamp is the
 *  constraints and the children it was resolved from. */
export type ResolvedConstraints = {
  /** The node's `_version` when the round resolved it: a later change to
   *  its children or constraints makes this resolution stale. */
  version: number;
  /** Every placement operand's node, by its key (the node's `uid`). */
  operands: Map<string, ResolvedOperand>;
  /** The key of each placement operand (see `KeyOf`). */
  keyOf: KeyOf;
  /** Every z-order operand: the nodes inside the node it names. */
  z: Map<ConstraintRef, GoFishAST[]>;
  /** The order of the layer's relate steps (`scheduleRelate`). */
  schedule: RelateSchedule;
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
    const tokens = root.tryGetRenderSession()?.tokenContext;
    tokens?.clear();
    registerTokens(root, tokens ?? new Map());
  }
  resolveIn(root, new Round());
}

function resolveIn(root: GoFishAST, round: Round): void {
  if (root instanceof GoFishRef) {
    root.resolveTarget(round);
    return;
  }
  for (const child of root.children) resolveIn(child, round);
  root._resolved =
    root.constraints.length > 0 || root._relateClauses.size > 0
      ? resolveConstraints(root)
      : undefined;
}

/** The resolution of a node with no constraints and no clauses. */
const NOTHING_RESOLVED: ResolvedConstraints = {
  version: -1,
  operands: new Map(),
  keyOf: (ref) => noKey(ref),
  z: new Map(),
  schedule: { clauses: new Set(), beforeSolve: [], afterSolve: [] },
};

/** The key of an operand no resolution holds. */
const noKey: KeyOf = (ref) => {
  throw new Error(
    `[gofish] constraint operand "${ref.name}" is not resolved for this ` +
      `layer (it is not one of the operands resolveReferences resolved)`
  );
};

/** `node`'s references as the last {@link resolveReferences} round resolved
 *  them. Throws when the node's constraints or children changed since: a
 *  pass that rewrites the tree must run the round again. */
export function resolution(node: GoFishNode): ResolvedConstraints {
  const r = node._resolved;
  if (r === undefined) {
    if (node.constraints.length === 0 && node._relateClauses.size === 0)
      return NOTHING_RESOLVED;
  } else if (r.version === node._version) return r;
  throw new Error(
    `[gofish] the references of a ${node.type} are not resolved for its ` +
      `current constraints and children (resolveReferences must run after ` +
      `a pass changes them)`
  );
}

/** Register the token name of every node under `node`, pre-order, in
 *  `tokens` and in its nearest scope root. A token is plural: each node that
 *  carries it joins its list. */
function registerTokens(
  node: GoFishNode,
  tokens: Map<Token, GoFishNode[]>
): void {
  if (node._isScope) node._scopeMap = new Map();
  if (node._name !== undefined && isToken(node._name)) {
    const token = node._name;
    const list = tokens.get(token);
    if (list === undefined) tokens.set(token, [node]);
    else list.push(node);
    for (let a = node.parent; a; a = a.parent) {
      if (a._isScope) {
        const map = (a._scopeMap ??= new Map());
        const tagged = map.get(token.__tag);
        if (tagged === undefined) map.set(token.__tag, [node]);
        else tagged.push(node);
        break;
      }
    }
  }
  for (const child of node.children)
    if (child instanceof GoFishNode) registerTokens(child, tokens);
}

/**
 * Resolve every operand of `layer`'s constraints, and schedule its relate
 * clauses. A placement operand means one node inside the layer
 * ({@link operandNodes}: a missing, ambiguous or outside name throws), and
 * its key is that node's uid. An operand an enclosing layer's `.relate()`
 * bound means a node of that layer outside this one, which this layer
 * cannot place. A z-order operand relates a SET of nodes at paint time:
 * every node it means inside the layer.
 */
function resolveConstraints(layer: GoFishNode): ResolvedConstraints {
  const operands = new Map<string, ResolvedOperand>();
  const keys = new Map<ConstraintRef, string>();
  const z = new Map<ConstraintRef, GoFishAST[]>();
  const place = (ref: ConstraintRef, what: string) => {
    if (keys.has(ref)) return;
    const nodes = operandNodes(layer, ref);
    if (nodes.length === 0)
      throw noSuchName(`${what} operand`, ref.name, layer);
    const node = one(nodes, `${what} operand: the name "${ref.name}"`);
    const child =
      ref instanceof SlotOperand
        ? ref.slot
        : (() => {
            const c = directChildOf(layer, node);
            return c === undefined ? -1 : (layer.indexOfChild(c) ?? -1);
          })();
    if (child < 0)
      throw new Error(
        `${what}: operand "${ref.name}" is not inside the layer this ` +
          `.relate() is attached to. A layer can only place nodes it ` +
          `contains; attach the constraint to a layer that contains every ` +
          `operand.`
      );
    keys.set(ref, node.uid);
    if (!operands.has(node.uid))
      operands.set(node.uid, {
        name: ref.name,
        node,
        child,
        direct: layer.children[child] === node,
      });
  };
  for (const c of layer.constraints) {
    const what = `Constraint.${c.type}`;
    if (isZOrderConstraint(c)) {
      for (const ref of c.children)
        z.set(
          ref,
          operandNodes(layer, ref)
            // A ref draws nothing: paint order orders what it stands for.
            .map((n) => (n instanceof GoFishRef ? (n.targetNode ?? n) : n))
            .filter((n) => n !== layer && isInside(n, layer))
        );
      continue;
    }
    for (const ref of c.children) place(ref, what);
    // A stack's origin names one of its parts.
    if (c.type === "distribute" && c.origin !== undefined)
      place(c.origin.part, what);
  }
  const keyOf: KeyOf = (ref) => keys.get(ref) ?? noKey(ref);
  // With every ref resolved, check the relate clauses' dependency order
  // now: a cycle would otherwise recurse forever in the space pass (a ref
  // proxies its target's space, and a cyclic target contains the ref).
  return {
    version: layer._version,
    operands,
    keyOf,
    z,
    schedule: scheduleRelate(layer, operands),
  };
}

/**
 * The nodes one operand of `layer` means (`ConstraintRef.means`), each in its
 * place inside `layer`. Every operand is a handle: a slot operand means the
 * child in its slot, a node operand its node, and a `.relate()` operand the
 * nodes its name meant when the call bound it. A placement takes
 * {@link one} of them; a paint-order operand takes those inside `layer`.
 *
 * The layer places, and orders, what stands in a node's place
 * ({@link inPlace}), so a node an elaboration pass wrapped moves with its
 * wrapper.
 */
function operandNodes(layer: GoFishNode, ref: ConstraintRef): GoFishAST[] {
  return ref.means(layer).map((n) => inPlace(n, layer));
}

/** What a ref made from `handle` points at: the node, or, for a named ref
 *  (an alias), its target, resolved in this round. */
function aliasTarget(
  handle: GoFishAST,
  round: Round,
  from: GoFishRef
): GoFishNode {
  if (!(handle instanceof GoFishRef)) return handle;
  if (handle !== from) handle.resolveTarget(round);
  const target = handle.targetNode;
  if (!target) {
    // A handle ref has no selection: describe it by the node it holds,
    // which is `handle`.
    const name = childNameKey(handle);
    const what =
      from.selection !== undefined
        ? `ref("${String(from.selection)}")`
        : name !== undefined
          ? `a ref to "${name}"`
          : "a ref";
    throw new Error(`${what} names a ref that points at nothing.`);
  }
  return target;
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
