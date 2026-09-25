"""Forward Syntax/Bar/Stacked — mirrors BarStacked.stories.tsx"""

from gofish import chart, spread, stack, rect
from stories.data.seafood import seafood

TITLE = "Forward Syntax/Bar/Stacked"


def default(w=400, h=400):
    return (
        chart(seafood)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="y"),
        )
        .mark(rect(h="count", fill="species"))
    )
