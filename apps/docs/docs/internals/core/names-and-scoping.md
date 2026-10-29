---
title: Name Resolution & Scoping
section: Core
order: 40
status: stable
covers:
  - packages/gofish-graphics/src/ast/_ref.tsx
  - packages/gofish-graphics/src/ast/constraints/nestedOperand.ts
  - packages/gofish-graphics/src/ast/constraints/relate.ts
---

# Name Resolution & Scoping

A mark gets a name with `.name(...)`. Something else then finds it by that
name: an operand in a `.relate()` callback, or a `ref("x")` inside one of the
clauses that callback returns. This page explains where a string name may be
used, how it is found, where the search stops, how a constraint uses a node
that sits deep inside another child, and in what order a layer evaluates the
clauses of its `.relate()`.

There are two kinds of name. A **string** (`.name("box")`) is a label. A
**token** (`.name(createName("box"))`) is an identity: a unique value that can
be passed around and used as the first step of a path. Tokens are looked up in
a global table and are not affected by anything on this page. Everything below
is about strings. A token's tag also answers to its string, so
`.name(createName("box"))` can be found as `"box"` too.

## Where a string name may be used

A string name is a variable of the layer that relates it. It may be used in
one place: a `.relate()` callback on a layer, either as one of the operands
the callback receives, or as a `ref("x")` inside one of the clauses the
callback returns. `GoFishRef.resolveLocalString` finds the relating layer
with `relatingLayerOf`, which walks up to the nearest ancestor that sits in
one of its parent's clause slots (`_relateClauses`, see below) and returns
that parent. A string `ref` with no such ancestor, a plain child or an operator
child written outside `.relate()`, is an error, and the message says to move
the ref into the enclosing layer's `.relate()`.

