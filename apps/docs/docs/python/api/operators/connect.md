# connect

Draws a connector (line) between each consecutive pair of children. Used for
linking elements that have already been placed by another layer or
constraint — most commonly inside a [nested-tier](/internals/design/principles)
layout where the inner tier places the shapes and the outer tier draws the
connections.

```python
from gofish import layer, connect, rect, ref, Constraint

layer([
    layer([
        rect(w=60, h=40, fill="#9ecae1").name("a"),
        rect(w=60, h=40, fill="#fcae91").name("b"),
    ]).constrain(lambda a, b: [
        Constraint.distribute([a, b], dir="x", spacing=80),
        Constraint.align([a, b], y="middle"),
    ]),
    connect(
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
connect(children, *, source=None, target=None,
        stroke=None, strokeWidth=None, fill=None, opacity=None,
        mixBlendMode=None, interpolation=None,
        # for non-anchor (edge) mode:
        direction=None, mode=None) -> Mark
```

`Connect` is the capitalized alias for the same factory. The children are
usually [`ref(...)`](/python/api/selection/ref) calls that point at named
elements placed by an earlier tier.

## Anchor mode (recommended)

When `source` or `target` is provided, `connect` runs a straight line between
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
connect([ref("a"), ref("b")], source="end", target="start")

# One anchor: target endpoint is clamped onto B's bbox
connect([ref("A"), ref("B")], source=["end", "middle"])
# -> straight horizontal line from A's right-middle to B's left edge at the same y

# Center-to-center is the most common: just use "middle"
connect([ref("A"), ref("B")], source="middle", target="middle")
```

## Edge mode (no anchors)

When neither `source` nor `target` is given, `connect` falls back to
edge mode: it routes between the children's facing edges along
`direction`. This is the legacy path; most diagrams should prefer anchor
mode.

| Option      | Type                                         | Default  | Description                           |
| ----------- | -------------------------------------------- | -------- | ------------------------------------- |
| `direction` | `"horizontal"` \| `"vertical"` \| `0` \| `1` | `0`      | Axis the connector runs along         |
| `mode`      | `"edge"` \| `"center"`                       | `"edge"` | Where the line attaches on each child |

## Visual props

| Option          | Type                       | Default                                                   | Description                                                                                                             |
| --------------- | -------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `stroke`        | `str`                      | `fill`                                                    | Stroke color                                                                                                            |
| `strokeWidth`   | `float`                    | `0`                                                       | Stroke width                                                                                                            |
| `fill`          | `str` \| `Value`           | `"black"`                                                 | Fill (for closed paths; channel-bindable)                                                                               |
| `opacity`       | `float`                    | `1`                                                       | Element opacity                                                                                                         |
| `mixBlendMode`  | `"multiply"` \| `"normal"` | `"multiply"` in edge mode / `"normal"` in `mode="center"` | Blend mode of the rendered path. Override to `"normal"` for opaque strokes that don't darken under colored backgrounds. |
| `interpolation` | `"linear"` \| `"bezier"`   | `"linear"`                                                | Path interpolation between consecutive children                                                                         |

## Examples

```python
# Center-to-center, opaque
connect(
    [ref("A"), ref("B")],
    stroke="#774e32",
    strokeWidth=3,
    mixBlendMode="normal",
    source="middle",
)

# Bottom-to-top vertical link (e.g. ceiling -> hanging weight)
connect(
    [ref("ceiling"), ref("weight")],
    source=["middle", "start"],
    target=["middle", "end"],
)

# One-sided clamp: A's right-middle straight across to B
connect([ref("A"), ref("B")], source=["end", "middle"])

# Multi-stop polyline: each consecutive pair gets its own segment
connect([ref("A"), ref("B"), ref("C")], source="middle")
```

## Notes

- This is the **low-level layout operator**, distinct from the builder method
  [`ChartBuilder.connect()`](/python/api/core/connect). The builder
  `.connect(line())` is the canonical spelling for simple line/area charts: it
  threads a ref-consuming _mark_ through a chart's own marks. This operator
  connects explicitly-listed `ref(...)` children inside a layout — reach for it
  only for cross-chart or hand-placed diagrams.
- The high-level [`line`](/python/api/marks/line) and
  [`area`](/python/api/marks/area) marks are thin wrappers over `connect`: they
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
