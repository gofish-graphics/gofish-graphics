# Calendar

Partitions of the time line into calendar cells: seconds, minutes, hours,
days, weeks, months, quarters and years. A time axis draws one row of labels
per partition. Pass them as the `rows` of an axis in the `axes` option of
[`chart`](/js/api/core/chart), over a time column (see
[`Schema.time`](/js/api/core/schema)).

::: gofish example:hourly-temperature-line
:::

## Signature

```ts
Calendar.second;
Calendar.minute;
Calendar.hour;
Calendar.day;
Calendar.week; // weeks start on Monday
Calendar.week({ start: "sunday" });
Calendar.month;
Calendar.quarter;
Calendar.year;

Calendar.month.every(3); // cells of 3 months
Calendar.quarter.format(fn); // custom labels, fn: (cell) => string
Calendar.month.every(3).format(fn);

chart(data, { axes: { x: { rows: [Calendar.month, Calendar.year] } } });
```

## Parameters

| Parameter | Type                             | Description                                                                              |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `n`       | `number`                         | `.every(n)`: how many units one cell spans. A whole number, 1 or more. Default `1`.      |
| `start`   | `"monday" \| "sunday"`           | `Calendar.week({ start })`: the first day of a week. Default `"monday"`, as in ISO 8601. |
| `fn`      | `(cell: CalendarCell) => string` | `.format(fn)`: the label of each cell. Default: the level's label (see Behavior).        |
| `rows`    | `TimeRowOption[]`                | An axis's label rows, inner row first. Each is a Calendar value.                         |

A `CalendarCell` has these fields. The calendar fields are those of the
cell's start in the zone of the axis's column, named like pandas' and
polars' `dt` fields.

| Field     | Type           | Description                                             |
| --------- | -------------- | ------------------------------------------------------- |
| `start`   | `number`       | The instant the cell starts, in epoch milliseconds.     |
| `end`     | `number`       | The instant the next cell starts.                       |
| `unit`    | `CalendarUnit` | The cell's level: `"second"`, `"minute"`, ... `"year"`. |
| `year`    | `number`       | The year.                                               |
| `quarter` | `number`       | The quarter, `1` to `4`.                                |
| `month`   | `number`       | The month, `1` to `12`.                                 |
| `week`    | `number`       | The ISO 8601 week number.                               |
| `day`     | `number`       | The day of the month.                                   |
| `hour`    | `number`       | The hour, `0` to `23`.                                  |
| `minute`  | `number`       | The minute.                                             |
| `second`  | `number`       | The second.                                             |

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
- `.format(fn)` returns the same partition with `fn` as its label. It keeps
  the step, and `.every(n)` keeps the format, so `Calendar.month.every(3).format(fn)`
  and `Calendar.month.format(fn).every(3)` are the same partition.
- A partition with a `.format` is JS-only: a function has no wire form, so
  serializing it (to Python or the IR) is an error that names the row.

**Rows.**

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
- Without `rows`, the axis has two rows. The inner row gives about 10
  ticks over the data, as a numeric axis does: it is the level and step
  whose cells are nearest in length to a tenth of the data's span, out of
  seconds and minutes (1, 5, 15, 30), hours (1, 3, 6, 12), days (1, 2),
  months (1, 2, 3), and years (1, 2, 5, 10, 20, 50, ...). The
  outer row is the inner level's parent: minutes for seconds, hours for
  minutes, days for hours, months for days and weeks, years for months and
  quarters. Year has no parent, so a year row is the only row.
- A domain of one instant spans the day that holds it.
- Default labels come from `Intl.DateTimeFormat` in English (`en-US`),
  whatever the runtime's locale: `12 AM` for an hour, `Feb 29` for a day or
  week, `Jan` for a month, `2024` for a year. A locale option is
  [#1098](https://github.com/gofish-graphics/gofish-graphics/issues/1098).
- `labelAngle` does not rotate the labels of a time axis.
- In a faceted chart, `rows` applies to the time axes inside the facets.
  The facets' category axis on the same dimension ignores it.
- `rows` on a chart with no time axis on that dimension is an error.

## Example

```ts
chart(prices, {
  schema: { date: Schema.time() },
  axes: {
    x: {
      rows: [
        Calendar.quarter.format(
          (cell) =>
            `Q${cell.quarter} '${String(cell.year % 100).padStart(2, "0")}`
        ),
      ],
    },
    y: true,
  },
})
  .flow(scatter({ by: "date", x: "date", y: "price" }))
  .mark(line())
  .render(container, { w: 560, h: 200 });
```
