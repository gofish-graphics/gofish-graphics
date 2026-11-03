---
title: Filter
---

# Filter

The `Filter` family holds the filters GoFish knows. A filter is a value of the
`filter` option of every mark and of [`layer`](/js/api/core/layer), beside a
raw CSS filter string (`"blur(2px)"`, `"url(#shadow)"`). The filter applies to
the node's whole drawing, as one picture.

::: gofish

```js
gf.layer([
  gf.rect({ x: 0, y: 0, w: 80, h: 80, fill: gf.color.red[3] }),
  gf.rect({
    x: 100,
    y: 0,
    w: 80,
    h: 80,
    fill: gf.color.red[3],
    filter: gf.Filter.grayscale,
  }),
]).render(root, { w: 180, h: 80 });
```

:::

## Signature

```ts
Filter.grayscale; // or Filter.grayscale({ amount? })
Filter.luminanceToAlpha;
```

No filter has a required option, so each member is a filter as it is, and
calling it sets options: `Filter.grayscale` and `Filter.grayscale()` are the
same filter. A filter is a plain object, `{ kind, ...params }`, of type
`Filter.Filter`, for example `{ kind: "grayscale", amount: 0.5 }`. The same
object is the filter's wire form. A CSS filter string is not a member of the
family: it is passed to the `filter` option as it is.

The family is also a module of its own:

```ts
import { Filter } from "gofish-graphics";
import { grayscale } from "gofish-graphics/filter"; // the same value as Filter.grayscale
```

## Members

| Member                      | What it draws                                        |
| --------------------------- | ---------------------------------------------------- |
| `Filter.grayscale()`        | The drawing in grays.                                |
| `Filter.luminanceToAlpha()` | Black, with each pixel's alpha set by its luminance. |

A [region compositing](/js/api/operators/region-compositing) operator reads a
child's alpha as its region, so a child with `Filter.luminanceToAlpha` gives
its luminance as its region: white is inside, black is outside. A hidden one
is a luminance mask.

## `Filter.grayscale()`

::: gofish-ref Filter.grayscale
:::

## `Filter.luminanceToAlpha()`

::: gofish-ref Filter.luminanceToAlpha
:::
