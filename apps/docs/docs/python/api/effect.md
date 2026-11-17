---
title: Effect
---

# Effect

The `Effect` family holds the effects GoFish knows. An effect is a value of the
`effect` option of every mark and of [`layer`](/python/api/core/layer), beside
a raw CSS filter string (`"blur(2px)"`, `"url(#shadow)"`). The effect applies
to the node's whole drawing, as one picture.

```python
from gofish import Effect, layer, rect

layer([
    rect(x=0, y=0, w=80, h=80, fill="#e06666"),
    rect(x=100, y=0, w=80, h=80, fill="#e06666", effect=Effect.grayscale),
]).render(w=180, h=80)
```

## Signature

```python
Effect.grayscale  # or Effect.grayscale(amount=None)
Effect.luminance_to_alpha
```

No effect has a required option, so each member is an effect as it is, and
calling it sets options: `Effect.grayscale` and `Effect.grayscale()` are the
same effect. An effect is a plain dict, `{"kind": ..., **params}`, for example
`{"kind": "grayscale", "amount": 0.5}`. A CSS filter string is not a member of
the family: it is passed to the `effect` option as it is.

The family is also a module of its own:

```python
from gofish import Effect
from gofish.effect import grayscale  # the same value as Effect.grayscale
```

## Members

| Member                        | What it draws                                        |
| ----------------------------- | ---------------------------------------------------- |
| `Effect.grayscale()`          | The drawing in grays.                                |
| `Effect.luminance_to_alpha()` | Black, with each pixel's alpha set by its luminance. |

A [region compositing](/python/api/operators/region-compositing) operator
reads a child's alpha as its region, so a child with
`Effect.luminance_to_alpha` gives its luminance as its region: white is
inside, black is outside. A hidden one is a luminance mask.

## `Effect.grayscale()`

::: gofish-ref Effect.grayscale
:::

## `Effect.luminance_to_alpha()`

::: gofish-ref Effect.luminanceToAlpha
:::
