"""Equivalent of BarChartRace.stories.tsx — Animated Vega-Lite/Bar Chart Race.

The clock is a `timer(...)` source the browser runs; the paused stories hold
it with `playing=False, at=...`. The Top10FromBelow stories clip their
container with CSS (page markup, not the spec), so they stay exempt per
`tests/.python-sync-exempt`.
"""

from gofish import Curve, chart, field, filter, rect, scatter, spread, text, time, timer
from python_stories.data import CATEGORY_BRANDS


def _every_year_brands(rows):
    """The brands with a value in every year, as the JS `everyYearBrands`."""
    years = len({d["year"] for d in rows})
    seen = {}
    for d in rows:
        seen.setdefault(d["name"], set()).add(d["year"])
    return [d for d in rows if len(seen[d["name"]]) == years]


def _top10(rows):
    """Each year's ten most valuable brands, as the JS `top10`: rank each
    year's brands by value, and keep the rows ranked ten or better."""
    years = list(dict.fromkeys(d["year"] for d in rows))
    out = []
    for y in years:
        ranked = sorted((d for d in rows if d["year"] == y), key=lambda d: -d["value"])
        out.extend(ranked[:10])
    return out


BRANDS = _every_year_brands(CATEGORY_BRANDS)
TOP10 = _top10(CATEGORY_BRANDS)

YEARS = [2000, 2019]
DURATION = 20000


def _year_readout(clock, h):
    """The year, large and pale behind the bars, placed by the x scale."""
    return (
        chart([{"value": 210000}])
        .flow(scatter(x="value"))
        .mark(text(text=clock.floor(), font_size=48, fill="#ccc", y=h - 130).z_order(-1))
    )


def _race(year, rows=BRANDS, w=600, h=600):
    return (
        chart(rows, legend=False)
        .flow(
            time.sequence(by="year", on=year),
            spread(by=field("name").sort("value", "desc"), dir="y", spacing=2),
        )
        .mark(rect(w="value", fill="category").label("name", position="outset-right"))
        .layer(time.transition(curve=Curve.linear()))
        .layer(_year_readout(year, h)),
        {"w": w, "h": h, "axes": {"x": True, "y": False}},
    )


def _paused(at):
    return timer(domain=YEARS, duration=DURATION, playing=False, loop=False, at=at)


def story_animated():
    return _race(timer(domain=YEARS, duration=DURATION))


def story_paused2000():
    return _race(_paused(2000))


def story_paused2010():
    return _race(_paused(2010))


def story_paused2019():
    return _race(_paused(2019))


def story_paused2007_5():
    return _race(_paused(2007.5))


def story_top10():
    return _race(timer(domain=YEARS, duration=DURATION), TOP10, h=400)


def story_top10_paused2007_5():
    return _race(_paused(2007.5), TOP10, h=400)


def story_top10_paused2008():
    return _race(_paused(2008), TOP10, h=400)


# One frame of the animation: the 2000 bar chart the playback starts from.
def story_frame2000():
    return (
        chart(BRANDS, legend=False)
        .flow(
            filter(lambda d: d["year"] == 2000),
            spread(by=field("name").sort("value", "desc"), dir="y", spacing=2),
        )
        .mark(rect(w="value", fill="category").label("name", position="outset-right")),
        {"w": 600, "h": 600, "axes": {"x": True, "y": False}},
    )
