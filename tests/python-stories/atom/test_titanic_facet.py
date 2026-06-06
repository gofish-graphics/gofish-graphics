from math import ceil, sqrt
from typing import Any

from gofish import Chart, circle, derive, palette, spread, table
import pandas as pd
import os


def story_default():
    data_filepath = os.path.join(os.getcwd(), '../../packages/gofish-graphics/src/data/titanicPassengers.json')
    titanic_passengers = pd.read_json('packages/gofish-graphics/src/data/titanicPassengers.json')

    def order_by_survived(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(rows, key=lambda row: row["survived"], reverse=True)

    def chunk_rows(rows: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
        size = ceil(sqrt(len(rows)))
        return [rows[i : i + size] for i in range(0, len(rows), size)]

    return (Chart(titanic_passengers, color=palette(["#2b8cbe", "#ff8408"])) \
        .flow(table(by={"x": "pclass", "y": "sex"})) \
        .mark(
            lambda group_data: Chart(group_data)
            .flow(
                derive(order_by_survived),
                derive(chunk_rows),
                spread(spacing=2, dir="y"),
                spread(spacing=2, dir="x"),
            )
            .mark(circle(r=4, fill="survived"))
        ), {"w" : 720, "h": 480})