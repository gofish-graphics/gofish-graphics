"""Equivalent of lowlevel/Constraints.stories.tsx — Low Level Syntax/Constraints.

Ports every story: the six that demonstrate `layer + constrain` directly,
`SpreadEnd_UnderCoordTransform` (the pixel-pure `end` fallback canary, #552),
`AlignSpan`/`AlignSize` (#726 — the `"span"`/`"size"` alignment values), and
the eight equivalence cases, each a `*_spread` / `*_constraints` pair showing
that `spread(...)` places its children the way `align` + `distribute` does.
"""

from gofish import Constraint, datum, layer, rect, spread, Coord


# ─── partial placement ───────────────────────────────────────────────────────


def story_align_only():
    return (
        layer([
            rect(w=80, h=40, fill="#e63946").name("a"),
            rect(w=120, h=60, fill="#457b9d").name("b"),
            rect(w=60, h=30, fill="#2a9d8f").name("c"),
        ]).relate(lambda a, b, c: [
            Constraint.align([a, b, c], x="end"),
        ]),
        {"w": 300, "h": 300},
    )


def story_align_only_manual_y():
    return (
        layer([
            rect(w=80, h=40, y=20, fill="#e63946").name("a"),
            rect(w=120, h=60, y=100, fill="#457b9d").name("b"),
            rect(w=60, h=30, y=200, fill="#2a9d8f").name("c"),
        ]).relate(lambda a, b, c: [
            Constraint.align([a, b, c], x="end"),
        ]),
        {"w": 300, "h": 300},
    )


def story_distribute_only():
    return (
        layer([
            rect(w=80, h=40, fill="#e63946").name("a"),
            rect(w=120, h=40, fill="#457b9d").name("b"),
            rect(w=60, h=40, fill="#2a9d8f").name("c"),
        ]).relate(lambda a, b, c: [
            Constraint.distribute([a, b, c], dir="y", spacing=10),
        ]),
        {"w": 300, "h": 300},
    )


# ─── subset selection ────────────────────────────────────────────────────────


def story_subset_selection():
    return (
        layer([
            rect(w=100, h=50, fill="#e63946").name("a"),
            rect(w=80, h=50, fill="#457b9d").name("b"),
            rect(w=120, h=50, fill="#2a9d8f").name("c"),
            rect(w=60, h=50, fill="#f4a261").name("d"),
        ]).relate(lambda a, b, c, d: [
            Constraint.align([a, b, c, d], x="end"),
            Constraint.distribute([a, b], dir="y", spacing=5),
            Constraint.distribute([c, d], dir="y", spacing=30),
        ]),
        {"w": 400, "h": 400},
    )


def story_background_not_distributed():
    return (
        layer([
            rect(w=150, h=200, fill="#e2ebf6").name("bg"),
            rect(w=100, h=40, fill="#e63946").name("a"),
            rect(w=80, h=40, fill="#457b9d").name("b"),
            rect(w=120, h=40, fill="#2a9d8f").name("c"),
        ]).relate(lambda bg, a, b, c: [
            Constraint.align([bg, a, b, c], x="start"),
            Constraint.distribute([a, b, c], dir="y", spacing=10),
        ]),
        {"w": 400, "h": 400},
    )


# ─── cross-axis ──────────────────────────────────────────────────────────────


def story_spread_end_under_coord_transform():
    # `end` alignment on a pixel-pure axis: posScales don't cross a coordinate
    # transform boundary, so the cross-axis `end` fallback inside wavy() is the
    # layer-box edge (#552) — the bar ends seat flush at the box top.
    return (
        layer([
            spread([
                rect(w=40, h=datum(30), fill="#e63946"),
                rect(w=40, h=datum(80), fill="#457b9d"),
                rect(w=40, h=datum(50), fill="#2a9d8f"),
            ], dir="x", alignment="end", spacing=8),
        ], coord=Coord.wavy(), x=0, y=0),
        {"w": 300, "h": 300},
    )


def story_align_center_distribute_y():
    return (
        layer([
            rect(w=80, h=40, fill="#e63946").name("a"),
            rect(w=120, h=60, fill="#457b9d").name("b"),
            rect(w=40, h=30, fill="#2a9d8f").name("c"),
            rect(w=100, h=50, fill="#f4a261").name("d"),
        ]).relate(lambda a, b, c, d: [
            Constraint.align([a, b, c, d], x="middle"),
            Constraint.distribute([a, b, c, d], dir="y", spacing=8),
        ]),
        {"w": 300, "h": 400},
    )


# ─── equivalence: spread = align + distribute ───────────────────────────────
# Each case is a pair, `<case>_spread` and `<case>_constraints`: the same
# three rects at the same size, placed once by `spread` and once by the
# `align` + `distribute` constraints it is equivalent to.


def _y_rects():
    return [
        rect(w=80, h=40, fill="#e63946").name("a"),
        rect(w=120, h=40, fill="#457b9d").name("b"),
        rect(w=60, h=40, fill="#2a9d8f").name("c"),
    ]


def _x_rects():
    return [
        rect(w=40, h=80, fill="#e63946").name("a"),
        rect(w=40, h=120, fill="#457b9d").name("b"),
        rect(w=40, h=60, fill="#2a9d8f").name("c"),
    ]


def _center_to_center_rects():
    return [
        rect(w=30, h=80, fill="#e63946").name("a"),
        rect(w=50, h=80, fill="#457b9d").name("b"),
        rect(w=20, h=80, fill="#2a9d8f").name("c"),
    ]


