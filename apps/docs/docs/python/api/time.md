---
title: time
---

# time

The `time` namespace holds the constructs that lay a chart out in time:
`time.sequence` (one keyframe per value of a field), `time.history` (keep
marks on screen after their keyframe), `time.transition` (the mark that moves
between keyframes, or a build-in), and `time.stagger` / `time.parallel` (how
children are arranged in time). The `Animation` family holds the values of
`.transition(enter=, update=, exit=)`. The [JavaScript Animation
guide](/js/animation) explains how they fit together.

```python
from gofish import Animation, Curve, chart, circle, layer, scatter, time, timer

year = timer(domain=[1955, 2005], duration=10_000)

(
    chart(gapminder, legend=False)
    .flow(
        time.sequence(by="year", on=year),
        scatter(by="country", x="fertility", y="life_expect"),
    )
    .mark(
        layer([
            time.history([circle(r=4, fill="country", opacity=0.3)]),
            circle(r=4, fill="country").transition(
                update=Animation.tween(curve=Curve.monotone())
            ),
        ])
    )
    .render(w=500, h=400)
)
```

The browser runs the clock. To draw one frame, hold it still:
`timer(domain=[1955, 2005], duration=10_000, playing=False, at=1997.5)`. A
build-in's clock is the chart's, held by `render(playing=False, at=700)`.

`from gofish import time` shadows the standard library's `time` module in that
namespace.

## Signature

```python
time.sequence(by, duration=None, loop=None, playing=None, at=None, on=None, cyclic=None)
time.history(last=None)                  # in .flow(...)
time.history([marks], last=None)         # around marks
time.transition(along=None, at=None, curve=None, enter=None, exit=None, fill=None, stroke=None, stroke_width=None, opacity=None)
time.stagger(lag=None, spacing=None, dwell=None, by=None, from_=None)
time.parallel()

mark.transition(enter=None, update=None, exit=None)       # Animation values
operator.transition(enter=None, update=None, exit=None)   # time.stagger(...) or time.parallel()
```

## Parameters

::: gofish-ref time.sequence time.history time.transition time.stagger time.parallel
:::

`on` takes a `timer(...)` source, and `at` takes a number or a source (see
[Expressions and sources](/python/api/expressions)).

## Animation

| Value                                                              | Effect                                         |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| `Animation.grow`, `Animation.shrink`                               | From the mark's baseline to its size, or back. |
| `Animation.fade_in`, `Animation.fade_out`                          | Opacity from 0 to the mark's own, or back.     |
| `Animation.appear`                                                 | Hidden until the mark's start, then shown.     |
| `Animation.wipe(from_="bottom")`, `Animation.wipe(shape="circle")` | A reveal from one side, or from the center.    |
| `Animation.tween(curve=Curve.monotone())`                          | How a mark moves between keyframes (`update`). |

Each effect takes `duration` (milliseconds, or a field name) and `ease`, a
name such as `"cubicInOut"`. A function ease is JavaScript only, and raises a
`TypeError` in Python. A kind with no required option is a value as it is:
`Animation.grow` is `Animation.grow()`.

## Example

A staggered build-in, held at 700 milliseconds:

```python
(
    chart(alphabet)
    .flow(spread(by="letter", dir="x").transition(enter=time.stagger(lag=60)))
    .mark(rect(h="frequency").transition(enter=Animation.grow(duration=600)))
    .render(w=480, h=220, playing=False, at=700)
)
```
