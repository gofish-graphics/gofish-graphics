"""Equivalent of BarChartRace.stories.tsx — Animated Vega-Lite/Bar Chart Race.

Ports the static story, Frame2000. The animated and paused stories hold a
`timer()` clock, which cannot cross the bridge; they are exempt per
`tests/.python-sync-exempt`. So are the JS file's race helpers
(`BAR_SPACING`, `clipToTopTen`), which only those stories read.
"""

from gofish import chart, field, filter, rect, spread
from python_stories.data import CATEGORY_BRANDS


def _every_year_brands(rows):
    """The brands with a value in every year, as the JS `everyYearBrands`."""
    years = len({d["year"] for d in rows})
    seen = {}
    for d in rows:
        seen.setdefault(d["name"], set()).add(d["year"])
    return [d for d in rows if len(seen[d["name"]]) == years]


# One frame of the animation: the 2000 bar chart the playback starts from.
def story_frame2000():
    return (
        chart(_every_year_brands(CATEGORY_BRANDS), legend=False, w=600, h=600)
        .flow(
            filter(lambda d: d["year"] == 2000),
            spread(by=field("name").sort("value", "desc"), dir="y", spacing=2),
        )
        .mark(
            rect(w="value", fill="category").label(
                "name", position="outset-right"
            )
        ),
        {"axes": {"x": True, "y": False}},
    )
