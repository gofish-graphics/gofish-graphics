"""Equivalent of seaborn/MarginalHistogram.stories.tsx — Seaborn/Marginal Histogram.

Mirrors seaborn's jointplot:
    sns.jointplot(data=penguins, x="bill_length_mm", y="bill_depth_mm")
https://seaborn.pydata.org/generated/seaborn.jointplot.html
(Our penguins export renames the fields to "Beak ..." rather than "bill ...".)
"""

from gofish import (
    Constraint,
    layer,
    bin,
    chart,
    circle,
    derive,
    rect,
    scatter,
)
from python_stories.data import PENGUINS


def story_default():
    w = 400
    h = 400
    GAP = 10

    # Our penguins export uses "Beak ..." rather than seaborn's "bill ..." field names.
    data = [
        {**d, "id": i}
        for i, d in enumerate(
            d
            for d in PENGUINS
            if d["Beak Length (mm)"] is not None
            and d["Beak Depth (mm)"] is not None
        )
    ]

    sc = (
        chart(data)
        .flow(scatter(by="id", x="Beak Length (mm)", y="Beak Depth (mm)"))
        .mark(circle(r=3, fill="steelblue", fillOpacity=0.6))
        .name("scatter")
    )

    # bin()'s measure provenance now rides the derive operator's IR across the
    # RPC bridge (#537), so the bin edges auto-tag with the source field's
    # measure — no explicit field(name, measure=...) needed. The bare "start"/
    # "end" channels unify on the source axis just like the JS story.
    top_hist = (
        chart(data, h=80)
        .flow(
            derive(bin("Beak Length (mm)")),
            scatter(xMin="start", xMax="end"),
        )
        .mark(rect(h="count", fill="steelblue"))
        .name("topHist")
    )

    right_hist = (
        chart(data, w=80)
        .flow(
            derive(bin("Beak Depth (mm)")),
            scatter(yMin="start", yMax="end"),
        )
        .mark(rect(w="count", fill="steelblue"))
        .name("rightHist")
    )

    return (
        layer([sc, top_hist, right_hist]).constrain(
            lambda scatter, topHist, rightHist: [
                Constraint.position([scatter], x=0, y=0, anchor="baseline"),
                Constraint.align([scatter, topHist], x="baseline"),
                Constraint.align([scatter, rightHist], y="baseline"),
                Constraint.position([topHist], y=h + GAP, anchor="start"),
                Constraint.position([rightHist], x=w + GAP, anchor="start"),
            ]
        ),
        {
            "w": w,
            "h": h,
            "axes": {
                "x": {"title": "Beak Length (mm)"},
                "y": {"title": "Beak Depth (mm)"},
            },
        },
    )
