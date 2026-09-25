"""Forward Syntax/Bar/Sorted Stacked — mirrors BarSortedStacked.stories.tsx

Uses derive() to sort each group by count ascending before stacking.
JS equivalent: derive((d) => orderBy(d, "count", "asc"))
"""

from gofish import chart, spread, stack, derive, rect
from stories.data.seafood import seafood

TITLE = "Forward Syntax/Bar/Sorted Stacked"


def default(w=400, h=400):
    return (
        chart(seafood)
        .flow(
            spread(by="lake", dir="x"),
            derive(lambda d: sorted(d, key=lambda r: r["count"])),
            stack(by="species", dir="y"),
        )
        .mark(rect(h="count", fill="species"))
    )
