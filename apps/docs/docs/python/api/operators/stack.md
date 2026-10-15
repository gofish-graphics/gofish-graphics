---
order: 20
---

# stack

Stacks groups edge-to-edge along an axis with no gap between them — `spread`
without the spacing. The basis for stacked bar charts and pie charts.

::: gofish example:stacked-bar-chart hidden
:::

```python
from gofish import chart, spread, stack, rect

chart(seafood, axes=True).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="y"),
).mark(rect(h="count", fill="species")).render(w=500, h=300)
```

## Signature

```python
stack(children=None, *, by=None, dir, **options) -> Operator | Mark
```

Like [`spread`](/python/api/operators/spread), `stack` is polymorphic: called
with no positional argument it returns an **operator** for use inside
[`.flow()`](/python/api/core/flow); called with a positional list of marks it
returns a **combinator-form mark** that stacks those explicit children (the
low-level form behind the `stackX`/`stackY` operators).

## Parameters

::: gofish-ref stack
:::

Returns an `Operator` for use inside [`.flow()`](/python/api/core/flow).

`dir` takes `"x"`, `"y"`, or an axis name the enclosing coordinate space
declares, such as `"theta"` under polar; see
[`spread` → naming the axis](/python/api/operators/spread#naming-the-axis-with-dir).

## Signed parts

`stack` places its parts end to end, in order. Each part starts where the one
before it ends, and the first part starts at 0. A negative part goes back, so
the stack ends at the sum of its parts, and parts that cancel overlap. Parts
(+100, −30, +20, −50, +10) rise to 100, step back and forth, and end at 50.

To pile positive parts up from 0 and negative parts down from 0 (a diverging
stacked bar), group by sign first, so each stack holds one sign:

```python
# `direction` is "Inflow" for positive amounts and "Outflow" for negative.
chart(cash_flows).flow(
    spread(by="quarter", dir="x"),
    group(by="direction"),
    stack(by="flow", dir="y"),
).mark(rect(h="amount", fill="flow"))
```

## Centered stacks

When the chart's `schema` gives the `by` column a midpoint
([`Schema.ordered(levels).diverging()`](/python/api/core/schema)), the stack's 0 is
the midpoint of that order instead of the start of its first part. The parts
must be nonnegative. This draws Likert charts and population pyramids:

```python
chart(
    survey, schema={"response": Schema.ordered(LEVELS).diverging()}
).flow(
    spread(by="question", dir="y"),
    stack(by="response", dir="x"),
).mark(rect(w="count", fill="response"))
```

## Examples

```python
# Stacked bars: lakes across x, species stacked up y
chart(seafood).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="y"),
).mark(rect(h="count", fill="species"))

# Grouped bars: stack along x instead
chart(seafood).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="x"),
).mark(rect(h="count", fill="species"))
```

## Notes

- `dir` is required — `stack()` raises a `ValueError` without it.
- Combine with `coord=Coord.clock()` on [`chart`](/python/api/core/chart) to turn a
  stack into a pie chart.
- Use [`spread`](/python/api/operators/spread) when you want gaps between groups.
