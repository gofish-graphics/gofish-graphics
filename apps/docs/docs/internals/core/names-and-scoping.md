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
parent and looks at that subtree, and so on. This is the **innermost
enclosing match**: the nearest level that contains the name wins.

The search has one hard boundary, the `createMark` component. It never goes
above the nearest component that contains the start, and it never looks inside
a nested component (the component's own name is visible, its insides are not).
Without an enclosing component, the whole diagram is the outermost level. The
walk that enforces the boundary is `visibleNodes`, which the chart layer
registry (`collectLayerRegistrations` in `chartBuilder.ts`) also uses, so the
component boundary means the same thing for `ref`, `.constrain()`, and
`selectAll`.

Two results are errors, and both name the problem:

- **Ambiguous.** Two or more nodes with the name at the level where the search
  stops.
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

Distance is counted in levels, not in depth. When one layer's subtree holds
the same name twice, once as a direct child and once deeper down, the search
from that layer sees both at the same level: that is ambiguous. It happens
when a helper nests copies of itself (a tree built by recursion) or when two
helpers that share a name nest one inside the other. Wrap the repeated part in
`createMark` so each copy is its own scope, or rename. The `NestedBoxesTree`
story does the first; `DFSCQ` does the second.

Chart-tier names are a different lookup. `.name("bars")` on a mark in a chart
also registers every node it produces in the chart's layer registry, and
`selectAll("bars")` (or `ref("bars")` as chart data) reads that registry. There
a name is a set, by design. The inline lookup on this page never reads the
registry.

## Constraint operands

`.constrain(fn)` calls `fn` with an environment (`constraintEnv` in
`constraints/index.ts`) where every property read is a by-name operand,
`{ name }`. Nothing is resolved at that point. At layout, the layer resolves
all of its operands (`resolveConstraintOperands`) with the lookup above,
starting at itself. An operand must end up inside the layer; a name that is
only found outside it is an error, because a layer can only place what it
contains.

Operators that build a constrained layer themselves (spread, scatter, table,
and the axis, legend, and label chrome) do not use names at all. They call
`constrainChildren`, which gives them **by-position** operands
(`{ name, child }`, from `childRefs`): the layer's `child`-th direct child. A
slot rather than a node object, because elaboration can later replace a child
with a wrapper in the same slot. This keeps their synthesized names, such as
`__spread_0`, out of the lookup, so those names can repeat freely.

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

## Open questions

- An inline string `ref` that is a child of a constrained layer resolves its
  position before that layer's constraints run (#878).
- Operator-synthesized names (`__spread_0`, datum keys written by `createMark`)
  still land in `_name`. They are harmless unless a user looks one up by
  string, but they are not hygienic (#905 is the same problem for chart tiers).
