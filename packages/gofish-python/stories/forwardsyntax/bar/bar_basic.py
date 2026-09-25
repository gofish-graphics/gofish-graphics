"""Forward Syntax/Bar/Basic — mirrors BarBasic.stories.tsx"""

from gofish import chart, spread, rect
from stories.data.seafood import seafood

TITLE = "Forward Syntax/Bar/Basic"


def default(w=400, h=400):
    return (
        chart(seafood)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count"))
    )
