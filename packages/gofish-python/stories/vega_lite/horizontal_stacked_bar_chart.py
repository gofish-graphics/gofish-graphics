"""Vega-Lite/Horizontal Stacked Bar Chart — mirrors HorizontalStackedBarChart.stories.tsx

https://vega.github.io/vega-lite/examples/stacked_bar_h.html

Data: barley.json — yield by variety and site.
"""

from gofish import chart, spread, stack, rect, palette

TITLE = "Vega-Lite/Horizontal Stacked Bar Chart"


def load_data():
    from stories.data.vega import load_barley
    return load_barley()


def default(data=None, w=500, h=400):
    if data is None:
        data = load_data()
    return (
        chart(data, color=palette("tableau10"))
        .flow(
            spread(by="variety", dir="y"),
            stack(by="site", dir="x"),
        )
        .mark(rect(w="yield", fill="site"))
    )
