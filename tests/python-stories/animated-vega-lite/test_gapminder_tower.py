"""Equivalent of GapminderTower.stories.tsx — Animated Vega-Lite/Gapminder Tower.

The desugaring tower of the Gapminder animation, held at 1957.5: the sugar
(L0), the key made explicit (L1), the clock made explicit (L2), and the
interpolation done in data space by a derive (L3). L3's derive is the kernel
tier: it reads the clock in Python (`year()`), and the browser re-runs it
when the clock changes.
"""

from gofish import (
    blank,
    chart,
    circle,
    derive,
    group,
    interpolate,
    scatter,
    select_all,
    time,
    timer,
)
from python_stories.vega_data_urls import read_json

AT = 1957.5
YEARS = [1955, 2005]


def _gapminder():
    return read_json("gapminder.json").to_dict("records")


def story_l0_sugar():
    return (
        chart(_gapminder(), legend=False)
        .flow(
            time.sequence(by="year", duration=5000, playing=False, at=AT),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(circle(r=4, fill="country"))
        .layer(time.transition()),
        {"w": 500, "h": 400},
    )


def story_l1_explicit_key():
    return (
        chart(_gapminder(), legend=False)
        .flow(
            time.sequence(by="year", duration=5000, playing=False, at=AT),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(circle(r=4, fill="country").name("kf"))
        .layer(
            chart(select_all("kf"))
            .flow(group(by="country"))
            .mark(time.transition(along="year"))
        ),
        {"w": 500, "h": 400},
    )


def story_l2_explicit_clock():
    year = timer(domain=YEARS, duration=5000, playing=False, loop=False, at=AT)
    return (
        chart(_gapminder(), legend=False)
        .flow(
            group(by="year"),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(circle(r=4, fill="country").name("kf"))
        .layer(
            chart(select_all("kf"))
            .flow(group(by="country"))
            .mark(time.transition(along="year", at=year))
        ),
        {"w": 500, "h": 400},
    )


def story_l3_data_space():
    rows = _gapminder()
    year = timer(domain=YEARS, duration=5000, playing=False, loop=False, at=AT)
    return (
        chart(rows, legend=False)
        .flow(
            group(by="year"),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(blank())
        .layer(
            chart(rows)
            .flow(
                derive(lambda r: interpolate(r, along="year", key="country", at=year())),
                scatter(by="country", x="fertility", y="life_expect"),
            )
            .mark(circle(r=4, fill="country"))
        ),
        {"w": 500, "h": 400},
    )
