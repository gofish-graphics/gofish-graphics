# Calendar

Partitions of the time line into calendar cells: seconds, minutes, hours,
days, weeks, months, quarters and years. A time axis draws one row of labels
per partition. Pass them as the `"rows"` of an axis in the `axes` keyword of
[`chart`](/python/api/core/chart), over a time column (see
[`Schema.time`](/python/api/core/schema)).

::: gofish example:hourly-temperature-line hidden
:::

```python
from gofish import chart, scatter, line, Calendar

chart(readings, axes={"x": {"rows": [Calendar.hour.every(6), Calendar.day]}}).flow(
    scatter(by="time", x="time", y="temp")
).mark(line(stroke="steelblue", stroke_width=2)).render(w=560, h=200)
```

## Signature

```python
Calendar.second
Calendar.minute
Calendar.hour
Calendar.day
Calendar.week                    # weeks start on Monday
Calendar.week(start="sunday")
Calendar.month
Calendar.quarter
Calendar.year

Calendar.month.every(3)          # cells of 3 months

axes={"x": {"rows": [Calendar.month, Calendar.year]}}
```

## Parameters

| Parameter | Type                      | Description                                                                              |
| --------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `n`       | `int`                     | `.every(n)`: how many units one cell spans. A whole number, 1 or more. Default `1`.      |
| `start`   | `"monday" \| "sunday"`    | `Calendar.week(start=...)`: the first day of a week. Default `"monday"`, as in ISO 8601. |
| `"rows"`  | `list[CalendarPartition]` | An axis's label rows, inner row first.                                                   |

A Calendar value is a dict, its wire form: `Calendar.month.every(3)` is
`{"unit": "month", "step": 3}`. A custom label function for a row (`format`
in JS) is JS-only.

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

**Rows.**

- A time axis is continuous: every tick and label sits where the axis's
  scale puts its instant.
- Each row is one partition. Its ticks are the starts of its cells inside
  the domain. Each cell's label sits just right of its start, or of the axis
  start for a partial first cell. A cell that starts at the end of the domain
  has a tick and no label.
- A label that would run into the next one is left out. In practice only a
  narrow partial first cell loses its label.
- Rows need not nest: `[Calendar.week, Calendar.month]` is valid.
- The first row sits next to the axis line, and each further row sits past
  the one before it. The ticks of the outer rows are longer.
- Without `"rows"`, the axis has two rows. The inner row is the finest level
  and step whose labels fit between its ticks, tried in this order: seconds
  and minutes (1, 5, 15, 30), hours (1, 3, 6, 12), days (1, 2), months (1, 2,
  3), and years (1, 2, 5, 10, 20, 50, ...). The outer row is the inner
  level's parent: minutes for seconds, hours for minutes, days for hours,
  months for days and weeks, years for months and quarters. Year has no
  parent, so a year row is the only row.
- To tell what fits, the axis takes its length to be the chart's `w` (or `h`
  for a y axis).
- Default labels come from `Intl.DateTimeFormat` in the browser's locale:
  `12 AM` for an hour, `Feb 29` for a day or week, `Jan` for a month, `2024`
  for a year.
- `"rows"` on an axis that is not over a time column is an error.

## Example

A week row over a month row:

```python
chart(
    visits,
    schema={"day": Schema.time()},
    axes={"x": {"rows": [Calendar.week, Calendar.month]}, "y": True},
).flow(scatter(by="day", x="day", y="visits")).mark(
    line(stroke="steelblue", stroke_width=2)
)
```
