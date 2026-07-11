"""Equivalent of lowlevel/ScopeRegressions.stories.tsx — Low Level Syntax/Scope Regressions.

Regression repros for per-scope y-orientation (#629): a subtree keeps its own
y-orientation even when wrapped in a bake boundary (`enclose`) or reordered by a
z-order constraint. `EncloseMixed`: an `enclose` around a continuous-y bar chart
beside an ordinal heatmap — the bars grow UP while the heatmap reads top→bottom
(before the fix the whole boundary rendered y-down). `ZOrderedMixed`: the same
mix inside a layer carrying a `z_above` constraint — the z-order hoist must carry
the flip scope through, so adding the constraint never changes orientation.
Combinator `spread` in the `dir` variants stands in for v1 `spreadX`/`spreadY`; a
data-bound SIZE uses `datum(v)` (JS `value(v)`).
"""

from gofish import Constraint, datum, enclose, layer, rect, spread
from python_stories.data import COLORS

_C6 = COLORS["color6"]


# A vertical bar chart: continuous-y value axis → grows UPWARD (y-up).
def _bars():
    return spread(
        [
            rect(key=f"b{i}", w=20, h=datum(b), fill=_C6[0])
            for i, b in enumerate([40, 90, 60, 80, 55])
        ],
        dir="x",
        spacing=10,
        alignment="start",
        h=160,
    )


# A heatmap: keyed rows → ordinal y axis → reads top→bottom (y-down).
def _heat():
    return spread(
        [
            spread(
                [
                    rect(w=20, h=20, fill=f"rgba(189,0,38,{0.2 + 0.2 * c})")
                    for c in range(4)
                ],
                dir="x",
                key=row,
                spacing=3,
                alignment="middle",
            )
            for row in ["A", "B", "C"]
        ],
        dir="y",
        spacing=3,
        alignment="start",
    )


# Bug #2: a bake boundary (enclose) around a continuous-y bar chart beside an
# ordinal heatmap. The boundary's own y space is UNDEFINED, so it declares no
# flip — but its internal lowering must still run the scope walk, so the bars grow
# UP while the heatmap reads top→bottom.
def story_enclose_mixed():
    return (
        enclose(
            [spread([_bars(), _heat()], dir="x", spacing=40, alignment="start")]
        ),
        {},
    )


# Bug #3: the same mixed composition inside a layer that carries a z-order
# constraint — which routes the layer through the z-order hoist. The hoist must
# CARRY the flip scope through each hoisted-through plain layer, so adding the
# constraint never changes which orientation a subtree lowers under.
def story_zordered_mixed():
    return (
        layer(
            [
                layer([_bars()]).name("barsWrap"),
                layer([_heat()]).name("heatWrap"),
            ]
        ).constrain(
            # Param names must match the child `.name(...)` values — the layer
            # passes the resolved refs as keyword args keyed by name.
            lambda barsWrap, heatWrap: [
                Constraint.distribute(
                    [barsWrap, heatWrap], dir="x", spacing=40, anchor="edge"
                ),
                Constraint.z_above(heatWrap, barsWrap),
            ]
        ),
        {},
    )
