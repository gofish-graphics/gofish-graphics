# Calendar

Partitions of the time line into calendar cells: seconds, minutes, hours,
days, days of the week, weeks, months, quarters and years, over a time column (see
[`Schema.time`](/js/api/core/schema)). A Calendar value has two uses. It bins
a time column's rows into cells, as the partition of
[`field(name).bin(...)`](/js/api/operators/spread#field-expression-pipeline).
And it names a level of an axis, an entry of the `levels` of an axis in the
`axes` option of [`chart`](/js/api/core/chart): a time axis draws one row of
labels per level.

::: gofish example:hourly-temperature-line
:::

## Signature

```ts
Calendar.second;
Calendar.minute;
Calendar.hour;
Calendar.day;
Calendar.weekday; // the day of the week, from Monday
Calendar.weekday({ start: "sunday" });
Calendar.week; // weeks start on Monday
Calendar.week({ start: "sunday" });
Calendar.month;
Calendar.quarter;
Calendar.year;

Calendar.month.every(3); // cells of 3 months
Calendar.quarter.format(fn); // custom labels, fn: (cell) => string
Calendar.month.every(3).format(fn);

field("date").bin(Calendar.month); // the month of the year
field("date").bin(Calendar.weekday); // the day of the week
field("date").bin([Calendar.year, Calendar.month]); // each month of each year
field("date").bin(Calendar.year).bin(Calendar.month); // the months of each year
chart(data, { axes: { x: { levels: [Calendar.month, Calendar.year] } } });
```

## Parameters

| Parameter | Type                             | Description                                                                                                             |
| --------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `n`       | `number`                         | `.every(n)`: how many units one cell spans. A whole number, 1 or more. Default `1`.                                     |
| `start`   | `"monday" \| "sunday"`           | `Calendar.week({ start })`, `Calendar.weekday({ start })`: the first day of a week. Default `"monday"`, as in ISO 8601. |
| `fn`      | `(cell: CalendarCell) => string` | `.format(fn)`: the label of each cell. Default: the level's label (see Behavior).                                       |

A `CalendarCell` has these fields. The calendar fields are those of the
cell's start in the zone of the axis's column, named like pandas' and
polars' `dt` fields.

| Field     | Type           | Description                                                                                |
| --------- | -------------- | ------------------------------------------------------------------------------------------ |
| `start`   | `number`       | The instant the cell starts, in epoch milliseconds.                                        |
| `end`     | `number`       | The instant the next cell starts.                                                          |
| `unit`    | `CalendarUnit` | The cell's level: `"second"`, `"minute"`, ... `"year"`.                                    |
| `year`    | `number`       | The year.                                                                                  |
| `quarter` | `number`       | The quarter, `1` to `4`.                                                                   |
| `month`   | `number`       | The month, `1` to `12`.                                                                    |
| `week`    | `number`       | The ISO 8601 week number.                                                                  |
| `day`     | `number`       | The day of the month.                                                                      |
| `weekday` | `number`       | The ISO 8601 day of the week, `1` (Monday) to `7` (Sunday), whatever day a week starts on. |
| `hour`    | `number`       | The hour, `0` to `23`.                                                                     |
| `minute`  | `number`       | The minute.                                                                                |
| `second`  | `number`       | The second.                                                                                |

A part of a cycle (a month of the year, see Bins) has no one place on the
time line: its `start`, `end` and `week`, and the fields of its cycle and
above (`year` for a month of the year), are `NaN`. Its `weekday` is `NaN`
too, except for a part of a week (a weekday, or an hour of a weekday), whose
`day`, `month`, `quarter` and `year` are `NaN` instead. Its other fields are
those of its first instant (`day` is `1` for a month).

## Behavior

**Cells.**

- A cell starts where the calendar of the column's zone says the level
  starts: a day at local midnight, a month on its first day, a week on its
  first day. A day in a zone with daylight saving can last 23 or 25 hours.
- `.every(n)` counts from the level above: `Calendar.month.every(3)` starts
  its cells in January, April, July and October, `Calendar.hour.every(6)` at
  0, 6, 12 and 18 o'clock, and `Calendar.day.every(2)` on days 1, 3, 5, ... of
  each month, so the last cell of a 31-day month is one day long.
  `Calendar.year.every(5)` starts on years divisible by 5. Weeks count from
  the week of 1970-01-01.
- `Calendar.quarter` is months in steps of 3, labeled `Q1` to `Q4`.
- `Calendar.weekday` is days, labeled by the day of the week (`Mon`). It has
  no steps: `Calendar.weekday.every(n)` is an error.
- `.format(fn)` returns the same partition with `fn` as its label. It keeps
  the step, and `.every(n)` keeps the format, so `Calendar.month.every(3).format(fn)`
  and `Calendar.month.format(fn).every(3)` are the same partition.
- A partition with a `.format` is JS-only: a function has no wire form, so
  serializing it (to Python or the IR) is an error that names the entry.

**Bins.**

- A level binned alone is a part of the next larger level, a cycle: all
  the cells with the same part are one cell, in any year. Every part is a
  cell, in the cycle's order, whatever the data holds.

  | Level alone        | Cells                      | Labels                 |
  | ------------------ | -------------------------- | ---------------------- |
  | `Calendar.second`  | the 60 seconds of a minute | `00` to `59`           |
  | `Calendar.minute`  | the 60 minutes of an hour  | `00` to `59`           |
  | `Calendar.hour`    | the 24 hours of a day      | `12 AM` to `11 PM`     |
  | `Calendar.day`     | the 31 days of a month     | `1` to `31`            |
  | `Calendar.weekday` | the 7 days of a week       | `Mon` to `Sun`         |
  | `Calendar.month`   | the 12 months of a year    | `Jan` to `Dec`         |
  | `Calendar.quarter` | the 4 quarters of a year   | `Q1` to `Q4`           |
  | `Calendar.week`    | weeks on the time line     | its first day, `Jan 1` |
  | `Calendar.year`    | years on the time line     | `2024`                 |

  A weekday's days start on the week's first day: with
  `Calendar.weekday({ start: "sunday" })` they are `Sun` to `Sat`. A week is
  a part of nothing (weeks do not nest in months or years), and nothing
  holds a year, so they stay on the time line. A step counts from
  the level above: `Calendar.month.every(3)` alone is 4 cells, starting in
  January, April, July and October.

- A list is a product, `[Calendar.year, Calendar.month]`: one cell where
  one cell of each level meets one of the next, each level after the first
  a part of the one before it. Its cells are the finest level's cells (the
  June of 2015), labeled by every level at once (`Jun 2015`, `Q2 2015`,
  `Jun 15, 2015`). With a first level on the time line, the cells are every
  cell in the range of the data, the empty ones too, and each has one
  region on the time line. With a first level that is a part,
  `[Calendar.month, Calendar.day]`, the cells are the parts of a cycle (the
  366 days of a year).
