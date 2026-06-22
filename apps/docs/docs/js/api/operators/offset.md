# offset

Shifts a single child by `(x, y)` pixels **at render time only**. The child's
reported layout bounds are passed through unchanged — `offset` does not move
the bbox it advertises to its parent, it only nudges the rendered pixels.

This makes it the right tool when something else defines the visible bounds
(for example a [`mask`](/js/api/operators/region-compositing) region rect) and
you just need to slide the underlying content beneath it. It is the primitive
the `cut` mark uses to align each slice's source under its
clip region.

::: gofish

```js
gf.layer([
  gf.rect({ w: 100, h: 80, fill: gf.color.gray[2] }),
  gf.Offset({ x: 20, y: 15 }, [
    gf.rect({ w: 100, h: 80, fill: gf.color.blue[4], opacity: 0.6 }),
  ]),
]).render(root, { w: 160, h: 140 });
```

:::

The blue rectangle reports the same bounds as the gray one but is drawn
shifted by `(20, 15)`.

## Signature

```ts
offset({ x?, y? }, [child]);
```

`Offset` is the v2 (capitalized) alias for the same factory.

## Parameters

| Option | Type     | Description                            |
| ------ | -------- | -------------------------------------- |
| `x`    | `number` | Horizontal shift in pixels. Default 0. |
| `y`    | `number` | Vertical shift in pixels. Default 0.   |

Exactly one child is required.

## Layout semantics

`offset` keeps its layout `transform.translate` as `[undefined, undefined]` —
the "parent can place me" signal — and adds the `(x, y)` shift on top of
whatever translate the parent assigns, during render. The reported intrinsic
dimensions are the child's, unmoved.
