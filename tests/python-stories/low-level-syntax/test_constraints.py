"""Equivalent of lowlevel/Constraints.stories.tsx — Low Level Syntax/Constraints.

Ports the nine single-chart stories: the six that demonstrate
`layer + constrain` directly, `SpreadEnd_UnderCoordTransform` (the
pixel-pure `end` fallback canary, #552), and `AlignSpan`/`AlignSize` (#726 —
the `"span"`/`"size"` alignment values). The eight side-by-side equivalence
stories (`SpreadY_*`, `SpreadX_*`) use a multi-panel DOM scaffold that
doesn't fit the single-chart parity harness — those are per-export exempt.
`SpreadY_AlignMiddle` specifically now compares two freely translated systems
after layout normalization instead of pinning a child to the canvas center; that
change remains covered by the JS side-by-side story and the confluence tests.

`story_spread_x_center_to_center` additionally ports the `Constraint.distribute`
half of `SpreadX_CenterToCenter` (still exempt from byte-matching for the same
multi-panel reason, but now captured + IR-validated) — the first Python
coverage of `anchor="middle"` (#748).
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


# ─── center-to-center mode (anchor="middle", #748) ──────────────────────────


def story_spread_x_center_to_center():
    # Port of the `SpreadX_CenterToCenter` equivalence story (still on the
    # per-export exempt list — it's a two-panel `renderEquivalentStory()`
    # scaffold the single-chart parity harness can't byte-match — but
    # captured + IR-validated here via its `Constraint.distribute` half,
    # `spread({ dir: "x", alignment: "start", spacing: 60, anchor: "middle" })`
    # ≡ `align(y="start") + distribute(dir="x", spacing=60, anchor="middle")`.
    # First Python coverage of `anchor="middle"`.
    return (
        layer([
            rect(w=30, h=80, fill="#e63946").name("a"),
            rect(w=50, h=80, fill="#457b9d").name("b"),
            rect(w=20, h=80, fill="#2a9d8f").name("c"),
        ]).constrain(lambda a, b, c: [
            Constraint.align([a, b, c], y="start"),
            Constraint.distribute([a, b, c], dir="x", spacing=60, anchor="middle"),
        ]),
        {"w": 400, "h": 300},
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
        .constrain(lambda a, b, c: [
            Constraint.align([a, b, c], y="start"),
            Constraint.distribute([a, b, c], dir="x", spacing=10),
        ])
        .name("group")
    )

    return (
        layer([
            group,
            rect(fill="none", stroke="#333", strokeWidth=2).name("border"),
        ]).constrain(lambda group, border, **_: [
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
        .constrain(lambda s1, s2: [
            Constraint.align([s1, s2], x="start"),
            Constraint.distribute([s1, s2], dir="y", spacing=4),
        ])
        .name("stack")
    )

    return (
        layer([
            stack,
            rect(y=110, h=10, fill="#2a9d8f").name("divider"),
        ]).constrain(lambda stack, divider, **_: [
            Constraint.align([stack, divider], x="size"),
        ]),
        {"w": 320, "h": 180},
    )
