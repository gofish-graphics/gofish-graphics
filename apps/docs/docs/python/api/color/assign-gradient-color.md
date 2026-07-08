# assign_gradient_color

```python
assign_gradient_color(gradient_config, t)
```

Interpolates a [`gradient`](/python/api/color/gradient) config at `t` (`0` to
`1`) and returns the resulting hex color, in LAB space. Use it to precompute a
per-row fill color inside [`derive`](/python/api/operators/derive) — for
example when one chart draws colors from more than one gradient, so a single
`fill` field can't reference a single scale.

```python
from gofish import chart, derive, spread, stack, rect, gradient
from gofish.ast import assign_gradient_color

warm_gradient = gradient(["#ffe0b2", "#e65100"])
cold_gradient = gradient(["#bbdefb", "#0d47a1"])


def assign_colors(rows):
    values = [row["value"] for row in rows]
    lo, hi = min(values), max(values)
    out = []
    for row in rows:
        t = 0 if hi == lo else (row["value"] - lo) / (hi - lo)
        scale = warm_gradient if row["type"] == "warm" else cold_gradient
        out.append({**row, "color": assign_gradient_color(scale, t)})
    return out


chart(paired_bars).flow(
    derive(assign_colors),
    spread(by="pair", dir="x"),
    stack(by="type", dir="x"),
).mark(rect(h="value", fill="color"))
```

See also [`gradient`](/python/api/color/gradient) and
[`palette`](/python/api/color/palette).
