"""Forward Syntax/Bar/With Labels — mirrors BarWithLabels.stories.tsx

Only the `Default` export is ported. `SpeciesCountPerLake` uses `pluck()`
(the un-collapsed sibling of the `by: "field"` homogeneity collapse), which
has no Python wrapper yet — a separate follow-up from #591's ref/datum
mark-fn bridge implemented here.
"""

from gofish import chart, spread, rect, text, group
from stories.data.seafood import seafood

TITLE = "Forward Syntax/Bar/With Labels"


def default(w=400, h=400):
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

    return (
        chart(seafood, axes=True)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count"))
        .layer(chart().flow(group(by="lake")).mark(label_mark))
    )
