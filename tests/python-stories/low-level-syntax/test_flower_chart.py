"""Equivalent of lowlevel/FlowerChart.stories.tsx — Low Level Syntax/Flower Chart.

Each lake becomes a flower: a green stem (height = the lake's y position) topped
by a bloom of petals, one per species, sized by catch count. The bloom is a
`stack` of petals rendered under a `polar` coordinate transform so they fan out
radially. Exercises `layer({coord: polar()})` (Tier-2 coord transform) and the
`petal` mark.
"""

from gofish import layer, rect, petal, stack, polar, datum
from python_stories.data import SEAFOOD, CATCH_LOCATIONS, COLORS
from python_stories._lowlevel_helpers import group_by, sum_by

_GREEN5 = COLORS["colorGreen5"]
_MIX_WHITE = COLORS["mixWhite05"]


def story_default():
    flowers = []
    for lake, rows in group_by(SEAFOOD, "lake").items():
        loc = CATCH_LOCATIONS[lake]
        collection = [{"species": r["species"], "count": r["count"]} for r in rows]
        bloom = stack(
            [
                petal(w=datum(d["count"]), fill=_MIX_WHITE[i % 6])
                for i, d in enumerate(collection)
            ],
            dir="x",
            h=sum_by(collection, "count") / 7,
            spacing=0,
            alignment="start",
            sharedScale=True,
        )
        flowers.append(
            layer(
                [
                    rect(w=2, h=loc["y"], fill=_GREEN5),
                    layer([bloom], y=loc["y"], coord=polar()),
                ],
                x=loc["x"],
            )
        )

    return (
        layer(flowers),
        {"axes": True},
    )
