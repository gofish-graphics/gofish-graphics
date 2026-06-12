# offset

Shifts a single child by `(x, y)` pixels **at render time only**. The child's
reported layout bounds are passed through unchanged — `offset` does not move
the bbox it advertises to its parent, it only nudges the rendered pixels.

This makes it the right tool when something else defines the visible bounds
(for example a [`mask`](/python/api/operators/region-compositing) region rect)
and you just need to slide the underlying content beneath it. It is the
primitive the [`cut`](/python/api/operators/cut) mark uses to align each slice's
source under its clip region.

```python
from gofish import layer, offset, rect, Constraint

layer([
    rect(w=100, h=80, fill="#dcdcdc").name("base"),
    offset(
        rect(w=100, h=80, fill="#4f8ff0", opacity=0.6),
        x=20,
        y=15,
    ).name("shifted"),
]).render(w=160, h=140)
```

The blue rectangle reports the same bounds as the gray one but is drawn shifted
by `(20, 15)`.

## Signature

```python
offset(child, *, x=None, y=None)
```

Exactly one child is required.

## Parameters

| Option | Type     | Description                            |
| ------ | -------- | -------------------------------------- |
| `x`    | `number` | Horizontal shift in pixels. Default 0. |
| `y`    | `number` | Vertical shift in pixels. Default 0.   |

## Layout semantics

`offset` keeps its layout `transform.translate` as the "parent can place me"
signal and adds the `(x, y)` shift on top of whatever translate the parent
assigns, during render. The reported intrinsic dimensions are the child's,
unmoved.
