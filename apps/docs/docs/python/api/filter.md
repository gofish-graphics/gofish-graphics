---
title: Filter
---

# Filter

The `Filter` family holds the filters GoFish knows. A filter is a value of the
`filter` option of every mark and of [`layer`](/python/api/core/layer), beside
a raw CSS filter string (`"blur(2px)"`, `"url(#shadow)"`). The filter applies
to the node's whole drawing, as one picture.

```python
from gofish import Filter, layer, rect

layer([
    rect(x=0, y=0, w=80, h=80, fill="#e06666"),
    rect(x=100, y=0, w=80, h=80, fill="#e06666", filter=Filter.grayscale),
]).render(w=180, h=80)
```

## Signature

```python
Filter.grayscale  # or Filter.grayscale(amount=None)
Filter.luminance_to_alpha
```

No filter has a required option, so each member is a filter as it is, and
calling it sets options: `Filter.grayscale` and `Filter.grayscale()` are the
same filter. A filter is a plain dict, `{"kind": ..., **params}`, for example
`{"kind": "grayscale", "amount": 0.5}`. A CSS filter string is not a member of
the family: it is passed to the `filter` option as it is.

The module is `gofish.filter_`, with a trailing underscore, because
`gofish.filter` is the [`filter`](/python/api/operators/filter) operator:

```python
from gofish import Filter
from gofish.filter_ import grayscale  # the same value as Filter.grayscale
```

## Members

| Member                        | What it draws                                        |
| ----------------------------- | ---------------------------------------------------- |
| `Filter.grayscale()`          | The drawing in grays.                                |
| `Filter.luminance_to_alpha()` | Black, with each pixel's alpha set by its luminance. |

A [region compositing](/python/api/operators/region-compositing) operator
reads a child's alpha as its region, so a child with
`Filter.luminance_to_alpha` gives its luminance as its region: white is
inside, black is outside. A hidden one is a luminance mask.

## `Filter.grayscale()`

::: gofish-ref Filter.grayscale
:::

## `Filter.luminance_to_alpha()`

::: gofish-ref Filter.luminanceToAlpha
:::
