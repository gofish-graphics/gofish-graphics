---
title: How does a chart chain become operators, and then constraints?
order: 2
topics:
  - lowering
  - flow
  - operator
  - combinator
  - direct style
  - split
  - createOperator
  - spread
  - layer
  - relate
  - align
  - distribute
  - constraints
reads:
  - packages/gofish-graphics/src/ast/marks/chartBuilder.ts
  - packages/gofish-graphics/src/ast/marks/createOperator.ts
  - packages/gofish-graphics/src/ast/marks/markResult.ts
  - packages/gofish-graphics/src/ast/marks/compose.ts
  - packages/gofish-graphics/src/ast/datumProjection.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/stack.tsx
  - packages/gofish-ir/src/frontend/descriptors.ts
  - packages/gofish-graphics/src/ast/marks/chart.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/spread.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/spreadX.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/group.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/scatter.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/partition.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/table.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/pack.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/treemap.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/position.tsx
  - packages/gofish-graphics/src/ast/constraints/index.ts
  - packages/gofish-graphics/src/ast/constraints/distribute.ts
  - packages/gofish-graphics/src/ast/constraints/shared.ts
  - packages/gofish-graphics/src/ast/withGoFish.ts
  - packages/gofish-graphics/src/ast/_node.ts
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/data.ts
  - packages/gofish-graphics/src/ast/shapes/rect.tsx
checked:
  commit: 3e52867e4d31dfe0b02e148c22c225f1d33b5a12
  date: 2026-11-13
cover:
  - figure: levels
    rows: 4
    cols: 3
---

<script setup>
import LoweringLevels from "./lowering.levels.vue";
</script>

A bar chart can be written as a chain of calls, as operators over a list of children, or as a layer of shapes with constraints. How does GoFish turn each form into the next, and what does each step need to know?

```ts
chart(data)
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }));
```

Here `data` is three rows: A is 3, B is 7 and C is 5.

## Three levels

The **chain** is the code above. An operator in `.flow()` splits rows into groups. The **direct style** gives the same operator a second argument, a list of children. Nothing is split.

```ts
chart(data).mark(
  spread({ dir: "x" }, [
    rect({ key: "A", h: value(3) }),
    rect({ key: "B", h: value(7) }),
    rect({ key: "C", h: value(5) }),
  ])
);
```

A **constraint** is a relation between nodes that layout solves. `align` lines nodes up on one axis, and `distribute` puts them one after another along an axis. A `layer` holds its children and their constraints.

```ts
chart(data).mark(
  layer([
    rect({ key: "A", h: value(3) }).name("r0"),
    rect({ key: "B", h: value(7) }).name("r1"),
    rect({ key: "C", h: value(5) }).name("r2"),
  ]).relate(({ r0, r1, r2 }) => [
    Constraint.align({ y: "baseline" }, [r0, r1, r2]),
    Constraint.distribute({ dir: "x", spacing: 8, measure: "category" }, [
      r0,
      r1,
      r2,
    ]),
  ])
);
```

<LoweringLevels />

All three were run through `book:tree` and `toDisplayList` at 300 by 200 pixels. Each builds a frame layer, a content layer and a layer of three rects, and after layout that inner layer holds `[align, distribute]`. The value axis and the A, B, C labels match. The titles do not. The chain gets "category" and "value", the constraint form gets "category", and the direct style gets neither. With no "value" title on the left, the bars are 84.3 pixels wide instead of 78.

## From the chain to operators

`.flow()` and `.mark()` only store what you gave them. Nothing runs until a terminal such as `render` calls `resolve()`.

An operator is a function from a mark to a mark. `resolve()` wraps the mark in each operator, last first, so `.flow(a, b).mark(m)` becomes the mark `a(b(m))`. It calls that mark once with the chart's rows, typed by the chart's `schema`, and puts the result in the chart's frame (see the [pipeline chapter](/under-the-surface/pipeline)).

The mark that `spread({ by })` returns comes from `createOperator`. Called with rows, it:

1. **Splits** the rows by the `by` field, in order of first appearance, or in the column's level order when the `schema` gives one.
2. **Calls the mark once per group** with that group's rows. `rect({ h: "value" })` reads `value` from its one row, and the value remembers its field.
3. **Keys** each node with its group's value, A, B or C.
4. **Computes per-group options**, such as `size`.
5. **Passes the grouping field on** as the measure of the axis the groups lie along.
6. **Calls `Spread`**, the function the direct style calls.

This step needs the rows, their column types and the mark's kind: a mark like `cut` takes a group's rows at once and returns several nodes.

## From operators to constraints

`Spread` returns a `layer` holding the children at once, but not its constraints. `dir` names an axis, and inside a polar space it may be `"theta"`, a space that does not exist while the tree is built. So `Spread` leaves a hook on the layer.

Right after resolving colors, `layout()` calls `resolveAliases()`, which walks the tree from the root and gives each axis name its meaning. At the spread's layer it runs the hook, which:

