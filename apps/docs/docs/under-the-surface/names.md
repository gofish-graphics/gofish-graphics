---
title: How do names and refs find their targets?
label: Names
order: 6
topics:
  - names
  - ref
  - selectAll
  - createName
  - token
  - scope
  - hygiene
  - relate
  - createMark
  - component
  - registry
reads:
  - packages/gofish-graphics/src/ast/_ref.tsx
  - packages/gofish-graphics/src/ast/marks/markResult.ts
  - packages/gofish-graphics/src/ast/createName.ts
  - packages/gofish-graphics/src/ast/tokenContext.ts
  - packages/gofish-graphics/src/ast/shapes/ref.tsx
  - packages/gofish-graphics/src/ast/marks/resolveRefData.ts
  - packages/gofish-graphics/src/ast/marks/chartBuilder.ts
  - packages/gofish-graphics/src/ast/marks/chart.ts
  - packages/gofish-graphics/src/ast/marks/createOperator.ts
  - packages/gofish-graphics/src/ast/withGoFish.ts
  - packages/gofish-graphics/src/ast/constraints/relate.ts
  - packages/gofish-graphics/src/ast/constraints/index.ts
  - packages/gofish-graphics/src/ast/constraints/shared.ts
  - packages/gofish-graphics/src/ast/_node.ts
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/paintOrder.ts
  - packages/gofish-graphics/src/interaction/widgets.ts
  - packages/gofish-graphics/src/tests/nameScope.test.ts
  - packages/gofish-graphics/stories/bluefish/PythonTutor/PythonTutor.stories.tsx
  - packages/gofish-graphics/stories/bluefish/PythonTutor/globalFrame.ts
  - packages/gofish-graphics/stories/bluefish/PythonTutor/stackSlot.ts
  - packages/gofish-graphics/stories/bluefish/PythonTutor/elmTuple.ts
checked:
  commit: 3e52867e4d31dfe0b02e148c22c225f1d33b5a12
  date: 2026-11-13
cover:
  - figure: walk
    rows: 3
    cols: 3
---

<script setup>
import NamesWalk from "./names.walk.vue";
</script>

Diagrams in the style of Bluefish are built from parts that repeat. Here a `card` is a component: a box with a title centered on it. The diagram uses it twice and draws an arrow from one card's box to the other's.

```ts
const card = createMark(({ title }) => {
  const box = createName("box");
  return layer([
    rect({ w: 60, h: 36, fill: "#eee" }).name(box),
    text({ text: title }).name("title"),
  ]).relate(({ box, title }) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, title]),
  ]);
});

const a = createName("left");
const b = createName("right");
layer([
  spread({ dir: "x", spacing: 80 }, [
    card({ title: "A" }).name(a),
    card({ title: "B" }).name(b),
  ]),
  text({ text: "calls" }).name("note"),
]).relate(({ left, note }) => [
  Constraint.align({ x: "middle" }, [note, left]),
  Constraint.distribute({ dir: "y", spacing: 12 }, [left, note]),
  arrow({}, [ref(a).box, ref(b).box]),
]);
```

There are two nodes called `box` and two called `title`. Each card's `.relate()` finds its own, and the diagram reaches card A's box only through the token path `ref(a).box`. Why?

## The kinds of name

- **`.name("x")`** puts a string name on the node a mark builds.
- **`createName("x")`** makes a token: an object with a tag, `"x"`, and a fresh JavaScript symbol. Two calls with the same tag make two different tokens.
- **`.relate(fn)`** on a layer calls `fn` with one operand per name inside the layer. An operand is a handle on the nodes the name meant when the call ran.
- **`ref(...)`** makes a ref, a stand-in node that draws nothing and stands where its target is. `ref(token)` and a token path such as `ref(a).box` find the target by token. A string `ref("x")` is legal only inside a `.relate()` clause.
- **`selectAll("x")`**, as chart data, gives one ref per mark with that name. `chart(ref("x"))` requires exactly one.

## Three places a name is resolved

**The registry, at build time.** A registry is a table from names to nodes. When a `chart()` has built its marks, it walks the finished tree and files every node that got a `.name()`. `selectAll` and `ref` as chart data read it. Only a chart fills a registry: `chart(selectAll("r"))` beside a plain `rect(...).name("r")` throws `Layer "r" not found.`

**The tree walk for `.relate()`, at build time.** When `.relate()` runs, the layer's children are built. `namesIn` walks down from the layer one depth at a time and binds each name to its closest matches. A clause added later cannot capture them.

**The tree walk for refs, at layout time.** `resolveReferences` first files every token in the render's token table, and in the scope map of the nearest component above it. Then it resolves each ref, so a ref may come before its target. It runs again after each pass that rewrites the tree, such as the one that adds axes.

<NamesWalk />

## Scopes

In the registry, a top-level `chart()` has a root registry. A `layer([...])` opens a child of the registry it is built in, and a chart inside it shares that child. A `createMark` body gets a new root. A lookup reads its scope and the scopes nested in it, then its parent's, and stops at the first level that has the name, never passing a root. So `chart(selectAll("dot"))` in a nested layer found both dots of a chart beside that layer, and the same lookup inside a `createMark` threw `Layer "dot" not found.`

