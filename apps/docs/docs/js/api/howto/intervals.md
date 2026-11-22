# How to draw a mark between two values

A box plot's box, an error bar, and a Gantt bar each run from one value to
another. Give a `rect` both ends: `y` and `y2` for a vertical span, `x` and
`x2` for a horizontal one. Both must be data values, such as field names. You
do not need to subtract one from the other to get a size. The
[rect reference](/js/api/marks/rect#position-and-size) lists the cases
where a rect does not span to `x2` or `y2`.

## Box plots

Each row holds one group's summary. The whisker spans `min` to `max`, and
the box spans `q1` to `q3`. The median is a thin rect centered on one value.

::: gofish

```js
const stats = [
  { group: "A", min: 2, q1: 4, median: 5, q3: 7, max: 9 },
  { group: "B", min: 3, q1: 5, median: 6.5, q3: 8, max: 10 },
  { group: "C", min: 1, q1: 3, median: 4, q3: 5, max: 8 },
];
gf.chart(stats)
  .flow(gf.spread({ by: "group", dir: "x", spacing: 30 }))
  .mark(
    gf.layer([
      gf.rect({ x: 9.5, w: 1, y: "min", y2: "max", fill: "gray" }),
      gf.rect({ w: 20, y: "q1", y2: "q3", fill: "steelblue" }),
      gf.rect({ w: 20, h: 1.5, cy: "median", fill: "white" }),
    ])
  )
  .render(root, { w: 220, h: 200, axes: true });
```

:::

## Error bars

An error bar is a thin rect from the low end to the high end, with a dot at
the estimate. The bar's `y: 3` and `h: 2` center it on the dot, whose
radius is 4.

::: gofish

```js
const estimates = [
  { model: "A", estimate: 1.6, lo: 1.2, hi: 2.0 },
  { model: "B", estimate: 2.4, lo: 1.9, hi: 3.1 },
  { model: "C", estimate: 0.9, lo: 0.3, hi: 1.4 },
];
gf.chart(estimates)
  .flow(gf.spread({ by: "model", dir: "y", spacing: 16 }))
  .mark(
    gf.layer([
      gf.rect({ x: "lo", x2: "hi", y: 3, h: 2, fill: "gray" }),
      gf.circle({ cx: "estimate", r: 4, fill: "black" }),
    ])
  )
  .render(root, { w: 320, h: 140, axes: true });
```

:::

## Gantt bars

Each task runs from its `start` to its `end`.

::: gofish

```js
const tasks = [
  { task: "Design", start: 0, end: 4 },
  { task: "Build", start: 3, end: 10 },
  { task: "Test", start: 8, end: 12 },
];
gf.chart(tasks)
  .flow(gf.spread({ by: "task", dir: "y", spacing: 8 }))
  .mark(gf.rect({ x: "start", x2: "end", h: 16, fill: "task" }))
  .render(root, { w: 300, h: 120, axes: true });
```

:::
