"""Equivalent of ConnectedScatterplot.stories.tsx — Animated Vega-Lite/Connected Scatterplot.

The Animated Vega-Lite connected scatterplot: fifty-five years of miles
driven against the price of gas, with the line drawn in year by year. Each
reading has a playing story, captured at its first frame, and one held at
1979.5 on a paused `timer(...)`.
"""

from gofish import Animation, Curve, chart, circle, layer, line, scatter, time, timer
from python_stories.data import DRIVING_SHIFTS

YEARS = [1956, 2010]
DURATION = 54 * 200
AT = 1979.5


def _playing():
    return timer(domain=YEARS, duration=DURATION)


def _paused():
    return timer(domain=YEARS, duration=DURATION, playing=False, loop=False, at=AT)


def _dot():
    return circle(r=4, fill="white", stroke="black", stroke_width=2)


def _years(clock, *between):
    return chart(DRIVING_SHIFTS).flow(
        time.sequence(by="year", on=clock), *between, scatter(x="miles", y="gas")
    )


def _port(clock):
    return _years(clock, time.history()).mark(line(along="year", curve=Curve.linear()))


def _with_dots(clock):
    return (
        _years(clock)
        .mark(time.history([_dot()]))
        .layer(line(along="year", stroke="black", stroke_width=2))
    )


def _moving_dot(clock):
    orange = circle(r=4, fill="#e4572e", stroke="black", stroke_width=2)
    return (
        _years(clock)
        .mark(layer([time.history([_dot()]), orange.transition(update=Animation.tween())]))
        .layer(line(along="year", stroke="black", stroke_width=2))
    )


def _comet(clock):
    return _years(clock, time.history(last=10)).mark(line(along="year", curve=Curve.linear()))


SIZE = {"w": 500, "h": 500}


def story_animated():
    return (_port(_playing()), SIZE)


def story_paused1979():
    return (_port(_paused()), SIZE)


def story_with_dots():
    return (_with_dots(_playing()), SIZE)


def story_with_dots_paused1979():
    return (_with_dots(_paused()), SIZE)


def story_moving_dot():
    return (_moving_dot(_playing()), SIZE)


def story_moving_dot_paused1979():
    return (_moving_dot(_paused()), SIZE)


def story_comet():
    return (_comet(_playing()), SIZE)


def story_comet_paused1979():
    return (_comet(_paused()), SIZE)
