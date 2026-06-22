# arrow

Draws a curved, arrowheaded connector from the first child to the second.
Like [`connect`](/python/api/operators/connect), `arrow` links elements that
have already been placed by another layer or constraint — but it renders a
directed, gently bowed arrow (powered by
[perfect-arrows](https://github.com/steveruizok/perfect-arrows)) instead of a
plain line. Reach for it in diagrams: callouts, pointer/heap edges, and labeled
annotations.

```python
from gofish import layer, arrow, rect, ref, Constraint

layer([
    layer([
        rect(w=70, h=40, fill="#9ecae1").name("a"),
        rect(w=70, h=40, fill="#fcae91").name("b"),
    ]).constrain(lambda a, b: [
        Constraint.distribute([a, b], dir="x", spacing=120),
        Constraint.align([a, b], y="middle"),
    ]),
    arrow([ref("a"), ref("b")], stroke="#333", strokeWidth=3),
]).render(w=320, h=100)
```

## Signature

```python
arrow(children, *,
      # visual
      stroke=None, strokeWidth=None, start=None,
      # curve shape (perfect-arrows)
      bow=None, stretch=None, stretchMin=None, stretchMax=None,
      padStart=None, padEnd=None, flip=None, straights=None) -> Mark
```

`Arrow` is the capitalized alias for the same factory. The children are usually
two [`ref(...)`](/python/api/selection/ref) calls (or datum-level sub-refs)
pointing at named elements placed by an earlier tier: the arrow runs **from the
first child to the second**. Fewer than two children renders nothing.

## Visual props

| Option        | Type    | Default   | Description                                                                        |
| ------------- | ------- | --------- | ---------------------------------------------------------------------------------- |
| `stroke`      | `str`   | `"black"` | Color of the arrow's line and head (and start dot, if shown)                       |
| `strokeWidth` | `float` | `3`       | Line width; also scales the arrowhead and the start dot                            |
| `start`       | `bool`  | `False`   | Draw a filled dot at the start (source) point — useful for pointer/reference edges |

## Curve shape

The arrow's path is a quadratic bezier whose bow and routing come straight from
[perfect-arrows](https://github.com/steveruizok/perfect-arrows)'
`getBoxToBoxArrow`. These options are passed through unchanged:

| Option       | Type    | Default | Description                                                                                           |
| ------------ | ------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `bow`        | `float` | `0.2`   | Baseline curvature. `0` is a straight line; higher values bow the arc further from center.            |
| `stretch`    | `float` | `0.5`   | How much the bow grows as the endpoints get closer (and shrinks as they get farther apart).           |
| `stretchMin` | `float` | `40`    | Distance (px) below which `stretch` has its full effect.                                              |
| `stretchMax` | `float` | `420`   | Distance (px) above which `stretch` has no effect.                                                    |
| `padStart`   | `float` | `5`     | Gap (px) between the source box and the start of the line.                                            |
| `padEnd`     | `float` | `20`    | Gap (px) between the end of the line and the target box — leave room for the arrowhead.               |
| `flip`       | `bool`  | `False` | Flip which side the arrow bows toward.                                                                |
| `straights`  | `bool`  | `True`  | Allow perfectly straight lines when the endpoints are axis-aligned (instead of forcing a slight bow). |

## Examples

```python
# Labeled callout: a text label pointing at a named shape (gently bowed default)
arrow([ref("label"), ref("Mercury")])

# Pointer edge: straight, with a dot at the source (e.g. a heap/stack reference)
arrow(
    [ref("stackSlot"), ref("heapCell")],
    bow=0, stretch=0, padStart=0, stroke="#1A5683", start=True,
)

# Datum-level endpoints: arrow into a specific selected sub-element
arrow(
    [ref("heap").path(0, 1).val, ref("heap").path(0, 2).elmTuples[0]],
    bow=0, padEnd=25, padStart=0, stroke="#1A5683", start=True,
)
```

## Notes

- The arrow's bbox is the union of the resolved endpoints' boxes — like
  `connect`, it does not contribute its own space.
- `ref(name)` resolves names declared via `.name(...)`. With `createName()`
  tokens, the name is global; with plain strings, it is layer-scoped.
- Use [`connect`](/python/api/operators/connect) instead when you want an
  _undirected_ line (or a multi-stop polyline) with explicit bbox-anchor
  control; use `arrow` when you want a _directed_ arrowhead and automatic curved
  routing.
- Pair the operator with z-order constraints
  ([`Constraint.z_above` / `z_below`](/python/api/constraints/constrain#constraintz_above--constraintz_below))
  when an arrow needs to sit between two elements in paint order.
