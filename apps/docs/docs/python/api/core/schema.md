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
Schema.time()                        # HasCalendar, in UTC
Schema.time(zone=zone)               # HasCalendar, in the time zone `zone`
Schema.unit(unit)                    # HasUnit, in the unit `unit`
```

A column type is a set of classes. Each builder method adds one class, and
`.diverging()` needs the order that `.ordered(...)` gives, because a midpoint
is a point along an order.

| Builder                  | Class         | Meaning                                                |
| ------------------------ | ------------- | ------------------------------------------------------ |
| `Schema.ordered(levels)` | `HasOrder`    | The column's values are `levels`, in this order.       |
| `.diverging()`           | `HasMidpoint` | The order has a midpoint, a point along it. See below. |
| `Schema.time()`          | `HasCalendar` | The column's values are instants, read on a calendar.  |
| `Schema.unit(unit)`      | `HasUnit`     | The column's values are amounts in the unit `unit`.    |

## Parameters

| Parameter  | Type               | Description                                                                                                        |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `levels`   | `list[str \| int]` | Every value the column takes, first to last.                                                                       |
| `midpoint` | `float`            | Where the midpoint lies along the order, from 0 (before the first level) to `n` (after the last). Default `n / 2`. |
| `zone`     | `str`              | The IANA time zone the column's instants are read in, e.g. `"America/New_York"`. Default `"UTC"`.                  |
| `unit`     | `str`              | The name of the unit, e.g. `"USD"` or `"mm"`. Two units are the same when their names are equal.                   |

## Behavior

**`HasOrder`.**

- Every `by` split over the column (`spread`, `stack`, `group`, `scatter`, ...)
  lays its groups out in the order of `levels`, not in order of first
  appearance. A `field(...).sort(...)` or `.reverse()` on the `by` reorders
  from there.
- A categorical color scale whose values all come from the column lists its
  legend in the same order.
- A value that is not in `levels` is an error that names the column and the
  value. Add it to the levels, filter those rows out, or, if a `derive`
  changed the values, give the column its type with `derive(fn, schema={...})`.

**`HasMidpoint`.**

- `midpoint` counts levels from the start of the order. Level `i` (counting
  from 0) spans `i` to `i + 1`, so 0 is the start of the first level, `n` is
  the end of the last, and 2.25 is a quarter of the way into the third level.
- The default, `n / 2`, is the middle of the middle level when the number of
  levels is odd, and the boundary between the two middle levels when it is
  even.
- A `midpoint` that is not a finite number, or that is below 0 or above `n`,
  is an error from `.diverging()`. The message names the midpoint, the range
  `0..n`, and the levels. `chart` checks a column-type record passed as is
  (the wire form) the same way, with the same message.
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

**`HasCalendar`.**

- Each value becomes epoch milliseconds (UTC) when the chart applies its
  schema. A value may be an ISO 8601 string, a datetime, or epoch
  milliseconds.
- A date alone (`"2024-03-05"`) is the start of that day in `zone`. A
  date-time with an offset (`"2024-03-05T14:30:00Z"`) is that instant. A
  date-time without one (`"2024-03-05T14:30"`) is that wall-clock time in
  `zone`. Any other value is an error that names the column and the value.
- A pandas, polars or pyarrow datetime column is a time column without a
  schema entry. A tz-aware datetime is an instant, read in its own time
  zone. A naive datetime or a date is a wall-clock time, like a string
  without an offset: it is read in the `zone` of the column's
  `Schema.time()` entry, or in UTC without one. Strings and numbers are
  never taken as times.
- An instant has no zero.
- An axis over the column is a time axis. Its ticks and labels are
  calendar cells in rows: by default the level that gives about 10 ticks,
  and below it that level's parent. Its domain is rounded outward to the
  cells of its first row. See [`Calendar`](/python/api/core/calendar) for the rows.
- An unknown `zone` is an error. Two time columns on one axis must have the
  same zone.
- The unit of a time column is an instant, so two time columns (a start and
  an end) share an axis.

**`HasUnit`.**

- Columns in the same unit share an axis and its scale. Two columns in
  different units on one axis are an error that names the axis, both units,
  and the columns in each.
- A column with no declared unit has an unknown unit. It shares an axis with
  any column. When it meets a column in a declared unit, it takes that unit
  for the whole chart, so meeting another unit anywhere else is an error.
- A column's unit is the same everywhere in a chart: columns with the same
  name have the same unit.
- When x and y have the same unit, they get one scale: one data unit is the
  same length on both axes.
- The unit never titles an axis. An axis is titled by the names of its
  columns, joined with commas.
- `.count()` and `.distinct()` are in the unit `"count"`. The edges of
  `bin(field)` (`start`, `end`, `size`) are amounts of `field`: they title
  their axis as `field` does and share its unit. Its `count` is in the unit
  `"count"`.

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

Two columns in the same unit share one scale on x and y, so a circle in the
data stays a circle:

::: gofish example:sunflower-equal-scale hidden
:::

```python
chart(
    sunflower,
    schema={"x": Schema.unit("plane"), "y": Schema.unit("plane")},
).flow(scatter(x="x", y="y")).mark(circle(r=4, fill="i"))
```

A column of date strings is a time with `Schema.time()`:

::: gofish example:daily-price-line hidden
:::

```python
chart(prices, schema={"date": Schema.time()}, axes=True).flow(
    scatter(by="date", x="date", y="price")
).mark(line(stroke="steelblue", stroke_width=2))
```
