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
ChartBuilder.render(w=800, h=600, axes=None, legend=None, padding=None, debug=False)
```

`layer(...)` and `.layer(...)` chains (`LayerBuilder`) and bare marks take the
same options. They are the JS `.render(container, options)` options, in snake
case.

## Parameters

| Parameter | Type                   | Default | Description                                                                                                                          |
| --------- | ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `w`       | `int`                  | `800`   | Width in pixels                                                                                                                      |
| `h`       | `int`                  | `600`   | Height in pixels                                                                                                                     |
| `axes`    | `bool \| dict \| None` | `None`  | Auto-generate axes, labels, and legends; same shape as `chart(axes=...)`. Unset, the chart's own `axes` option decides.              |
| `legend`  | `bool \| None`         | `None`  | Whether to draw the color-scale legend. Unset, the default (`True`) applies. A `chart()` option of the same name wins over this one. |
| `padding` | `float \| None`        | `None`  | Extra pixels between the drawing and the SVG edge. Unset, the chart's own `padding` option (or the default) applies.                 |
| `debug`   | `bool`                 | `False` | Whether to enable debug rendering                                                                                                    |

Returns a `GoFishChartWidget`.

::: tip Axes on the chart or on render
`axes` (and `padding`) can be passed to [`chart`](/python/api/core/chart) or to
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

`.to_ir()` returns the chart's JSON intermediate representation instead of
rendering — useful for debugging or testing:

```python
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count")).to_ir()
```

## Notes

- Rendering requires a notebook kernel — `render()` produces a widget. To get
  an SVG file or string, use [`save` / `to_svg`](/python/api/core/export).
- A chart must have a [mark](/python/api/core/mark) before it can be rendered.
