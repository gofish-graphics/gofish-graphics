"""Equivalent of BarWithLabels.stories.tsx — Forward Syntax V3/Bar/With Labels.

Only `Default` is ported (`story_default`). `SpeciesCountPerLake` uses
`pluck()`, which has no Python wrapper yet — a separate follow-up from #591's
ref/datum mark-fn bridge implemented here.
"""

from gofish import chart, spread, rect, text, group
from python_stories.data import SEAFOOD


def story_default():
    # `.layer()`'s empty scope yields one ref per lake; each ref's datum is
    # that lake's array of species records (an aggregate). `by="lake"`
    # resolves because every row in a lake agrees on `lake` (homogeneity
    # collapse), giving one frame per lake; sum the aggregate's rows for the
    # per-lake total label.
    def label_mark(d):
        total = sum(row["count"] for row in d[0].datum)
        return spread(
            [d[0], text(text=str(total))],
            dir="y",
            alignment="middle",
            spacing=10,
        )

    chart_builder = (
        chart(SEAFOOD, axes=True)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count"))
        .layer(chart().flow(group(by="lake")).mark(label_mark))
    )
    return (chart_builder, {"w": 400, "h": 400})
