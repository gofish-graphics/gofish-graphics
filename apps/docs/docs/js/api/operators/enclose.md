---
order: 75
---

# enclose

Draws a rounded rectangle around the union of its children's bounding boxes,
padded by `padding`. Use it to group elements of a diagram visually.

::: gofish

```js
gf.enclose({ padding: 10, stroke: gf.color.blue[4] }, [
  gf.Stack({ dir: "x", spacing: 12 }, [
    gf.rect({ w: 40, h: 40, fill: gf.color.blue[2] }),
    gf.rect({ w: 40, h: 60, fill: gf.color.red[2] }),
  ]),
]).render(root, { w: 160, h: 120 });
```

:::

## Signature

```ts
enclose(options?, [child1, child2, ...]);
```

`background` is an alias for the same factory: it takes the same options and
produces the same node. `Enclose` is the capitalized alias. The enclosure is
the children's bbox union grown by `padding`, so it draws nothing of its own
beyond that box — reach for [`position`](/js/api/operators/position) when one
child needs a precise absolute offset with its own styling instead.

## Parameters

::: gofish-ref enclose
:::
