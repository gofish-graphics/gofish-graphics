"""Equivalent of UnitMosaic.stories.tsx — atom/UnitMosaic."""

import math

import pandas as pd

from gofish import chart, circle, derive, palette, spread

DOTS_PER_ROW = 34  # target group-size per dot-row; tunes the mosaic's aspect


def _js_round(x):
    # JS `Math.round` rounds half away from zero (toward +Infinity for
    # positive numbers); Python's built-in `round` uses banker's rounding —
    # match JS exactly since group sizes can land on an exact `.5`.
    return math.floor(x + 0.5)


def _chunk(rows, size):
    size = size if size and size > 0 else 1
    return [rows[i : i + size] for i in range(0, len(rows), size)]


def _chunk_by_grid_rows(rows):
    size = rows[0].get("gridRows", 1) if rows else 1
    return _chunk(rows, size)


def _mosaic_passengers():
    titanic_passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    )

    # Rows per (class, sex) block — shared by its Yes/No cells so they tile flush.
    group_sizes = titanic_passengers.groupby(["pclass", "sex"]).size()
    rows_by_group = {
        key: max(1, _js_round(count / DOTS_PER_ROW))
        for key, count in group_sizes.items()
    }

    titanic_passengers["gridRows"] = [
        rows_by_group.get((row["pclass"], row["sex"]), 1)
        for _, row in titanic_passengers.iterrows()
    ]

    # One global sort pins every nested `spread`'s group order: pclass
    # ascending (1st row ends up at the bottom), sex ascending (female below
    # male), survived descending (survived/blue column on the left), so the
    # Yes/No split is consistent across blocks.
    return titanic_passengers.sort_values(
        ["pclass", "sex", "survived"],
        ascending=[True, True, False],
        kind="mergesort",
    )


def story_default():
    return (
        chart(_mosaic_passengers(), color=palette(["#2b8cbe", "#ff8408"]))
        .flow(
            # pclass rows: 1st at the bottom, 3rd at the top
            spread(by="pclass", dir="y", spacing=6, alignment="start"),
            # sex sub-rows within a class: female bottom, male top
            spread(by="sex", dir="y", spacing=3, alignment="start"),
            # survived columns: survived (blue) left, died (orange) right
            spread(by="survived", dir="x", spacing=3, alignment="start"),
        )
        .mark(
            chart()
            .flow(
                # Fill column-by-column — each column `gridRows` tall — so
                # every cell has flush top and bottom edges and only the
                # last column is short. (Row-major chunking instead left a
                # ragged partial *row* spanning the whole cell width, which
                # broke the band boundaries.)
                derive(_chunk_by_grid_rows),
                spread(spacing=1, dir="x"),
                spread(spacing=1, dir="y", reverse=True),
            )
            .mark(circle(r=3, fill="survived"))
        ),
        {"w": 400, "h": 300},
    )
