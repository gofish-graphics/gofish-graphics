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
its **origin** (its local 0 point) instead of its box. With no placed sibling
the fallback is the **axis origin**: the scale's zero (`posScale(0)`) on a
scaled axis, the layer's origin on a pixel-pure one. On a pixel-pure axis,
`align([content], y="baseline")` thus means "stay where you were laid out" —
regardless of how far its box overhangs the origin (a bar dipping below zero,
axis labels hanging under a chart). For an unconditional origin pin regardless
of axis, use `Constraint.position([ref], x=0, y=0, anchor="baseline")` instead.
Pass a single value to share one anchor across every ref; pass a list
to assign one anchor _per ref_ positionally (the list length must equal the
number of refs) — e.g. `x=["middle", "start"]` aligns the first ref's center
to the second ref's start. The first already-placed ref acts as the anchor;
unplaced refs move to match it. When both `x` and `y` are given, `x` is
resolved before `y`.

When no ref is placed yet, the fallback depends on the axis's underlying space:
a scaled axis uses the scale origin `posScale(0)`, a pixel-pure axis uses the
layer's own edge (`start` = 0, `middle` = midpoint, `end` = full extent,
`baseline` = layer origin).

### `"span"` and `"size"`

`x` / `y` also accept `"span"` and `"size"` — an **interval statistic** rather
than a point anchor, equating the size cell itself:

- `"span"` — the target adopts the source's **both** endpoints: position AND
  size (e.g. a border rect that exactly bounds a placed group).
- `"size"` — the target adopts only the source's **length**, without moving
  (e.g. a divider that matches a stack's width but is positioned
  independently).

As with the point-anchor form, the source is the first already-placed ref;
every other listed ref is a target.

```python
layer([group, rect(fill="none", stroke="#333").name("border")]).constrain(
    lambda group, border: [
        Constraint.align([group, border], x="span"),  # border adopts group's left AND right
        Constraint.align([group, border], y="span"),  # together: border exactly bounds the group
    ]
)
```

**Unbound-target scope**: `"span"`/`"size"` only apply when the target has
**no intrinsic size** on that axis (a bare `rect()` with no `w`/`h`/data
binding on that axis). If the target already has an intrinsic size, this is
an ownership conflict — GoFish raises a structured error naming the
constraint and the target's own size option, rather than silently clobbering
or skipping it. Fractional/two-sided anchors, offsets, and cross-axis length
matching are not supported. `"span"`/`"size"` are whole-constraint values and
cannot appear inside a per-ref list.

### Per-ref anchors

The list form of `x` / `y` expresses "edges share" relations directly — the
per-ref generalization of the single-anchor form, instead of going through a
`distribute` with a negative `spacing`:

```python
# "A's center aligns with B's start" — shared-edge layouts where two refs
# overlap by a known fraction of their bbox.
Constraint.align([a, b], x=["middle", "start"])

# "B's end touches C's start" — adjacent placement.
Constraint.align([b, c], x=["end", "start"])
```

## Constraint.distribute

Stacks a set of refs end-to-end along an axis, with optional spacing.

```python
Constraint.distribute(refs, *, dir, spacing=None, anchor=None, order=None, glue=None, weights=None)
```

