"""Equivalent of forwardsyntax/Distributions.stories.tsx — Forward Syntax/Distributions."""

from gofish import Dist, chart, field, ribbon, stack
from python_stories.data import PENGUINS


def story_normal_curve():
    d = Dist.normal(mean="mean", sd="sd")
    return (
        chart([{"mean": 0, "sd": 1}]).mark(
            ribbon(x=d.domain(), h=d.density(), fill="#4c78a8")
        ),
        {"w": 500, "h": 250, "axes": True},
    )


def story_stacked_species_densities():
    mass = field("Body Mass (g)")
    return (
        chart([p for p in PENGUINS if p["Body Mass (g)"] is not None])
        .flow(stack(by="Species", dir="y"))
        .mark(ribbon(x=mass.domain(), h=mass.density(), fill="Species")),
        {"w": 500, "h": 300, "axes": True},
    )
