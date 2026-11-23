---
title: Placement
---

# Placement

The `Placement` family holds the ways a label can find its spot on the mark it
labels. A placement is a value of the `placement` option of
[`.label()`](/python/api/core/mark), beside the position strings
(`"outset-top"`, `"center"`, ...). A position string puts the label at one
spot by the mark's box. A placement reads the mark's outline and tries spots in
order.

```python
from gofish import Placement, Unit, chart, group, line

(
    chart(stocks, schema={"date": Unit.time()})
    .flow(group(by="symbol"))
    .mark(
        line(x="date", y="price", stroke="symbol", stroke_width=2).label(
            "symbol",
            placement=Placement.along(at=0.6, orient="sloped"),
            halo={},
            font_weight=600,
        )
    )
    .render(w=560, h=320, axes=True, legend=False)
)
```

::: gofish example:line-chart-with-inline-labels hidden
:::

## Signature

```python
Placement.around  # or Placement.around(directions=None, side=None, offset=None)
Placement.along  # or Placement.along(at=None, side=None, orient=None, offset=None)
Placement.start  # or Placement.start(offset=None)
Placement.end  # or Placement.end(offset=None)
Placement.interior
```

No placement has a required option, so each member is a placement as it is, and
calling it sets options: `Placement.end` and `Placement.end()` are the same placement. A
placement is a plain dict, `{"kind": ..., **params}`, for example
`{"kind": "along", "at": 0.6, "orient": "sloped"}`.

The family is also a module of its own:

```python
from gofish import Placement
from gofish.placement import along  # the same value as Placement.along
```

## Members

| Member                 | Reads                              | Where the label goes                                       | Default for          |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------- | -------------------- |
| `Placement.around()`   | the outline's extreme points       | Just outside the mark, in each of eight screen directions. | a dot (`circle`)     |
| `Placement.along()`    | an open path or a region's outline | On or beside the outline, sliding along it from `at`.      |                      |
| `Placement.start()`    | an open path's first point         | Just before the path's start, level.                       |                      |
| `Placement.end()`      | an open path's last point          | Just past the path's end, level.                           | a `line`, an `arrow` |
| `Placement.interior()` | a filled region                    | Inside the region, where the label's box can grow largest. | a band, a `polygon`  |

With no `placement`, a label takes the default for its mark's kind of
geometry, and `"outset"` for any other mark.

## How the labels of one call are placed

The labels of one `.label()` call are placed together, in data order. Each
takes its first spot that stays inside the plot and covers no labeled mark,
no label already placed, and no node in the label's `avoiding` option
(`avoiding=select_all("trend")`). A label with no free spot is hidden, and
the render prints how many labels each call hid. A label of
`Placement.start()` or `Placement.end()` has one spot, past its path's end, which
may be outside the plot. Labels there that would cover each other slide
apart vertically, and a label that still covers a mark, a label or a node in
`avoiding` is hidden.

A position string ignores `avoiding`, and is never hidden.

In a polar or other curved coordinate space, a placement is an error, and a
label's default is `"outset"`
([#1201](https://github.com/gofish-graphics/gofish-graphics/issues/1201)).

## `Placement.around()`

::: gofish-ref Placement.around
:::

## `Placement.along()`

::: gofish-ref Placement.along
:::

## `Placement.start()`

::: gofish-ref Placement.start
:::

## `Placement.end()`

::: gofish-ref Placement.end
:::

## `Placement.interior()`

::: gofish-ref Placement.interior
:::

## See also

- [How to place labels](/python/api/howto/label-placement)
- [Labels](/internals/frontend/labels), the essay on how labels are placed
