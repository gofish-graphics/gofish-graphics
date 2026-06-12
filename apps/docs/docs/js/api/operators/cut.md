# cut

Slices a single source shape (an [`image`](/js/api/marks/rect) or
[`rect`](/js/api/marks/rect)) into **N clipped sub-shapes** along one
direction. Each slice shows a contiguous window of the source; together the
slices tile it.

`cut` **never lays out**. It always returns an **array** of slice nodes and
leaves the arrangement to whatever you wrap it in — a combinator
([`Stack`](/js/api/operators/stack), [`Spread`](/js/api/operators/spread)) or
a chart-flow operator. (APIs in GoFish are named by the shape of value they
return; `cut` returns an array, so there is no fused single-shape mode.)

::: starfish

```js
gf.Spread(
  { dir: "x", spacing: 8 },
  gf.cut(gf.rect({ w: 600, h: 80, fill: gf.color.green[5] }), {
    dir: "x",
    size: [gf.datum(1), gf.datum(1), gf.datum(2)],
  })
).render(root, { w: 620, h: 100 });
```

:::

The `rect` is cut into three windows weighted `1 : 1 : 2`; the `datum()`
weights are normalized to fill the source width exactly, and `Spread` then
explodes the slices apart with an 8px gap.

## Two forms

### Pure `cut(source, opts)`

The core primitive. Returns `Promise<GoFishNode>[]` — an array you can drop
straight into a combinator's children, synchronously:

```js
gf.Stack(
  { dir: "y" },
  gf.cut(gf.image({ href, w: 193, h: 600 }), {
    dir: "y",
    size: bottleData.map((d) => gf.datum(d.amount)),
    inset: 4,
  })
);
```

`N` (the slice count) is `size.length`.

### `.cut(opts)` modifier

A mark built **on** the pure function, for chart-flow use. `image(...).cut(...)`
is an _expand_ mark — given the chart's data it produces N slices 1:1 with the
rows, ready for an upstream layout operator to arrange:

```js
gf.chart(bottleData)
  .flow(gf.spread({ dir: "y", spacing: 4, reverse: true }))
  .mark(
    gf.image({ href, w: 193, h: 600 }).cut({
      dir: "y",
      size: "amount", // field name → per-row datum weights
      inset: 4,
    })
  );
```

The modifier's `size` additionally accepts a **field-name string** (resolved
per row, treated as datum-provenance — `size: "amount"` is exactly
`bottleData.map((d) => datum(d.amount))`) and `undefined` (equal slices, N
taken from the data length). Each slice carries its source row, so a second
sub-chart can `selectAll(...)` the named slices and annotate them.

### Combining with `by`-grouping

A `by`-grouped operator expects **exactly one child node per group**. But an
_expand_ mark turns each group's rows into an **array** of slice nodes — so you
cannot hang the `.cut(...)` mark directly under a `by`-grouped operator; doing
so throws. The fix is to **interpose a layout operator** between the grouping
and the cut, so each group's slices collapse back into a single node before the
`by`-operator arranges them:

```js
gf.chart(data)
  .flow(
    gf.spread({ by: "vintage", dir: "x", spacing: 40 }), // one bottle per group
    gf.stack({ dir: "y", reverse: true }) // collapse each group's slices into one node
  )
  .mark(gf.image({ href, w: 193, h: 600 }).cut({ dir: "y", size: "amount" }));
```

The inner `stack` consumes the expand mark (cutting one bottle per group and
stacking its slices back into a whole), so the outer `spread({ by })` sees a
single node per group — no throw.

## Size semantics

`size` is a `(number | datum)[]`. Each element is one slice's extent along
`dir`, with a **field / datum / literal** trichotomy
([#266](https://github.com/joshpoll/gofish/issues/266)):

| `size` element        | Meaning                                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `number` (e.g. `100`) | **Absolute** source pixels. Windows consume the source in order from offset 0; leftover source past the summed extents is **omitted** (never appears in any slice). If the extents sum to **more** than the source extent, `cut` throws. |
| `datum(n)`            | **Relative** weight. The whole array is normalized to fill the source extent exactly.                                                                                                                                                    |
| field name (string)   | _Modifier form only._ Resolved per row and treated as a `datum` weight.                                                                                                                                                                  |

Mixing raw numbers and `datum()` in one array is a provenance/type error and
**throws** — pick one. Equal slices are `Array(n).fill(datum(1))` (or, in the
modifier form, simply omit `size`).

```js
// Absolute pixels: a 600px source, only 0–400 sliced; 400–600 omitted.
gf.cut(rect, { dir: "x", size: [100, 100, 200] });

// Relative weights: always fills the source, whatever its extent.
gf.cut(rect, { dir: "x", size: [datum(1), datum(1), datum(2)] });
```

## inset

`inset` removes `inset` pixels from each slice's source window, split half on
each side along `dir`, producing a "chunk taken out" gap between adjacent
slices even before any combinator spacing. Default 0.

## No default layout

Because `cut` only ever returns the slice array, the surrounding combinator
decides everything spatial. The same `cut(...)` re-arranges freely:

```js
// Stack recomposes the slices back into the whole source (no gaps):
gf.Stack({ dir: "y" }, gf.cut(source, { dir: "y", size }));

// Spread explodes them apart:
gf.Spread(
  { dir: "y", spacing: 20, reverse: true },
  gf.cut(source, { dir: "y", size })
);
```

## Signatures

```ts
// Pure primitive — returns Promise<GoFishNode>[]
cut(source, { dir, size, inset? });

// v3 expand-mark modifier — chainable on image()/rect()
image({ ... }).cut({ dir, size?, inset? });
```

## Parameters

| Option  | Type                                                           | Description                                                                                 |
| ------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `dir`   | `"x" \| "y"`                                                   | Axis the source is sliced along.                                                            |
| `size`  | `(number \| datum)[]` (modifier also: field name, `undefined`) | Per-slice extents. See [Size semantics](#size-semantics). `N = size.length`.                |
| `inset` | `number`                                                       | Pixels removed from each slice's source window, split half per side along `dir`. Default 0. |

## How it works

Each slice is a [`mask`](/js/api/operators/region-compositing) of a window rect
over an [`offset`](/js/api/operators/offset) copy of the source:
`mask([window, offset(source)])`. The window rect defines the visible portion,
and `offset` shifts the source so the requested pixels line up beneath it — so
`cut` is built entirely from the public region-compositing and `offset`
primitives.
