# layer

Overlays multiple children in the same coordinate space without any layout offset.

```python
from gofish import layer, rect, ellipse

layer([
    rect(w=100, h=80, fill="#9ecae1"),
    ellipse(w=60, h=60, fill="#fcae91"),
]).render(w=200, h=150)
```

Both shapes occupy the same space. The ellipse is drawn on top of the rectangle
because it appears second in the list.

## Signature

```python
layer(children, **options) -> Mark
```

The children are a positional list of marks; layout options are passed as
kwargs. Children typically carry `.name(...)` tags so they can be referenced
from a [`.constrain(...)`](/python/api/constraints/constrain) callback or by a
sibling [`connect`](/python/api/operators/connect) / `ref`.

## Parameters

| Option              | Type      | Description                         |
| ------------------- | --------- | ----------------------------------- |
| `coord`             | transform | Coordinate transform for this layer |
| `w`                 | `float`   | Override width                      |
| `h`                 | `float`   | Override height                     |
| `transform.scale.x` | `float`   | Scale factor for x axis             |
| `transform.scale.y` | `float`   | Scale factor for y axis             |

## Z-ordering

By default, children are drawn in the order they appear in the list — later
children appear on top. You can override this with `.z_order(n)` on any child.
Children are sorted by z-order value before rendering; lower values are drawn
first (underneath). Children with the same z-order value keep their original
list order.

```python
from gofish import layer, rect, ellipse

layer([
    ellipse(w=60, h=60, fill="#fcae91").z_order(1),  # forced on top
    rect(w=100, h=80, fill="#9ecae1").z_order(0),     # forced underneath
])
```

`.z_order()` is available on every `Mark`. The chart-composing form of
[`layer`](/python/api/core/chart) (which overlays whole charts) exposes the
same control on a `ChartBuilder` as `.zOrder()`.

## Notes

- This is the **low-level combinator-form** `layer`, which wraps an explicit list
  of marks and renders directly. To overlay whole charts — for example to draw
  one chart's marks on top of another and relate them with cross-chart
  constraints — use the chart-composing form [`layer([chart1, chart2])`](/python/api/core/chart),
  which composes `ChartBuilder` instances and accepts `.constrain(...)`.
- Naming a child (`rect(...).name("a")`) makes it addressable from a
  `.constrain(...)` callback and from a sibling
  [`connect`](/python/api/operators/connect) drawn over the same layer.
