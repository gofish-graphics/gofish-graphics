"""Equivalent of BoxPlot.stories.tsx — Forward Syntax/Box Plot."""

from gofish import chart, layer, rect, spread, Schema
from python_stories.data import GENDER_PAY_GAP, PAY_GRADE


def story_gender_pay_gap():
    # Five columns on one y axis, none with a declared unit: their units are
    # unknown, so they unify and the axis is titled by their names.
    return (
        chart(
            GENDER_PAY_GAP,
            schema={"Pay Grade": Schema.ordered(PAY_GRADE)},
            axes=True,
        )
        .flow(
            spread(by="Pay Grade", dir="x", spacing=24),
            spread(dir="x", spacing=6),
        )
        .mark(
            layer(
                [
                    rect(x=7.5, w=1, y="Min", y2="Max", fill="gray"),
                    rect(w=16, y="25-Percentile", y2="75-Percentile", fill="Gender"),
                    rect(w=16, h=1.5, y="Median", fill="white"),
                ]
            )
        ),
        {"w": 560, "h": 320},
    )
