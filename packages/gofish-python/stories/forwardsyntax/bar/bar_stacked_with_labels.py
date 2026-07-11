"""Forward Syntax V3/Bar/Stacked With Labels — mirrors BarStackedWithLabels.stories.tsx"""

from gofish import chart, spread, stack, rect
from stories.data.seafood import seafood

TITLE = "Forward Syntax V3/Bar/Stacked With Labels"


def default(w=400, h=400):
    return (
        chart(seafood)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="y"),
        )
        .mark(
            rect(h="count", fill="species").label(
                "species", position="center", color="white", fontSize=12
            )
        )
    )
