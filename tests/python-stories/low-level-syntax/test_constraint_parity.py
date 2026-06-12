"""Equivalent of lowlevel/ConstraintParity.stories.tsx — Low Level Syntax/Constraint Parity.

Ports the twelve single-chart stories that certify `spread` and its
`layer + Constraint.align + Constraint.distribute` form produce identical
geometry (issue #475 / the operators-constraints unification, #543). Each
Spread*/Constraint* pair renders the same data at the same canvas size; their
normalized DOM should match — except SpreadEnd/ConstraintEnd, a principled
divergence (the cross-axis baseline policies differ when no sibling is
pre-placed), which is documented in the JS story.

`spread({...}, [children])` maps to the combinator form `spread([children], ...)`;
`layer([...]).constrain(...)` maps to the same combinator form. Data-driven
sizes use `datum(v)` (JS `value(v)`).
"""

from gofish import Constraint, datum, layer, rect, spread

COLORS = ["#e63946", "#457b9d", "#2a9d8f"]

# ── Bar chart: data-driven heights, fixed widths ───────────────────────────
BAR_HEIGHTS = [30, 80, 50]


def story_spread_bar():
    return (
        spread(
            [
                rect(w=40, h=datum(v), fill=COLORS[i])
                for i, v in enumerate(BAR_HEIGHTS)
            ],
            dir="x",
            alignment="start",
            spacing=8,
        ),
        {"w": 300, "h": 200},
    )


def story_constraint_bar():
    return (
        layer([
            rect(w=40, h=datum(v), fill=COLORS[i]).name(f"r{i}")
            for i, v in enumerate(BAR_HEIGHTS)
        ]).constrain(lambda r0, r1, r2: [
            Constraint.align([r0, r1, r2], y="start"),
            Constraint.distribute([r0, r1, r2], dir="x", spacing=8),
        ]),
        {"w": 300, "h": 200},
    )


# ── Auto-fit: data-driven widths on the stack axis, canvas too small ───────
FIT_WIDTHS = [120, 200, 90]


def story_spread_fit():
    return (
        spread(
            [
                rect(w=datum(v), h=60, fill=COLORS[i])
                for i, v in enumerate(FIT_WIDTHS)
            ],
            dir="x",
            alignment="start",
            spacing=8,
        ),
        {"w": 200, "h": 60},
    )


def story_constraint_fit():
    return (
        layer([
            rect(w=datum(v), h=60, fill=COLORS[i]).name(f"r{i}")
            for i, v in enumerate(FIT_WIDTHS)
        ]).constrain(lambda r0, r1, r2: [
            Constraint.align([r0, r1, r2], y="start"),
            Constraint.distribute([r0, r1, r2], dir="x", spacing=8),
        ]),
        {"w": 200, "h": 60},
    )


# ── Fill children: NO explicit size on the distribute axis ─────────────────


def story_spread_fill():
    return (
        spread(
            [rect(h=40, fill=c) for c in COLORS],
            dir="x",
            alignment="start",
            spacing=8,
        ),
        {"w": 300, "h": 80},
    )


def story_constraint_fill():
    return (
        layer([
            rect(h=40, fill=c).name(f"r{i}") for i, c in enumerate(COLORS)
        ]).constrain(lambda r0, r1, r2: [
            Constraint.align([r0, r1, r2], y="start"),
            Constraint.distribute([r0, r1, r2], dir="x", spacing=8),
        ]),
        {"w": 300, "h": 80},
    )


# ── Weighted fill children: budget split by weights, not equally ───────────
WEIGHTS = [1, 2, 3]


def story_spread_weights():
    return (
        spread(
            [rect(h=40, fill=c) for c in COLORS],
            dir="x",
            alignment="start",
            spacing=8,
            stackWeights=WEIGHTS,
        ),
        {"w": 300, "h": 80},
    )


def story_constraint_weights():
    return (
        layer([
            rect(h=40, fill=c).name(f"r{i}") for i, c in enumerate(COLORS)
        ]).constrain(lambda r0, r1, r2: [
            Constraint.align([r0, r1, r2], y="start"),
            Constraint.distribute(
                [r0, r1, r2], dir="x", spacing=8, weights=WEIGHTS
            ),
        ]),
        {"w": 300, "h": 80},
    )


# ── Glue (stack): data-driven heights summed into a position ───────────────
STACK_HEIGHTS = [30, 50, 20]


def story_spread_glue():
    return (
        spread(
            [
                rect(w=60, h=datum(v), fill=COLORS[i])
                for i, v in enumerate(STACK_HEIGHTS)
            ],
            dir="y",
            glue=True,
            alignment="start",
        ),
        {"w": 120, "h": 200},
    )


def story_constraint_glue():
    return (
        layer([
            rect(w=60, h=datum(v), fill=COLORS[i]).name(f"r{i}")
            for i, v in enumerate(STACK_HEIGHTS)
        ]).constrain(lambda r0, r1, r2: [
            Constraint.align([r0, r1, r2], x="start"),
            Constraint.distribute([r0, r1, r2], dir="y", glue=True),
        ]),
        {"w": 120, "h": 200},
    )


# ── End alignment: exact parity, like every pair above (#552) ───────────────
# Once a principled divergence; since #552 the no-sibling fallback dispatches on
# the axis's underlying space (posScale -> scale origin; pixel-pure -> box edge).
# Both layers here are SIZE-derived, so both resolve the same POSITION space and
# posScale: the bars' "end" lands on the scale's zero line in both, hanging into
# negative cross-coords. Identical geometry — an exact parity pair.


def story_spread_end():
    return (
        spread(
            [
                rect(w=40, h=datum(v), fill=COLORS[i])
                for i, v in enumerate(BAR_HEIGHTS)
            ],
            dir="x",
            alignment="end",
            spacing=8,
        ),
        {"w": 300, "h": 200},
    )


def story_constraint_end():
    return (
        layer([
            rect(w=40, h=datum(v), fill=COLORS[i]).name(f"r{i}")
            for i, v in enumerate(BAR_HEIGHTS)
        ]).constrain(lambda r0, r1, r2: [
            Constraint.align([r0, r1, r2], y="end"),
            Constraint.distribute([r0, r1, r2], dir="x", spacing=8),
        ]),
        {"w": 300, "h": 200},
    )
