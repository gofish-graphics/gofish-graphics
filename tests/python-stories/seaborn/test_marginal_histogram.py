"""Equivalent of seaborn/MarginalHistogram.stories.tsx — Seaborn/Marginal Histogram.

Mirrors seaborn's jointplot:
    sns.jointplot(data=penguins, x="bill_length_mm", y="bill_depth_mm")
https://seaborn.pydata.org/generated/seaborn.jointplot.html
(Our penguins export renames the fields to "Beak ..." rather than "bill ...".)
"""

import math

from gofish import (
    Constraint,
    layer,
    chart,
    circle,
    derive,
    field,
    rect,
    scatter,
)
from python_stories.data import PENGUINS


def _histogram(column, step):
    """The bins of `column`, `step` wide, as rows: each bin's edges and the
    number of rows in it.

    TODO(#1058): use `partition` with `field(column).bin(step=...)` once it
    lands. The marginal bars must sit on the scatter's continuous scale, and
    `field(x).bin(...)` alone gives equal slots on an ordinal axis.
    """

    def bins(rows):
        counts = {}
        for r in rows:
            start = math.floor(r[column] / step) * step
            counts[start] = counts.get(start, 0) + 1
        return [
            {"start": start, "end": start + step, "count": count}
            for start, count in sorted(counts.items())
        ]

    return bins


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
        .flow(
            derive(_histogram("Beak Length (mm)", 2)),
            scatter(
                x_min=field("start", measure="Beak Length (mm)"),
                x_max=field("end", measure="Beak Length (mm)"),
            ),
        )
        .mark(rect(h="count", fill="steelblue"))
        .name("topHist")
    )

    right_hist = (
        chart(data, w=80)
        .flow(
            derive(_histogram("Beak Depth (mm)", 1)),
            scatter(
                y_min=field("start", measure="Beak Depth (mm)"),
                y_max=field("end", measure="Beak Depth (mm)"),
            ),
        )
        .mark(rect(w="count", fill="steelblue"))
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
