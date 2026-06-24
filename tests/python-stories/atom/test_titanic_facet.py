"""Equivalent of TitanicFacet.stories.tsx — atom/TitanicFacet."""

from math import ceil, sqrt

import pandas as pd

from gofish import chart, circle, derive, palette, spread, table


def story_default():
    titanic_passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    )

    def order_by_survived(rows):
        return sorted(rows, key=lambda row: row["survived"], reverse=True)

    def chunk_rows(rows):
        size = ceil(sqrt(len(rows)))
        return [rows[i : i + size] for i in range(0, len(rows), size)]

    def passenger_dots(group_data):
        return (
            chart(group_data)
            .flow(
                derive(order_by_survived),
                derive(chunk_rows),
                spread(spacing=2, dir="y"),
                spread(spacing=2, dir="x"),
            )
            .mark(circle(r=4, fill="survived"))
        )

    return (
        chart(titanic_passengers, color=palette(["#2b8cbe", "#ff8408"]), axes=True)
        .flow(table(by={"x": "pclass", "y": "sex"}))
        .mark(passenger_dots),
        {"w": 720, "h": 480},
    )
