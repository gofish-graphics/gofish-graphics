# export (SVG)

Save a chart to an SVG file. `save()` infers the format from the file extension;
`to_svg()` returns the markup as a string. These sit alongside
[`render`](/python/api/core/render).

```python
from gofish import chart, spread, rect

# Last expression in a cell → displays and writes "seafood.svg".
chart(seafood, axes=True).flow(spread(by="lake", dir="x")).mark(
    rect(h="count")
).save("seafood.svg", w=500, h=300)
```

## How it works

The SVG is produced by the notebook **front-end**, not the Python kernel, so
export uses the same widget bridge as rendering:

- `chart(...).save(path, ...)` returns a widget that **writes the file once it
  renders**. Make it the last expression in a cell (or otherwise display it) so
  the render — and therefore the write — happen.
- After a widget has displayed, `widget.to_svg()` returns the markup and
  `widget.svg` exposes it as a property.

Because the write waits for the front-end to render, it completes
asynchronously — shortly after the cell with the live widget runs. Truly
synchronous, headless export (works in plain `.py` scripts / CI) is tracked in
[#577](https://github.com/gofish-graphics/gofish-graphics/issues/577).

## Signature

```python
ChartBuilder.save(path, w=800, h=600, debug=False)   # returns a widget

GoFishChartWidget.save(path)        # write now (or defer until rendered)
GoFishChartWidget.to_svg() -> str   # markup; errors if not yet rendered
GoFishChartWidget.svg               # markup or None
```

## Parameters

| Parameter | Type  | Default | Description                                               |
| --------- | ----- | ------- | --------------------------------------------------------- |
| `path`    | `str` | —       | Output path. Format inferred from the extension (`.svg`). |
| `w`       | `int` | `800`   | Chart width in pixels                                     |
| `h`       | `int` | `600`   | Chart height in pixels                                    |

::: tip Axes are a chart option
`axes` (and `padding`) are passed to [`chart`](/python/api/core/chart), not
`save` — mirroring `render`.
:::

## Working with the widget directly

```python
w = chart(seafood, axes=True).flow(spread(by="lake", dir="x")).mark(
    rect(h="count")
).render(w=500, h=300)   # display this cell

# In a later cell, after it has rendered:
svg = w.to_svg()
w.save("seafood.svg")
```

## Notes

- Only `.svg` is supported today; PNG and HTML are tracked in
  [#578](https://github.com/gofish-graphics/gofish-graphics/issues/578).
- Fonts are **referenced**, not embedded — a viewer without those fonts sees
  fallback fonts. Self-contained output (embedded/outlined fonts) is tracked in
  [#578](https://github.com/gofish-graphics/gofish-graphics/issues/578).
- Calling `save()` without ever displaying the widget writes nothing — the
  front-end must render to produce the SVG.
