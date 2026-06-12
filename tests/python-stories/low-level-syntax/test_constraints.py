"""Equivalent of lowlevel/Constraints.stories.tsx — Low Level Syntax/Constraints.

Ports the seven single-chart stories: the six that demonstrate
`layer + constrain` directly, plus `SpreadEnd_UnderCoordTransform` (the
pixel-pure `end` fallback canary, #552). The eight side-by-side equivalence
stories (`SpreadY_*`, `SpreadX_*`) use a multi-panel DOM scaffold that
doesn't fit the single-chart parity harness — those are per-export exempt.
"""

from gofish import Constraint, datum, layer, rect, spread, wavy


# ─── partial placement ───────────────────────────────────────────────────────


def story_align_only():
    return (
        layer([
            rect(w=80, h=40, fill="#e63946").name("a"),
            rect(w=120, h=60, fill="#457b9d").name("b"),
            rect(w=60, h=30, fill="#2a9d8f").name("c"),
        ]).constrain(lambda a, b, c: [
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
        ]).constrain(lambda a, b, c: [
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
        ]).constrain(lambda a, b, c: [
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
        ]).constrain(lambda a, b, c, d: [
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
        ]).constrain(lambda bg, a, b, c: [
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
        ], coord=wavy(), x=0, y=0),
        {"w": 300, "h": 300},
    )


def story_align_center_distribute_y():
    return (
        layer([
            rect(w=80, h=40, fill="#e63946").name("a"),
            rect(w=120, h=60, fill="#457b9d").name("b"),
            rect(w=40, h=30, fill="#2a9d8f").name("c"),
            rect(w=100, h=50, fill="#f4a261").name("d"),
        ]).constrain(lambda a, b, c, d: [
            Constraint.align([a, b, c, d], x="middle"),
            Constraint.distribute([a, b, c, d], dir="y", spacing=8),
        ]),
        {"w": 300, "h": 400},
    )
