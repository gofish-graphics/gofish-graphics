---
title: Name Resolution & Scoping
section: Core
order: 40
status: stable
covers:
  - packages/gofish-graphics/src/ast/_ref.tsx
  - packages/gofish-graphics/src/ast/constraints/nestedOperand.ts
---

# Name Resolution & Scoping

A mark gets a name with `.name(...)`. Something else then finds it by that
name: a `ref("x")` that an arrow points at, or an operand in a `.constrain()`
callback. This page explains how a string name is found, where the search
stops, and how a constraint uses a node that sits deep inside another child.

There are two kinds of name. A **string** (`.name("box")`) is a label. A
**token** (`.name(createName("box"))`) is an identity: a unique value that can
be passed around and used as the first step of a path. Tokens are looked up in
a global table and are not affected by anything on this page. Everything below
is about strings. A token's tag also answers to its string, so
`.name(createName("box"))` can be found as `"box"` too.

## One lookup for `ref` and `.constrain()`

`ref("x")` and a `.constrain()` operand named `x` use the same function,
`resolveScopedName` in `_ref.tsx`. The only difference is where the search
starts:

- a `ref` starts at its parent;
- a `.constrain()` operand starts at the layer the constraint is attached to.

From the start, the search looks at every node inside the current level's
subtree. If it finds the name, it stops there. If not, it moves up to the
parent and looks at that subtree, and so on. So the nearest level that
contains the name wins.

Inside the level where the search stops, the closest match wins. Distance is
the number of steps down from that level's node, so a direct child is at
distance 1. A layer's direct child `x` therefore beats an `x` nested deeper
inside another child, and a deeply nested name is still reachable when nothing
closer has it. `closestAtLevel` does this with a breadth-first search that
stops at the first depth with a match. When the search moves up a level, it
does not walk the subtree it just searched again.

The search has one hard boundary, the `createMark` component. It never goes
above the nearest component that contains the start, and it never looks inside
a nested component (the component's own name is visible, its insides are not).
Without an enclosing component, the whole diagram is the outermost level. The
walk that enforces the boundary is `visibleNodes`, which the chart layer
registry (`collectLayerRegistrations` in `chartBuilder.ts`) also uses, so the
component boundary means the same thing for `ref`, `.constrain()`, and
`selectAll`.

Two results are errors, and both name the problem:

- **Ambiguous.** Two or more nodes with the name at the same smallest distance
  in the level where the search stops.
- **Missing.** No node with the name anywhere up to the boundary.

## Why the nearest match, and why hiding is intended

A nearer name hides a farther one with the same spelling. This is deliberate,
and it is what makes repetition work. A layer written once but built many
times, once per row of a chart or once per call of a helper function, can use
the same local names in every copy:

```js
chart(rows)
  .flow(spread({ by: "k", dir: "x" }))
  .mark(
    layer([
      rect({ h: "v" }).name("bar"),
      rect({ h: 4 }).name("tick"),
    ]).constrain(({ bar, tick }) => [
      Constraint.align({ y: "end" }, [bar, tick]),
    ])
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
`selectAll("bars")` (or `ref("bars")` as chart data) reads that registry. There
a name is a set, by design. The inline lookup on this page never reads the
registry.

## Constraint operands

`.constrain(fn)` calls `fn` right away with an environment
(`constraintEnv` in `constraints/index.ts`). The environment is an ordinary
object with one by-name operand, `{ name }`, for every distinct name inside the
layer. It walks the same bounded tree as the lookup (`visibleNodes`), so it
goes into nested layers but not into a nested `createMark` component.

These are exactly the names a constraint of this layer can use. The lookup
from the layer stops at the layer's own level for any of them, so each one
resolves to a node inside the layer. A name that exists only outside the layer
could never be an operand, because a layer can only place what it contains.
Since the layer's contents already exist when `.constrain()` runs, the
callback does not have to wait until layout.

A name that is not in the environment reads as `undefined`. So JS
destructuring defaults, e.g., `({ a, b, pad = 8 })`, and optional checks,
e.g., `note ? [...] : []`, work as they do for any object. If the callback
uses `undefined` as an operand, `validateOperands` throws right away, and the
message lists the names inside the layer (#819).

At layout, the layer resolves each distinct operand name once
(`resolveConstraintOperands`) with the lookup above, starting at itself, and
records whether the node is a direct child. The operand stays a name until
then because elaboration can swap a named child for a wrapper. Axis, legend,
and label elaboration wrap a node with `wrapPreservingIdentity`, which moves
the node's name and key onto the wrapper, so the name still finds the node
that now fills that slot.

Operators that build a constrained layer themselves use the same path. Spread,
scatter, table, and the axis, legend, and label chrome call plain
`.constrain()` and read their operands from the environment. The closest match
rule is what makes this safe. An operator names its own direct children, which
are at distance 1, so a node with the same name deeper inside a child never
competes.

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
]).constrain(({ mercury, planets, label }) => [
  Constraint.align({ x: "middle" }, [mercury, label]),
  Constraint.distribute({ dir: "y", spacing: 20 }, [planets, label]),
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

## History

Strings used to be **layer-local**. `.constrain()` saw only a layer's direct
children (plus names inside plain nested layers, which the solver then ignored
in silence), while `ref("x")` searched the whole component. Stories worked
around the gap with a proxy child, `ref("x").name("x")`, to re-expose a nested
name to an outer layer (#724), and an operand that matched nothing did nothing
(#819). The single lookup above replaced both behaviors.

That proxy no longer works, and is no longer needed. Its nearest match for
`"x"` is itself, so `ref("x")` inside `ref("x").name("x")` throws a "refers to
itself" error that says to constrain the named node directly. The Diagrams
tutorial shows the replacement: the constrained layer holds the node's
container, so the constraint names the nested node, and anything that reads
the result (an arrow) sits one layer out.

## Names the library makes up

A name the library makes up must never clash with a name a user writes. Two
rules keep them apart:

- The data key is never used as a name. `createMark` used to write each mark's
  data key into `_name`, and `spread`, `scatter`, and `table` used to name an
  unnamed child after its key. Then a spread over rows keyed `"a"` and `"b"`
  put nodes named `"a"` and `"b"` into the scope, where they could make a
  user's own `"a"` ambiguous, or answer to it. Now the key stays in `key`
  only. Axis tick labels read the key, so they are unchanged.
- When an operator has to name a node, it gets a fresh name from
  `internalName` (`constraints/shared.ts`), e.g., `__spread#12`. Each call
  returns a new name, so it cannot equal a user's name or another operator's.
  `ensureChildNames` keeps a name the user gave a child, and gives an
  `internalName` to an unnamed child or to a second child with the same user
  name.

These names still live in `_name`, next to user names, so they appear in a
`.constrain()` environment. The full fix keeps library names out of `_name`
altogether (see the open questions).

## Open questions

- An inline string `ref` that is a child of a constrained layer resolves its
  position before that layer's constraints run (#878).
- Library names still share `_name` with user names, and the fixed chrome
  names (`__axisContent`, `__legend`, and similar) are not yet made unique
  per call (#927). Chart-tier names have the same problem (#905).
- A nested operand moves its container only when the container is named too.
  Treating every operand as a direct child plus a constant offset would
  remove that rule (#925).
- A named ref is a scope member in some places and an alias for its target
  in others (#926).
