# First Steps

GoFish for Python is a thin wrapper over the GoFish graphics engine. You write
charts with the same fluent builder API as the JavaScript library — `chart()`,
`.flow()`, `.mark()` — and render them as interactive widgets in Jupyter or
marimo notebooks.

## Install

```bash
pip install gofish-graphics
```

Import it as `gofish`:

::: starfish example:bar-chart hidden
:::

```python
from gofish import chart, spread, rect
```

It depends on `anywidget`, `pyarrow`, and `pandas`, and renders inside any
notebook environment that supports [anywidget](https://anywidget.dev/) — Jupyter,
JupyterLab, VS Code notebooks, and marimo.

## Your first chart

A chart is built in three steps: pick the **data**, describe the **flow** of
layout operators, and choose a **mark** to draw.

```python
from gofish import chart, spread, rect

seafood = [
    {"lake": "Lake A", "species": "Bass", "count": 23},
    {"lake": "Lake B", "species": "Bass", "count": 25},
    {"lake": "Lake C", "species": "Bass", "count": 15},
    {"lake": "Lake D", "species": "Bass", "count": 12},
    {"lake": "Lake E", "species": "Bass", "count": 7},
    {"lake": "Lake F", "species": "Bass", "count": 4},
]

chart(seafood, axes=True).flow(spread(by="lake", dir="x")).mark(
    rect(h="count")
).render(w=500, h=300)
```

`spread(by="lake", dir="x")` partitions the rows by `lake` and lays the groups
out left-to-right. `rect(h="count")` draws one rectangle per row whose height
encodes the `count` field.

## Rendering in a notebook

`.render()` returns a widget. If a `ChartBuilder` is the **last expression** in a
notebook cell, it displays automatically — no `.render()` call needed:

```python
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count"))
```

Call `.render()` explicitly when you want to set the size (axes are a `chart()`
option — `chart(seafood, axes=True)`):

```python
chart(seafood, axes=True).flow(spread(by="lake", dir="x")).mark(
    rect(h="count")
).render(w=500, h=300)
```

::: tip
Charts in these docs are rendered with the shared GoFish engine. Because the
Python and JavaScript APIs serialize to the same intermediate representation, the
output you see here is exactly what `.render()` produces in a notebook.
:::

## Data

Pass either a list of dictionaries or a pandas `DataFrame`:

```python
import pandas as pd

df = pd.DataFrame(seafood)
chart(df).flow(spread(by="lake", dir="x")).mark(rect(h="count"))
```

Field names referenced by operators (`by="lake"`) and marks (`h="count"`) are
the column names of your data.

## Next steps

- [API Reference](/python/api/core/chart) — every function and option.
- [chart](/python/api/core/chart) · [flow](/python/api/core/flow) ·
  [mark](/python/api/core/mark) · [render](/python/api/core/render) — the core
  builder.
- Prefer JavaScript? The [JS docs](/js/get-started) cover the same API — use the
  toggle at the top to switch.
