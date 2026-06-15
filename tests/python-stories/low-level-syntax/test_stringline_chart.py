"""Equivalent of lowlevel/StringlineChart.stories.tsx — Low Level Syntax/Stringline Chart.

A Marey/stringline diagram of Caltrain schedules: stations stacked top-to-bottom
in stop order, each train's stop marked by a dot positioned by time, and a line
per train threading its dots. The dots are placed in a `spread` tier and named;
the lines are `connect`s over `ref`s to those names (the Pulley cross-tier
pattern), all wrapped in one `layer`.
"""

from gofish import layer, spread, connect, rect, ellipse, ref, datum
from python_stories.data import CALTRAIN, CALTRAIN_STOP_ORDER
from python_stories._lowlevel_helpers import group_by, order_by


def _stop_index(station):
    # Mirror JS `caltrainStopOrder.indexOf(station)` (−1 when absent).
    return CALTRAIN_STOP_ORDER.index(station) if station in CALTRAIN_STOP_ORDER else -1


def _dot_name(d):
    return f"{d['Train']}-{d['Station']}-{d['Time']}"


def story_default():
    rows = [d for d in CALTRAIN if d["Type"] != "Bullet"]

    by_station = group_by(
        order_by(rows, lambda d: _stop_index(d["Station"]), "desc"),
        "Station",
    )

    stations_tier = spread(
        [
            layer(
                [
                    rect(w=0, h=0),
                    *[
                        ellipse(
                            x=d["Time"] / 3, w=4, h=4, fill=datum(d["Direction"])
                        ).name(_dot_name(d))
                        for d in station_rows
                    ],
                ],
                key=station,
            )
            for station, station_rows in by_station.items()
        ],
        dir="y",
        reverse=True,
        spacing=8,
        alignment="start",
    )

    train_lines = [
        connect(
            [ref(_dot_name(d)) for d in train_rows],
            direction="y",
            strokeWidth=1,
            mode="center",
        )
        for train_rows in group_by(rows, "Train").values()
    ]

    return (
        layer([stations_tier, *train_lines]),
        {"axes": True},
    )
