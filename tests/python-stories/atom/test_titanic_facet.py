from math import ceil, sqrt
from typing import Any

from ..helper import initialize_container
from gofish_python import Chart, circle, derive, palette, spread, table
from gofish_python.data.titanic_passengers import titanic_passengers


def test_titanic_facet():
    container = initialize_container()

    def order_by_survived(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(rows, key=lambda row: row["survived"], reverse=True)

    def chunk_rows(rows: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
        size = ceil(sqrt(len(rows)))
        return [rows[i : i + size] for i in range(0, len(rows), size)]

    Chart(titanic_passengers, color=palette(["#2b8cbe", "#ff8408"])) \
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
        ) \
        .render(container, w=720, h=480, axes=True)

    return container