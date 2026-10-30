"""Equivalent of lowlevel/NameScope.stories.tsx — Low Level Syntax/Name Scope.

String-name resolution checks: a `.relate()` parameter can name a node
nested anywhere inside the layer (`mercury` inside enclose › spread), and a
constrained mark repeated per chart row reuses its local names in every row.
"""

import math

from gofish import (
    Constraint,
    Shape,
    arrow,
    chart,
    circle,
    enclose,
    field,
    layer,
    line,
    rect,
    ribbon,
    scatter,
    select_all,
    spread,
    text,
)

PLANETS = [
    {"name": "mercury", "r": 8, "fill": "#b5b5b5", "stroke": "#8a8a8a"},
    {"name": "venus", "r": 14, "fill": "#e8c77a", "stroke": "#c9a24d"},
    {"name": "earth", "r": 15, "fill": "#4a90d9", "stroke": "#2d6fb3"},
    {"name": "mars", "r": 10, "fill": "#d9603b", "stroke": "#b04424"},
]


def story_nested_operand():
    return (
        layer([
            enclose(
                [
                    spread(
                        [
                            circle(
                                r=d["r"],
                                fill=d["fill"],
                                stroke=d["stroke"],
                                stroke_width=3,
                            ).name(d["name"])
                            for d in PLANETS
                        ],
                        dir="x",
                        spacing=50,
                        alignment="middle",
                    )
                ],
                padding=20,
                fill="#252150",
                stroke="none",
                shape=Shape.box(rx=16),
            ).name("planets"),
            text(text="Mercury", fill="#E94560", font_size=14).name("label"),
        ]).relate(lambda mercury, planets, label: [
            Constraint.align([mercury, label], x="middle"),
            Constraint.distribute([planets, label], dir="y", spacing=20),
            arrow([label, mercury], stroke="#E94560"),
        ]),
        {"w": 400, "h": 200},
    )


def story_per_row_names():
    return (
        chart(
            [
                {"k": "a", "v": 40},
                {"k": "b", "v": 90},
                {"k": "c", "v": 60},
            ],
            axes=False,
            w=200,
            h=120,
        )
        .flow(spread(by="k", dir="x", spacing=20, axes=False))
        .mark(
            layer([
                rect(w=40, h="v", fill="#9cc3e6").name("bar"),
                rect(w=16, h=4, fill="#1a5683").name("tick"),
            ]).relate(lambda bar, tick: [
                Constraint.align([bar, tick], x="middle", y="end"),
            ])
        ),
        {},
    )


def _normal_row(i):
    x = -4 + i / 10
    return {"x": x, "pdf": math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)}


NORMAL = [_normal_row(i) for i in range(81)]


def story_nested_callout():
    # The callout's arrow is a clause of a nested layer whose swatch is also
    # named "density"; the operand keeps the outer layer's binding.
    return (
        layer([
            chart(NORMAL, w=240, h=160)
            .flow(scatter(x="x"))
            .mark(ribbon(h="pdf", fill="#D1E4F6", stroke="#467DA8").name("density")),
        ]).relate(lambda density: [
            layer([
                rect(x=55, y=205, w=12, h=12, fill="#D1E4F6", stroke="#467DA8").name(
                    "density"
                ),
                text(x=73, y=205, text="standard normal", font_size=12).name("note"),
            ]).relate(lambda note: [
                arrow([note, density], stroke="#C0392B", pad_end=2),
            ]),
        ]),
        {"axes": False},
    )


MONTHLY_MEANS = [
    {"month": 1, "mean": 8.4},
    {"month": 2, "mean": 9.9},
    {"month": 3, "mean": 12.3},
    {"month": 4, "mean": 15.4},
    {"month": 5, "mean": 19.6},
    {"month": 6, "mean": 22.3},
    {"month": 7, "mean": 26.0},
    {"month": 8, "mean": 25.8},
    {"month": 9, "mean": 22.3},
    {"month": 10, "mean": 16.3},
    {"month": 11, "mean": 10.7},
    {"month": 12, "mean": 7.9},
]


def story_clause_select_all():
    return (
        layer([
            chart(MONTHLY_MEANS)
            .flow(scatter(x="month", y="mean"))
            .mark(circle(r=3.5, fill="#467DA8").name("means")),
        ]).relate(lambda: [
            chart(select_all("means")).mark(line(stroke="#467DA8")),
        ]),
        {"w": 420, "h": 200, "axes": False},
    )


def story_clause_with_default_axes():
    def dots(fill, r):
        return (
            chart(MONTHLY_MEANS)
            .flow(scatter(x="month", y="mean"))
            .mark(circle(r=r, fill=fill))
        )

    return (
        layer([dots("#9cc3e6", 6)]).relate(lambda: [dots("#1a5683", 2.5)]),
        {"w": 420, "h": 200},
    )


GROUPS = [
    {"g": "A", "mu": 0},
    {"g": "B", "mu": 0.6},
    {"g": "C", "mu": 1.4},
    {"g": "D", "mu": 1.1},
    {"g": "E", "mu": 1.9},
    {"g": "F", "mu": 2.4},
]


def _group_row(g, mu, i):
    x = -3 + i / 10
    z = x - mu
    return {"g": g, "mu": mu, "x": x, "pdf": math.exp(-0.5 * z * z) / math.sqrt(2 * math.pi)}


GROUP_DENSITY = [_group_row(d["g"], d["mu"], i) for d in GROUPS for i in range(81)]


def story_median_trend():
    # Each cell's dot is named "median" in its own layer; select_all from
    # outside the spread gathers all six.
    return (
        layer([
            chart(GROUP_DENSITY, w=360, axes=False)
            .flow(spread(by="g", dir="y", anchor="baseline", spacing=30))
            .mark(
                layer([
                    chart()
                    .flow(scatter(x="x", h=28))
                    .mark(ribbon(h="pdf", fill="#D1E4F6", stroke="#467DA8")),
                    chart().mark(
                        circle(
                            cx=field("mu").median(), cy=4, r=3, fill="#C0392B"
                        ).name("median")
                    ),
                ])
            ),
            chart(select_all("median")).mark(line(stroke="#C0392B").z_order(1)),
        ]),
        {"axes": False},
    )
