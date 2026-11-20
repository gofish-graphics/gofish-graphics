---
title: Effect
---

# Effect

The `Effect` family holds the effects GoFish knows. An effect is a value of the
`effect` option of every mark and of [`layer`](/js/api/core/layer), beside a
raw CSS filter string (`"blur(2px)"`, `"url(#shadow)"`). The effect applies to
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
    effect: gf.Effect.grayscale,
  }),
]).render(root, { w: 180, h: 80 });
```

:::

## Signature

```ts
Effect.grayscale; // or Effect.grayscale({ amount? })
Effect.luminanceToAlpha;
```

No effect has a required option, so each member is an effect as it is, and
calling it sets options: `Effect.grayscale` and `Effect.grayscale()` are the
same effect. An effect is a plain object, `{ kind, ...params }`, of type
`Effect.Effect`, for example `{ kind: "grayscale", amount: 0.5 }`. The same
object is the effect's wire form. A CSS filter string is not a member of the
family: it is passed to the `effect` option as it is.

The family is also a module of its own:

```ts
import { Effect } from "gofish-graphics";
import { grayscale } from "gofish-graphics/effect"; // the same value as Effect.grayscale
```

## Members

| Member                      | What it draws                                        |
| --------------------------- | ---------------------------------------------------- |
| `Effect.grayscale()`        | The drawing in grays.                                |
| `Effect.luminanceToAlpha()` | Black, with each pixel's alpha set by its luminance. |

A [region compositing](/js/api/operators/region-compositing) operator reads a
child's alpha as its region, so a child with `Effect.luminanceToAlpha` gives
its luminance as its region: white is inside, black is outside. A hidden one
is a luminance mask.

## `Effect.grayscale()`

::: gofish-ref Effect.grayscale
:::

## `Effect.luminanceToAlpha()`

::: gofish-ref Effect.luminanceToAlpha
:::
