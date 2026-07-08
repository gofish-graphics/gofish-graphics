"""Equivalent of Violin.stories.tsx — atom/Violin."""

import math

import pandas as pd

from gofish import chart, circle, palette, spread


def _age_bin(age):
    return math.floor(age / 2) * 2


def story_default():
    titanic_passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    )
    titanic_passengers["ageNum"] = pd.to_numeric(
        titanic_passengers["age"], errors="coerce"
    )
    aged_passengers = titanic_passengers[
        titanic_passengers["ageNum"].apply(math.isfinite)
    ].copy()
    aged_passengers["ageBin"] = aged_passengers["ageNum"].apply(_age_bin)
    aged_passengers = aged_passengers.sort_values(
        ["ageBin", "survived"], ascending=[True, False], kind="mergesort"
    )

    def dot_row(bin_data):
        return (
            chart(bin_data)
            .flow(spread(dir="x", spacing=1, alignment="middle"))
            .mark(circle(r=2, fill="survived"))
        )

    def age_panel(panel_data):
        return (
            chart(panel_data)
            .flow(
                # Reverse so age increases UPWARD (youngest bin at the bottom)
                # in y-down free space — the density silhouette stacks up the
                # age axis.
                spread(
                    by="ageBin",
                    dir="y",
                    spacing=1,
                    alignment="middle",
                    reverse=True,
                )
            )
            .mark(dot_row)
        )

    return (
        chart(
            aged_passengers,
            color=palette(["#2b8cbe", "#ff8408"]),
            # x = pclass (the violins) at the bottom (y-end); y is the dot-row
            # index, so suppress it.
            axes={"x": {"side": "end"}, "y": False},
        )
        .flow(spread(by="pclass", dir="x", spacing=48, alignment="middle"))
        .mark(age_panel),
        {"w": 680, "h": 260},
    )
