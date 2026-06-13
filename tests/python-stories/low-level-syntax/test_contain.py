"""Equivalent of lowlevel/Contain.stories.tsx — Low Level Syntax/Contain.

Ports the Contain stories that certify `Constraint.contain([outer, inner], …)`.
`contain` is a size-setting constraint: on each constrained axis
`outer = inner + 2*padding` holds and `inner` is centered in `outer`. Which side
is derived is dispatched on which side carries the size:

  - Basic: a fixed-pixel inner is sized, the outer is not → inside-out
    (`outer = inner + 2p`).
  - OutsideIn: the outer carries the size, the inner is claim-less → outside-in
    (`inner = outer - 2p`), i.e. CSS padding.

Pure-spec stories (no JS-only options); their normalized DOM should match the JS
Basic / OutsideIn stories.
"""

from gofish import Constraint, layer, rect


# ── Basic box-in-box ────────────────────────────────────────────────────────
# inner 60x40, padding 10 → outer 80x60; inner centered (inner.min = 10).
def story_contain_basic():
    return (
        layer([
            rect(fill="#dbe6f3", stroke="#5a7da6", strokeWidth=1.5, rx=6).name(
                "outer"
            ),
            rect(w=60, h=40, fill="#e63946", rx=4).name("inner"),
        ]).constrain(lambda outer, inner: [
            Constraint.contain([outer, inner], x=10, y=10),
        ]),
        {"w": 200, "h": 160},
    )


# ── Outside-in: CSS padding ─────────────────────────────────────────────────
# The OUTER carries the size (200x140) and the INNER is claim-less, so contain
# resolves outside-in: inner = outer - 2*16 = 168x108, centered.
def story_contain_outside_in():
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
            Constraint.contain([outer, inner], x=16, y=16),
        ]),
        {"w": 280, "h": 220},
    )
