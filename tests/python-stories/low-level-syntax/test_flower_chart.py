"""Equivalent of lowlevel/FlowerChart.stories.tsx — Low Level Syntax/Flower Chart.

A meadow where each lake becomes a flower. The flowers are planted in a row by
lake location (a 1-D `scatter` on x, baseline-aligned so the stems share a
ground line). Each flower is a glyph chart whose mark is a `layer` of:

  - a green stem `rect` whose height is the lake's total catch — the `count`
    size channel auto-sums across the species rows, so no hand-computed total is
    needed; and
  - a flower head: petals fanning out to a fixed radius under a `polar` coord
    transform, one per species, angular width encoding catch and color encoding
    species (lightened toward white via the post-scale `.lighten` color op).

A `.constrain(...)` on the layer snaps the flower head's center onto the stem's
top. Exercises the v3 `scatter` + mark-as-function pattern, `layer(...).constrain`
with `Constraint.align`, the `petal` mark under `polar()`, and `datum().lighten`.
"""

from gofish import (
    chart,
    scatter,
    layer,
    rect,
    petal,
    stack,
    polar,
    datum,
    Constraint,
)
from python_stories.data import SEAFOOD, CATCH_LOCATIONS, COLORS
from python_stories._lowlevel_helpers import group_by

_GREEN5 = COLORS["colorGreen5"]

# Fixed radius of every flower head, in pixels (matches the JS story).
FLOWER_RADIUS = 40

_scatter_data = [
    {
        "lake": lake,
        "x": CATCH_LOCATIONS[lake]["x"],
        "collection": [
            {"species": r["species"], "count": r["count"]} for r in rows
        ],
    }
    for lake, rows in group_by(SEAFOOD, "lake").items()
]


def story_default():
    def _flower(data):
        collection = data[0]["collection"]
        return chart(collection).mark(
            layer(
                [
                    rect(w=4, h="count", fill=_GREEN5).name("stem"),
                    layer(
                        [
                            stack(
                                [
                                    petal(
                                        w=datum(d["count"]),
                                        fill=datum(d["species"]).lighten(0.5),
                                    )
                                    for d in collection
                                ],
                                dir="x",
                                h=FLOWER_RADIUS,
                                spacing=0,
                                alignment="start",
                                sharedScale=True,
                            )
                        ],
                        coord=polar(),
                    ).name("flower"),
                ]
            ).constrain(
                lambda stem, flower: [
                    Constraint.align([stem, flower], x="middle"),
                    Constraint.align([stem, flower], y=["end", "middle"]),
                ]
            )
        )

    return (
        chart(_scatter_data, axes=False)
        .flow(scatter(by="lake", x="x", alignment="baseline"))
        .mark(_flower),
        {"w": 400, "h": 400},
    )
