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
    gf.spread({ dir: "y", spacing: 14, reverse: true }) // explode each group's slices apart
  )
  .mark(gf.image({ href, w: 193, h: 600 }).cut({ dir: "y", size: "amount" }));
```

The inner `spread` consumes the expand mark (cutting one bottle per group and
arranging its slices into a single node — with `spacing: 14`, so each bottle
reads as an exploded stack of its slices), so the outer `spread({ by })` sees a
single node per group — no throw. Use `stack` instead of `spread` here to
recompose each bottle's slices flush into a whole (no gaps), since `stack` has
no `spacing`.

## Size semantics

`size` is a `(number | datum)[]`. Each element is one slice's extent along
`dir`, with a **field / datum / literal** trichotomy
([#266](https://github.com/joshpoll/gofish/issues/266)):

| `size` element        | Meaning                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `number` (e.g. `100`) | **Absolute** source pixels — a fixed-size slice. Claims its pixels in place.                                                |
| `datum(n)`            | **Relative** weight — a flex slice. Splits whatever source extent the fixed slices leave over, in proportion to its weight. |
| field name (string)   | _Modifier form only._ Resolved per row and treated as a `datum` weight.                                                     |

The two compose with **CSS-flexbox semantics**: fixed-size items sit beside
flex items. The raw numbers claim their absolute pixels first; the `datum()`
weights then split the **remainder** (source extent − sum of the absolutes)
proportionally. The two degenerate ends are the common cases:

- **All `datum()`** → the remainder is the whole source extent, so the weights
  normalize over the full source (a pure flex split).
- **All numbers** → no remainder is needed; each slice is exactly its pixels.
  Leftover source past the summed extents is simply **omitted** (never appears
  in any slice).

```js
// Pure flex: weights fill the source exactly, whatever its extent.
gf.cut(rect, { dir: "x", size: [datum(1), datum(1), datum(2)] });

// Pure fixed: a 600px source, only 0–400 sliced; 400–600 omitted.
gf.cut(rect, { dir: "x", size: [100, 100, 200] });

// Mixed: 100px + 50px fixed end caps; datum() weights split the middle
// (450px) 1:2 → 150px and 300px slices.
gf.cut(rect, { dir: "x", size: [100, datum(1), datum(2), 50] });
```

Equal slices are `Array(n).fill(datum(1))` (or, in the modifier form, simply
omit `size`).

`cut` **throws** on the genuinely meaningless cases:

- the **absolutes alone exceed the source extent** (the fixed claims don't fit);
- there are `datum()` weights but **no remainder is left** for them (the
  absolutes already consume the whole source);
- two `datum()` entries carry **different, both-defined measure tags**
  (`datum(v, measure)`) — an incompatible-units error. Untagged weights are
  permissive and unify with anything; this reuses the same measure unification
  as the underlying-space type system
  ([#527](https://github.com/joshpoll/gofish/issues/527)).

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

## Croissant charts: recomposing in continuous space

`inset` shrinks both the visible window **and** the slice's reported bounding
box — a slice reports the bounds of its visible region, not its full logical
extent. That is deliberate (`mask` reports the region's bounds). It does mean a
plain flush `Stack` pulls the inset slices flush and drops the gaps (`Stack`
recomposes its children flush by design — it has no `spacing` option).

To recompose the slices back into the source's **continuous** space while
keeping the inset gaps — a
[croissant chart](https://vis.khoury.northeastern.edu/pubs/Fygenson2026CroissantChartsModulating/) —
pad each slice back to its full logical extent in user space: add `inset / 2`
of transparent space on each side along `dir` (an inner `Stack` with
zero-cross-extent spacer rects), then flush-stack the padded slices.
The padding amount is the constant `inset / 2`, independent of each slice's
extent, so the same wrapper works for any `size`:

```js
const inset = 20;
const slices = gf.cut(source, { dir: "x", size, inset });

// inset/2 of transparent space on each side restores the carved-out gap.
const spacer = () =>
  gf.rect({ w: inset / 2, h: 0, fill: "none", stroke: "none" });
const padded = slices.map((slice) =>
  gf.Stack({ dir: "x" }, [spacer(), slice, spacer()])
);

gf.Stack({ dir: "x" }, padded);
```

The recomposed row spans the source's **exact** extent, with an even `inset`-wide
gap at every cut point. (There is no built-in one-axis padding operator —
`Frame`/`layer` size to their content, so they can't pad a smaller child;
the spacer rects are the spelling.)

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
