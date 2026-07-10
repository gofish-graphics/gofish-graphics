# line / ribbon connector (combinator form)

Draws a connector between each consecutive pair of children. Used for
linking elements that have already been placed by another layer or
constraint — most commonly inside a [nested-tier](/internals/design/principles)
layout where the inner tier places the shapes and the outer tier draws the
connections.

::: tip Renamed from `connect`
The low-level `connect` / `connect_x` / `connect_y` operators (and the
capitalized `Connect(...)`) **have been removed**. The connector primitive is now
spelled as the _combinator form_ of the [`line`](/python/api/marks/line) mark
(center) and the [`ribbon`](/python/api/marks/ribbon) mark (edge band): you pass
an explicit list of `ref(...)` children as the first positional argument.

| Removed                                         | Replacement                                                    |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `connect([ref("a"), ref("b")], ...)`            | `line([ref("a"), ref("b")], ...)`                              |
| `Connect([...], ...)`                           | `line([...], ...)`                                             |
| `connect_x(...)` / `connect_y(...)` (edge band) | `ribbon([...], dir="x")` / `ribbon([...], dir="y")`            |
| `interpolation="linear" \| "bezier"`            | `curve="straight" \| "bezier"` (see [Path curve](#path-curve)) |

This page is still served at `operators/connect` so existing cross-links keep
working.
:::

```python
from gofish import layer, line, rect, ref, Constraint

layer([
    layer([
        rect(w=60, h=40, fill="#9ecae1").name("a"),
        rect(w=60, h=40, fill="#fcae91").name("b"),
    ]).constrain(lambda a, b: [
        Constraint.distribute([a, b], dir="x", spacing=80),
        Constraint.align([a, b], y="middle"),
    ]),
    line(
        [ref("a"), ref("b")],
        stroke="black",
        strokeWidth=2,
        source=["end", "middle"],
        target=["start", "middle"],
    ),
]).render(w=240, h=80)
```

## Signature

```python
# center connector
line(children, *, source=None, target=None,
     stroke=None, strokeWidth=None, strokeDasharray=None, fill=None,
     opacity=None, mixBlendMode=None, curve=None,
     # for non-anchor (edge) mode:
     direction=None, mode=None) -> Mark

# edge band
ribbon(children, *, dir=None, ...) -> Mark
```

The children are usually [`ref(...)`](/python/api/selection/ref) calls that point
at named elements placed by an earlier tier. Passing an explicit children list
(rather than letting the mark take refs from a `selectAll(...)` upstream) is what
makes this the _combinator_ form.

## Anchor mode (recommended)

When `source` or `target` is provided, `line` runs a straight line between
the _anchored points_ on each consecutive pair of children's bounding boxes —
ignoring `direction` and `mode`. The anchor is a normalized fraction of the
bbox: `[0, 0]` = bottom-left, `[1, 1]` = top-right, `[0.5, 0.5]` = center.
(GoFish is y-up.)

Anchors accept three forms — pick the one that reads clearest at the call
site:

```python
# Single keyword: both axes share the alignment
source="middle"              # = [0.5, 0.5]

# Per-axis list: each axis can be a keyword or a number
source=["start", "middle"]   # = [0,   0.5]
source=[0.5, "end"]          # = [0.5, 1]

# Axis-keyed dict: only set the axes you care about; omitted = 0.5
source={"x": "start"}        # = [0,   0.5]
source={"y": 0.25}           # = [0.5, 0.25]
```

Where `start` → `0`, `middle` → `0.5`, `end` → `1`.

### One anchor or two?

|                                  | Behavior                                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both `source` and `target` given | Line runs directly between the two anchored points.                                                                                                                                          |
| Only one given                   | The line's other endpoint is the specified point **clamped onto the opposite bbox** per axis. Produces an axis-aligned line when the specified point lies inside the other bbox on one axis. |
| Neither (and `direction` set)    | See "Edge mode" below.                                                                                                                                                                       |

```python
# Both anchors: literal line between two corners
line([ref("a"), ref("b")], source="end", target="start")

# One anchor: target endpoint is clamped onto B's bbox
line([ref("A"), ref("B")], source=["end", "middle"])
# -> straight horizontal line from A's right-middle to B's left edge at the same y

# Center-to-center is the most common: just use "middle"
line([ref("A"), ref("B")], source="middle", target="middle")
```

## Edge mode (no anchors)

When neither `source` nor `target` is given, `line` falls back to
edge mode: it routes between the children's facing edges along
`direction`. For an edge _band_ between the children, use
[`ribbon`](/python/api/marks/ribbon) instead. This is the legacy path; most
diagrams should prefer anchor mode.

| Option      | Type                                         | Default  | Description                           |
| ----------- | -------------------------------------------- | -------- | ------------------------------------- |
| `direction` | `"horizontal"` \| `"vertical"` \| `0` \| `1` | `0`      | Axis the connector runs along         |
| `mode`      | `"edge"` \| `"center"`                       | `"edge"` | Where the line attaches on each child |

## Visual props

| Option            | Type                          | Default    | Description                                                                                                                      |
| ----------------- | ----------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `stroke`          | `str`                         | `fill`     | Stroke color                                                                                                                     |
| `strokeWidth`     | `float`                       | `0`        | Stroke width                                                                                                                     |
| `strokeDasharray` | `str`                         | solid      | SVG dash pattern for the stroked path (e.g. `"8"`, `"4 2"`), same spelling as `enclose`'s option                                 |
| `fill`            | `str` \| `Value`              | `"black"`  | Fill (for closed paths; channel-bindable)                                                                                        |
| `opacity`         | `float`                       | `1`        | Element opacity                                                                                                                  |
| `mixBlendMode`    | `"multiply"` \| `"normal"`    | `"normal"` | Blend mode of the rendered path. Override to `"multiply"` for overlapping translucent bands that should darken where they cross. |
| `curve`           | see [Path curve](#path-curve) | `"auto"`   | Shape of the path between consecutive children (replaces the removed `interpolation`)                                            |

## Path curve

The `curve` option replaces the old `interpolation` / `route` options with a
single knob controlling the shape of the path drawn between consecutive children:

| Value                       | Description                                           |
| --------------------------- | ----------------------------------------------------- |
| `"auto"` (default)          | Picks a sensible curve for the connector              |
| `"straight"` / `straight()` | Straight segments between points (the old `"linear"`) |
| `"bezier"` / `bezier()`     | Smooth Bézier curve through the points                |
| `orthogonal()`              | Right-angled (elbow) routing                          |
| `arc(direction=...)`        | Circular arc; `direction` chooses the bow side        |
| `perfect_arrows(bow=...)`   | perfect-arrows routing with a `bow` amount            |

```python
line([ref("A"), ref("B")], source="middle", curve="bezier")
line([ref("A"), ref("B")], source="middle", curve=arc(direction="clockwise"))
```

## Examples

```python
# Center-to-center, opaque
line(
    [ref("A"), ref("B")],
    stroke="#774e32",
    strokeWidth=3,
    mixBlendMode="normal",
    source="middle",
)

# Bottom-to-top vertical link (e.g. ceiling -> hanging weight)
line(
    [ref("ceiling"), ref("weight")],
    source=["middle", "start"],
    target=["middle", "end"],
)

# One-sided clamp: A's right-middle straight across to B
line([ref("A"), ref("B")], source=["end", "middle"])

# Multi-stop polyline: each consecutive pair gets its own segment
line([ref("A"), ref("B"), ref("C")], source="middle")

# Edge band between two shapes
ribbon([ref("A"), ref("B")], dir="x")
```

## Notes

- This is the **low-level combinator form** of the `line` / `ribbon` marks,
  distinct from chaining [`.layer()`](/python/api/core/layer) with a bare
  connector mark. `.layer(line())` is the canonical spelling for simple
  line/area charts: it threads a ref-consuming _mark_ through a chart's own
  marks. This combinator form connects explicitly-listed `ref(...)` children
  inside a layout — reach for it only for cross-chart or hand-placed diagrams.
- The same [`line`](/python/api/marks/line) and
  [`ribbon`](/python/api/marks/ribbon) marks also work in _selection_ form: they
  take the array of refs from [`selectAll(...)`](/python/api/selection/ref) and
  connect them. To re-partition a selection before connecting (e.g. one area per
  species), run it through a path-aware operator first —
  `group(by="datum.species")`; see
  [`spread` -> path-aware `by`](/python/api/operators/spread#path-aware-by).
- `ref(name)` resolves names declared via `.name(...)`. With `createName()`
  tokens, the name is global; with plain strings, it is layer-scoped.
- The connector's bbox is the union of the resolved endpoints — it does
  not contribute its own space.
- Pair the operator with z-order constraints
  ([`Constraint.z_above` / `z_below`](/python/api/constraints/constrain#constraintz_above--constraintz_below))
  when a connector needs to sit _between_ two elements in paint order.