| Parameter | Type                                                           | Default     | Description                                                                                                                                        |
| --------- | -------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dir`     | `"x"` \| `"y"`                                                 | —           | **Required.** Axis to distribute along.                                                                                                            |
| `spacing` | `int`                                                          | `8`         | Gap between each element (forced to `0` when `glue` is set).                                                                                       |
| `anchor`  | `"edge"` \| `"start"` \| `"middle"` \| `"end"` \| `"baseline"` | `"edge"`    | Spacing measured between facing edges (`"edge"`), or as a fixed pitch between a chosen point on each element: `anchor[i+1] = anchor[i] + spacing`. |
| `order`   | `"forward"` \| `"reverse"`                                     | `"forward"` | Order to place elements.                                                                                                                           |
| `glue`    | `bool`                                                         | `False`     | Stack semantics: children touch, and their data-driven extents commit to one positional axis.                                                      |
| `weights` | `list[float]`                                                  | —           | Per-child budget weights (one per child, positional) — how fill children share the layer's slice space.                                            |

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

### Space resolution and auto-fit

`distribute` (and `align`) don't just position refs after layout — they
participate in **underlying-space resolution**, exactly like the operators
built on them. A `distribute` over data-sized children composes their size
claims (sum + spacing) into the layer's claim on that axis; when the layer is
then given a size (an explicit `w`/`h`, or an allotted budget from its parent
or a coordinate transform), it solves for the scale factor that makes the
children fit, and proposes budget slices (equal, or per `weights`) to children
with no size claim of their own. With `glue=True` the composed extents commit
to an anchored positional axis instead — that's a stacked bar chart. In other
words: a constraint-assembled layer auto-fits the same way a `spread`/`stack`
does.

```python
layer([
    rect(w=60, h=datum(30), fill="#e63946").name("a"),
    rect(w=60, h=datum(50), fill="#457b9d").name("b"),
    rect(w=60, h=datum(20), fill="#2a9d8f").name("c"),
]).constrain(
    lambda a, b, c: [
        Constraint.align([a, b, c], x="start"),
        Constraint.distribute([a, b, c], dir="y", glue=True),
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

## Constraint.nest

Sizes one ref to wrap (or be wrapped by) another with a fixed padding — the
first **size-setting** constraint. Given `[outer, inner]`, the relation
`outer = inner + 2*padding` holds on each constrained axis, and `inner` is
centered inside `outer` there.

```python
Constraint.nest(refs, *, x=None, y=None)
```

| Parameter | Type    | Description                                                 |
| --------- | ------- | ----------------------------------------------------------- |
| `refs`    | `list`  | Exactly `[outer, inner]` — outer nests inner.               |
| `x`       | `float` | Per-axis padding (px) on x (omit to leave x unconstrained). |
| `y`       | `float` | Per-axis padding (px) on y (omit to leave y unconstrained). |

At least one of `x` / `y` must be given; `refs` must be exactly two. Padding is
always known — the unknown per axis is _which_ side is derived, resolved from
which side carries the size:

- **Inside-out** (`outer = inner + 2*padding`): the inner is sized and the outer
  is not — a box that shrink-wraps its content. The derived outer size enters the
  layer's size request, so a nested pair inside an auto-fit context (a
  `spread` of nested pairs) participates in the scale solve.
- **Outside-in** (`inner = outer - 2*padding`): the outer carries the size and
  the inner is claim-less — exactly CSS `padding`.
- **Center only**: when neither side is sized, the layer fills the outer, then
  resolves outside-in over that filled box.

```python
from gofish import layer, rect, Constraint

# inner 60x40, padding 10 -> outer 80x60; inner centered (inner.min = 10).
layer([
    rect(fill="#dbe6f3").name("outer"),
    rect(w=60, h=40, fill="#e63946").name("inner"),
]).constrain(
    lambda outer, inner: [
        Constraint.nest([outer, inner], x=10, y=10),
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
render flattens the (non-component) subtree into a single paint list and
**topologically sorts** it. Within the order the constraints don't pin, the
existing default order is preserved (`.z_order(n)` hints first, then declaration
order); a cycle (`z_above(a, b)` + `z_above(b, a)`) raises an error at render
time.

```python
layer([
    rect(w=80, h=40, fill="lightgray").name("bg"),
    rect(w=60, h=60, fill="steelblue").name("box"),
    text(text="label", fontSize=14).name("label"),
]).constrain(
    lambda bg, box, label: [
        # box paints over bg; label paints over both.
        Constraint.z_above(box, bg),
        Constraint.z_above(label, box),
    ]
)
```

### Cross-tier references

Z-order refs can reach into the layer's _direct_ children and into any
**plain (non-component) nested `layer`** below — the same descent rule `ref()`
uses inside `mark` composites. This makes patterns like "rope on the outer
layer slots in z between two pulleys in the inner layer" expressible without
restructuring the AST.

### When to use this vs `.z_order(n)`

- Use `.z_order(n)` when you want a _global tier_ (e.g. "all ropes go behind
  all wheels").
- Use `Constraint.z_above` / `z_below` when you want a _relational_ exception
  (e.g. "this specific rope sits between these two specific wheels").

The two compose: `.z_order(n)` sets the default order; z-order constraints
override it for the pairs they name.

## spread equivalences

Constraints are the primitive `spread` and `stack` are built on — literally:
the operators delegate their space resolution, budget slicing, and placement
walks to the same machinery the constraint path uses. These pairs are
equivalent, **including** scale solving and auto-fit, not just placement:

| spread                                                | Constraint equivalent                                |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `spread(items, dir="y", alignment="start")`           | `align(x="start")` + `distribute(dir="y")`           |
| `spread(items, dir="x", alignment="end", spacing=10)` | `align(y="end")` + `distribute(dir="x", spacing=10)` |
| `spread(items, dir="x", spacing=60, anchor="middle")` | `distribute(dir="x", spacing=60, anchor="middle")`   |
| `spread(items, dir="y", reverse=True)`                | `distribute(dir="y", order="reverse")`               |
| `stack(items, dir="y")`                               | `distribute(dir="y", glue=True)`                     |
| `spread(items, dir="x", stackWeights=[2, 1])`         | `distribute(dir="x", weights=[2, 1])`                |

When **no ref is pre-placed**, the cross-axis alignment fallback depends on the
**axis**, not the API — `spread` and the `align` constraint resolve the same
fallback, so the pairs above are exact. A scaled (POSITION) axis falls back to
the scale origin `posScale(0)` (so SIZE-derived bars hang from the zero line); a
pixel-pure axis falls back to the layer-box edge (`start` → 0, `middle` →
midpoint, `end` → full extent).

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
