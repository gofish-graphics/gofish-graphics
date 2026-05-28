# render

Renders the chart as an [anywidget](https://anywidget.dev/) that displays in
Jupyter, JupyterLab, VS Code notebooks, and marimo.

::: starfish example:bar-chart hidden
:::

```python
from gofish import chart, spread, rect

chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count")).render(
    w=500, h=300, axes=True
)
```

## Signature

```python
ChartBuilder.render(w=800, h=600, axes=False, debug=False)
```

## Parameters

| Parameter | Type   | Default | Description                       |
| --------- | ------ | ------- | --------------------------------- |
| `w`       | `int`  | `800`   | Chart width in pixels             |
| `h`       | `int`  | `600`   | Chart height in pixels            |
| `axes`    | `bool` | `False` | Whether to draw axes              |
| `debug`   | `bool` | `False` | Whether to enable debug rendering |

Returns a `GoFishChartWidget`.

## Automatic display

A `ChartBuilder` displays itself when it is the **last expression** in a
notebook cell — no `.render()` call is required:

```python
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count"))
```

This is equivalent to calling `.render()` with its defaults. Call `.render()`
explicitly when you want to set the size or turn on axes:

```python
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count")).render(
    w=500, h=300, axes=True
)
```

## Inspecting the IR

`.to_ir()` returns the chart's JSON intermediate representation instead of
rendering — useful for debugging or testing:

```python
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count")).to_ir()
```

## Notes

- Rendering requires a notebook kernel — `render()` produces a widget, not a
  static image or an SVG string.
- A chart must have a [mark](/python/api/core/mark) before it can be rendered.
