"""Equivalent of UnitColumnChart.stories.tsx — atom/UnitColumnChart."""

import pandas as pd

from gofish import chart, circle, derive, palette, spread


def story_default():
    titanic_passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    )

    def order_by_survived(rows):
        return sorted(rows, key=lambda row: row["survived"], reverse=True)

    def chunk_rows(rows):
        size = 14
        return [rows[i : i + size] for i in range(0, len(rows), size)]

    def passenger_dots(group_data):
        return (
            chart(group_data)
            .flow(
                derive(order_by_survived),
                derive(chunk_rows),
                # Reverse the rows so the ragged partial row lands at the top.
                spread(spacing=2, dir="y", reverse=True),
                spread(spacing=2, dir="x"),
            )
            .mark(circle(r=4, fill="survived"))
        )

    return (
        chart(
            titanic_passengers,
            color=palette(["#2b8cbe", "#ff8408"]),
            # x = pclass (the columns) at the bottom (y-end), under the
            # upward-filling columns; y is the dot-row index, so suppress it.
            axes={"x": {"side": "end"}, "y": False},
        )
        # Bottom-align the columns (y-down free space: "end" = bottom) so the
        # unit stacks share a baseline and grow upward.
        .flow(spread(by="pclass", dir="x", spacing=24, alignment="end"))
        .mark(passenger_dots),
        {"w": 520, "h": 580},
    )
