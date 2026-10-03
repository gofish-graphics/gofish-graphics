# Schema

Declares the types of a chart's columns. Pass a dict of column types as the
`schema` keyword of [`chart`](/python/api/core/chart).

::: gofish example:diverging-likert-chart hidden
:::

```python
from gofish import chart, spread, stack, rect, Schema

LEVELS = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]

chart(
    survey,
    schema={"response": Schema.ordered(LEVELS).diverging()},
    axes=True,
).flow(
    spread(by="question", dir="y"),
    stack(by="response", dir="x"),
).mark(rect(w="count", fill="response")).render(w=640, h=300)
```

## Signature

```python
Schema.ordered(levels)               # HasOrder
Schema.ordered(levels).diverging()   # HasOrder and HasMidpoint
Schema.ordered(levels).diverging(midpoint=m)   # HasOrder and HasMidpoint
```

A column type is a set of classes. Each builder method adds one class, and
`.diverging()` needs the order that `.ordered(...)` gives, because a midpoint
is a point along an order.

| Builder                  | Class         | Meaning                                                |
| ------------------------ | ------------- | ------------------------------------------------------ |
| `Schema.ordered(levels)` | `HasOrder`    | The column's values are `levels`, in this order.       |
| `.diverging()`           | `HasMidpoint` | The order has a midpoint, a point along it. See below. |

## Parameters

| Parameter  | Type               | Description                                                                                                        |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `levels`   | `list[str \| int]` | Every value the column takes, first to last.                                                                       |
| `midpoint` | `float`            | Where the midpoint lies along the order, from 0 (before the first level) to `n` (after the last). Default `n / 2`. |

## Behavior

**`HasOrder`.**

- Every `by` split over the column (`spread`, `stack`, `group`, `scatter`, ...)
  lays its groups out in the order of `levels`, not in order of first
  appearance. A `field(...).sort(...)` or `.reverse()` on the `by` reorders
  from there.
- A categorical color scale whose values all come from the column lists its
  legend in the same order.
- A value that is not in `levels` is an error that names the column and the
  value. Add it to the levels, or filter those rows out.

**`HasMidpoint`.**

- `midpoint` counts levels from the start of the order. Level `i` (counting
  from 0) spans `i` to `i + 1`, so 0 is the start of the first level, `n` is
  the end of the last, and 2.25 is a quarter of the way into the third level.
- The default, `n / 2`, is the middle of the middle level when the number of
  levels is odd, and the boundary between the two middle levels when it is
  even.
- A `midpoint` below 0, above `n`, or not finite is an error from
  `.diverging()`.
- A [`stack`](/python/api/operators/stack) whose `by` column has `HasMidpoint` puts its 0 at
  the midpoint instead of at its first part's start. A stack laid out in the
  reverse of the order keeps the same levels on each side.
- The midpoint comes from the order, not from the data: a stack with no part
  for some level keeps the same midpoint. When the midpoint falls inside a
  level that a stack has no part for, the 0 is the boundary between that
  stack's parts on either side. So the stacks of a `spread` line up on their
  midpoints.
- The parts of a centered stack must be nonnegative. A negative value is an
  error.
- An axis over a centered stack labels each tick with its distance from the
  midpoint (`60 40 20 0 20 40 60`).
- The parts must follow the column's order, or its reverse. Reordering them
  some other way is an error.

## Example

A population pyramid is a two-level diverging order, with positive counts on
both sides:

::: gofish example:population-pyramid hidden
:::

```python
chart(
    population,
    schema={"sex": Schema.ordered(["Women", "Men"]).diverging()},
).flow(
    spread(by=field("age").reverse(), dir="y", spacing=1),
    stack(by="sex", dir="x"),
).mark(rect(w="people", fill="sex"))
```
