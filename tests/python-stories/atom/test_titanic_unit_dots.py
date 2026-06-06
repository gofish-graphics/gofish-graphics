"""Equivalent of TitanicUnitDots.stories.tsx — atom/TitanicUnitDots."""

import pandas as pd

from gofish import chart, circle, palette, treemap


def story_default():
    titanic_passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    )

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
