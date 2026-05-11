"""Equivalent of Bar/GroupedBarChartRepeat.stories.tsx — Vega-Lite/Grouped Bar Chart (Multiple Measure with Repeat).

The JS uses a v2-style nested mark — `mark(spread({dir: "x", spacing: 0}, [rect(...), rect(...)]))`
together with `v("Worldwide Gross")` literal fills. Neither nested-mark nor `v()` exists in the
Python wrapper, so we reshape to long format and rely on a second `spread(by="measure")` to
produce the per-measure split within each genre.
"""

from gofish import chart, spread, rect, palette
from vega_datasets import data as vega_data

_MEASURES = ("Worldwide Gross", "US Gross")


def _to_long(rows):
    out = []
    for row in rows:
        for measure in _MEASURES:
            value = row.get(measure)
            if value is None:
                continue
            out.append({**row, "measure": measure, "value": value})
    return out


def story_default():
    df = vega_data.movies().rename(columns={
        "Major_Genre": "Major Genre",
        "Worldwide_Gross": "Worldwide Gross",
        "US_Gross": "US Gross",
    })
    movies_long = _to_long(df.to_dict("records"))

    return (
        chart(
            movies_long,
            {
                "color": palette({
                    "Worldwide Gross": "#1f77b4",
                    "US Gross": "#ff7f0e",
                })
            },
        )
        .flow(
            spread(by="Major Genre", dir="x"),
            spread(by="measure", dir="x", spacing=0),
        )
        .mark(rect(h="value", fill="measure")),
        {"w": 600, "h": 300, "axes": True},
    )
