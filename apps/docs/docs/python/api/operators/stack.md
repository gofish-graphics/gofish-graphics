---
order: 20
---

# stack

Adds its children's data amounts along `dir`. Each part starts where the one
before it ends, and the parts share one data axis. The basis for stacked bar
charts and pie charts.

::: gofish example:stacked-bar-chart hidden
:::

```python
from gofish import chart, spread, stack, rect

chart(seafood, axes=True).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="y"),
).mark(rect(h="count", fill="species")).render(w=500, h=300)
```

## Parts are data amounts

Every part needs a data size along `dir`: a `rect(h="count")`, a ribbon with a
data `h`, or another stack. A part sized in pixels or by its content (a
`rect(h=20)`, a `text`, an `image`, a `spread`) has no amount to add, so it
is an error that names the part. Parts like these only touch. Lay them out
with [`spread`](/python/api/operators/spread)`(dir=..., spacing=0)`.

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

## Baselines

`baseline` sets where the stack puts its own 0, the point its parent lines up
with its other children. It takes a member of the
[`Baseline`](/python/api/baseline) family: `Baseline.start()` (the default),
`Baseline.end()`, `Baseline.middle()`, `Baseline.wiggle()` or
`Baseline.at(part, point)`.

```python
stack(by="response", dir="x", baseline=Baseline.at("Neutral", 0.5))
```

## Centered stacks

When the chart's `schema` gives the `by` column a midpoint
([`Unit(domain=Domain.discrete(levels), traits=[Trait.diverging()])`](/python/api/core/schema)), the stack's 0 is
the midpoint of that order instead of the start of its first part: a
`Baseline.at` at that midpoint. The parts must be nonnegative, and the stack
takes no `baseline` option. This draws Likert charts and population pyramids:

```python
chart(
    survey, schema={"response": Unit(domain=Domain.discrete(LEVELS), traits=[Trait.diverging()])}
).flow(
    spread(by="question", dir="y"),
    stack(by="response", dir="x"),
).mark(rect(w="count", fill="response"))
```

## Stacked areas

A stack of [shape-form ribbons](/python/api/marks/ribbon#shape-form) is a
stacked area. A band's thickness changes along `x`, so the stack moves each
band by an amount that changes along `x` too: the thickness of the bands
before it, moved by the baseline. Each band keeps its thickness at every `x`.
Outside its own rows a band has thickness 0, so series may be sampled at
different `x`.

```python
chart(unemployment, schema={"date": Unit.time()}).flow(
    stack(by="series", dir="y"),
).mark(ribbon(x="date", h="count", fill="series"))
```

::: gofish example:stacked-area-chart hidden
:::

With `Baseline.wiggle()` the stack is a streamgraph. With `Baseline.middle()`
it is centered at every `x`.

```python
chart(unemployment, schema={"date": Unit.time()}).flow(
    stack(by="series", dir="y", baseline=Baseline.wiggle()),
).mark(ribbon(x="date", h="count", fill="series"))
```

::: gofish example:streamgraph hidden
:::

Every part of such a stack must be a band. A `rect` or a `text` in a stack of
bands is an error.

## Examples

```python
# Stacked bars: lakes across x, species stacked up y
chart(seafood).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="y"),
).mark(rect(h="count", fill="species"))

# Grouped bars: the bars only touch along x, so they are a spread with no spacing
chart(seafood).flow(
    spread(by="lake", dir="x"),
    spread(by="species", dir="x", spacing=0),
).mark(rect(h="count", fill="species"))
```

## Notes

- `dir` is required — `stack()` raises a `ValueError` without it.
- Combine with `coord=Coord.clock()` on [`chart`](/python/api/core/chart) to turn a
  stack into a pie chart.
- Use [`spread`](/python/api/operators/spread) when you want gaps between groups.
