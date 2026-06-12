# Region compositing

Five operators combine the _regions_ (silhouettes) of two children, named
after [Figma's boolean operations](https://help.figma.com/hc/en-us/articles/360039957534-Boolean-operations)
(see issues [#196](https://github.com/joshpoll/gofish/issues/196) /
[#202](https://github.com/joshpoll/gofish/issues/202)). They are the public
primitives the `cut` mark composes from.

Each takes **exactly two children** `[A, B]` — the binary SVG-filter
implementations do not generalize to three or more, so passing any other
number of children throws. The n-ary forms in the table below describe the
_intended_ eventual semantics; today only the binary case is implemented.

| Operator    | Region algebra               | Notes                                                                         |
| ----------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `intersect` | `A ∩ B`                      | Draw only where both regions overlap.                                         |
| `exclude`   | `A ^ B` (odd-overlap parity) | Draw the symmetric difference.                                                |
| `subtract`  | `A − B`                      | Draw A with B's region removed.                                               |
| `paint`     | `A ∪ (B ∩ A)`                | A is a base **surface**; B is painted onto it, clipped to A. Sized to A.      |
| `mask`      | `B ∩ A`, A **not** drawn     | A is a **clip region**; B is painted inside it without drawing A. Sized to A. |

`paint` and `mask` both clip to A but differ in intent: `paint` keeps A as a
visible surface, while `mask` uses A only as a stencil and never draws it.

Union (`A ∪ B`) is intentionally **not** exported — it is conceptually
[`layer`](/js/api/operators/layer) (#196). Use `layer` to overlay regions.

::: starfish

```js
gf.Paint([
  gf.rect({ x: 0, y: 0, w: 120, h: 120, fill: gf.color.blue[3] }),
  gf.rect({ x: 40, y: 40, w: 120, h: 120, fill: gf.color.red[3] }),
]).render(root, { w: 160, h: 160 });
```

:::

Here A is the blue square (the surface) and B is the red square; B is only
drawn where it overlaps A, so the result is clipped to the blue square's
bounds.

## Signatures

```ts
intersect(options?, [A, B]);
exclude(options?, [A, B]);
subtract(options?, [A, B]);
paint(options?, [A, B]);
mask([A, B]);
```

`Intersect`, `Exclude`, `Subtract`, `Paint`, and `Mask` are the v2
(capitalized) aliases for the same factories.

## Parameters

| Option      | Type                                                             | Description                                                                   |
| ----------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `blendMode` | `"color" \| "multiply" \| "screen" \| "overlay" \| "luminosity"` | Blend used where regions combine. Default `"color"`. `mask` takes no options. |

## Arity

All five operators require **exactly two children** and throw
`"Porter-Duff relation operators currently expect exactly two children"`
otherwise. The n-ary forms (`A ∩ B ∩ ...`, `A − B − C − ...`, etc.) are not
yet implemented.
