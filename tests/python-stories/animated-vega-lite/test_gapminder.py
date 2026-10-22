"""Equivalent of Gapminder.stories.tsx — Animated Vega-Lite/Gapminder.

The clock is a `timer(...)` source, declared here and run by the browser; a
paused story holds it with `playing=False, at=...`, and a playing one is
captured at its first frame. CurvesKinematics and CurvesKinematicsPaused
build their sparklines from internal spline helpers and an internal
coordinate transform, so they stay exempt per `tests/.python-sync-exempt`.
"""

from gofish import (
    Animation,
    Curve,
    chart,
    circle,
    filter,
    layer,
    line,
    scatter,
    spread,
    text,
    time,
    timer,
)
from python_stories.vega_data_urls import read_json


def _gapminder():
    return read_json("gapminder.json").to_dict("records")


def _year_range(rows):
    """The year field's own range. A `time.sequence` reads this off the data
    itself; a `timer` the chart shares with a readout has to be told it."""
    years = [r["year"] for r in rows]
    return [min(years), max(years)]


def _paused(rows, at, duration=10000):
    return timer(
        domain=_year_range(rows), duration=duration, playing=False, loop=False, at=at
    )


def _year_readout(clock):
    """The year the chart is showing, large and pale in the plot's top right."""
    return (
        chart([{"fertility": 7.5, "life_expect": 83}])
        .flow(scatter(x="fertility", y="life_expect"))
        .mark(text(text=clock.floor(), font_size=48, fill="#ccc").z_order(-1))
    )


# The spatial twin of the animation: `spread` by year lays the time axis out
# across x as eleven panels, `scatter` places each country inside its panel,
# and the `line` threads along the year tier, one path per country.
def story_spatial_twin():
    return (
        chart(_gapminder(), legend=False)
        .flow(
            spread(by="year", dir="x", spacing=12),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(circle(r=2.5, fill="country"))
        .layer(
            line(along="year", stroke="country", stroke_width=0.5, opacity=0.5)
        ),
        {"w": 1150, "h": 280},
    )


# The animation itself: `spread` became `time.sequence` and `line` became
# `time.transition`.
def story_animated():
    rows = _gapminder()
    year = timer(domain=_year_range(rows), duration=5000)
    return (
        chart(rows, legend=False)
        .flow(
            time.sequence(by="year", on=year),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(circle(r=4, fill="country"))
        .layer(time.transition())
        .layer(_year_readout(year)),
        {"w": 500, "h": 400},
    )


# The same animation held still at 1975, on the sequence's own clock.
def story_paused1975():
    return (
        chart(_gapminder(), legend=False)
        .flow(
            time.sequence(by="year", playing=False, at=1975),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(circle(r=4, fill="country"))
        .layer(time.transition()),
        {"w": 500, "h": 400},
    )


# The sequence on its own, with no transition layered over it.
def story_sequence_only():
    rows = _gapminder()
    year = timer(domain=_year_range(rows), duration=5000)
    return (
        chart(rows, legend=False)
        .flow(
            time.sequence(by="year", on=year),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(circle(r=4, fill="country"))
        .layer(_year_readout(year)),
        {"w": 500, "h": 400},
    )


PANEL_W = 240
PANEL_GAP = 16

CURVES = [
    ("no transition (sequence alone)", None),
    ("step: hold, then jump", Curve.step()),
    ("linear", Curve.linear()),
    ("monotone (default)", Curve.monotone()),
]

CURVES_THREE = [
    ("no interpolation", None),
    ("linear", Curve.linear()),
    ("monotone", Curve.monotone()),
]


def _curve_panel(rows, clock, curve):
    """One panel of the comparison: the same animated scatter, read one way,
    on a clock it shares with the others."""
    keyframes = (
        chart(rows, legend=False, padding=0)
        .flow(
            time.sequence(by="year", on=clock),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(circle(r=4, fill="country"))
    )
    return keyframes if curve is None else keyframes.layer(time.transition(curve=curve))


def _curves_row(w, h, clock, readings, panel):
    """A row of panels, one per reading, each under its caption, under a year
    readout, all on one clock."""
    return (
        spread(
            [
                text(text=clock.floor(), font_size=40, fill="#ccc"),
                spread(
                    [
                        spread(
                            [
                                text(text=caption, font_size=12, fill="#555"),
                                layer([panel(curve)], w=PANEL_W, h=280),
                            ],
                            dir="y",
                            spacing=8,
                            alignment="middle",
                        )
                        for caption, curve in readings
                    ],
                    dir="x",
                    spacing=PANEL_GAP,
                    alignment="end",
                ),
            ],
            dir="y",
            spacing=16,
            alignment="middle",
        ),
        {"w": w, "h": h, "legend": False, "axes": True},
    )


def story_curves():
    rows = _gapminder()
    year = timer(domain=_year_range(rows), duration=10000)
    return _curves_row(1160, 400, year, CURVES, lambda c: _curve_panel(rows, year, c))


def story_curves_three():
    rows = _gapminder()
    year = timer(domain=_year_range(rows), duration=10000)
    return _curves_row(880, 400, year, CURVES_THREE, lambda c: _curve_panel(rows, year, c))


def story_curves_paused():
    rows = _gapminder()
    year = _paused(rows, 1957.5)
    return _curves_row(1160, 400, year, CURVES, lambda c: _curve_panel(rows, year, c))


# One frame of the animation: the 1955 scatter the playback starts from.
def story_frame1955():
    return (
        chart(_gapminder(), legend=False)
        .flow(
            filter(lambda d: d["year"] == 1955),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(circle(r=4, fill="country")),
        {"w": 500, "h": 400},
    )


TRAIL_COUNTRIES = ["China", "India", "United States", "Rwanda", "South Africa"]


def _trails(rows, clock, curve, **options):
    """Each country a dot moving through the years, leaving a faint dot for
    each year it has passed and a line threaded through them."""
    return (
        chart([d for d in rows if d["country"] in TRAIL_COUNTRIES], **options)
        .flow(
            time.sequence(by="year", on=clock),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(
            layer(
                [
                    time.history([circle(r=4, fill="country", opacity=0.3)]),
                    circle(r=4, fill="country").transition(
                        update=Animation.tween(curve=curve)
                    ),
                ]
            )
        )
        .layer(
            line(
                along="year",
                stroke="country",
                stroke_width=1.5,
                opacity=0.6,
                curve=curve,
            )
        )
    )


def story_trails():
    rows = _gapminder()
    year = timer(domain=_year_range(rows), duration=10000)
    return (
        _trails(rows, year, Curve.monotone()).layer(_year_readout(year)),
        {"w": 500, "h": 400},
    )


def story_trails_paused():
    rows = _gapminder()
    year = _paused(rows, 1997.5)
    return (
        _trails(rows, year, Curve.monotone()).layer(_year_readout(year)),
        {"w": 500, "h": 400},
    )


TRAIL_CURVES = [(c["kind"], c) for c in [Curve.linear(), Curve.monotone()]]


def _trail_curves_row(rows, clock):
    return _curves_row(
        600,
        400,
        clock,
        TRAIL_CURVES,
        lambda c: _trails(rows, clock, c, legend=False, padding=0),
    )


def story_trails_curves():
    rows = _gapminder()
    return _trail_curves_row(rows, timer(domain=_year_range(rows), duration=10000))


def story_trails_curves_paused():
    rows = _gapminder()
    return _trail_curves_row(rows, _paused(rows, 1967.5))
