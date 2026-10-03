---
order: 90
---

# arrow

Draws a curved, arrowheaded connector from the first child to the second.
Like [`line`](/python/api/marks/line), `arrow` links elements that
have already been placed by another layer or constraint — but it renders a
directed, gently bowed arrow (powered by
[perfect-arrows](https://github.com/steveruizok/perfect-arrows)) instead of a
plain line. Reach for it in diagrams: callouts, pointer/heap edges, and labeled
annotations.

```python
from gofish import layer, arrow, rect, Constraint

layer([
    rect(w=70, h=40, fill="#9ecae1").name("a"),
    rect(w=70, h=40, fill="#fcae91").name("b"),
]).relate(lambda a, b: [
    Constraint.distribute([a, b], dir="x", spacing=120),
    Constraint.align([a, b], y="middle"),
    arrow([a, b], stroke="#333", stroke_width=3),
]).render(w=320, h=100)
```

## Signature

```python
arrow(children, *,
      # visual
      stroke=None, stroke_width=None, start=None,
      # curve shape (perfect-arrows)
      bow=None, stretch=None, stretch_min=None, stretch_max=None,
      pad_start=None, pad_end=None, flip=None, straights=None) -> Mark
```

The children are usually two named elements: parameters of a
[`.relate()`](/python/api/constraints/relate) callback, or
[`ref(...)`](/python/api/selection/ref) calls (or datum-level sub-refs of a
`create_name` token). The arrow runs **from the first child to the second**.
Fewer than two children renders nothing.

## Parameters

::: gofish-ref arrow
:::

## Curve shape

The arrow's path is a quadratic bezier whose bow and routing come straight from
[perfect-arrows](https://github.com/steveruizok/perfect-arrows)'
`getBoxToBoxArrow`. The `bow`, `stretch`, `stretch_min`, `stretch_max`,
`pad_start`, `pad_end`, `flip`, and `straights` options above are passed through
to it unchanged.

## Examples

```python
# Labeled callout: a text label pointing at a named shape (gently bowed default)
layer([planets, label]).relate(lambda label, Mercury: [arrow([label, Mercury])])

# Pointer edge: straight, with a dot at the source (e.g. a heap/stack reference)
layer([stack, heap]).relate(lambda stackSlot, heapCell: [
    arrow(
        [stackSlot, heapCell],
        bow=0, stretch=0, pad_start=0, stroke="#1A5683", start=True,
    ),
])

# Datum-level endpoints: arrow into a specific selected sub-element of a
# create_name token (a token reaches across component boundaries)
arrow(
    [ref(heap).path(0, 1).val, ref(heap).path(0, 2).elmTuples[0]],
    bow=0, pad_end=25, pad_start=0, stroke="#1A5683", start=True,
)
```

## Notes

- The arrow's bbox is the union of the resolved endpoints' boxes — like
  `line`, it does not contribute its own space.
- An arrow over string names is a `.relate()` clause: it is laid out after the
  layer's constraints, so it runs between the final positions of its
  endpoints. A string `ref("name")` outside a `.relate()` clause is an error.
  With `create_name()` tokens, the name is global and `ref(token)` works
  anywhere.
- Use [`line`](/python/api/marks/line) or [`ribbon`](/python/api/marks/ribbon) instead when you want an
  _undirected_ line (or a multi-stop polyline) with explicit bbox-anchor
  control; use `arrow` when you want a _directed_ arrowhead and automatic curved
  routing.
- Pair the operator with z-order constraints
  ([`Constraint.z_above` / `z_below`](/python/api/constraints/relate#constraintz_above--constraintz_below))
  when an arrow needs to sit between two elements in paint order.
