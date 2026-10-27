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
Schema.time()                        # HasCalendar and HasUnit (the instant), in UTC
Schema.time(zone=zone)               # the same, in the time zone `zone`

Unit(name)                           # a unit definition
Unit(name).summable()                # a unit whose amounts add up (CanAdd)

{"name": name, "unit": unit}         # a column record: HasQuantity and HasUnit
unit                                 # a Unit: the same as {"unit": unit}
"km²"                                # a unit's name: the same as {"unit": "km²"}
```

A column type is a set of classes. Each builder method adds the classes its
row below lists, and `.diverging()` needs the order that `.ordered(...)`
gives, because a midpoint is a point along an order.

A column of amounts is declared with a column record, or with one of its two
shorthands. A record takes the keys `"name"` and `"unit"`. Any other key
raises a `TypeError`. `"unit"` is a `Unit` or a unit's name. A `Unit` is
declared once and used by every column in it, so its columns agree on what
it can do:

```python
from gofish import Unit

USD = Unit("USD").summable()
Celsius = Unit("°C")

chart(
    ledger,
    schema={
        "balance": {"name": "Balance", "unit": USD},
        "revenue": USD,
        "area": "km²",
        "temp": {"unit": Celsius},
    },
)
```

| Entry                     | Class                    | Meaning                                                 |
| ------------------------- | ------------------------ | ------------------------------------------------------- |
| `Schema.ordered(levels)`  | `HasOrder`               | The column's values are `levels`, in this order.        |
| `.diverging()`            | `HasMidpoint`            | The order has a midpoint, a point along it. See below.  |
| `Schema.time()`           | `HasCalendar`, `HasUnit` | The column's values are instants, read on a calendar.   |
| `{"unit": ...}`, a `Unit` | `HasUnit`                | The column's values are amounts in the unit.            |
| `Unit(name).summable()`   | `CanAdd`                 | The unit's amounts add up. See below.                   |
| `{"unit": ...}`, a name   | `HasUnit`                | The same, with no word on whether the amounts add up.   |
| `{"name": ...}`           | `HasQuantity`            | The column's values are amounts of the quantity `name`. |

## Parameters

| Parameter  | Type               | Description                                                                                                              |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `levels`   | `list[str \| int]` | Every value the column takes, first to last.                                                                             |
| `midpoint` | `float`            | Where the midpoint lies along the order, from 0 (before the first level) to `n` (after the last). Default `n / 2`.       |
| `zone`     | `str`              | The IANA time zone the column's instants are read in, e.g. `"America/New_York"`. Default `"UTC"`.                        |
| `unit`     | `Unit \| str`      | A record's unit: a `Unit`, or a unit's name, e.g. `"USD"` or `"mm"`. Two units are the same when their names are equal.  |
| `name`     | `str`              | A record's quantity, e.g. `"Pay"`. It titles the axis in place of the column's name. `Unit(name)` takes the unit's name. |

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
- A `Unit` and a unit's name are the same unit when their names are equal.
- When x and y have the same unit, they get one scale: one data unit is the
  same length on both axes.
- An axis title shows a declared unit after its quantities, in
  parentheses: `"Production Budget (USD)"`. The rule does not read the
  names, so a column named `"Flipper Length (mm)"` in `"mm"` titles
  `"Flipper Length (mm) (mm)"`. Declare its quantity
  (`{"name": "Flipper Length", "unit": Unit("mm")}`) or set the axis `title`
  for `"Flipper Length (mm)"`.
- `.count()` and `.distinct()` are in the unit `"count"`. The cells of
  `field(x).bin(...)` are amounts of `x`: a `partition` over them titles its
  axis as `x` does and shares its unit. Counts, `.normalize()` shares, and
  times add no unit to an axis title.

**`CanAdd`.**

- A `size` channel (`w`, `h`, ...), a [`stack`](/python/api/operators/stack), a
  [`treemap`](/python/api/operators/treemap) `size`, `field(x).sum()` and
  `field(x).normalize()` add up their values. Adding up values in a declared
  unit needs `CanAdd`: without it, it is an error that names the column and
  the unit, and says to declare the unit with `Unit(name).summable()`, or,
  for a time, to subtract a reference first.
- A time column never has `CanAdd`: two instants do not add up. Its
  difference does (`end - start` is a duration), and a mark with two
  positions (`x="start", x2="end"`) adds nothing.
- A column with no declared unit adds up without `.summable()`, and so does
  a column whose unit is a name alone (`"km²"`), since that says nothing
  about whether the amounts add up.
- A size channel adds up its rows whenever it reads a column, even when a
  group has one row. A pipeline op that folds the rows first
  (`field(x).mean()`, `.count()`) adds nothing.
- `.count()`, `.distinct()` and `.normalize()` shares add up.
- The difference of two amounts is in their unit (USD − USD is USD, °C − °C
  is °C), except the difference of two times, which is a duration. A size
  read from a time column is a duration too, never a time.
- `CanAdd` is the unit's, not the column's. A unit is its name, so two
  `Unit`s of one name in one chart's schema, or in the columns two charts
  of one figure draw, must agree on `.summable()`: a disagreement is an
  error that names both columns. A column whose unit is a name alone takes the `CanAdd` of a
  `Unit` of that name in the same chart; a stack of it also takes the
  `CanAdd` of a `Unit` of that name in another chart of the figure.
- A stack checks only the columns it adds, so a `start` column in days may
  share an axis with a stacked width in days.

**`HasQuantity`.**

- An axis is titled by the quantities of its columns, joined with commas, in
  the order they meet. A column's quantity is its `HasQuantity` name, or else
  the column's name.
- Columns of the same quantity have the same unit, like columns with the
  same name.
- `.sum()` and `.mean()` keep the column's quantity. `.count()` is the
  quantity `"count"`.
- An `axes` option's `title` replaces the inferred title.

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
    schema={"x": "plane", "y": "plane"},
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

Five summary columns of one quantity title their axis once:

```python
pay = {"name": "Pay", "unit": Unit("USD")}

chart(
    boxes,
    schema={"lo": pay, "q1": pay, "q3": pay, "hi": pay},
    axes=True,
).flow(spread(by="grade", dir="x")).mark(
    layer(
        [
            rect(w=1, y="lo", y2="hi"),
            rect(w=16, y="q1", y2="q3"),
        ]
    )
)  # y axis: "Pay (USD)"
```
