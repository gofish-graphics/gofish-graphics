"""Vega-Lite/Strip Plot — mirrors StripPlot.stories.tsx

https://vega.github.io/vega-lite/examples/tick_strip.html

Cars dataset: horsepower vs. cylinders as thin tick marks.
"""

from gofish import chart, scatter, rect, log

TITLE = "Vega-Lite/Strip Plot"


def load_data():
    from stories.data.vega import load_cars
    rows = load_cars()
    return [
        {
            "name": r["Name"],
            "horsepower": r["Horsepower"],
            "cylinders": round(r["Cylinders"]) if r["Cylinders"] else None,
        }
        for r in rows
        if r.get("Horsepower") is not None and r.get("Cylinders") is not None
    ]


def default(data=None, w=300, h=300):
    if data is None:
        data = load_data()
    return (
        chart(data)
        .flow(
            log("cars before scatter"),
            scatter(by="name", x="horsepower", y="cylinders"),
        )
        .mark(rect(w=1, h=10, fill="rgba(31, 119, 180, 0.4)", stroke="#1f77b4", stroke_width=1))
    )
