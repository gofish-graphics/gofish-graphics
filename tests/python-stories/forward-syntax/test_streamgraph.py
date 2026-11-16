"""Equivalent of Streamgraph.stories.tsx — Forward Syntax/Streamgraph."""

from gofish import chart, stack, ribbon, Baseline, Unit
from python_stories.data import UNEMPLOYMENT

# The six industries with the most unemployment over the decade, one for
# each color of the default palette.
LARGEST = [
    "Wholesale and Retail Trade",
    "Manufacturing",
    "Leisure and hospitality",
    "Business services",
    "Construction",
    "Education and Health",
]
AXES = {"x": {"title": False}, "y": {"title": "Unemployed (thousands)"}}


def story_default():
    return (
        chart(
            [d for d in UNEMPLOYMENT if d["series"] in LARGEST],
            w=560,
            h=400,
            schema={"date": Unit.time()},
            axes=AXES,
        )
        .flow(stack(by="series", dir="y", baseline=Baseline.wiggle()))
        .mark(ribbon(x="date", h="count", fill="series")),
        {},
    )
