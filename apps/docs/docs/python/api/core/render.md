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
ChartBuilder.render(w=800, h=600, debug=False)
```

## Parameters

| Parameter | Type   | Default | Description                       |
| --------- | ------ | ------- | --------------------------------- |
| `w`       | `int`  | `800`   | Chart width in pixels             |
| `h`       | `int`  | `600`   | Chart height in pixels            |
| `debug`   | `bool` | `False` | Whether to enable debug rendering |

Returns a `GoFishChartWidget`.

::: tip Axes are a chart option
`axes` (and `padding`) are passed to [`chart`](/python/api/core/chart), not
`render` — mirroring the JS `chart(data, { axes: true })`. See
[chart](/python/api/core/chart) for the full `axes` shape.
:::

## Automatic display

A `ChartBuilder` displays itself when it is the **last expression** in a
notebook cell — no `.render()` call is required:

```python
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count"))
```

This is equivalent to calling `.render()` with its defaults. Call `.render()`
explicitly when you want to set the size (turn axes on via `chart(..., axes=True)`):

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
