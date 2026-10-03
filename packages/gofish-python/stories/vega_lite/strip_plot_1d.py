"""Vega-Lite/1D Strip Plot — mirrors 1DStripPlot.stories.tsx

https://vega.github.io/vega-lite/examples/tick_dot.html

Seattle weather: precipitation as 1D strip with random y jitter.
"""

import random
from gofish import chart, scatter, rect, log

TITLE = "Vega-Lite/1D Strip Plot"


def load_data():
    from stories.data.vega import load_seattle_weather
    rows = load_seattle_weather()
    rng = random.Random(42)  # fixed seed for reproducibility
    return [
        {"date": r["date"], "precipitation": r["precipitation"], "stripY": rng.random() * 0.2}
        for r in rows
    ]


def default(data=None, w=300, h=100):
    if data is None:
        data = load_data()
    return (
        chart(data)
        .flow(
            log("weather before scatter"),
            scatter(by="date", x="precipitation", y="stripY"),
        )
        .mark(rect(w=1, h=10, fill="rgba(31, 119, 180, 0.4)", stroke="#1f77b4", stroke_width=1))
    )
