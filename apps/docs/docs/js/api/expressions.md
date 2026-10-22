---
title: Expressions
---

# Expressions

An expression is a value built from field reads, source reads, literals and a
fixed set of operations, written as data instead of as a function. The
vocabulary is polars': comparisons, arithmetic, boolean logic,
`when/then/otherwise`, `clip`, `fillNull`, `floor`, `round` and `concatStr`.
An expression is also a function of the datum, so it is valid anywhere a
function accessor is: a channel, a [`filter`](/js/api/operators/filter)
predicate, `time.transition({ at })`.

```ts
const dr = drag();
const cut = dr.y.clip(0, 95).fillNull(60);

chart(bars)
  .flow(spread({ by: "cat", dir: "x" }))
  .mark(
    rect({
      h: "count",
      fill: when(field("count").sum().gt(cut))
        .then("#d62728")
        .otherwise("#6b9bd1"),
    })
  )
  .layer(rect({ y: cut, h: 3, w: 500, fill: "#333" }))
  .render(container, { w: 500, h: 360 });
```

## Signature

```ts
when(condition).then(value)            // .when(c).then(v) ... .otherwise(v)
concatStr(...parts)

expr.gt(other)   expr.gtEq(other)   expr.lt(other)   expr.ltEq(other)
expr.eq(other)   expr.neq(other)
expr.add(other)  expr.sub(other)    expr.mul(other)  expr.div(other)
expr.and(other)  expr.or(other)     expr.not()
expr.clip(lo, hi)   expr.fillNull(value)   expr.floor()   expr.round()
```

## Leaves

| Leaf                                         | Value                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `field(name)`                                | The field at the datum. With an aggregate (`field("count").sum()`), the fold of the mark's rows.     |
| a literal                                    | A string, number, boolean or `null`. Inside an expression a string is a literal, never a field name. |
| `timer(...)`, `signal(...)`, `wheel(...)`    | The source's current value. A source of one value is an expression itself: `year.floor()`.           |
| `pointer().over`                             | True on the mark under the pointer.                                                                  |
| `pointer().field(name)`                      | That field of the mark under the pointer, or `null` when no mark is under it.                        |
| `drag().x`, `.y`, `.x0`, `.y0`, `.dx`, `.dy` | The drag's position, start, and movement, in data units, or `null` before the first drag.            |
| `drag().active`                              | True while a drag is in progress.                                                                    |

## Null

A `null` operand gives `null`, as in polars, with three exceptions: `fillNull`
replaces it, `and` and `or` use three-valued logic (`false` wins over `null`
in `and`, `true` in `or`), and a `when` branch whose condition is `null` does
not hold. A `field` read over a mark whose rows disagree on the field is an
error; fold the rows with an aggregate.

## Tier

Where an expression is evaluated is inferred from the channel, by one rule.
On a paint channel (`fill`, `stroke`, `strokeWidth`,
`opacity`, `fillOpacity`, `mixBlendMode`, `strokeDasharray`, `filter`, or text
content) whose value reaches the screen as written (a raw channel, or a color
channel whose every possible value is a literal color), it is evaluated at
paint, at the mark's datum, and a change to a source it reads patches paint.
Anywhere else it is an accessor of the pipeline, and a change to a source it
reads lays the chart out again. A JavaScript closure is
opaque to the rule, so it keeps [`live(fn)`](/js/reactivity) to say it is paint.

## Serialization

An expression crosses the frontend IR as `ExprIR`, and each source it reads is
declared once in the document's `sources` table. A source made with a
JavaScript function option (a drag's `hitTest`) has no serialized form.
