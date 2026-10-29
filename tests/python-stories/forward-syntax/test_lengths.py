"""Equivalent of Lengths.stories.tsx — Forward Syntax/Lengths.

Lengths (#1176 step 6): a size or a gap given as `percent(n)` of the room it
is laid out in, or as `fr(k)`, k shares of the room its nearest scope
divides.
"""

from gofish import (
    Color,
    chart,
    datum,
    fr,
    layer,
    percent,
    rect,
    ribbon,
    spread,
    stack,
    text,
)
from python_stories.data import SEAFOOD

SALES = [
    {"store": store, "quarter": f"Q{q + 1}", "sales": s}
    for store, values in [
        ("North", [32, 41, 38, 52]),
        ("Harbor", [24, 22, 30, 27]),
        ("Hill", [45, 39, 33, 36]),
    ]
    for q, s in enumerate(values)
]
NORTH = [r for r in SALES if r["store"] == "North"]


def _panel(fill, label, **dims):
    """A labeled box: a filled rect that fills its room, and its label."""
    return layer(
        [rect(fill=fill, stroke="#555", stroke_width=1), text(text=label, font_size=12)],
        **dims,
    )


def story_area_fr_gaps():
    return (
        chart(SEAFOOD, w=500, h=200)
        .flow(spread(by="lake", dir="x", spacing=fr(1)), stack(by="species", dir="y"))
        .mark(ribbon(h="count", fill="species", opacity=0.8)),
        {},
    )


def story_sidebar_and_fr_panels():
    return (
        layer(
            [
                spread(
                    [
                        _panel("#eeeeee", "sidebar 140 px", w=140, h=260),
                        _panel("#dbe9f6", "main fr(2)", w=fr(2), h=260),
                        _panel("#fde7d4", "inspector fr(1)", w=fr(1), h=260),
                    ],
                    dir="x",
                    spacing=12,
                    alignment="start",
                )
            ],
            w=720,
            h=260,
        ),
        {},
    )


def story_sidebar_and_fr_charts():
    return (
        layer(
            [
                spread(
                    [
                        _panel("#eeeeee", "filters 120 px", w=120, h=200),
                        chart(SALES, w=fr(2), h=200)
                        .flow(
                            spread(by="quarter", dir="x", spacing=6),
                            stack(by="store", dir="y"),
                        )
                        .mark(rect(h="sales", fill="store")),
                        chart(SALES, w=fr(1), h=200)
                        .flow(spread(by="store", dir="x", spacing=6))
                        .mark(rect(h="sales", fill="#08519c")),
                    ],
                    dir="x",
                    spacing=24,
                    alignment="end",
                )
            ],
            w=760,
            h=260,
        ),
        {},
    )


def _dashboard(spacing, left, right):
    return layer(
        [
            spread(
                [
                    _panel("#dbe9f6", left[0], w=left[1], h=120),
                    _panel("#fde7d4", right[0], w=right[1], h=120),
                ],
                dir="x",
                spacing=spacing,
                alignment="start",
            )
        ],
        w=720,
        h=120,
    )


def story_dashboard30_and70():
    return (
        _dashboard(0, ("percent(30)", percent(30)), ("percent(70)", percent(70))),
        {},
    )


def story_dashboard30_and70_with_gap():
    return (
        _dashboard(12, ("percent(30)", percent(30)), ("percent(70)", percent(70))),
        {},
    )


def story_dashboard3fr_and7fr_with_gap():
    return (_dashboard(12, ("fr(3)", fr(3)), ("fr(7)", fr(7))), {})


def story_bars_inset_percent():
    return (
        chart(NORTH, w=400, h=200)
        .flow(spread(by="quarter", dir="x", spacing=0))
        .mark(rect(h="sales", fill="#08519c", inset=percent(10))),
        {},
    )


def story_bars_fr_spacing():
    return (
        chart(NORTH, w=400, h=200)
        .flow(spread(by="quarter", dir="x", spacing=fr(0.25)))
        .mark(rect(h="sales", fill="#08519c")),
        {},
    )


STORE_COLORS = {"North": "#4e79a7", "Harbor": "#f28e2b", "Hill": "#59a14f"}


def story_legend_column_percent():
    entries = [
        spread(
            [rect(w=12, h=12, fill=fill), text(text=store, font_size=12)],
            dir="x",
            spacing=6,
            alignment="middle",
        )
        for store, fill in STORE_COLORS.items()
    ]
    return (
        layer(
            [
                spread(
                    [
                        chart(
                            SALES,
                            w=fr(1),
                            h=200,
                            legend=False,
                            color=Color.palette(STORE_COLORS),
                        )
                        .flow(
                            spread(by="quarter", dir="x", spacing=8),
                            stack(by="store", dir="y"),
                        )
                        .mark(rect(h="sales", fill="store")),
                        layer(
                            [spread(entries, dir="y", spacing=6, alignment="start")],
                            w=percent(20),
                            h=200,
                        ),
                    ],
                    dir="x",
                    spacing=16,
                    alignment="end",
                )
            ],
            w=640,
            h=260,
        ),
        {"legend": False},
    )


def story_small_multiples_percent_spacing():
    return (
        chart(SALES, w=600, h=200)
        .flow(spread(by="store", dir="x", spacing=percent(5)))
        .mark(
            chart(axes=False)
            .flow(spread(by="quarter", dir="x", spacing=fr(0.25)))
            .mark(rect(h="sales", fill="#08519c"))
        ),
        {},
    )


def story_fr_in_data_scope_warns():
    return (
        chart(NORTH, w=400, h=200)
        .flow(spread(by="quarter", dir="x", spacing=fr(0.25)))
        .mark(rect(w="sales", h="sales", fill="#08519c")),
        {},
    )


def story_percent_of_band():
    return (
        chart(NORTH, w=400, h=200)
        .flow(spread(by="quarter", dir="x", spacing=8))
        .mark(
            lambda d: layer(
                [
                    rect(h=datum(d[0]["sales"]), fill="#9ecae1"),
                    rect(y=datum(d[0]["sales"]), w=percent(40), h=4, fill="#08519c"),
                ]
            )(d)
        ),
        {},
    )