def story_spread_y_align_start_spread():
    return spread(_y_rects(), dir="y", alignment="start"), {"w": 300, "h": 300}


def story_spread_y_align_start_constraints():
    return (
        layer(_y_rects()).relate(lambda a, b, c: [
            Constraint.align([a, b, c], x="start"),
            Constraint.distribute([a, b, c], dir="y"),
        ]),
        {"w": 300, "h": 300},
    )


def story_spread_y_align_end_spread():
    return spread(_y_rects(), dir="y", alignment="end"), {"w": 300, "h": 300}


def story_spread_y_align_end_constraints():
    return (
        layer(_y_rects()).relate(lambda a, b, c: [
            Constraint.align([a, b, c], x="end"),
            Constraint.distribute([a, b, c], dir="y"),
        ]),
        {"w": 300, "h": 300},
    )


def story_spread_y_align_middle_spread():
    return spread(_y_rects(), dir="y", alignment="middle"), {"w": 300, "h": 300}


def story_spread_y_align_middle_constraints():
    return (
        layer(_y_rects()).relate(lambda a, b, c: [
            Constraint.align([a, b, c], x="middle"),
            Constraint.distribute([a, b, c], dir="y"),
        ]),
        {"w": 300, "h": 300},
    )


def story_spread_x_align_start_spread():
    return spread(_x_rects(), dir="x", alignment="start"), {"w": 300, "h": 300}


def story_spread_x_align_start_constraints():
    return (
        layer(_x_rects()).relate(lambda a, b, c: [
            Constraint.align([a, b, c], y="start"),
            Constraint.distribute([a, b, c], dir="x"),
        ]),
        {"w": 300, "h": 300},
    )


def story_spread_y_spacing_spread():
    return (
        spread(_y_rects(), dir="y", alignment="start", spacing=20),
        {"w": 300, "h": 400},
    )


def story_spread_y_spacing_constraints():
    return (
        layer(_y_rects()).relate(lambda a, b, c: [
            Constraint.align([a, b, c], x="start"),
            Constraint.distribute([a, b, c], dir="y", spacing=20),
        ]),
        {"w": 300, "h": 400},
    )


def story_spread_x_spacing_align_end_spread():
    return (
        spread(_x_rects(), dir="x", alignment="end", spacing=15),
        {"w": 400, "h": 300},
    )


def story_spread_x_spacing_align_end_constraints():
    return (
        layer(_x_rects()).relate(lambda a, b, c: [
            Constraint.align([a, b, c], y="end"),
            Constraint.distribute([a, b, c], dir="x", spacing=15),
        ]),
        {"w": 400, "h": 300},
    )


# Center-to-center mode (anchor="middle", #748).


def story_spread_x_center_to_center_spread():
    return (
        spread(
            _center_to_center_rects(),
            dir="x",
            alignment="start",
            spacing=60,
            anchor="middle",
        ),
        {"w": 400, "h": 300},
    )


def story_spread_x_center_to_center_constraints():
    return (
        layer(_center_to_center_rects()).relate(lambda a, b, c: [
            Constraint.align([a, b, c], y="start"),
            Constraint.distribute([a, b, c], dir="x", spacing=60, anchor="middle"),
        ]),
        {"w": 400, "h": 300},
    )


def story_spread_y_reversed_spread():
    return (
        spread(_y_rects(), dir="y", alignment="start", reverse=True),
        {"w": 300, "h": 300},
    )


def story_spread_y_reversed_constraints():
    return (
        layer(_y_rects()).relate(lambda a, b, c: [
            Constraint.align([a, b, c], x="start"),
            Constraint.distribute([a, b, c], dir="y", order="reverse"),
        ]),
        {"w": 300, "h": 300},
    )


# ─── "span" / "size" alignment values (#726) ────────────────────────────────


def story_align_span():
    group = (
        layer(
            [
                rect(w=60, h=60, fill="#e63946").name("a"),
                rect(w=60, h=60, fill="#457b9d").name("b"),
                rect(w=60, h=60, fill="#2a9d8f").name("c"),
            ],
            x=40,
            y=50,
        )
        .relate(lambda a, b, c: [
            Constraint.align([a, b, c], y="start"),
            Constraint.distribute([a, b, c], dir="x", spacing=10),
        ])
        .name("group")
    )

    return (
        layer([
            group,
            rect(fill="none", stroke="#333", stroke_width=2).name("border"),
        ]).relate(lambda group, border, **_: [
            Constraint.align([group, border], x="span"),
            Constraint.align([group, border], y="span"),
        ]),
        {"w": 340, "h": 220},
    )


def story_align_size():
    stack = (
        layer(
            [
                rect(w=220, h=30, fill="#e63946").name("s1"),
                rect(w=220, h=30, fill="#457b9d").name("s2"),
            ],
            x=0,
            y=20,
        )
        .relate(lambda s1, s2: [
            Constraint.align([s1, s2], x="start"),
            Constraint.distribute([s1, s2], dir="y", spacing=4),
        ])
        .name("stack")
    )

    return (
        layer([
            stack,
            rect(y=110, h=10, fill="#2a9d8f").name("divider"),
        ]).relate(lambda stack, divider, **_: [
            Constraint.align([stack, divider], x="size"),
        ]),
        {"w": 320, "h": 180},
    )
