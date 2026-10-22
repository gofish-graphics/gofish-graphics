---
title: Expressions
---

# Expressions

An expression is a value built from field reads, source reads, literals and a
fixed set of operations, written as data instead of as a function, so it
crosses to JavaScript and runs in the browser. The vocabulary is polars':
comparisons, arithmetic and boolean logic with Python's operators,
`when/then/otherwise`, `clip`, `fill_null`, `floor`, `round` and `concat_str`.
An expression is valid wherever a channel value is, and as a
[`filter`](/python/api/operators/filter) predicate.

A **source** is a clock, a piece of state or an input: `timer`, `signal`,
`wheel`, `pointer`, `drag` and `click`. Python declares it, and the browser
runs it.

```python
from gofish import chart, drag, field, rect, spread, when

dr = drag()
cut = dr.y.clip(0, 95).fill_null(60)

(
    chart(bars)
    .flow(spread(by="cat", dir="x"))
    .mark(
        rect(
            h="count",
            fill=when(field("count").sum() > cut).then("#d62728").otherwise("#6b9bd1"),
        )
    )
    .layer(rect(y=cut, h=3, w=500, fill="#333"))
    .render(w=500, h=360)
)
```

## Signature

```python
when(condition).then(value)            # .when(c).then(v) ... .otherwise(v)
concat_str(*parts)

a > b   a >= b   a < b   a <= b   a == b   a != b
a + b   a - b    a * b   a / b
a & b   a | b    ~a
expr.clip(lo, hi)   expr.fill_null(value)   expr.floor()   expr.round()

timer(domain=None, duration=None, step=None, loop=None, playing=None, at=None)
signal(init)
wheel(range, initial=None, domain=None, round=None, sensitivity=None)
pointer()
drag()
click()
```

## Leaves

| Leaf                                         | Value                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `field(name)`                                | The field at the datum. With an aggregate (`field("count").sum()`), the fold of the mark's rows.   |
| a literal                                    | A `str`, number, `bool` or `None`. Inside an expression a string is a literal, never a field name. |
| `timer(...)`, `signal(...)`, `wheel(...)`    | The source's current value. A source of one value is an expression itself: `year.floor()`.         |
| `pointer().over`                             | True on the mark under the pointer.                                                                |
| `pointer().field(name)`                      | That field of the mark under the pointer, or `None` when no mark is under it.                      |
| `drag().x`, `.y`, `.x0`, `.y0`, `.dx`, `.dy` | The drag's position, start, and movement, in data units, or `None` before the first drag.          |
| `drag().active`                              | True while a drag is in progress.                                                                  |

## Python operators

As in polars, `==` builds an expression rather than comparing, so an
expression has no truth value: `if expr:` and `expr and other` raise a
`TypeError` that points to `when(...)` and to `&`, `|` and `~`. For the same
reason an expression cannot be a dict key or a set member. To compare two
`field(...)` accessors' wire forms, compare `dict(a) == dict(b)`.

## Null

A `None` operand gives `None`, as in polars, with three exceptions:
`fill_null` replaces it, `&` and `|` use three-valued logic, and a `when`
branch whose condition is `None` does not hold.

## Tier

Where an expression is evaluated is inferred from the channel, by the rule the
[JavaScript page](/js/api/expressions#tier) gives. On a paint channel whose
value reaches the screen as written, it is evaluated at paint, and a change to
a source it reads patches paint. Anywhere else it lays the chart out again.
There is no `live()` in Python.

## Sources in the kernel

A Python callback that the browser calls, such as a
[`derive`](/python/api/operators/derive), may call a source of one value to
read it:

```python
bins = wheel(range=[3, 40], initial=12, round=True)

chart(penguins).flow(
    derive(lambda rows: bin_rows(rows, bins())),
    spread(by="bin", dir="x"),
).mark(rect(h="count"))
```

The browser ships the source's current value with each call, and lays the
chart out again when a source the callback read changes. Each change is a
round trip to the kernel. Calling a source while building the spec raises,
because the chart would never see it change. A pointer, a drag and a click
have several values, so a callback cannot call them.

## Serialization

An expression crosses the frontend IR as `ExprIR`, and each source it reads is
declared once in the document's `sources` table, keyed by the source object.
