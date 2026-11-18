"""Equivalent of lowlevel/ViolinPlot.stories.tsx — Low Level Syntax/Violin Plot.

A violin plot of penguin body mass per species: each species' kernel
density of body mass (``derive(kde(...))`` in each species, read by
``field(...).density()``), drawn as a ribbon centered in a one-part stack,
the species spread side by side on a shared scale.
"""

from gofish import Baseline, chart, derive, field, kde, ribbon, spread, stack
from python_stories.data import PENGUINS


def story_default():
    mass = field("Body Mass (g)")
    return (
        chart(PENGUINS)
        .flow(
            spread(by="Species", dir="x", spacing=64),
            derive(kde("Body Mass (g)")),
        )
        .mark(
            stack(
                [ribbon(y=mass.domain(), w=mass.density(), fill="Species")],
                dir="x",
                baseline=Baseline.middle(),
            )
        ),
        {"w": 500, "h": 300, "axes": True},
    )
