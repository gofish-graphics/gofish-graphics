"""Forward Syntax/Bar/Stacked Fluent — mirrors BarStackedFluent.stories.tsx

Uses .facet() and .stack() convenience methods instead of .flow(spread(...), stack(...)).
"""

from gofish import chart, rect
from stories.data.seafood import seafood

TITLE = "Forward Syntax/Bar/Stacked Fluent"


def default(w=400, h=400):
    return (
        chart(seafood)
        .facet(by="lake", dir="x")
        .stack(by="species", dir="y")
        .mark(rect(h="count", fill="species"))
    )
