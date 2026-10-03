"""Vega-Lite/Simple Scatter Plot — mirrors ScatterPlot.stories.tsx

https://vega.github.io/vega-lite/examples/point_2d.html

Cars dataset: Horsepower vs. Miles_per_Gallon.
"""

from gofish import chart, scatter, circle, log

TITLE = "Vega-Lite/Simple Scatter Plot"


def load_data():
    from stories.data.vega import load_cars
    rows = load_cars()
    return [r for r in rows if r.get("Horsepower") and r.get("Miles_per_Gallon")]


def default(data=None, w=300, h=300):
    if data is None:
        data = load_data()
    return (
        chart(data)
        .flow(
            log("cars before scatter"),
            scatter(by="Name", x="Horsepower", y="Miles_per_Gallon"),
        )
        .mark(circle(r=4, fill="rgba(31, 119, 180, 0.4)", stroke="#1f77b4", stroke_width=1))
    )
