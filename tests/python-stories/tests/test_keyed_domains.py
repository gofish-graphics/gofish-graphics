"""Equivalent of KeyedDomains.stories.tsx — Tests/Keyed Domains.

Checks for measure-keyed domains (#1114): a size never splits a domain.
"""

from gofish import chart, spread, stack, rect, select_all, group, text

# The largest value is 1.1, in group B.
_VALUES = [
    {"group": "A", "item": "p", "value": 0.4},
    {"group": "A", "item": "q", "value": 0.7},
    {"group": "A", "item": "r", "value": 0.5},
    {"group": "B", "item": "p", "value": 1.1},
    {"group": "B", "item": "q", "value": 0.3},
    {"group": "B", "item": "r", "value": 0.8},
    {"group": "C", "item": "p", "value": 0.2},
    {"group": "C", "item": "q", "value": 0.6},
    {"group": "C", "item": "r", "value": 0.9},
]

_GROUP_B = [d for d in _VALUES if d["group"] == "B"]


def story_grouped_bars_inner_height():
    # Every inner group is 150px tall. The groups share the y domain, 0 to
    # 1.1, so 1.1 maps to 150px in every group. The chart is 150px tall too,
    # so its y axis lines up with the groups.
    return (
        chart(_VALUES)
        .flow(
            spread(by="group", dir="x", spacing=24),
            stack(by="item", dir="x", h=150),
        )
        .mark(rect(w=20, h="value", fill="item")),
        {"w": 300, "h": 150, "axes": True},
    )


def story_chart_own_size():
    # A chart with its own size keeps its axes: it maps its keyed domains
    # into its own w and h, and the render gives it no other size.
    return (
        chart(_GROUP_B, w=240, h=160)
        .flow(spread(by="item", dir="x", spacing=12))
        .mark(rect(w=40, h="value", fill="item")),
        {"axes": True},
    )


def story_layered_chart_own_size():
    # A `.layer()` chart whose root tier has a size of its own, rendered on a
    # larger canvas. The bars, their value labels and the y axis all map with
    # the σ the 240 x 160 box solves: the 1.1 bar's top meets the axis at 1.1.
    def label_mark(d):
        return spread(
            [text(text=str(d[0].datum[0]["value"])), d[0]],
            dir="y",
            alignment="middle",
            spacing=6,
        )

    return (
        chart(_GROUP_B, w=240, h=160)
        .flow(spread(by="item", dir="x", spacing=12))
        .mark(rect(w=40, h="value", fill="item").name("bars"))
        .layer(chart(select_all("bars")).flow(group(by="item")).mark(label_mark)),
        {"w": 400, "h": 400, "axes": True},
    )