- finds the axis `dir` names, and takes the other axis as the cross axis;
- adds `align` on the cross axis, with the spread's `alignment`;
- adds `distribute` along `dir`, with the spread's `spacing`, `anchor`, `glue`, `reverse` and the measure from step 5.

These constraints point at children by slot number, so no name you choose can collide with them. `stack` is `spread` with `glue: true` and lowers the same way.

`.relate()` installs its constraints when the tree is built, and points at children by name. The trees show it: before layout, the constraint form's layer already holds `[align, distribute]` and the spread's holds none. Then layout solves them (see the [layout chapter](/under-the-surface/layout)).

::: rule A chain is nested marks.
.flow(*op*₁, … , *op*ₙ).mark(_m_) = *op*₁(… *op*ₙ(_m_))(_rows_)

The first operator in the chain is the outermost, so it splits first.
:::

::: rule A split calls the mark per group.
spread({ by: _f_, … })(_m_)(_rows_) = spread({ … }, [ *m*(*g*₁), … , *m*(*g*ₖ) ])\
<small>where</small> *g*ᵢ = the rows with _f_ = *v*ᵢ, key(_m_(*g*ᵢ)) = *v*ᵢ

The direct style skips this step.
:::

::: rule A spread is a layer with two constraints.
spread({ dir: _d_, … }, _cs_) = layer(_cs_)\
\+ align(cross(_d_), _cs_) + distribute(_d_, _cs_)

The constraints are added when layout starts.
:::

## What the split knows that a list does not

In the direct style every child gets all the rows. So `rect({ h: "value" })` as a child sums `value` over all three: run with two such children, each bar was 15 tall. That is why the direct style writes `value(3)`.

A plain `value(3)` has no field, so no "value" title comes from it. The "category" title comes from the measure only the split passes on. `Constraint.distribute` takes it as `measure`, and the direct-style `spread` has no option for it. The keys come from the split too, so the direct style writes `key` by hand. Without it, the A, B, C labels are gone.

To match the chain exactly, call each rect on its own row, as the split does: `(_, key, ctx) => rect({ key: "A", h: "value" }).name("r0")([data[0]], key, ctx)`. With `measure: "category"`, that constraint form drew the chain's display list exactly, titles included.

## What is not lowered this way

- **`derive` and `filter`** make no node. They change the rows and pass them to the mark below.
- **`group`** lowers to a plain `layer` with no constraints.
- **`treemap` and `pack`** split with `createOperator`, but compute child boxes in their own layout function. No constraints.
- **`scatter` and `partition`** lower in the same kind of hook, to `position` and `align`. A scatter `overlap` strategy adds an `overlap` constraint, which `Constraint` does not offer.
- **`table`** lowers to a `grid` constraint at build time. `Constraint` does not offer `grid`.
- **`spreadX`, `spreadY`, `stackX` and `stackY`** call `Spread` directly: no chain form, no split, no channels.
- **`enclose`, `arrow`, `connect`, `offset` and `position`** have layout functions of their own.

::: not-yet-true

- **The direct style cannot say everything.** It has no option for the category measure, which `Constraint.distribute` takes.
- **A combinator child cannot get its own rows** except by calling the mark by hand. No public way was found; not every helper was checked.
- **Not every operator has a constraint level.** `grid`, `overlap` and label placement are private, and `treemap` and `pack` have none.
- **The travel axis is read at build time.** A relational mark's default grouping reads `spread`'s `dir` before any coordinate space exists, so `dir: "theta"` positions neither axis there (TODO #838 in spread.tsx).
- **The direct style leans on an internal option**, `rect`'s `key`, which the descriptor table calls an "internal per-node key override".

:::

## Where this lives in the code

::: code-map

- **Chain stores operators** marks/chartBuilder.ts `flow` 642, `mark` 698
- **Chain to one mark** marks/chartBuilder.ts `resolveNamed` 983 to 999; `frameChart` 1195
- **Operator factory** marks/createOperator.ts `createOperator` 1231; direct style 1246; split 1347; per group 1388; keys 1402; measure 1462
- **Split by field** datumProjection.ts `splitEntries` 665
- **Spread lowers** graphicalOperators/spread.tsx `Spread` 51, layer 158, hook 171 to 203
- **Hooks run** gofish.tsx `layout` 353, `resolveAliases` call 412; \_node.ts `resolveAliases` 2254
- **Relate** \_node.ts `relate` 3566, `INTERNAL_relate` 3583; marks/chart.ts `layer` 1277
- **Constraint factory** constraints/index.ts `Constraint` 123; constraints/shared.ts `childSlots` 112
- **Other lowerings** scatter.tsx hook 245; partition.tsx hook 197; table.tsx grid 52; group.ts 23; treemap.tsx `Treemap` 217; pack.tsx `packOperator` 148
- **No node** marks/chart.ts `mapOperator` 129, `derive` 184, `filter` 221

:::
