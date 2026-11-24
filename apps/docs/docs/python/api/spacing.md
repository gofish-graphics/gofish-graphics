---
title: Spacing
---

# Spacing

The `Spacing` family holds the ways [`spread`](/python/api/operators/spread)
sets its neighbors apart along `dir`. A spacing is a value of spread's
`spacing` option, beside a bare amount. `Spacing.box(gap)` leaves a gap
between the facing edges of each child's box.
`Spacing.pitch(distance, at=...)` puts the same point on each child a fixed
distance from the last one. The `spacing` of
[`Constraint.distribute`](/python/api/constraints/relate#constraint-distribute) takes the
same values.

```python
from gofish import Spacing, chart, field, scatter, spread

(
    chart(seattle_weather)
    .flow(
        spread(
            by=field("month").sort(MONTH_NAMES),
            dir="y",
            spacing=Spacing.pitch(24, at="baseline"),
        ),
        scatter(x="temp_max", h=40),
    )
    .mark(ridge)
    .render(w=500, h=400)
)
```

::: gofish example:ridgeline-chart hidden
:::

## Signature

```python
spread(dir=..., spacing=Spacing.box(gap))
spread(dir=..., spacing=Spacing.pitch(distance, at=None))
spread(dir=..., spacing=gap)  # the same as Spacing.box(gap)
```

A bare amount is `Spacing.box(amount)`: `spacing=8` and
`spacing=Spacing.box(8)` lay the children out the same way. The amount is a
number of pixels, `percent(n)`, or `fr(k)`, in both members. `gap` and
`distance` are positional.

A spacing is a plain dict, `{"kind": ..., **params}`, for example
`{"kind": "pitch", "distance": 24, "at": "baseline"}`.

The family is also a module of its own:

```python
from gofish import Spacing
from gofish.spacing import pitch  # the same function as Spacing.pitch
```

## Members

| Member               | Measures from               | To                                                   | Depends on the children's sizes |
| -------------------- | --------------------------- | ---------------------------------------------------- | ------------------------------- |
| `Spacing.box()`      | the end of one child's box  | the start of the next child's box                    | yes                             |
| `Spacing.pitch()`    | the point `at` on one child | the point `at` on the next child                     | no                              |
| `Spacing.at_least()` | the end of one child's box  | the start of the next child's box, at least `gap` on | yes                             |

`Spacing.at_least(gap)` is a minimum gap, a placeholder name that is not yet
final. The exact constraints are solved first, and the minimum gaps then push
apart what they would put closer. Its `gap` is pixels only. A minimum gap
gives each child a range of positions, not one position, and the
[`slack`](/python/api/slack) of the spread or layer that solves it picks one.

`at` is `"start"`, `"middle"`, `"end"` or `"baseline"`. `"middle"` is center
to center. `"baseline"` is each child's local 0, which for a ribbon or a text
is its baseline, not an edge of its box.

## `Spacing.box()`

::: gofish-ref Spacing.box
:::

## `Spacing.pitch()`

::: gofish-ref Spacing.pitch
:::

## `Spacing.at_least()`

::: gofish-ref Spacing.atLeast
:::

## See also

- [`spread`](/python/api/operators/spread)
- [`Constraint.distribute`](/python/api/constraints/relate#constraint-distribute)
- [`Slack`](/python/api/slack), where minimum gaps put what they leave room for
- [Underlying space](/internals/core/underlying-space), the essay on how a
  chain of children claims its room
