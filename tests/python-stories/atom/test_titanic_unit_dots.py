"""Equivalent of TitanicUnitDots.stories.tsx — atom/TitanicUnitDots."""

import pandas as pd

from gofish import chart, circle, palette, treemap


def story_default():
    titanic_passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    )
    # Match JS titanicPassengers.ts: fare must be numeric for treemap's
    # data-driven `h: "fare"` sizing — string fares produce NaN layouts.

    tier_fare = {1: 85, 2: 40, 3: 14}
    titanic_passengers["fare"] = pd.to_numeric(
        titanic_passengers["fare"], errors="coerce"
    )
    mask = titanic_passengers["fare"].isna() | (titanic_passengers["fare"] < 0)
    titanic_passengers.loc[mask, "fare"] = titanic_passengers.loc[mask, "pclass"].map(tier_fare).fillna(1)

    return (
        chart(titanic_passengers, color=palette(["#2b8cbe", "#ff8408"]))
        .facet(by="pclass", dir="x")
        .flow(
            treemap(
                h="fare",
                valueField="fare",
                paddingInner=0,
                tile="squarifyCircle",
                sort="desc",
                flipY=True,
            )
        )
        .mark(circle(fill="survived", stroke="#ccc", strokeWidth=1)),
        {"w": 1000, "h": 320},
    )
