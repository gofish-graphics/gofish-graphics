"""Equivalent of seaborn/MarginalHistogram.stories.tsx — Seaborn/Marginal Histogram.

Mirrors seaborn's jointplot:
    sns.jointplot(data=penguins, x="bill_length_mm", y="bill_depth_mm")
https://seaborn.pydata.org/generated/seaborn.jointplot.html
(Our penguins export renames the fields to "Beak ..." rather than "bill ...".)
"""

from gofish import (
    Constraint,
    layer,
    chart,
    circle,
    field,
    partition,
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
        .mark(circle(r=3, fill="steelblue", fill_opacity=0.6))
        .name("scatter")
    )

    top_hist = (
        chart(data, h=80)
        .flow(partition(by=field("Beak Length (mm)").bin(step=2), dir="x"))
        .mark(rect(h=field("Beak Length (mm)").count(), fill="steelblue"))
        .name("topHist")
    )

    right_hist = (
        chart(data, w=80)
        .flow(partition(by=field("Beak Depth (mm)").bin(step=1), dir="y"))
        .mark(rect(w=field("Beak Depth (mm)").count(), fill="steelblue"))
        .name("rightHist")
    )

    return (
        layer([sc, top_hist, right_hist]).relate(
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
