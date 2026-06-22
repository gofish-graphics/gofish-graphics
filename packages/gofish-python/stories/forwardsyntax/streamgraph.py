"""Forward Syntax V3/Streamgraph — mirrors Streamgraph.stories.tsx"""

from gofish import layer, chart, spread, stack, blank, selectAll, area, group
from stories.data.seafood import seafood

TITLE = "Forward Syntax V3/Streamgraph"


def default(w=400, h=400):
    bars = (
        chart(seafood)
        .flow(
            spread(by="lake", dir="x", spacing=64, alignment="middle"),
            stack(by="species", dir="y"),
        )
        .mark(blank(h="count", fill="species").name("bars"))
    )
    overlay = chart(selectAll("bars")).flow(group(by="species")).mark(area(opacity=0.8))
    return layer([bars, overlay])
