"""Equivalent of BarWithLabels.stories.tsx — Forward Syntax/Bar/With Labels."""

from gofish import chart, spread, rect, text, group, pluck
from python_stories.data import SEAFOOD


def story_default():
    # `.layer()`'s empty scope yields one ref per lake; each ref's datum is
    # that lake's array of species records (an aggregate). `by="lake"`
    # resolves because every row in a lake agrees on `lake` (homogeneity
    # collapse), giving one frame per lake; sum the aggregate's rows for the
    # per-lake total label.
    def label_mark(d):
        total = sum(row["count"] for row in d[0].datum)
        # A spread on y reads top-down: the label above its bar.
        return spread(
            [text(text=str(total)), d[0]],
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


# Demonstrates `pluck`, the uncollapsed sibling of the `by="field"` homogeneity
# collapse. Within a lake the `species` field is multi-valued, so
# `by="species"` would NOT resolve. `pluck` asks for every distinct value:
# here, the count of species in each lake.
def story_species_count_per_lake():
    def label_mark(d):
        # `pluck(d[0], "species")` -> the distinct species in this lake's bag.
        species = pluck(d[0], "species")
        return spread(
            [text(text=f"{len(species)} spp"), d[0]],
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
