---
title: Baseline
---

# Baseline

The `Baseline` family holds the places a stack or a spread can put its own 0.
A baseline is the value of the `baseline` option of
[`stack`](/python/api/operators/stack) and
[`spread`](/python/api/operators/spread). The parent of a stack lines its
baseline up with the baselines of its other children, so in a bar chart every
stack starts from one line.

```python
from gofish import chart, spread, stack, rect, Baseline

(
    chart(seafood)
    .flow(
        spread(by="lake", dir="x"),
        stack(by="species", dir="y", baseline=Baseline.middle()),
    )
    .mark(rect(h="count", fill="species"))
    .render(w=400, h=400)
)
```

## Signature

```python
Baseline.start  # or Baseline.start()
Baseline.end  # or Baseline.end()
Baseline.middle  # or Baseline.middle()
Baseline.wiggle  # or Baseline.wiggle()
Baseline.at(part, point)
```

A stack lays its parts end to end. Each part has a tail and a head, and the
tail of each part is on the head of the one before it. The start of the stack
is the tail of its first part, and its end is the head of its last part.

`Baseline.at` has two required arguments, so it is a call only, and both are
positional. The other members are values as they are, and `Baseline.start` and
`Baseline.start()` are the same baseline. A baseline is a plain dict,
`{"kind": ..., **params}`, for example
`{"kind": "at", "part": "Neutral", "point": 0.5}`.

The family is also a module of its own:

```python
from gofish import Baseline
from gofish.baseline import middle  # the same function as Baseline.middle
```

## Members

| Member                     | Where the stack's 0 is                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `Baseline.start()`         | The start of the stack. The default.                                                       |
| `Baseline.end()`           | The end of the stack, so the parts lie before 0.                                           |
| `Baseline.middle()`        | Halfway from the start of the stack to its end (d3's `stackOffsetSilhouette`).             |
| `Baseline.wiggle()`        | A line that keeps the bands of a streamgraph as flat as it can (d3's `stackOffsetWiggle`). |
| `Baseline.at(part, point)` | A point on one part.                                                                       |

With `start`, `end` and `at`, the stack's 0 is data 0, and a position on its
axis is an amount from 0. With `middle` and `wiggle`, the stack's 0 is not data 0, so a position on its
axis is not an amount. Its axis shows only differences. The stack's 0 is still
its baseline, and a parent with `alignment="baseline"` lines it up with the
baselines of its other children, so rows of centered stacks share one middle.

## `Baseline.at(part, point)`

| Argument | Type                                                  | Description                                                                                                                                                                                                         |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `part`   | `str \| float`                                        | The part: a value of the `by` column in a flow, or a child index in the combinator form.                                                                                                                            |
| `point`  | `float \| "start" \| "middle" \| "end" \| "baseline"` | A fraction of the way from the part's tail to its head (0 is the tail, 1 the head), or one of the part's anchors. `"baseline"` is the part's own 0: the tail of a bar, or the baseline of a nested spread or stack. |

A part that the data lacks takes no room, and the baseline falls on the
boundary where the part would be. The stack finds that boundary from the order
of the `by` column, so the column must declare its levels with
`Domain.discrete(levels)` in the chart's `schema`. `Trait.diverging()` on the
unit of the `by` column is `Baseline.at` at the midpoint of the column's order,
and a stack over such a column takes no `baseline` option.

## On `spread`

A spread takes `Baseline.start()`, `Baseline.end()`, `Baseline.middle()` and
`Baseline.at(part, point)`. Its start is the start of its first child, its
end is the end of its last child, and the gaps between children are part of
the way from one to the other. Without `baseline`, its 0 is its start.
`Baseline.wiggle()` is for `stack` only, and on a spread it is an error. A
spread's baseline only places it: the spread draws no data axis along its
direction.

```python
chart(survey, color=likert_colors, axes={"x": False, "y": True}).flow(
    spread(by="question", dir="y"),
    spread(by="response", dir="x", spacing=3, baseline=Baseline.at("Neutral", 0.5)),
).mark(rect(w="count", fill="response"))
```

See the [JavaScript `Baseline` page](/js/api/baseline) for more on each member.
