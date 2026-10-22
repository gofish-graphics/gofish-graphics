# render

Renders the chart as an [anywidget](https://anywidget.dev/) that displays in
Jupyter, JupyterLab, VS Code notebooks, and marimo.

::: gofish example:bar-chart hidden
:::

```python
from gofish import chart, spread, rect

chart(seafood, axes=True).flow(spread(by="lake", dir="x")).mark(
    rect(h="count")
).render(w=500, h=300)
```

## Signature

```python
ChartBuilder.render(w=800, h=600, axes=None, legend=None, debug=False)
```

`layer([...])` (a mark), `.layer(...)` chains (`LayerBuilder`) and bare marks take the
same options. They are the JS `.render(container, options)` options, in snake
case.

## Parameters

| Parameter | Type                   | Default | Description                                                                                                                                                          |
| --------- | ---------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `w`       | `int`                  | `800`   | Width of the whole graphic in pixels, axes, titles and legend included                                                                                               |
| `h`       | `int`                  | `600`   | Height of the whole graphic in pixels, axes, titles and legend included                                                                                              |
| `axes`    | `bool \| dict \| None` | `None`  | Auto-generate axes, labels, and legends; same shape as `chart(axes=...)`. Overrides the outermost chart's `axes` only. Unset, the chart's own `axes` option decides. |
| `legend`  | `bool \| None`         | `None`  | Whether to draw the color-scale legend. Unset, the default (`True`) applies. A `chart()` option of the same name wins over this one.                                 |
| `debug`   | `bool`                 | `False` | Whether to enable debug rendering                                                                                                                                    |

Returns a `GoFishChartWidget`.

::: tip Axes on the chart or on render
`axes` can be passed to [`chart`](/python/api/core/chart) or to
`render`, as in JS (`chart(data, { axes: true })` or
`.render(container, { axes: true })`). See [chart](/python/api/core/chart) for the full `axes` shape.
:::

## Automatic display

A `ChartBuilder` displays itself when it is the **last expression** in a
notebook cell — no `.render()` call is required:

```python
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count"))
```

This is equivalent to calling `.render()` with its defaults. Call `.render()`
explicitly when you want to set the size or other render options:

```python
chart(seafood, axes=True).flow(spread(by="lake", dir="x")).mark(
    rect(h="count")
).render(w=500, h=300)
```

## Inspecting the IR

`.to_ir()` returns the chart's intermediate representation document (its
`root` and its `tables` as JSON rows) instead of rendering — useful for
debugging or testing:

```python
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count")).to_ir()
```

## Layout warnings

When a chart cannot fit its canvas, the render keeps its size, draws the
chart anyway, and warns, as in JS (see
[render › Layout warnings](/js/api/core/render#layout-warnings)). Once the
widget has rendered, `widget.warnings` is a list with one dict per warning,
with the keys `kind`, `node`, `axis`, `needed`, `available`, `parts` and
`message`. The browser console also prints each one, prefixed
`[gofish:layout]`.

```python
w = chart(barley).flow(
    spread(by="site", dir="x", spacing=110),
    spread(by="year", dir="x", spacing=36),
    scatter(by="variety", y="yield"),
).mark(line(stroke="variety")).render(w=700, h=350)   # display this cell

# In a later cell, after it has rendered:
for warning in w.warnings:
    print(warning["message"])
```

## Notes

- Rendering requires a notebook kernel — `render()` produces a widget. To get
  an SVG file or string, use [`save` / `to_svg`](/python/api/core/export).
- A chart must have a [mark](/python/api/core/mark) before it can be rendered.
