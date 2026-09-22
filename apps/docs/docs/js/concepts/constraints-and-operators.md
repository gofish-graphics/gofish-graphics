# Constraints and Operators

::: warning Under construction
This page is a first draft. The ideas are right, but the prose has not been
written properly yet and may change shape.
:::

GoFish has two ways to say where something goes, and they answer different
questions.

An **operator** is a layout rule over a family of children. `spread` puts them
in a row with gaps, `stack` puts them in a row flush against each other, and
`layer` puts them all at the same place. You hand an operator a list and it
decides the positions of every item in that list by applying one rule to all of
them.

A **constraint** is a relation between named marks. `align` says two of them
share an edge or a center. `distribute` says one sits a given distance from the
next. `position` says a mark lands at a coordinate, which may be a data value
rather than a pixel. You state relations and layout finds positions that
satisfy them.

The short version of the difference: an operator answers "how is this family
arranged?", and a constraint answers "where does this one thing sit relative to
that one thing?"

## Position as a rule

When the children are alike and their order is the point, an operator says it
in one line.

::: gofish

```js
gf.spread({ dir: "x", spacing: 10, alignment: "middle" }, [
  gf.rect({ w: 40, h: 70, fill: "#e63946" }),
  gf.rect({ w: 40, h: 40, fill: "#457b9d" }),
  gf.rect({ w: 40, h: 55, fill: "#2a9d8f" }),
]).render(root, { w: 220, h: 120 });
```

:::

Three rectangles, one rule, and the rule does not care how many there are.
Change the list to thirty and nothing else in the code changes. This is why
operators carry the bulk of a chart: a chart is almost entirely families of
similar things.

An operator also owns a box. It has a size, it can be nested inside another
operator, and its size is composed from its children's. That is what makes
`spread` inside `spread` inside `chart` work, and it is what lets a scale solve
propagate from the outside in.

## Position as a relation

Sometimes the thing you know is not a rule over a family. It is a fact about
two specific marks.

The chart below is the idea behind the bottle chart from
[Pictorial Charts](/js/tutorials/pictorial-charts), reduced to its bones. Each
bar has a line at the height its value reaches and a number sitting on that
line.

::: gofish

```js
const fruit = [
  { name: "apple", count: 12 },
  { name: "pear", count: 7 },
  { name: "plum", count: 19 },
  { name: "fig", count: 4 },
];

gf.chart(fruit, { axes: false })
  .flow(gf.spread({ by: "name", dir: "x", spacing: 10 }))
  .mark(
    gf
      .layer([
        gf.rect({ w: 40, h: "count", fill: "#a8b8d8" }).name("bar"),
        gf.rect({ w: 70, h: 1, fill: "#666", y: "count" }).name("line"),
        gf
          .text({ text: (d) => `${d.count}`, fontSize: 12, fill: "#666" })
          .name("label"),
      ])
      .constrain(({ bar, line, label }) => [
        gf.Constraint.align({ x: "start" }, [bar, line]),
        gf.Constraint.distribute({ dir: "y", spacing: 0 }, [line, label]),
        gf.Constraint.align({ x: "end" }, [label, line]),
      ])
  )
  .render(root, { w: 300, h: 200 });
```

:::

Both kinds are in this picture and each is doing the job it is good at. The
`spread` arranges the four bars, which are a family. The three constraints hold
the three parts of one bar together, which are not a family but a small set of
specific relations.

Look at what the constraints say. The line's left edge is the bar's left edge.
The label sits flush on the line. The label's right edge is the line's right
end. Every one of these is a statement about two named things.

## Why a constraint is the right tool here

The line's vertical position comes from `y: "count"`, which is not a pixel
value. It becomes one only after the scale is solved, and the scale depends on
the data and on how big the plot turned out. So there is no number you could
write for the label's position. Whatever you wrote would be wrong for a
different dataset, and wrong again at a different size.

This is the general rule for reaching past operators. A constraint earns its
place when one mark's position depends on another mark's data-driven size or
position. The dependency is real, layout is the only thing that can resolve it,
and a constraint is how you hand it over.

Compare the horizontal case in the same snippet. The bar's width might come
from the data, or from an image's own proportions, or from a text measurement.
"The line starts where the bar starts" is a sentence you can write without
knowing any of that. A pixel offset is not.

## What each one cannot do

An operator cannot relate two specific children. It applies its rule uniformly,
so "this one child hangs off the right edge of that one child" has no operator
form. You can sometimes fake it by restructuring the tree until the relation
becomes a family, which produces trees whose shape is an artifact of the
layout engine rather than of the picture.

A constraint cannot own a box. Constraints are relations among a layer's
children and they do not introduce structure. Anything that has a size, holds
other things, and reports its size upward is an operator. This is also why
z-order relations exist only as constraints and there is no z-order operator:
a paint-order relation has no box, so it has no operator form.

There is a useful principle hiding there. Anything that places into a box is an
operator. Anything with no box of its own is a constraint.

## Two surfaces, one machinery

The two are not two engines. Underneath, `spread` and `stack` are expressed in
terms of the same machinery the constraints use, and the equivalences are
exact, including the scale solve and the auto-fit, not just the final pixels:

| Operator                                          | Constraint form                                        |
| ------------------------------------------------- | ------------------------------------------------------ |
| `Spread({ dir: "y", alignment: "start" }, items)` | `align({ x: "start" })` and `distribute({ dir: "y" })` |
| `Stack({ dir: "y" }, items)`                      | `distribute({ dir: "y", glue: true })`                 |

So the choice between them is a choice of phrasing, not of capability inside
that overlap. Use the operator when the sentence you want to write is about a
family, and drop to constraints when it is about particular marks.

## What was rejected

**Computing the pixels yourself.** Every constraint in the snippet above could
be replaced by arithmetic if you were willing to recompute the scale by hand
and read a text measurement out of the layout. That code is correct once, for
one dataset at one size, and it is silently wrong afterward. The reason to
express a relation as a relation is that it stays true.

**Restructuring the tree instead.** Many relations can be forced into an
operator by rearranging the children until the relation happens to be what the
operator does. The result is a tree whose nesting no longer describes the
picture, and it gets harder to read with every relation added.

**One unified concept.** Bluefish made alignment a single thing that was both a
container and a relation. It reads well in a slide and it splits badly in code.
A node that is both has to answer the bounding box question twice, once as a
container with its own box and once as a relation whose box is whatever its
satisfied children turn out to occupy, and both answers need special cases.
GoFish keeps the two surfaces apart for that reason, and unifies the machinery
underneath instead, which is where a unification actually pays.

**All constraints, no operators.** The other extreme is dropping operators and
expressing everything as relations. It is expressible, and it is miserable to
write, because the overwhelmingly common case is a family of similar children
and it would cost two constraints every time. A grammar that makes the common
case long in order to make the rare case uniform has optimized the wrong thing.

## Where next

- [How to pick a layout operator](/js/api/howto/operators) for `spread`,
  `stack` and `scatter` side by side.
- [constrain](/js/api/constraints/constrain) for every constraint, including
  `position` for data-driven placement and `nest` for padding.
- [Pictorial Charts](/js/tutorials/pictorial-charts) for the full version of
  the example above.
