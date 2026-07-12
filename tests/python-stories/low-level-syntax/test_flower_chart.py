"""Equivalent of lowlevel/FlowerChart.stories.tsx — Low Level Syntax/Flower Chart.

The same shape as a labeled bar chart — but the bars are stems and the labels
are flowers. The stems are a real bar chart (one chart, so their heights
share a scale, growing with each lake's total catch); each flower is the
stem's "label", placed on top via the `selectAll` + `group` + mark-fn pattern
(issue #591): the mark-fn receives one `_InputRef` per lake (its `.datum` is
that lake's species-row bag) and embeds the ref directly in the combinator
mark it returns, mirroring JS `spread([d[0], <petal fan>], ...)`.
"""

from gofish import (
    chart,
    scatter,
    spread,
    stack,
    rect,
    layer,
    group,
    petal,
    polar,
    datum,
    selectAll,
)
from python_stories.data import SEAFOOD, CATCH_LOCATIONS, COLORS

# Fixed radius of every flower head, in pixels. The petals fan out to this
# shared length; only their colors and angular widths vary with the data.
_FLOWER_RADIUS = 40

_GREEN_5 = COLORS["colorGreen5"]

# Each species row tagged with its lake's planting location on x.
_STEM_DATA = [{**row, "x": CATCH_LOCATIONS[row["lake"]]["x"]} for row in SEAFOOD]


def story_default():
    def label_mark(d):
        ref = d[0]
        petals = [
            petal(w=datum(r["count"]), fill=datum(r["species"]).lighten(0.5))
            for r in ref.datum
        ]
        return spread(
            [
                ref,
                layer(
                    {"coord": polar()},
                    [
                        stack(
                            petals,
                            dir="x",
                            h=_FLOWER_RADIUS,
                            spacing=0,
                            alignment="start",
                            sharedScale=True,
                        ),
                    ],
                ),
            ],
            dir="y",
            alignment="middle",
            spacing=-_FLOWER_RADIUS,
        )

    stems = (
        chart(_STEM_DATA)
        .flow(scatter(by="lake", x="x"))
        .mark(rect(w=4, h="count", fill=_GREEN_5).name("stems"))
    )
    flowers = (
        chart(selectAll("stems"))
        .flow(group(by="lake"))
        .mark(label_mark)
    )
    chart_builder = layer([stems, flowers])
    return (chart_builder, {"w": 400, "h": 400, "axes": False})
