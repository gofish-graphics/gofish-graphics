"""Equivalent of lowlevel/ViolinPlot.stories.tsx — Low Level Syntax/Violin Plot.

A violin plot of penguin body mass per species: each species' kernel
density of body mass (``field(...).density()``), drawn as a ribbon centered
in a one-part stack, the species spread side by side on a shared scale.
"""

from gofish import Baseline, chart, field, ribbon, spread, stack
from python_stories.data import PENGUINS


def story_default():
    mass = field("Body Mass (g)")
    return (
        chart([p for p in PENGUINS if p["Body Mass (g)"] is not None])
        .flow(spread(by="Species", dir="x", spacing=64))
        .mark(
            stack(
                [ribbon(y=mass.domain(), w=mass.density(), fill="Species")],
                dir="x",
                baseline=Baseline.middle(),
            )
        ),
        {"w": 500, "h": 300, "axes": True},
    )
