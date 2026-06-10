# constrain

`.constrain()` positions named children of a `layer` relative to each other
using declarative rules. It is the low-level alternative to `spread` when you
need precise control over how individual elements relate — for example, aligning
a label to the edge of a background, or placing tick marks at their data values.

This is the Python mirror of the JS [constrain](/js/api/constraints/constrain)
page; the constraint surface is identical, with Python conventions (options as
keyword arguments, `z_above` / `z_below` snake-cased).

## Usage

Name each child you want to position with `.name("key")`, then chain
`.constrain()` on the `layer`. The callback receives one ref per named child as
a keyword argument.

```python
from gofish import layer, rect, text, Constraint

layer([
    rect(w=200, h=150, fill="#e2ebf6").name("bg"),
    text(text="Title", fontSize=18).name("label"),
]).constrain(
    lambda bg, label: [
        Constraint.align([label, bg], x="middle", y="end"),
    ]
)
```

## Constraint.align

Aligns a set of refs to a shared edge or center on one or both axes. At least
one of `x` / `y` must be given.

```python
Constraint.align(refs, *, x=None, y=None)
```

| Parameter | Type                 | Description                                                   |
| --------- | -------------------- | ------------------------------------------------------------- |
| `refs`    | `list[Ref]`          | The refs to align (the kwargs from the callback).             |
| `x`       | `str` \| `list[str]` | Edge/center/origin to align on x (omit to leave x untouched). |
| `y`       | `str` \| `list[str]` | Edge/center/origin to align on y.                             |

The anchor is `"start" | "middle" | "end" | "baseline"`. The first three
anchor a ref by its bounding-box edge or center. `"baseline"` anchors a ref by
its **origin** (its local 0 point) instead of its box: `align([content],
y="baseline")` with no placed sibling pins the ref's origin to the layer's
origin — i.e. "stay where you were laid out" — regardless of how far its box
overhangs the origin (a bar dipping below zero, axis labels hanging under a
chart). Pass a single value to share one anchor across every ref; pass a list
to assign one anchor _per ref_ positionally (the list length must equal the
number of refs) — e.g. `x=["middle", "start"]` aligns the first ref's center
to the second ref's start. The first already-placed ref acts as the anchor;
unplaced refs move to match it.

## Constraint.distribute

Stacks a set of refs end-to-end along an axis, with optional spacing.

```python
Constraint.distribute(refs, *, dir, spacing=None, mode=None, order=None)
```

| Parameter | Type                       | Default     | Description                                        |
| --------- | -------------------------- | ----------- | -------------------------------------------------- |
| `dir`     | `"x"` \| `"y"`             | —           | **Required.** Axis to distribute along.            |
| `spacing` | `int`                      | `8`         | Gap between each element.                          |
| `mode`    | `"edge"` \| `"center"`     | `"edge"`    | Spacing measured edge-to-edge or center-to-center. |
| `order`   | `"forward"` \| `"reverse"` | `"forward"` | Order to place elements.                           |

The first already-placed ref acts as an anchor; unplaced refs after it are
distributed forward, and those before it backward so they stack flush.

```python
layer([
    rect(w=80, h=40).name("a"),
    rect(w=80, h=60).name("b"),
    rect(w=80, h=30).name("c"),
]).constrain(
    lambda a, b, c: [
        Constraint.align([a, b, c], x="start"),
        Constraint.distribute([a, b, c], dir="y", spacing=8),
    ]
)
```

## Constraint.position

Places a ref at an `x` and/or `y` coordinate — the data-driven counterpart to
`align`/`distribute`, which only relate refs to each other. It mirrors how you
position a shape: each coordinate is either a **literal** pixel value or a
**`datum`** (`datum(n)`). A literal is placed as-is; a datum is mapped through a
scale the `layer` infers from the datum coordinates of its `position`
constraints (their union is the layer's domain on that axis, mapped onto the
layer's pixel size). This is how a hand-drawn continuous axis places each tick at
its value rather than assuming uniform spacing.

```python
Constraint.position(refs, *, x=None, y=None, anchor=None)
```

| Parameter | Type             | Default    | Description                                                                                                             |
| --------- | ---------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `x`       | `int` \| `datum` | —          | x coordinate — literal pixel or `datum(n)` (scaled).                                                                    |
| `y`       | `int` \| `datum` | —          | y coordinate — literal pixel or `datum(n)` (scaled).                                                                    |
| `anchor`  | `str`            | `"middle"` | Which anchor of the ref lands on the coordinate (`"start"`, `"middle"`, `"end"`, or `"baseline"` for the ref's origin). |

At least one of `x` / `y` is required. Only `datum` coordinates feed the layer's
inferred scale; literal pixels are placed directly and don't define the domain.

A datum coordinate supports **pixel-offset arithmetic** — "this data position,
plus pixels", applied after the scale mapping:

```python
# Seat a line 6px outside the y = 0 grid position, wherever 0 lands.
Constraint.position([line], y=datum(0) - 6, anchor="end")
```

The offset shifts the resolved position without affecting the inferred domain
(`datum(0) - 6` still contributes `0` to the scale). It works anywhere a datum
is accepted — shape coordinates too, not just constraints. (The JS equivalent
is `datum(0).offset(-6)`.)

```python
from gofish import layer, rect, datum, Constraint

# A continuous y-axis: each tick centered at its data value. Passing datum(v)
# maps it through the y-scale the layer derives from these constraints
# (domain [0, 300] -> plot height). A bare number would be a raw pixel instead.
tick_values = [0, 50, 100, 150, 200, 250, 300]

layer(
    [rect(w=1, h=300, fill="#999").name("axis")]
    + [_tick(v).name(f"t{i}") for i, v in enumerate(tick_values)]
).constrain(
    lambda **g: [
        Constraint.align([g["axis"]], y="start"),
        *[
            Constraint.position([g[f"t{i}"]], y=datum(v))
            for i, v in enumerate(tick_values)
        ],
    ]
)
```

## Constraint.z_above / Constraint.z_below

Declare a partial-order relation between two named children for **paint order**
(z-order) only. They do not affect position.

```python
Constraint.z_above(a, b)  # a paints in front of b (on top in z)
Constraint.z_below(a, b)  # a paints behind b (under in z)
```

`z_below(a, b)` is equivalent to `z_above(b, a)`; both are provided so the spec
reads naturally either way. When a `layer` carries any z-order constraint, the
render flattens the subtree and topologically sorts it; a cycle raises an error.

## Partial placement

Constraints only apply to the axes you specify. Unmentioned axes fall back to 0,
so you can mix manually-positioned children with constraint-placed ones:

```python
layer([
    rect(w=80, h=40, y=20).name("a"),  # y set manually
    rect(w=120, h=40).name("b"),
    rect(w=60, h=40).name("c"),
]).constrain(
    lambda a, b, c: [
        # Only constrain x — each element keeps its own y
        Constraint.align([a, b, c], x="end"),
    ]
)
```

## Subset selection

A single `layer` can have multiple constraints that each target different subsets
of its children:

```python
layer([
    rect(w=100, h=50).name("a"),
    rect(w=80, h=50).name("b"),
    rect(w=120, h=50).name("c"),
    rect(w=60, h=50).name("d"),
]).constrain(
    lambda a, b, c, d: [
        Constraint.align([a, b, c, d], x="end"),
        Constraint.distribute([a, b], dir="y", spacing=5),   # tight grouping
        Constraint.distribute([c, d], dir="y", spacing=30),  # loose grouping
    ]
)
```