- A weekday is a part of a week that starts on the same day, so
  `[Calendar.week, Calendar.weekday]` is each day, labeled `Mon, Jan 1`. A
  weekday is a day, so an hour is a part of it:
  `[Calendar.weekday, Calendar.hour]` is the 168 hours of a week.
- A second `.bin(...)` splits each cell of the first, a chain:
  `.bin(Calendar.year).bin(Calendar.month)` gives the months of each year.
  On the time line, the next bin must be finer, and a cell it shares with
  two cells of the bin before it is cut in two (a week across New Year). On
  a cycle, the next bin must be a part of the one before it, as in a
  product. Each cell keeps the cell it was split from, and an axis over the
  key shows one level per bin (a month level, then a year level).
- A product's levels must be in order, at a step of 1 before the last, with
  default labels: `[Calendar.year, Calendar.day]` is an error (a day is a
  part of a month), and so are `[Calendar.month]`, a numeric bin, a level
  with a `.format`, and a weekday of a week that starts on another day. A chain whose next bin is not finer is an error.
- A part of a cycle has no one region on the time line, so
  [`partition`](/js/api/operators/partition) over one is an error that names
  the product and the chain.

**Levels of a time axis.**

- A time axis is continuous: every tick and label sits where the axis's
  scale puts its instant.
- The axis's domain is rounded outward to the cells of the inner row, as a
  numeric axis rounds its domain to its tick step, so both ends of the axis
  are ticks.
- Each row is one partition. Its ticks are the starts of its cells inside
  the domain. Each label is centered on its cell's start tick. An outer
  row's first cell can start before the domain: its label is centered on
  the first tick, under the inner row's first label. The labels at the ends
  may reach past the axis, as a numeric axis's do.
- The axis labels every tick, as a numeric axis does.
- Rows need not nest: `[Calendar.week, Calendar.month]` is valid.
- The first row sits next to the axis line, and each further row sits past
  the one before it. An outer-row tick that falls between inner ticks is longer.
- By default the axis has two rows. The inner row gives about 10
  ticks over the data, as a numeric axis does: it is the level and step
  whose cells are nearest in length to a tenth of the data's span, out of
  seconds and minutes (1, 5, 15, 30), hours (1, 3, 6, 12), days (1, 2),
  months (1, 2, 3), and years (1, 2, 5, 10, 20, 50, ...). The
  outer row is the inner row's parent: minutes for seconds, hours for
  minutes, days for hours, months for days and weeks, weeks for weekdays
  (with the same first day), years for months and quarters. Year has no parent, so a year row is the only row.
- In `levels`, a Calendar value names a row's partition, and the outer row
  follows the inner row as named. `false` hides a row: its ticks and labels
  are not drawn, and the domain is still rounded to the inner row's cells.
  On the outermost axis of its dimension, Calendar values past the rows add
  rows.
- A domain of one instant spans the day that holds it.
- Default labels come from `Intl.DateTimeFormat` in English (`en-US`),
  whatever the runtime's locale: `12 AM` for an hour, `Feb 29` for a day or
  week, `Mon` for a weekday, `Jan` for a month, `2024` for a year. A locale option is
  [#1098](https://github.com/gofish-graphics/gofish-graphics/issues/1098).
- `label.angle` does not rotate the labels of a time axis.
- In a faceted chart, the rows of the time axes inside the facets are the
  first levels of the dimension, and the facets' category level comes after
  them.

## Example

```ts
chart(prices, {
  schema: { date: Schema.time() },
  axes: {
    x: {
      levels: [
        Calendar.quarter.format(
          (cell) =>
            `Q${cell.quarter} '${String(cell.year % 100).padStart(2, "0")}`
        ),
        false, // no year row
      ],
    },
    y: true,
  },
})
  .flow(scatter({ by: "date", x: "date", y: "price" }))
  .mark(line())
  .render(container, { w: 560, h: 200 });
```

```ts
chart(weather, { schema: { date: Schema.time() }, axes: true })
  .flow(spread({ by: field("date").bin(Calendar.month), dir: "x" }))
  .mark(rect({ h: field("precipitation").mean() }));
```

::: gofish example:seattle-rain-by-month-of-the-year
:::
