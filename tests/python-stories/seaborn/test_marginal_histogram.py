"""Equivalent of seaborn/MarginalHistogram.stories.tsx — Seaborn/Marginal Histogram.

Mirrors seaborn's jointplot:
    sns.jointplot(data=penguins, x="bill_length_mm", y="bill_depth_mm")
https://seaborn.pydata.org/generated/seaborn.jointplot.html
(Our penguins export renames the fields to "Beak ..." rather than "bill ...".)
"""

from gofish import (
    Constraint,
    Layer,
    bin,
    chart,
    circle,
    derive,
    field,
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

    # Python bin()'s measure provenance can't cross the derive RPC bridge
    # (JSON drops the JS-side symbol), so the bin-edge channels would tag as
    # "start"/"end" and falsely conflict with the center's field measure.
    # Annotate explicitly with field(name, measure=...) — the escape hatch the
    # measure type error prescribes. The JS story needs no annotations; #537
    # tracks carrying provenance across the bridge so this collapses too.
    top_hist = (
        chart(data, h=80)
        .flow(
            derive(bin("Beak Length (mm)")),
            scatter(
                xMin=field("start", measure="Beak Length (mm)"),
                xMax=field("end", measure="Beak Length (mm)"),
            ),
        )
        .mark(rect(h="count", fill="steelblue"))
        .name("topHist")
    )

    right_hist = (
        chart(data, w=80)
        .flow(
            derive(bin("Beak Depth (mm)")),
            scatter(
                yMin=field("start", measure="Beak Depth (mm)"),
                yMax=field("end", measure="Beak Depth (mm)"),
            ),
        )
        .mark(rect(w="count", fill="steelblue"))
        .name("rightHist")
    )

    return (
        Layer([sc, top_hist, right_hist]).constrain(
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
