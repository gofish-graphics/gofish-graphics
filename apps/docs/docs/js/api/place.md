---
title: Place
---

# Place

The `Place` family holds the ways a label can find its spot on the mark it
labels. A place is a value of the `position` option of
[`.label()`](/js/api/core/mark#modifiers), beside the position strings
(`"outset-top"`, `"center"`, ...). A position string puts the label at one
spot by the mark's box. A place reads the mark's outline and tries spots in
order.

::: gofish example:line-chart-with-inline-labels
:::

## Signature

```ts
Place.around; // or Place.around({ directions?, side?, offset? })
Place.along; // or Place.along({ at?, side?, orient?, offset? })
Place.start; // or Place.start({ offset? })
Place.end; // or Place.end({ offset? })
Place.interior;
```

No place has a required option, so each member is a place as it is, and
calling it sets options: `Place.end` and `Place.end()` are the same place. A
place is a plain object, `{ kind, ...params }`, of type `Place.Place`, for
example `{ kind: "along", at: 0.6, orient: "sloped" }`. The same object is
the place's wire form.

The family is also a module of its own:

```ts
import { Place } from "gofish-graphics";
import { along } from "gofish-graphics/place"; // the same value as Place.along
```

## Members

| Member             | Reads                              | Where the label goes                                       | Default for          |
| ------------------ | ---------------------------------- | ---------------------------------------------------------- | -------------------- |
| `Place.around()`   | the outline's extreme points       | Just outside the mark, in each of eight screen directions. | a dot (`circle`)     |
| `Place.along()`    | an open path or a region's outline | On or beside the outline, sliding along it from `at`.      |                      |
| `Place.start()`    | an open path's first point         | Just before the path's start, level.                       |                      |
| `Place.end()`      | an open path's last point          | Just past the path's end, level.                           | a `line`, an `arrow` |
| `Place.interior()` | a closed outline                   | Inside the region, where the label's box can grow largest. | a band, a `polygon`  |

With no `position`, a label takes the default for its mark's kind of
geometry, and `"outset"` for any other mark.

## How the labels of one call are placed

The labels of one `.label()` call are placed together, in data order. Each
takes its first spot that stays inside the plot and covers no labeled mark,
no label already placed, and no node in the label's `avoiding` option. A
label with no free spot is hidden, and the render prints how many labels
each call hid. The labels of `Place.start()` and `Place.end()` are never
hidden: labels that would cover each other slide apart vertically.

A position string ignores `avoiding`, and is never hidden.

In a polar or other curved coordinate space, a place is an error, and a
label's default is `"outset"`
([#1201](https://github.com/gofish-graphics/gofish-graphics/issues/1201)).

## `Place.around()`

::: gofish-ref Place.around
:::

## `Place.along()`

::: gofish-ref Place.along
:::

## `Place.start()`

::: gofish-ref Place.start
:::

## `Place.end()`

::: gofish-ref Place.end
:::

## `Place.interior()`

::: gofish-ref Place.interior
:::

## See also

- [How to place labels](/js/api/howto/label-placement)
- [Labels](/internals/frontend/labels), the essay on how labels are placed
