"""Equivalent of UnitHistogram.stories.tsx — atom/UnitHistogram."""

import math

import pandas as pd

from gofish import chart, circle, derive, field, palette, spread


def _age_decade(age):
    return math.floor(age / 10) * 10


def _load_aged_passengers():
    titanic_passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    )

    def to_age_num(age):
        try:
            return float(age)
        except (TypeError, ValueError):
            return float("nan")

    titanic_passengers = titanic_passengers.assign(
        ageNum=titanic_passengers["age"].apply(to_age_num)
    )
    titanic_passengers = titanic_passengers[
        titanic_passengers["ageNum"].apply(math.isfinite)
    ]
    titanic_passengers = titanic_passengers.assign(
        ageBin=titanic_passengers["ageNum"].apply(_age_decade)
    )
    return titanic_passengers


def story_default():
    aged_passengers = _load_aged_passengers()

    def order_by_survived(rows):
        return sorted(rows, key=lambda row: row["survived"], reverse=True)

    def chunk_rows(rows):
        size = 3
        return [rows[i : i + size] for i in range(0, len(rows), size)]

    return (
        chart(
            aged_passengers,
            color=palette(["#2b8cbe", "#ff8408"]),
            # x = pclass (the panels) at the bottom (y-end); y is the
            # dot-row index, so suppress it.
            axes={"x": {"side": "end"}, "y": False},
        )
        # Bottom-align panels and their age-bin bars (y-down free space:
        # "end" = bottom) so every unit stack shares a baseline and grows
        # upward.
        .flow(
            spread(by="pclass", dir="x", spacing=40, alignment="end"),
            # Age bins in ascending order along x — `spread` lays groups out
            # in data-appearance order, so sort by the bin key first (as the
            # strip plot sorts before its categorical spread).
            spread(by=field("ageBin").sort(), dir="x", spacing=6, alignment="end"),
        )
        .mark(
            chart()
            .flow(
                derive(order_by_survived),
                derive(chunk_rows),
                # Reverse so the ragged partial row lands at the top.
                spread(spacing=1.5, dir="y", reverse=True),
                spread(spacing=1.5, dir="x"),
            )
            .mark(circle(r=3, fill="survived"))
        ),
        {"w": 900, "h": 560},
    )