Tokens are exempt. A token is an identity, not a lexical variable, and it
exists to reach across component boundaries, so `ref(token)` (and a token
path) stays legal anywhere. Where a token ref sits outside `.relate()`, it
reads its target's position when it is laid out, so it must come after the
target in sibling order (#677). Inside a `.relate()` clause a token ref is
scheduled like any other (see below).

## One lookup for `ref` and `.relate()`

`ref("x")` and a `.relate()` operand named `x` use the same function,
`lookupName` in `_ref.tsx` (`resolveScopedName` is its singular form). A `ref("x")` the author writes starts at
the relating layer. An operand starts at the layer whose `.relate()` bound it,
its **scope**. An operand becomes a string ref when it is used as a child of
a drawing clause (`resolveMarkResult` calls `RelateOperand.toRef()`, a ref
that carries the scope), so the two are the same lookup, started from the
layer each one belongs to.

### An operand is a name plus its scope

`.relate()` is a binding form. A `RelateOperand` holds the name and the
layer it was bound in, the sets-of-scopes idea at the size GoFish needs: one
scope per `.relate()` call. The difference shows when a clause of one layer
holds another layer that relates its own names:

```js
layer([curve.name("density")]).relate(({ density }) => [
  layer([swatch.name("density"), note.name("note")]).relate(({ note }) => [
    arrow({}, [note, density]),
  ]),
]);
```

The arrow sits in the inner layer, and the inner layer has a `density` of
its own. The `density` operand still resolves from the outer layer, so it
names the curve. A ref built from an operand that is used outside the layer
of its scope is an error.

Starting at the outer layer is not enough on its own, because the inner
layer is now one of the outer layer's clauses, and its swatch can be closer
to the outer layer than the curve inside the chart. An operand names a node
the layer held when the callback ran, and a name a clause introduces does
not carry the binding's scope. So the lookup of a bound operand
(`resolveScopedName(scope, name, what, true)`) skips the scope layer's
clause slots at that first level. A `ref("x")` the author writes, and a
constraint a pass builds without a scope, search the whole layer as before.

A drawing clause may read an operand of an enclosing scope, because it reads
positions and places nothing. A constraint places its operands, so each one
must resolve inside the layer that holds the constraint. An operand an
enclosing `.relate()` bound never does: the lookup from that layer skips its
clause slots, and the inner layer sits in one. So `resolveReferences`
throws on such an operand right away, and looks every other operand up from
the layer itself.

From the start, the search looks at every node inside the current level's
subtree. If it finds the name, it stops there. If not, it moves up to the
parent and looks at that subtree, and so on. So the nearest level that
contains the name wins.

Inside the level where the search stops, the closest match wins. Distance is
the number of steps down from that level's node, so a direct child is at
distance 1. A layer's direct child `x` therefore beats an `x` nested deeper
inside another child, and a deeply nested name is still reachable when nothing
closer has it. A wrapper an elaboration pass inserted adds no distance (see
[Constraint operands](#constraint-operands)). `closestAtLevel` does this with
a breadth-first search that stops at the first depth with a match. When the
search moves up a level, it does not walk the subtree it just searched again.

A name is plural: the lookup returns every match at that depth. A singular
use, a `ref` or a placement operand, needs exactly one. A paint-order operand
(`zAbove`, `zBelow`) takes them all, and only those inside the layer that
orders them count.

The search has one hard boundary, the `createMark` component. It never goes
above the nearest component that contains the start, and it never looks inside
a nested component (the component's own name is visible, its insides are not).
Without an enclosing component, the whole diagram is the outermost level.
The chart layer registry (`collectLayerRegistrations` in `chartBuilder.ts`)
and the `.relate()` environment walk the same boundary (`visibleNodes`), so
the component boundary means the same thing for `ref`, `.relate()`,
`selectAll`, and `zAbove` / `zBelow`.

Three results are errors, and each names the problem:

- **Ambiguous.** A singular use, and two or more nodes with the name at the
  same smallest distance in the level where the search stops.
- **Missing.** No node with the name anywhere up to the boundary.
- **Outside the layer.** The name is found only above the relating layer. A
  layer relates what it contains, so a clause's refs and a constraint's
  operands must resolve inside it.

## Why the nearest match, and why hiding is intended

A nearer name hides a farther one with the same spelling. This is deliberate,
and it is what makes repetition work. A layer written once but built many
times, once per row of a chart or once per call of a helper function, can use
the same local names in every copy:

```js
chart(rows)
  .flow(spread({ by: "k", dir: "x" }))
  .mark(
    layer([rect({ h: "v" }).name("bar"), rect({ h: 4 }).name("tick")]).relate(
      ({ bar, tick }) => [Constraint.align({ y: "end" }, [bar, tick])]
    )
  );
```

Each row's layer starts its search at itself, finds its own `bar` and `tick`,
and stops. The other rows' `bar`s are farther away and never compete. A rule
that required names to be unique across the whole component would make this
an error, and the only fix would be to invent a new name per row.

A tie is still possible. It happens when two nodes with the name sit at the
same depth below the level, e.g., two sibling layers that each hold a child
named `x`. A tree built by recursion can produce that. Wrap each repeated part
in `createMark` so each copy is its own scope, or rename. The
`NestedBoxesTree` story does the first.

Chart-tier names are a different lookup. `.name("bars")` on a mark in a chart
also registers every node it produces in the chart's layer registry, and
`selectAll("bars")` (or `ref("bars")` as chart data) reads the registries.
There a name is a set, by design. The inline lookup on this page never reads
the registries.

The registries follow the same widening rule as the tree lookup
(`LayerContext.lookup` in `marks/markResult.ts`). Each `layer([...])`
combinator has a registry of its own, nested in the registry of the place it
is built (`LayerContext.child`): a chart, an operator's cell, another layer.
A chart shares the registry it is built in. A top-level render and a
`createMark` body start a root, which no lookup crosses. A lookup searches
its registry and the ones nested in it, nearest depth first, then its
parent's, one level at a time, and stops at the first level that has the
name. Every registry at that depth contributes. A registry links only to its
parent. When a registry first gets a name, it records the name in its own
index and in each ancestor's: the nearest depth below that ancestor that has
the name, and the registries at that depth. So a lookup reads one index
entry per ancestor and never walks down. The tree lookup has no such index,
because elaboration renames and wraps nodes after they are built, so it
searches each level breadth first. So a `layer` repeated per `spread` cell finds its own
cell's `bars`, and a `selectAll("bars")` outside the spread gathers the bars
of every cell. A name a split repeats is plural: `selectAll` gathers it, and
the singular `ref` reports how many marks it matched. Before #1236 each
`layer` combinator's registry was flat and private, so a name declared
inside a cell was invisible outside it.

## Constraint operands

`.relate(fn)` calls `fn` right away with an environment
(`relateEnv` in `constraints/index.ts`). The environment is an ordinary
object with one operand, a `RelateOperand` carrying the name and the layer,
for every distinct name inside the layer. `GoFishNode.relate` passes the
layer to the callback too, which the deserializer's callback uses to bind
the wire's scope id. The environment walks the same bounded tree as the lookup
(`visibleNodes`), so it goes into nested layers but not into a nested
`createMark` component.

These are exactly the names a constraint of this layer can use. The lookup
from the layer stops at the layer's own level for any of them, so each one
resolves to a node inside the layer. A name that exists only outside the layer
could never be an operand, because a layer can only place what it contains.
Since the layer's contents already exist when `.relate()` runs, the
callback does not have to wait until layout.

A name that is not in the environment reads as `undefined`. So JS
destructuring defaults, e.g., `({ a, b, pad = 8 })`, and optional checks,
e.g., `note ? [...] : []`, work as they do for any object. If the callback
uses `undefined` as an operand, `validateOperands` throws right away, and the
message lists the names inside the layer (#819).

One function, `resolveReferences` (`_ref.tsx`), resolves every reference in
the tree: each ref's target, each constraint operand, and each paint-order
operand. The render runs it once per round, after the pass that installs the
operators' constraints (`resolveAliases`), and again whenever a pass rewrites
the tree (`reresolve` in `gofish.tsx`). For each layer with constraints, it
looks each distinct operand name up once with the lookup above, starting at
the layer, writes the uid of the node it finds into the operand's `key`, and
records whether the node is a direct child (`resolvedConstraints`). The
placement solve reads only the key. The name is kept for error messages. The
operand stays a name until the round because elaboration can wrap a named
node. Axis, legend, and label elaboration wrap a node with
`wrapPreservingIdentity`, which moves the node's key onto the wrapper and
leaves its name on the node, so the name still finds the node.

Operators that build a constrained layer themselves do not use names. Spread,
scatter, partition, table, and the axis, legend, and label chrome refer to
their own children by slot (`SlotOperand` in `constraints/shared.ts`): the
operand is the child in slot `i` of the layer, whatever fills it, so a pass
that wraps the child in place keeps it. A chrome ring's content is slot 0,
and its k-th shape is slot k + 1 (`wrapRing`). The default paint order of a
relational mark holds the nodes themselves (`NodeOperand`). A handle names no
one, so it can neither capture a user's name nor be captured by one. These
operators name nothing, so `_name` holds only names the user wrote.

A wrapper that an elaboration pass inserts is transparent to a name lookup
(`_transparent`, set by `wrapRing`, the one helper that builds them). It
takes no name, and it adds no depth: the lookup treats its children as if
they stood where it stands. The node it wraps is its slot 0 and keeps its own
name, so `ref("bar")` on a labeled bar is the bar alone, not the bar and its
label. A layer still places, and orders, what stands in a named node's place
(`inPlace`): a constraint on the labeled bar moves its wrapper, so the label
moves with it.

### Nested operands

An operand does not have to be a direct child. In the Diagrams tutorial's
final figure, the constraint names `mercury`, which sits inside
`enclose(spread(...))`:

```js
layer([
  enclose({ padding: 20 }, [
    spread(
      { dir: "x" },
      planets.map((d) => circle(d).name(d.name))
    ),
  ]).name("planets"),
  text({ text: "Mercury" }).name("label"),
]).relate(({ mercury, planets, label }) => [
  Constraint.align({ x: "middle" }, [mercury, label]),
  Constraint.distribute({ dir: "y", spacing: 20 }, [planets, label]),
  arrow({}, [label, mercury]),
]);
```

The layer cannot move `mercury` on its own: the spread already placed it inside
`planets`. So a nested operand is **rigidly attached** to the direct child that
contains it (its container). `NestedOperand` (`constraints/nestedOperand.ts`)
stands in for it in the solve: its box is the container's box plus a constant
offset, taken from the container's finished layout (`nestedGap`). For each axis
the operand takes part in, the solve adds one relation that ties the operand's
`start` to the container's `start` at that offset.

What happens next depends on whether the container is itself an operand:

- **Container not named in any constraint.** It is placed at the layer's origin
  before the solve, like any unconstrained child. The nested operand is then a
  fixed point, and the other operands move to it.
- **Container named too** (`planets` above). The solve moves the container, and
  the nested operand moves with it.

The container carries the write-back; the stand-in's own placement writes do
nothing. A nested operand cannot be resized from outside, so its size hooks
throw: the target of `"span"` or `"size"` must be a direct child.

A nested operand and a `ref` both share their target's local frame, so each one
returns its target's `geometry()` (the shape queries described under
[Layout Calculation](/internals/layout/passes)).

A laid-out `ref` stands where its target is. Its translate is read off the
target each time, not copied at layout: the walk from the target up to their
common ancestor, less the walk from the ref's parent up to it. So a node on
those walks that is placed after the ref is laid out (a layer places a
constrained child in its solve) moves the ref with it. Like a node's, its
`place()` is write-once, so the parent's default placement of an
unconstrained child does not move it off its target; only an authoritative
pin (`pinAnchor`) does.

## Drawing clauses and their order

A clause that is not a constraint draws: an operator or mark such as `arrow`,
a relational `enclose` or `line`, or an open term that mixes operands with
fresh marks, e.g., `spread({ dir: "y" }, [bar, text(...)])`.
A drawing clause is a mark position over the rows the layer was drawn for,
as the layer's children are: when the layer is a mark (one per cell of a
partition), its `.relate` modifier passes those rows to `GoFishNode.relate`,
so an empty-scope `chart()` in a clause binds the cell's rows.

`resolveRelateClauses` (`constraints/relate.ts`) awaits and flattens the
callback's result the way an operator treats its children (with the shared
`flattenAndAwaitPromises`; it also awaits any thenable and drops `false`, and
it skips the awaiting when the result holds no promise). It splits the result
into constraints (plain objects built by a `Constraint.*` factory, or one of
the private elaboration targets `grid`, `overlap` and `labelPlace` that
`table`, `scatter` and `.label()` build) and terms,
checks the constraints' operands, and resolves each term to its node, one at a
time. A term is resolved in a fresh registry nested in the one the layer's plain
children were resolved in: the `layer([...])` combinator keeps that registry
as `_names`, so `chart(selectAll("points"))` in a clause finds the layer's
`points`, as it would as a plain child, and a clause that a later call
replaces leaves no names behind. `resolveRelateClauses` appends the nodes to
the layer's children and records each slot in the layer's `_relateClauses`
(a map from child index to the clause's position in the list; empty when
there are none). A later `.relate()` call replaces the clauses of an
earlier one.

The list belongs to the layer, not to the child, so no other layer can read
it (#1235), and a pass that wraps a child replaces it in its slot
(`children[i] = wrapper`), so the wrapper stays a clause. Only `.relate()`
appends children to a layer after it is built, so slots do not move. `.relate()` is a layer method: it throws on any other node,
because only `layer.tsx` knows how to schedule clauses.

Coordinates are single-assignment: a clause that reads a position must run
after the clause that writes it. `scheduleRelate` orders the steps of one
layer's layout. There are two kinds of step: the **solve**, which lays out the
plain children and runs the layer's one joint constraint solve, and one step
per drawing clause, which lays that clause out. The edges are:

- a clause whose refs point into a plain child runs after the solve;
- a clause whose refs point into another clause runs after that clause;
- the solve runs after any clause that contains a constraint operand.

A ref that points outside the layer (a token reaching across scopes) adds no
edge, and neither does a ref a clause makes to a fresh node inside itself.
Ties keep declaration order, with the solve first. `layer.tsx` lays out the
plain children and the clauses scheduled before the solve, runs the solve,
then lays out the rest. A clause's refs read final positions, which fixes
#878: an arrow between two nodes that the same layer's constraints place used
to resolve before the solve moved them.

A cycle is an error that names every clause on it: a clause whose ref points
at itself, two clauses that read each other, or a constraint that moves a
clause which reads the nodes that constraint places. `resolveReferences`
runs the check as soon as the refs are resolved. It cannot wait for layout,
because the space pass would recurse forever first (a ref proxies its target's
type and size claim, and a cyclic target contains the ref).
`resolveReferences` keeps the schedule it computed on the layer, and layout
reuses it while the layer has the same children and constraints
(`relateScheduleForLayout`); a pass that rewrites the tree runs
`resolveReferences` again, which recomputes it.

A clause paints after the plain children, in clause order, except that a
clause built by `createRelationalMark` (`enclose`, `line`, `ribbon`) paints
under the nodes it reads. A clause's operands are string refs, which are not
resolved when the clause is attached, so the default names them:
`GoFishNode.relate` runs the same pass `layer` runs for its children
(`applyRelationalZBelowDefaults`), which adds `zBelow(clause, operand)` for
each string-ref operand whose scope lies in this layer; an operand an
enclosing `.relate()` bound is left for that layer (see [The Mark Factory](/internals/frontend/mark-factory)).
The constraint carries the operand's scope, and `resolveReferences` looks
the name up from that layer without its clause slots, as the placement lookup
does, so a nested clause's node of the same name does not join the operand's
set. A paint-order operand that is a name stands for every node inside the
layer that carries it; paint order reads the sets `resolveReferences` found. An explicit
`.zOrder(...)` on the clause wins. `.relate()` replaces the constraints of
an earlier `.relate()`, but not the defaults `layer` gave its own
relational-mark children (`_paintDefaults`), so a `line` or `enclose` among
the layer's children still paints under the nodes it reads.

## History

Strings used to be **layer-local**. `.relate()` saw only a layer's direct
children (plus names inside plain nested layers, which the solver then ignored
in silence), while `ref("x")` searched the whole component. Stories worked
around the gap with a proxy child, `ref("x").name("x")`, to re-expose a nested
name to an outer layer (#724), and an operand that matched nothing did nothing
(#819). The single lookup above replaced both behaviors.

That proxy no longer works, and is no longer needed. As a plain child it is a
string ref outside `.relate()`, which is an error. The Diagrams tutorial shows
the replacement: the related layer holds the node's container, so the
constraint names the nested node.

The callback was called `.constrain()` until its clauses could draw. A slot
whose clauses include arrows and backgrounds is not well described by
"constrain", so it was renamed `.relate()` with no alias (#707). Before the
rename, a string `ref` could sit anywhere, and an arrow over nodes that a
sibling constraint placed had to live one layer out, laid out after the
constrained layer; written as a sibling, it read the positions before the
solve (#878). Local string refs now live only inside `.relate()`, where their
order is scheduled.

## Names the library makes up

The library makes up no names in the tree. Two rules keep its nodes apart
from a user's names:

- The data key is never used as a name. `createMark` used to write each mark's
  data key into `_name`, and `spread`, `scatter`, and `table` used to name an
  unnamed child after its key. Then a spread over rows keyed `"a"` and `"b"`
  put nodes named `"a"` and `"b"` into the scope, where they could make a
  user's own `"a"` ambiguous, or answer to it. Now the key stays in `key`
  only. Axis tick labels read the key, so they are unchanged.
- An operator or a chrome pass refers to the nodes it builds by handle (see
  [Constraint operands](#constraint-operands)), so it writes no name. Two
  children that share a user name both keep it, and the name is plural: a
  singular use of it is ambiguous, and a paint-order operand takes them all.
  The library used to give the second one a fresh name of its own, and the
  chrome had fixed names (`__axisContent`, `__legend`); #1246 removed them.

A chart tier that a later tier reads gets a name only when the user gave its
mark none (`ensureNamedMark`). That name is a fresh `createName` token, so
the registry files the tier's marks under a key no string and no other tier
can reach. It is the one name the library still writes into `_name`, where
its tag answers to the string `"__gofish_layer"` like any token's tag. The
tier needs only the registry, so the fix is to file its marks there without
a tree name (#905).

A token is plural like a string. `resolveReferences` registers every token
before it resolves any ref, and each node that carries a token joins its
list. A singular `ref(token)` that matches several nodes says how many it
matched, and `selectAll(token)` gathers them all from the registry.

## Open questions

- A nested operand moves its container only when the container is named too.
  Treating every operand as a direct child plus a constant offset would
  remove that rule (#925).
- A named ref is a scope member in some places and an alias for its target
  in others (#926).
