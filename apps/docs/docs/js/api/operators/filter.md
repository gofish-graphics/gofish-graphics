# filter

Keeps the rows a predicate accepts, and drops the rest. It sits in `.flow()`
beside [`derive`](/js/api/operators/derive), which can do the same thing with an
arbitrary callback — `filter` just says what it does.

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(
    gf.filter((row) => row.species === "Salmon"),
    gf.spread({ by: "lake", dir: "x" })
  )
  .mark(gf.rect({ h: "count", fill: "steelblue" }))
  .render(root, { w: 400, h: 250 });
```

:::

## Signature

```ts
filter(pred);
```

## Parameters

| Parameter | Type                  | Description               |
| --------- | --------------------- | ------------------------- |
| `pred`    | `(row: T) => boolean` | Kept when it returns true |

The predicate can be written by hand, or built from a field expression —
[`field(name).between(lo, hi)`](/js/api/operators/spread#field-expression-pipeline)
returns exactly this shape. Its bounds are plain numbers, and it throws if the
expression carries pipeline ops (`field("x").bin(10).between(...)`), which would
otherwise test the raw field: a predicate is not a value slot.

## Examples

```ts
// A plain predicate
.flow(filter((d) => d.year === 2020), spread({ by: "category", dir: "x" }))

// A value window, with polars' `closed` ends
.flow(filter(field("day").between(100, 120, { closed: "right" })))

// A window that follows a clock. `between`'s bounds are plain numbers, so the
// clock read goes in the predicate: the rows kept change as the timer advances
// (see the reactivity guide). `between(v, lo, hi)` is the bare value test behind
// `field(name).between(...)`.
const day = timer({ domain: [1, 365], step: 1, duration: 10000 });
.flow(filter((d) => between(d.day, day() - 20, day(), { closed: "right" })))

// A window on a CYCLIC field. Day-of-year wraps, so the window is on the
// distance back from the playhead, modulo the year — which keeps the trail 20
// days long at the loop boundary instead of letting it collapse to the few
// days of the new year so far.
.flow(filter((d) => between((day() - d.day + 365) % 365, 0, 20, { closed: "left" })))
```

## Domains are inferred from what survives

`filter` runs **before** domain inference, so the scales see only the rows it
kept. In an animated chart whose filter follows a clock, that means the axes
rescale every frame: with one day's rows in hand, the x domain is that day's
extent and nothing else. Two ways to hold the scales still:

- Give the chart an explicit domain. Under
  [`geo`](/js/api/coords/geo) with a `lon`/`lat` window, the window replaces the
  data extent entirely, so filtering cannot move the map — which is why the bird
  migration examples stay put.
- Keep the full data in the chart and vary something paint-only instead, e.g.
  `opacity: live((d) => (d.day === day() ? 1 : 0))`.

## Python

`filter` is JavaScript only. Its predicate is a live JavaScript function with
nothing to put on the wire, the same reason `derive`'s callback does not cross
the bridge.
