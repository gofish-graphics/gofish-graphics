"""Equivalent of Streamgraph.stories.tsx — Forward Syntax/Streamgraph."""

from gofish import chart, stack, ribbon, Baseline, Unit
from python_stories.data import UNEMPLOYMENT


def story_default():
    return (
        chart(UNEMPLOYMENT, w=560, h=400, schema={"date": Unit.time()})
        .flow(stack(by="series", dir="y", baseline=Baseline.wiggle()))
        .mark(ribbon(x="date", h="count", fill="series")),
        {},
    )
