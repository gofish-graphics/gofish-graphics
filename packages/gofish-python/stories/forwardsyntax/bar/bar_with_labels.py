"""Forward Syntax V3/Bar/With Labels — mirrors BarWithLabels.stories.tsx

BLOCKED: requires layer (multi-chart composition) and low-level v1 primitives
(Spread, ref, text with custom mark function).

What it would look like once layer is supported:

    from gofish import chart, spread, rect, ref, group, text
    from stories.data.seafood import seafood

    def default(w=400, h=400):
        bars = (
            chart(seafood)
            .flow(spread(by="lake", dir="x"))
            .mark(rect(h="count").name("bars"))
        )
        # The label layer uses a custom mark function with low-level Spread/ref/text.
        # Full implementation requires v1 primitive access from Python wrapper.
        labels = chart(ref("bars")).flow(group(by="lake")).mark(...)
        return layer([bars, labels])
"""

TITLE = "Forward Syntax V3/Bar/With Labels"


def default(w=400, h=400):
    raise NotImplementedError(
        "Bar with labels requires layer + low-level Spread/ref primitives — "
        "not yet implemented in Python wrapper"
    )
