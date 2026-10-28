"""Equivalent of Gapminder.stories.tsx — Animated Vega-Lite/Gapminder.

Ports the two static stories, SpatialTwin and Frame1955. The animated stories
hold a `timer()` clock, which cannot cross the bridge; they are exempt per
`tests/.python-sync-exempt`.
"""

from gofish import chart, circle, filter, line, scatter, spread
from python_stories.vega_data_urls import read_json


def _gapminder():
    return read_json("gapminder.json").to_dict("records")


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


# One frame of the animation: the 1955 scatter the playback starts from.
def story_frame1955():
    return (
        chart(_gapminder(), legend=False, w=300, h=300)
        .flow(
            filter(lambda d: d["year"] == 1955),
            scatter(by="country", x="fertility", y="life_expect"),
        )
        .mark(circle(r=4, fill="country")),
        {},
    )