In the tree, layers are not walls. Only a component is: the node a `createMark` call builds, marked by `sealComponent`. Built-in marks such as `rect` are too. The walk checks a component's own name but does not go inside.

A string `ref("x")` in a clause searches the subtree of the layer that holds the clause. If nothing matches, it moves up one ancestor at a time and stops at the nearest component, or at the top. A match found above the layer is still rejected, because a clause relates only nodes inside its own layer: `ref("note") in a .relate() clause names a node outside the relating layer.` So the upward search only chooses the error.

::: rule Nearest depth wins.
lookup(_L_, _x_) = the nodes named _x_ at the smallest depth _d_ below _L_\
<small>where the path to depth _d_ enters no component</small>

All matches at that depth count, so a name can mean several nodes.
:::

::: rule A singular use needs one.
<small>ref, a placement operand:</small> count(lookup) = 1\
<small>selectAll, a paint-order operand:</small> count(lookup) ≥ 1

Zero matches is an error that says the name is missing, and two or more is an error that says it is ambiguous.
:::

::: rule A token is global.
ref(_t_) = the nodes carrying _t_, anywhere in the render\
ref(_t_)._s_ = the nodes filed under tag _s_ in the scope map of ref(_t_)

No string search runs, so no component stops it.
:::

## Hygiene

Hygiene means a name used inside a part cannot collide with a name outside it. For string names the component is the wall, in both directions: each `createMark` body gets a new root registry, and the tree walk stops at components. Each rule lives in one place in the code, so this is a guarantee of the design.

Tokens are hygienic by identity. A token made inside the body is new for each call, so the two cards' `box` tokens differ. A token made once outside and shared is one token on two nodes: `ref(createName("box")) is ambiguous: it matched 2 nodes`. And a token's tag still answers to string lookups, which is how the card's `.relate(({ box }) => …)` finds its rect.

The parts the library adds reach nodes through handles, not names (see [the axes chapter](/under-the-surface/axes)), and data keys are not names. For these parts hygiene is true of today's code, not enforced. The `slider` and `button` widgets name inner nodes `"track"`, `"readout"`, `"box"` and `"label"` and are not components. A `button` beside a nested `text(...).name("label")` makes `label` ambiguous: `the name "label" is ambiguous: it matched 2 nodes`.

## The example, lookup by lookup

The figure walks through five lookups, each run against the example. Two fail. `box` in the diagram's `.relate()` stops at the cards and is `undefined`: `Constraint.align: operand 2 is undefined, not an operand. … Names inside this layer: note, left, right.` A `ref("note")` in a clause inside the card cannot leave it: `ref("note"): no node named "note" in the enclosing createMark component.`

Two variants fail too. With the string `.name("box")` in the card, the path finds nothing, because a scope map files only tokens: `Ref path: tag "box" not found under "left". Available: ` (an empty list). With plain layers in place of components, the diagram's `box` finds both boxes at depth 3: `the name "box" is ambiguous: it matched 2 nodes`.

## How a ref gets its target's box

When a ref is laid out, it copies its target's size and records the closest node above both. Its position is computed each time it is read: the offsets from the target up to that shared node, less those from the ref's parent up to it (`translateOn`). So a target placed after the ref is laid out still carries the ref with it.

For a drawing clause such as the arrow, `scheduleRelate` sets the order. A clause whose refs point into the layer's other children is laid out after the layer solves its constraints, and a clause that points into another clause comes after that clause. A cycle is an error.

::: not-yet-true

- **Only charts file names.** A `.name()` outside any `chart()` is reachable by the tree walk and by tokens, but not by `selectAll`.
- **Widgets use string names.** `slider` and `button` should be components or use handles, so their inner names cannot collide with the user's.
- **The registry and the tree draw scopes differently.** A layer is a registry scope but not a tree scope, so the same name can resolve differently through `selectAll` and through `.relate()`.

:::

## Where this lives in the code

::: code-map

- **Tokens** createName.ts `createName` 11; tokenContext.ts `TokenContext` 4
- **Registry** markResult.ts `LayerContext` 55, `register` 103, `lookup` 172
- **Filing names** chartBuilder.ts `collectLayerRegistrations` 134, called 1006; createOperator.ts `nameModifier` 448
- **Registry scopes** chart.ts `layer` 1294; withGoFish.ts `boundary` 588, `sealComponent` 485
- **Chart data** resolveRefData.ts `resolveRefData` 25
- **Relate operands** constraints/index.ts `relateEnv` 168, `validateOperands` 193; relate.ts `RelateOperand` 31; \_node.ts `relate` 3566
- **Tree walk** \_ref.tsx `visibleNodes` 516, `scopeRootOf` 536, `namesIn` 553, `closestAtLevel` 624, `lookupName` 667, `one` 591
- **Ref resolution** \_ref.tsx `resolveReferences` 730, `registerTokens` 787, `resolveSelection` 211, `resolveLocalString` 297; gofish.tsx 415
- **Ref position** \_ref.tsx `translateOn` 102, `layout` 350; relate.ts `scheduleRelate` 250

:::
