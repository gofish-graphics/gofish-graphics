# Schema

Declares the types of a chart's columns. Pass a record of column types as the
`schema` option of [`chart`](/js/api/core/chart).

::: gofish example:diverging-likert-chart
:::

## Signature

```ts
Schema.ordered(levels); // HasOrder
Schema.ordered(levels).diverging(); // HasOrder and HasMidpoint
Schema.ordered(levels).diverging({ midpoint }); // HasOrder and HasMidpoint
Schema.time(); // HasCalendar, in UTC
Schema.time({ zone }); // HasCalendar, in the time zone `zone`
```

A column type is a set of classes. Each builder method adds one class, and
`.diverging()` exists only after `.ordered(...)`, because a midpoint is a
point along an order.

| Builder                  | Class         | Meaning                                                |
| ------------------------ | ------------- | ------------------------------------------------------ |
| `Schema.ordered(levels)` | `HasOrder`    | The column's values are `levels`, in this order.       |
| `.diverging()`           | `HasMidpoint` | The order has a midpoint, a point along it. See below. |
| `Schema.time()`          | `HasCalendar` | The column's values are instants, read on a calendar.  |

## Parameters

| Parameter  | Type                   | Description                                                                                                        |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `levels`   | `(string \| number)[]` | Every value the column takes, first to last.                                                                       |
| `midpoint` | `number`               | Where the midpoint lies along the order, from 0 (before the first level) to `n` (after the last). Default `n / 2`. |
| `zone`     | `string`               | The IANA time zone the column's instants are read in, e.g. `"America/New_York"`. Default `"UTC"`.                  |

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
- A `midpoint` that is not a finite number, or that is below 0 or above `n`,
  is an error from `.diverging()`. The message names the midpoint, the range
  `0..n`, and the levels. `chart` checks a column-type record passed as is
  (the wire form) the same way, with the same message.
- A [`stack`](/js/api/operators/stack) whose `by` column has `HasMidpoint` puts its 0 at
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
  schema. A value may be an ISO 8601 string, a `Date`, or epoch milliseconds.
- A date alone (`"2024-03-05"`) is the start of that day in `zone`. A
  date-time with an offset (`"2024-03-05T14:30:00Z"`) is that instant. A
  date-time without one (`"2024-03-05T14:30"`) is that wall-clock time in
  `zone`. Any other value is an error that names the column and the value.
- A column whose values are JS `Date` objects is a time column in UTC
  without a schema entry. Strings and numbers are never taken as times.
- An instant has no zero.
- An axis over the column is a time axis. Its domain is the data's own,
  not rounded, and its ticks and labels are calendar cells in rows: by
  default the finest level whose labels fit, and below it that level's
  parent. See [`Calendar`](/js/api/core/calendar) for the rows.
- An unknown `zone` is an error. Two time columns on one axis must have the
  same zone.

## Example

```ts
const LEVELS = [
  "Strongly disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly agree",
];

chart(survey, {
  schema: { response: Schema.ordered(LEVELS).diverging() },
  axes: true,
})
  .flow(
    spread({ by: "question", dir: "y" }),
    stack({ by: "response", dir: "x" })
  )
  .mark(rect({ w: "count", fill: "response" }))
  .render(container, { w: 640, h: 300 });
```

A population pyramid is a two-level diverging order, with positive counts on
both sides:

```ts
chart(population, {
  schema: { sex: Schema.ordered(["Women", "Men"]).diverging() },
})
  .flow(
    spread({ by: field("age").reverse(), dir: "y", spacing: 1 }),
    stack({ by: "sex", dir: "x" })
  )
  .mark(rect({ w: "people", fill: "sex" }));
```

::: gofish example:population-pyramid hidden
:::

A column of date strings is a time with `Schema.time()`:

```ts
chart(prices, { schema: { date: Schema.time() }, axes: true })
  .flow(scatter({ by: "date", x: "date", y: "price" }))
  .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
  .render(container, { w: 560, h: 200 });
```

::: gofish example:daily-price-line hidden
:::
