"""Forward Syntax/Bar/Horizontal — mirrors BarHorizontal.stories.tsx"""

from gofish import chart, spread, rect
from stories.data.seafood import seafood

TITLE = "Forward Syntax/Bar/Horizontal"


def default(w=400, h=400):
    return (
        chart(seafood)
        .flow(spread(by="lake", dir="y"))
        .mark(rect(w="count"))
    )
