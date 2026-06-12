# cut

Slices a single source shape (an [`image`](/python/api/marks/rect) or
[`rect`](/python/api/marks/rect)) into **N clipped sub-shapes** along one
direction. Each slice shows a contiguous window of the source; together the
slices tile it.

`cut` **never lays out**. It emits a single `cut` node that the runtime expands
into slices, and leaves the arrangement to whatever you wrap it in — a
combinator ([`stack`](/python/api/operators/stack),
[`spread`](/python/api/operators/spread)) or a chart-flow operator.

```python
from gofish import spread, cut, rect, datum

spread(
    [
        cut(
            rect(w=600, h=80, fill="seagreen"),
            dir="x",
            size=[datum(1), datum(1), datum(2)],
        )
    ],
    dir="x",
    spacing=8,
).render(w=620, h=100)
```

The `rect` is cut into three windows weighted `1 : 1 : 2`; the `datum()`
weights are normalized to fill the source width exactly, and `spread` then
explodes the slices apart with an 8px gap.

## Two forms

### Pure `cut(source, ...)`

The core primitive. Returns a `cut` node you can drop straight into a
combinator's children list; the runtime flat-expands it into its N slice nodes
in place:

```python
from gofish import stack, cut, image, datum

stack(
    [
        cut(
            image(href=href, w=193, h=600),
            dir="y",
            size=[datum(d["amount"]) for d in bottle_data],
            inset=4,
        )
    ],
    dir="y",
)
```

`N` (the slice count) is `len(size)`.

### `.cut(...)` modifier

A mark built **on** the pure function, for chart-flow use. `image(...).cut(...)`
is an _expand_ mark — given the chart's data it produces N slices 1:1 with the
rows, ready for an upstream layout operator to arrange:

```python
from gofish import chart, spread, image

chart(bottle_data).flow(
    spread(dir="y", spacing=4, reverse=True)
).mark(
    image(href=href, w=193, h=600).cut(
        dir="y",
        size="amount",  # field name → per-row datum weights
        inset=4,
    )
)
```

The modifier's `size` additionally accepts a **field-name string** (resolved
per row, treated as datum-provenance — `size="amount"` is exactly
`[datum(d["amount"]) for d in bottle_data]`) and `None` (equal slices, N taken
from the data length). Each slice carries its source row, so a second sub-chart
can [`selectAll(...)`](/python/api/core/chart#cross-chart-references) the named
slices and annotate them.

### Combining with `by`-grouping

A `by`-grouped operator expects **exactly one child node per group**. But an
_expand_ mark turns each group's rows into an **array** of slice nodes — so you
cannot hang the `.cut(...)` mark directly under a `by`-grouped operator; doing
so throws. The fix is to **interpose a layout operator** between the grouping
and the cut, so each group's slices collapse back into a single node before the
`by`-operator arranges them:

```python
chart(data).flow(
    spread(by="vintage", dir="x", spacing=40),    # one bottle per group
    spread(dir="y", spacing=14, reverse=True),    # explode each group's slices apart
).mark(image(href=href, w=193, h=600).cut(dir="y", size="amount"))
```

The inner `spread` consumes the expand mark (cutting one bottle per group and
arranging its slices into a single node — with `spacing=14`, so each bottle
reads as an exploded stack of its slices), so the outer `spread(by=...)` sees a
single node per group — no throw. Use `stack` instead of `spread` here to
recompose each bottle's slices flush into a whole (no gaps), since `stack` has
no `spacing`.

## Size semantics

`size` is a list whose elements are numbers or `datum()` values. Each element
is one slice's extent along `dir`, with a **field / datum / literal**
trichotomy:

| `size` element        | Meaning                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `number` (e.g. `100`) | **Absolute** source pixels — a fixed-size slice. Claims its pixels in place.                                                |
| `datum(n)`            | **Relative** weight — a flex slice. Splits whatever source extent the fixed slices leave over, in proportion to its weight. |
| field name (`str`)    | _Modifier form only._ Resolved per row and treated as a `datum` weight.                                                     |

The two compose with **CSS-flexbox semantics**: fixed-size items sit beside
flex items. The raw numbers claim their absolute pixels first; the `datum()`
weights then split the **remainder** (source extent − sum of the absolutes)
proportionally. The two degenerate ends are the common cases:

- **All `datum()`** → the remainder is the whole source extent, so the weights
  normalize over the full source (a pure flex split).
- **All numbers** → no remainder is needed; each slice is exactly its pixels.
  Leftover source past the summed extents is simply **omitted** (never appears
  in any slice).

```python
# Pure flex: weights fill the source exactly, whatever its extent.
cut(rect, dir="x", size=[datum(1), datum(1), datum(2)])

# Pure fixed: a 600px source, only 0–400 sliced; 400–600 omitted.
cut(rect, dir="x", size=[100, 100, 200])

# Mixed: 100px + 50px fixed end caps; datum() weights split the middle
# (450px) 1:2 → 150px and 300px slices.
cut(rect, dir="x", size=[100, datum(1), datum(2), 50])
```

Equal slices are `[datum(1)] * n` (or, in the modifier form, simply omit
`size`).

`cut` **throws** on the genuinely meaningless cases:

- the **absolutes alone exceed the source extent** (the fixed claims don't fit);
- there are `datum()` weights but **no remainder is left** for them (the
  absolutes already consume the whole source);
- two `datum()` entries carry **different, both-defined measure tags** — an
  incompatible-units error. Untagged weights are permissive and unify with
  anything.

## inset

`inset` removes `inset` pixels from each slice's source window, split half on
each side along `dir`, producing a "chunk taken out" gap between adjacent
slices even before any combinator spacing. Default 0.

## No default layout

Because `cut` only ever produces the slice array, the surrounding combinator
decides everything spatial. The same `cut(...)` re-arranges freely:

```python
# stack recomposes the slices back into the whole source (no gaps):
stack([cut(source, dir="y", size=size)], dir="y")

# spread explodes them apart:
spread(
    [cut(source, dir="y", size=size)],
    dir="y",
    spacing=20,
    reverse=True,
)
```

## Signatures

```python
# Pure primitive — emits a `cut` node usable as a combinator child
cut(source, *, dir, size=None, inset=None)

# v3 expand-mark modifier — chainable on image()/rect()
image(...).cut(dir=..., size=None, inset=None)
```

## Parameters

| Option  | Type                                                         | Description                                                                                 |
| ------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `dir`   | `"x"` \| `"y"`                                               | Axis the source is sliced along.                                                            |
| `size`  | `list[number \| datum]` (modifier also: field name, omitted) | Per-slice extents. See [Size semantics](#size-semantics). `N = len(size)`.                  |
| `inset` | `number`                                                     | Pixels removed from each slice's source window, split half per side along `dir`. Default 0. |

## How it works

Each slice is a [`mask`](/python/api/operators/region-compositing) of a window
rect over an [`offset`](/python/api/operators/offset) copy of the source:
`mask([window, offset(source)])`. The window rect defines the visible portion,
and `offset` shifts the source so the requested pixels line up beneath it — so
`cut` is built entirely from the public region-compositing and `offset`
primitives. Extent resolution (the flexbox-style number/datum split) runs on
the JS side; the Python wrapper only emits the `cut` node.
