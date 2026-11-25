"""Equivalent of lowlevel/BalloonChart.stories.tsx — Low Level Syntax/Balloon Chart.

A whimsical scatter where each lake is a balloon on a string, the whole scene
warped by a `wavy` coordinate transform. Each balloon is a small box `layer` of
two ellipses + two rects, drawn y-up with the knot at the bottom. A thin rect
draws the string, and the string and its balloon are a zero-gap `spread` along
y, so the string's top edge is the balloon's bottom edge. Exercises
`layer([...], coord=wavy())` (Tier-2 coord transform), a zero-gap chain, and
shape-level `cx`/`cy` positioning.
"""

from gofish import layer, spread, ellipse, rect, Coord
from python_stories.data import SEAFOOD, CATCH_LOCATIONS, COLORS
from python_stories._lowlevel_helpers import group_by

_C6 = COLORS["color6"]
_MIX_WHITE = COLORS["mixWhite05"]
_MIX_BLACK_01 = COLORS["mixBlack01"]
_MIX_BLACK_035 = COLORS["mixBlack035"]
_BLACK = COLORS["colorBlack"]


def _balloon(palette):
    """A balloon glyph. `palette` is the per-lake color ramp indexed [3..6],
    matching the JS array passed to the `Balloon` component."""
    return layer(
        [
            ellipse(cx=15, cy=19, w=24, h=30, fill=palette[4]),
            ellipse(cx=12, cy=23, w=7, h=11, fill=palette[3]),
            rect(cx=15, cy=2, w=8, h=4, fill=palette[5], rx=3, ry=2),
            rect(cx=15, cy=2, w=5, h=2.4, fill=palette[6], rx=2, ry=1),
        ],
        box=True,
    )


def story_default():
    scene = []
    for i, lake in enumerate(group_by(SEAFOOD, "lake").keys()):
        loc = CATCH_LOCATIONS[lake]
        # JS passes [null, null, null, mix(c,white,.5), c, mix(c,black,.1), mix(c,black,.35)]
        palette = [None, None, None, _MIX_WHITE[i], _C6[i], _MIX_BLACK_01[i], _MIX_BLACK_035[i]]
        scene.append(
            spread(
                [
                    rect(w=1, h=loc["y"], fill=_BLACK),
                    _balloon(palette),
                ],
                x=loc["x"],
                y=0,
                dir="y",
                spacing=0,
                alignment="middle",
            )
        )

    return (
        layer(scene, coord=Coord.wavy(), x=0, y=0),
        {"axes": True},
    )
