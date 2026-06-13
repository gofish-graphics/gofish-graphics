"""Equivalent of lowlevel/Nest.stories.tsx — Low Level Syntax/Nest.

Ports the Nest stories that certify `Constraint.nest([outer, inner], …)`.
`nest` is a size-setting constraint: on each constrained axis
`outer = inner + 2*padding` holds and `inner` is centered in `outer`. Which side
is derived is dispatched on which side carries the size:

  - Basic / Chained / AutoFit: a fixed-pixel / composite / data-driven inner is
    sized, the outer is not → inside-out (`outer = inner + 2p`).
  - OutsideIn: the outer carries the size, the inner is claim-less → outside-in
    (`inner = outer - 2p`), i.e. CSS padding.
  - FillOuter: neither side is sized → the layer fills the outer, then
    `inner = outer - 2p` (outside-in over a fill outer).

Pure-spec stories (no JS-only options); their normalized DOM should match the JS
Basic / Chained / AutoFit / OutsideIn / FillOuter stories.
"""

from gofish import Constraint, datum, layer, rect, spread

COLORS = ["#e63946", "#457b9d", "#2a9d8f"]


# ── Basic box-in-box ────────────────────────────────────────────────────────
# inner 60x40, padding 10 → outer 80x60; inner centered (inner.min = 10).
def story_basic():
    return (
        layer([
            rect(fill="#dbe6f3", stroke="#5a7da6", strokeWidth=1.5, rx=6).name(
                "outer"
            ),
            rect(w=60, h=40, fill="#e63946", rx=4).name("inner"),
        ]).constrain(lambda outer, inner: [
            Constraint.nest([outer, inner], x=10, y=10),
        ]),
        {"w": 200, "h": 160},
    )


# ── Chained nesting (3 levels) ──────────────────────────────────────────────
# core 40x30; mid = core + 2*8 = 56x46; shell = mid + 2*12 = 80x70.
def story_chained():
    mid = layer([
        rect(
            fill="#cfdcec", stroke="#5a7da6", strokeWidth=1.25, rx=5
        ).name("midOuter"),
        rect(w=40, h=30, fill="#2a9d8f", rx=3).name("core"),
    ]).constrain(lambda midOuter, core: [
        Constraint.nest([midOuter, core], x=8, y=8),
    ])

    return (
        layer([
            rect(
                fill="#fafbfd", stroke="#9bb1c4", strokeWidth=1.5, rx=6
            ).name("shell"),
            mid.name("mid"),
        ]).constrain(lambda shell, mid, **_: [
            Constraint.nest([shell, mid], x=12, y=12),
        ]),
        {"w": 220, "h": 200},
    )


# ── Auto-fit: a fixed-width spread of nested pairs ──────────────────────────
# Inner widths are data-driven (datum); each pair's outer = inner + 2*8. The
# spread sums the pairs' SIZE claims and inverts against the 300px budget so the
# three outer widths exactly fill 300 with 2*10 spacing. Inner heights are fixed
# (18), padded to outer height 34.
INNER_WIDTHS = [40, 90, 60]


def story_auto_fit():
    return (
        spread(
            [
                layer([
                    rect(
                        fill="#eef2f7",
                        stroke="#9bb1c4",
                        strokeWidth=1,
                        rx=4,
                    ).name("outer"),
                    rect(w=datum(v), h=18, fill=COLORS[i], rx=3).name("inner"),
                ]).constrain(lambda outer, inner: [
                    Constraint.nest([outer, inner], x=8, y=8),
                ])
                for i, v in enumerate(INNER_WIDTHS)
            ],
            dir="x",
            spacing=10,
            alignment="middle",
        ),
        {"w": 300, "h": 80},
    )


# ── Outside-in: CSS padding ─────────────────────────────────────────────────
# The OUTER carries the size (200x140) and the INNER is claim-less, so nest
# resolves outside-in: inner = outer - 2*16 = 168x108, centered.
def story_outside_in():
    return (
        layer([
            rect(
                w=200,
                h=140,
                fill="#dbe6f3",
                stroke="#5a7da6",
                strokeWidth=1.5,
                rx=6,
            ).name("outer"),
            rect(fill="#e63946", rx=4).name("inner"),
        ]).constrain(lambda outer, inner: [
            Constraint.nest([outer, inner], x=16, y=16),
        ]),
        {"w": 280, "h": 220},
    )


# ── Fill outer: neither side sized ──────────────────────────────────────────
# Neither outer nor inner declares a size, so the layer sizes the outer (it
# fills the layer box) and nest resolves outside-in: inner = layer - 2*20 on
# each axis, centered. At 240x180 the inner is 200x140.
def story_fill_outer():
    return (
        layer([
            rect(
                fill="#dbe6f3", stroke="#5a7da6", strokeWidth=1.5, rx=6
            ).name("outer"),
            rect(fill="#2a9d8f", rx=4).name("inner"),
        ]).constrain(lambda outer, inner: [
            Constraint.nest([outer, inner], x=20, y=20),
        ]),
        {"w": 240, "h": 180},
    )
