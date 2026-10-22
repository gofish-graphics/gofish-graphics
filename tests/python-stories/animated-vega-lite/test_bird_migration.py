"""Equivalent of BirdMigration.stories.tsx — Animated Vega-Lite/Bird Migration.

Panels B (hover), C (animated) and D (trails, playing and held still). The
hover is a `pointer()` read in expressions, captured at rest (the pointer off
the chart); the day clock is a `timer(...)` the browser runs. E_Controls
drives the clock from a slider and a play/pause button, whose writes are not
in Python yet, so it stays exempt per `tests/.python-sync-exempt`.
"""

from gofish import (
    Coord,
    chart,
    circle,
    field,
    filter,
    group,
    layer,
    line,
    pointer,
    polygon,
    scatter,
    text,
    time,
    timer,
    when,
)
from python_stories.bird_data import BIRDS, WORLD_110M


def _basemap():
    return chart(
        WORLD_110M,
        coord=Coord.geo("equalEarth", lon=(-170, -30), lat=(-60, 75)),
        legend=False,
    ).mark(polygon(points="ring", fill="#f7f7f7", stroke="#aaa"))


def story_b_hover_highlight():
    hover = pointer()
    return (
        _basemap()
        .layer(
            chart(BIRDS)
            .flow(group(by="species"), scatter(by="day", x="lon", y="lat"))
            .mark(
                line(
                    stroke="species",
                    stroke_width=when(hover.over).then(3).otherwise(0.1),
                    opacity=when(hover.over).then(1).otherwise(0.5),
                )
            )
        )
        .layer(text(text=hover.field("species").fill_null(""), font_size=14, fill="#333")),
        {"w": 600, "h": 600},
    )


def story_c_animated():
    day = timer(domain=[1, 365], step=1, duration=10000)
    return (
        _basemap().layer(
            chart(BIRDS)
            .flow(filter(field("day") == day), scatter(x="lon", y="lat"))
            .mark(circle(r=3, fill="species"))
        ),
        {"w": 600, "h": 600},
    )


def _trails(day):
    return (
        chart(BIRDS)
        .flow(time.sequence(by="day", on=day, cyclic=True), scatter(x="lon", y="lat"))
        .mark(
            layer(
                [
                    time.history([circle(r=3, fill="species", opacity=0.1)], last=20),
                    circle(r=3, fill="species"),
                ]
            )
        )
    )


def story_d_trails():
    day = timer(domain=[1, 365], step=1, duration=10000)
    return (_basemap().layer(_trails(day)), {"w": 600, "h": 600})


def _paused_panel(at):
    day = timer(domain=[1, 365], step=1, duration=10000, playing=False, loop=False, at=at)
    return (_basemap().layer(_trails(day)), {"w": 600, "h": 600})


def story_d_trails_paused():
    return _paused_panel(120)


def story_d_trails_paused_day5():
    return _paused_panel(5)
